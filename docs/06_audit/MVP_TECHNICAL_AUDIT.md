# XUANOS MVP 技术收尾审计

> 审计日期：2026-07-14  
> 范围：产品/协议/交互/后端/联调文档，`frontend/src`，`backend/app`，后端测试与 Alembic migrations。  
> 方式：只读代码审查与本地验证；除本文件外未修改前端、后端或数据库代码。

## 1. 结论摘要

当前版本已形成可运行的真实主链路：线程 → 理解 → 计划版本 → 行动反馈 → 快照升版 → 用户纠正。DTO、snake_case/camelCase mapper、错误封装和服务端事务边界整体一致，构建、静态检查、测试和迁移检查全部通过。

但系统**不适合直接作为一个共享后端开放给 5—10 人同时测试**。固定 `demo-user` 会让所有测试者共享线程、快照、纠正和幂等空间；默认启用且无身份校验的 `/api/demo/reset` 还允许任意访问者清空共享数据。每位测试者使用独立实例/独立数据库时，可开始受控测试；共享环境必须先处理 P0 与下列 P1。

## 2. 验证基线

| 验证项 | 结果 |
| --- | --- |
| `frontend: npm run build` | 通过，TypeScript 与 Vite 构建成功 |
| `frontend: npm run lint` | 通过，Oxlint 无错误 |
| `backend: pytest` | 通过，24 passed；1 条 TestClient/httpx 弃用警告 |
| `backend: ruff check .` | 通过 |
| `backend: ruff format --check .` | 通过，70 files already formatted |
| `backend: alembic check` | 通过，无待生成迁移 |
| `git diff --check` | 通过 |
| 审计开始前 `git status --short` | 空，工作树干净 |

前端目前没有自动化测试脚本；后端已覆盖主链路、计划版本、反馈事务回滚、线程/纠正幂等、纠正五种类型、持久化和 reset。

## 3. 前后端契约一致性

| API | 前端链路 | 审计结论 |
| --- | --- | --- |
| `POST /api/threads` | `threadService` → `threadMapper` | 字段、时间、ID、步骤一致；幂等覆盖 |
| `GET /api/threads` | `listThreads` → `threadMapper` | 一致 |
| `GET /api/threads/{thread_id}` | `getThread` → `threadAggregateMapper` | 主字段一致；计划历史存在多 root 混合风险，见 A-08 |
| `POST /api/understanding/analyze` | `understandingService` → `understandingMapper` | nullable、问题、回答、摘要、步骤一致；幂等覆盖 |
| `POST /api/understanding/{session_id}/confirm` | 同上 | assessment/correction、confirmedAt、snapshot 一致；幂等覆盖 |
| `POST /api/plans` | `planService` → `planMapper` | plan、items、版本链、时间一致；幂等覆盖 |
| `POST /api/plans/{plan_id}/revise` | 同上 | 原版与新版均映射；幂等覆盖 |
| `POST /api/plans/{plan_id}/accept` | 同上 | acceptedAt 与 snapshot 一致；重复接受风险见 A-05 |
| `POST /api/action-results` | `actionResultService` → `actionResultMapper` | duration 为分钟、obstacle 为 code；未持久化 action item，见 A-09 |
| `GET /api/users/demo-user/snapshot` | `snapshotService` → `snapshotMapper` | ID、版本、时间、规律与 hypothesis 完整 |
| `POST /api/users/demo-user/corrections` | `correctionService` → `correctionMapper` | 五种 code、结果与 snapshot 一致；缺并发前置条件，见 A-03 |

未发现页面直接 `fetch`；网络访问集中于 `apiClient.ts`。未发现 reducer 直接处理 DTO。后端 envelope 的 `request_id` 未写入状态，不阻塞 MVP，但排障时可保留。

错误方面，前端已映射 `NETWORK_ERROR`、`TIMEOUT`、`VALIDATION_ERROR`、`INVALID_FLOW_STATE`、`RESOURCE_NOT_FOUND`、`DUPLICATE_SUBMISSION`、`SERVER_ERROR`，并处理版本、理解确认和计划接受错误。后端统一封装异常，不向响应泄露堆栈。

## 4. 状态不变量

1. `understanding_confirmed` 必须有 `activeThreadId`、`understandingSessionId`、confirmed 状态与 `understandingConfirmedAt`。
2. `plan_generated/plan_modified` 必须有 `currentPlan/activePlanId`，且计划属于当前 thread 与已确认 session。
3. `plan_accepted/action_pending` 必须有 status=`accepted` 的当前计划及 `acceptedAt`。
4. `system_revised` 必须有 `actionResultId` 和新版 snapshot，且 source 属于当前链路。
5. `serverStep` 只能由服务端响应/aggregate 更新；缓存不得被提升为新服务端成功。
6. 切换 thread 时，understanding、plan、action、correction 状态必须按 thread 隔离。

## 5. 审计问题

### A-01 · P0 · 共享 demo-user 导致用户数据互见与互相覆盖

- **问题描述**：所有服务固定使用 `demo-user`，前端缓存和幂等空间也固定使用该用户。
- **证据文件与代码位置**：`backend/app/db/seed.py:6`；`backend/app/services/thread_service.py:29-53`；`backend/app/api/routes/corrections.py:12`；`frontend/src/state/integrationCache.ts:5-6`；`frontend/src/api/idempotency.ts:1`。
- **可能后果**：隐私泄露、数据相互污染、计划/快照归属错误，一个用户改变其他用户页面。
- **推荐修复方式**：引入不可伪造的测试参与者 ID，让 user/thread/snapshot/cache/idempotency 全链路隔离；或每人独立实例/数据库。
- **是否阻塞种子用户测试**：**阻塞共享环境**；不阻塞独立实例测试。

### A-02 · P0 · demo reset 默认开启且无权限保护

- **问题描述**：`POST /api/demo/reset` 默认启用，不校验身份，会删除 demo-user 全部数据和幂等记录。
- **证据文件与代码位置**：`backend/app/core/config.py:14`；`backend/app/api/routes/demo.py:18-28`；`backend/app/services/demo_service.py:20-42`。
- **可能后果**：共享环境中任意访问者都能清空所有参与者数据。
- **推荐修复方式**：非本地环境默认关闭；如保留，增加服务端 reset secret/管理身份与审计日志。
- **是否阻塞种子用户测试**：**阻塞共享环境**。

### A-03 · P1 · 用户纠正缺少 snapshot 乐观并发控制

- **问题描述**：纠正请求没有 `expected_snapshot_id/version`；前端只比较本地状态，后端把旧页面纠正应用到提交时的最新快照。
- **证据文件与代码位置**：`backend/app/schemas/correction.py:20-26`；`backend/app/services/correction_service.py:37-85`；`frontend/src/state/InteractionContext.tsx:489-511`。
- **可能后果**：多标签页或反馈/纠正并发时产生 lost update，覆盖较新的主线、行动或边界。
- **推荐修复方式**：请求加入 expected snapshot ID/version；服务端事务内校验，不一致返回 `VERSION_CONFLICT`。
- **是否阻塞种子用户测试**：**阻塞**。

### A-04 · P1 · partial hypothesis 的旧记录可能被重新激活

- **问题描述**：partial 将原记录标为 expired 并创建同 category 替代项；repository 查询不筛有效状态或排序。ActionService 只跳过 rejected，可能选中旧 partial 并覆盖 expired 状态。
- **证据文件与代码位置**：`backend/app/services/correction_service.py:127-166`；`backend/app/repositories/workflow.py:81-87`；`backend/app/services/action_service.py:80-100,123-127`。
- **可能后果**：已被用户替换的旧判断重新进入 snapshot。
- **推荐修复方式**：增加 superseded/active 关系；查询只返回最新有效项；ActionService 排除 expired/denied，并补组合测试。
- **是否阻塞种子用户测试**：**阻塞**。

### A-05 · P1 · 已接受计划再次 accept 可能让步骤回退

- **问题描述**：计划已 accepted 时后端固定返回 `plan_accepted`，即使 thread 已是 `system_revised`；新 key 重复接受后前端信任该步骤。
- **证据文件与代码位置**：`backend/app/services/plan_service.py:199-225`；`frontend/src/state/interactionReducer.ts:580-599`。
- **可能后果**：已反馈用户回到待行动阶段，thread 与前端状态不一致。
- **推荐修复方式**：返回 thread 真实步骤，或对越过阶段的 accept 做无状态 replay/拒绝，并补测试。
- **是否阻塞种子用户测试**：**阻塞**。

### A-06 · P1 · 切换到 idle thread 时保留上一 thread 状态

- **问题描述**：`THREAD_AGGREGATE_LOADED` 以 `serverStep !== idle` 决定是否使用 aggregate。切换到另一个 idle thread 时 active thread 已改变，但 plan/understanding/action 继续沿用旧 state。
- **证据文件与代码位置**：`frontend/src/state/interactionReducer.ts:215-313`。
- **可能后果**：旧线程计划显示在新线程下，后续可能操作错误计划。
- **推荐修复方式**：不同 thread 时清空 thread-scoped 状态并使用 aggregate；仅 sameThread 保留草稿。
- **是否阻塞种子用户测试**：**阻塞**。

### A-07 · P1 · idle thread 的首页继续按钮无法进入理解流程

- **问题描述**：有 `activeThreadId` 就显示继续，但 idle 的 `continuePage` 仍是 home，点击不调用 `startCalibration`。
- **证据文件与代码位置**：`frontend/src/pages/HomePage.tsx:11-17,35-36`；`frontend/src/state/InteractionContext.tsx:28-43`；`frontend/src/App.tsx:22-30`。
- **可能后果**：恢复刚创建的线程后，主 CTA 原地停留。
- **推荐修复方式**：idle active thread 进入 expression mode，或提供“使用现有线程开始校准”action。
- **是否阻塞种子用户测试**：**阻塞恢复场景**。

### A-08 · P2 · 计划历史混合多个 root chain

- **问题描述**：aggregate 返回 thread 下全部计划，仅按 version 排序；前端也按 version 合并。重新理解后创建新 root 会出现多个 v1/v2 混排。
- **证据文件与代码位置**：`backend/app/repositories/workflow.py:60-61`；`frontend/src/state/interactionReducer.ts:96-102`；`frontend/src/pages/PlanPage.tsx:170-179`。
- **可能后果**：用户无法判断版本属于哪条裁决链，可能查看过期 root。
- **推荐修复方式**：只返回 active root 版本链，其他 root 归档；前端按 `rootPlanId` 分组。
- **是否阻塞种子用户测试**：否，但多轮计划测试会混乱。

### A-09 · P2 · action result 未持久化唯一行动标识

- **问题描述**：前端有 `planItemId/actionIdentifier`，但请求、schema 和模型只保存 plan_id；恢复时从当前计划推断。
- **证据文件与代码位置**：`frontend/src/mappers/actionResultMapper.ts:43-76`；`backend/app/schemas/action_result.py:8-19,32-36`；`backend/app/models/action_result.py:14-17`。
- **可能后果**：计划扩展到多行动后，反馈无法可靠关联当时的具体行动。
- **推荐修复方式**：增加 nullable `plan_item_id` FK 与不可变 action label/identifier，并验证 item 属于 accepted plan。
- **是否阻塞种子用户测试**：否，当前单一行动 MVP 可暂缓。

### A-10 · P2 · 本地 reset 不重置服务端，也不清待重试 key

- **问题描述**：SystemPage 只清本地 session cache；不调用后端 reset，且 `clearIntegrationCache()` 不删除独立 idempotency store。
- **证据文件与代码位置**：`frontend/src/pages/SystemPage.tsx:70-74`；`frontend/src/state/InteractionContext.tsx:533-536`；`frontend/src/state/integrationCache.ts:376-382`；`frontend/src/api/idempotency.ts:1,35-51`。
- **可能后果**：刷新后旧服务端数据重现；残留未知结果 key 可能在“重置”后被复用。
- **推荐修复方式**：入口改名“清除本地缓存”；受保护的完整 reset 同时清 idempotency store，或增加 TTL/session epoch。
- **是否阻塞种子用户测试**：独立实例下不阻塞，但会干扰重复测试。

### A-11 · P2 · snapshot/idempotency 并发创建可能返回 500

- **问题描述**：snapshot 通过读取 current 后 `+1`；idempotency 采用先查后插。并发请求可能同时得到相同版本或同时认为 key 不存在，随后撞唯一约束。
- **证据文件与代码位置**：`backend/app/services/snapshot_service.py:38-69`；`backend/app/models/snapshot.py:13-20`；`backend/app/core/idempotency.py:22-57`；`backend/app/models/idempotency.py:10-19`。
- **可能后果**：事务会回滚，但一个请求可能收到通用 500，而不是 replay/version conflict；PostgreSQL 下更明显。
- **推荐修复方式**：捕获 IntegrityError 后重读幂等记录；snapshot 使用锁/原子版本分配或重试。
- **是否阻塞种子用户测试**：否，低并发 MVP 可接受；共享上线前必须处理。

### A-12 · P2 · localStorage 缺完整运行时校验和 thread 命名空间

- **问题描述**：缓存有 schemaVersion 与 JSON 异常降级，但内部对象主要靠 TypeScript 断言；草稿与成功缓存集中在一个 demo-user key 下。
- **证据文件与代码位置**：`frontend/src/state/integrationCache.ts:5-29,265-369`；`frontend/src/api/idempotency.ts:11-18,35-43`。
- **可能后果**：部分损坏/旧形状缓存制造非法状态；切换 thread 时草稿或 key 串线、长期残留。
- **推荐修复方式**：使用轻量 runtime schema；按 user/thread/schemaVersion 命名；pending key 增加 TTL 与清理策略。
- **是否阻塞种子用户测试**：否。

### A-13 · P2 · 前端缺少状态、恢复、离线自动化测试

- **问题描述**：`package.json` 没有 test 脚本。跨线程 reducer、刷新恢复、离线缓存、超时复用 key 只能手工验收。
- **证据文件与代码位置**：`frontend/package.json:6-11`；`frontend/src/state/interactionReducer.ts`；`InteractionContext.tsx`；`integrationCache.ts`。
- **可能后果**：A-06/A-07 类回归无法被 CI 捕获，真实 AI 接入后风险扩大。
- **推荐修复方式**：优先测试状态不变量、两 thread 切换、idle 恢复、超时同 key 重试、离线只读、缓存损坏；再加一条浏览器 E2E。
- **是否阻塞种子用户测试**：否，但修 P1 时应同步补测试。

### A-14 · P2 · snapshot diff 将“消失”统一解释为 rejected

- **问题描述**：当前快照缺失的 hypothesis 被统一标记 `rejected`；缺失也可能是 expired、替换或过滤，并不等于用户 discontinue。
- **证据文件与代码位置**：`frontend/src/mappers/snapshotMapper.ts:124-150`。
- **可能后果**：UI 可能伪造“拒绝继续使用”的语义，损害用户对纠正机制的信任。
- **推荐修复方式**：后端返回 change reason/event，或保留带状态 tombstone；未知时显示“已移出当前判断”。
- **是否阻塞种子用户测试**：否。

### A-15 · P3 · 根目录没有统一 .gitignore

- **问题描述**：frontend/backend 各自有 ignore，根目录没有。当前 tracked files 未发现真实 `.env`、数据库、缓存、私钥或日志。
- **证据文件与代码位置**：`frontend/.gitignore`；`backend/.gitignore`；仓库根目录无 `.gitignore`；`git ls-files` 仅命中两个 `.env.example`。
- **可能后果**：未来在根目录生成日志、数据库、密钥或工具缓存时更易误提交。
- **推荐修复方式**：增加根级防护规则并在 CI 加 secret scan。
- **是否阻塞种子用户测试**：否。

### A-16 · P3 · 生产配置缺少 fail-closed 约束

- **问题描述**：API base 与 mock 配置合理，CORS origin 默认限开发地址；但 `app_env` 不会自动关闭 reset，也不校验 production 使用了开发配置。
- **证据文件与代码位置**：`frontend/.env.example:1-2`；`frontend/src/config/developmentMock.ts:1`；`backend/app/core/config.py:8-14`；`backend/app/main.py:31-37`。
- **可能后果**：部署漏配时保留 localhost API 或开放 reset；CORS methods/headers 也宽于实际需要。
- **推荐修复方式**：production 启动时拒绝 reset=true、localhost CORS、开发 mock；收窄 methods/headers。
- **是否阻塞种子用户测试**：本地不阻塞；共享部署与 A-02 一并处理。

## 6. Mock、死代码与结构检查

- 正式线程、理解、计划、行动反馈、系统修正和用户纠正均走 service/API，不再调用前端 Mock 生成权威结果。
- `VITE_ENABLE_DEVELOPMENT_MOCK` 默认 `false`，只有显式 `true` 才启用开发数据。
- 未发现页面直接 `fetch`，未发现 reducer 直接解析 DTO。
- 未发现明显未引用的正式 service/mapper；`developmentMock.ts` 作为显式开发工具保留。
- 步骤、计划状态、纠正类型和错误 code 仍在多处分散维护；后续可用 OpenAPI 生成 DTO/共享契约降低漂移风险。

## 7. 数据库与后端一致性

- SQLAlchemy metadata 与 Alembic migrations 一致，`alembic check` 无差异。
- 计划使用 `root_plan_id + version` 唯一约束与 `previous_plan_id` 外键，正常 revise 只追加。
- correction 为追加记录；accurate 不升版，其他类型按规则创建新版 snapshot。
- action result、hypothesis、snapshot 和 thread step 在同一 session/事务提交；现有测试验证 snapshot 失败时整体回滚。
- demo reset 删除顺序覆盖当前模型，测试通过；风险在开放权限而非孤儿数据。
- thread aggregate 对每个 plan 分别读取 items，存在轻度 N+1，但 MVP 数据量下不优先。

## 8. 关键测试缺口

1. 两个 thread 切换，确认 idle thread 不继承旧 plan/understanding/action。
2. system_revised 后用新 key 重复 accept，确认步骤不回退。
3. partial hypothesis 后提交反馈，确认旧记录不复活、替代项唯一 active。
4. correction 使用旧 snapshot version，确认 `VERSION_CONFLICT`。
5. 所有写接口的同 key/不同 body 与并发写入矩阵。
6. snapshot 并发升版与 IntegrityError 重试。
7. 浏览器完整 E2E：刷新、断网、草稿、恢复后原 key 重试。
8. 缓存损坏、旧 schema、不同 thread 草稿隔离。
9. accurate 不升版、discontinue 经后续理解/反馈仍不恢复。
10. 共享环境 reset 被禁用/未授权拒绝。

## 9. 种子测试决策

### 9.1 是否适合进入 5—10 人种子测试

- **共享服务、共享数据库：不适合。** A-01 与 A-02 为 P0。
- **每人独立实例/独立 SQLite、研究员受控操作：有条件适合。** 建议先修 A-04、A-05、A-06、A-07；A-03 至少限制单标签页并明确风险。

### 9.2 种子测试前必须修复

A-01 用户/数据隔离；A-02 reset 保护；A-03 correction 乐观锁；A-04 hypothesis 生命周期；A-05 步骤单调性；A-06 跨 thread 隔离；A-07 idle 恢复入口。

### 9.3 可延后事项

- A-09 可在计划扩展为多行动前完成。
- A-11 可在共享部署/PostgreSQL 前完成，但不能拖到正式上线后。
- A-15/A-16 在云端部署前完成。
- OpenAPI 自动生成、N+1 优化、细粒度审计日志可在真实 AI 接入后排期。

## 10. 推荐修复顺序

预计 **6 批**，每批 30—45 分钟：

1. 共享环境止血：production 关闭/保护 reset，明确独立实例临时方案。
2. 前端状态隔离：A-06、A-07 与 reducer/恢复测试。
3. 计划步骤单调性：A-05 与重复 accept 测试。
4. hypothesis 生命周期：A-04 与跨反馈测试。
5. 纠正并发保护：A-03，前后端 expected snapshot version 与冲突 UI。
6. 缓存和工程防护：A-10、A-12、A-13 的高价值测试，以及根级 ignore/production 校验。

真正的多用户隔离若采用临时 seed token，预计额外 1—2 批；完整登录系统超出当前批次范围。

## 11. 技术债务总览

| 领域 | 当前状态 | 主要债务 |
| --- | --- | --- |
| 核心流程 | 已贯通，服务端守卫基本完整 | 少数重复操作/恢复组合会导致步骤不一致 |
| 数据可信度 | append-only、事务、版本链基础良好 | correction 缺乐观锁；hypothesis active 规则不唯一 |
| 前端状态 | currentStep/serverStep 已区分 | 跨 thread 清理和 idle 恢复有漏洞 |
| 幂等 | 核心写接口全覆盖，可拒绝同 key 不同 body | 并发插入、TTL/reset 清理、浏览器测试不足 |
| 缓存 | 服务端优先、离线标识已实现 | runtime schema、thread 隔离、损坏缓存测试不足 |
| 测试 | 后端 24 项覆盖主链路与事务 | 前端零自动化；并发、恢复、组合状态缺口明显 |
| 安全/部署 | 无硬编码密钥，当前未跟踪敏感文件 | 固定 demo-user、开放 reset、production fail-closed 缺失 |
| 可维护性 | service/mapper/reducer 边界清楚 | enum/契约重复维护；少量 N+1 与推断字段 |

总体判断：这是一个结构已经成形、核心链路可演示的 MVP，不需要推倒重写。下一阶段重点应从继续加功能转为隔离用户、收紧状态不变量、保护纠正可信度，并补少量高价值自动化测试。
