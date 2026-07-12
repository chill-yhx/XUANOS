# XUANOS 前后端联调规格 v0.1

- 文档版本：v0.1
- 当前阶段：阶段 5 - 前后端联调设计
- 适用范围：XUANOS MVP、固定用户 `demo-user`
- 前端状态：React Context + `useReducer`
- 后端实现：FastAPI + SQLite + 确定性 Mock 规则
- 核心边界：不接真实 AI、不做登录、不做支付、不新增 MVP 页面

---

# 1. 文档目标

本规格定义现有五页前端 Mock 闭环如何迁移到当前后端 API，并明确：

1. 每个用户动作调用哪个 API。
2. API DTO 与前端领域状态如何映射。
3. 服务端 ID、时间、流程状态、计划版本和快照版本如何成为权威数据。
4. `localStorage` 如何从主数据源降级为缓存、草稿和恢复辅助。
5. 失败、超时、重复提交、版本冲突和后端不可用时如何处理。
6. 联调期间需要新增或修改的前端模块，以及实施和验收顺序。

完整目标链路为：

```text
首页创建线程
→ 选择表达方式并提交目标
→ 逐题提交理解回答
→ 确认或纠正理解
→ 创建计划
→ 修改或接受计划
→ 提交行动反馈
→ 获取最新系统快照
```

联调后，后端是已提交业务事实的唯一权威来源。前端 reducer 继续负责页面状态、输入草稿、请求状态和展示投影，但不再自行生成已确认理解、计划版本、行动结果或系统快照。

---

# 2. 联调原则与数据权威

## 2.1 服务端权威数据

以下数据只能由 API 成功响应或线程聚合恢复结果写入前端：

- `thread.id`、线程状态、服务端流程步骤和当前对象指针。
- 理解 session ID、回答 ID/修订号、摘要版本和确认时间。
- 纠正记录 ID、处理结果和创建时间。
- 计划 ID、`root_plan_id`、`previous_plan_id`、版本、状态和接受时间。
- 行动结果 ID、系统修正和 hypothesis 状态。
- 快照 ID、快照版本、来源 ID、修正次数和服务端时间。

前端不得继续使用 `Date.now()` 生成上述实体 ID，也不得在 API 请求成功前伪造 `accepted`、`system_revised` 等持久化状态。

## 2.2 前端本地状态

以下内容仍由前端负责：

- 当前页面、弹层、折叠状态和“档案 / 日记 / 混合”展示模式。
- 尚未提交的目标、当前问题回答、计划修改和行动反馈草稿。
- `expression_mode`、`collecting_input`、`action_pending`、`feedback_submitted` 等瞬时 UI 步骤。
- 请求中的 loading、error、timeout、retry 和 stale 状态。
- 已发出写请求的 idempotency key 与请求指纹。

## 2.3 服务端步骤与 UI 步骤

当前后端不会单独持久化全部前端瞬时步骤，因此联调后建议同时保存：

```ts
currentStep: InteractionStep       // 页面当前展示步骤
serverStep: InteractionStep        // thread.current_step，服务端权威步骤
```

具体规则：

- 创建线程后服务端仍为 `idle`，前端可进入 `expression_mode`。
- `speak/sort` 选择后，前端可进入 `collecting_input`；首次 analyze 成功后采用服务端步骤。
- 接受计划后服务端返回 `plan_accepted`；用户点击“进入行动”时，前端本地进入 `action_pending`。
- 提交反馈请求期间，前端本地进入 `feedback_submitted`；成功响应直接返回服务端 `system_revised`。
- 除这些明确的瞬时步骤外，`currentStep` 应跟随 `serverStep`。

---

# 3. API 基础约定

## 3.1 运行地址

开发期建议新增前端环境变量：

```text
VITE_API_BASE_URL=http://127.0.0.1:8000
```

前端由 Vite 运行在 `http://localhost:5173` 或 `http://127.0.0.1:5173`。当前后端 CORS 已允许这两个来源。

## 3.2 成功响应

除 `/health` 外，当前业务接口统一返回：

```ts
interface ApiEnvelope<T> {
  data: T
  meta: {
    request_id: string
    next_cursor: string | null
  }
}
```

API client 负责解包 `data`，并把 `meta.request_id` 保存到请求诊断信息；页面组件不得重复处理 envelope。

`GET /health` 是例外，直接返回：

```json
{
  "status": "ok",
  "service": "xuanos-backend",
  "database": "ok",
  "version": "0.1.0"
}
```

## 3.3 错误响应

```ts
interface ApiErrorPayload {
  error: {
    code: string
    message: string
    details: unknown
    request_id: string
  }
}
```

前端流程判断使用 `code`，中文 `message` 只用于用户提示，`request_id` 用于定位问题。

## 3.4 命名与时间

- API 请求、响应和错误详情保持 `snake_case`。
- 前端领域类型保持 `camelCase`。
- DTO 类型只存在于 `frontend/src/api/`，页面和 reducer 不得接触原始 snake_case 对象。
- 时间保留为服务端 ISO 8601 字符串，不在 reducer 内转为 `Date`。
- 仅在展示层格式化时区和相对时间。
- 枚举保存稳定英文 code，中文标签由前端字典提供。

## 3.5 幂等头

当前以下写接口必须携带 `Idempotency-Key`，长度为 8 至 160：

```text
POST /api/understanding/analyze
POST /api/understanding/{session_id}/confirm
POST /api/plans
POST /api/plans/{plan_id}/revise
POST /api/plans/{plan_id}/accept
POST /api/action-results
```

建议格式：

```text
xuanos-{operation}-{crypto.randomUUID()}
```

同一操作在结果未知时重试，必须复用同一个 key 和完全相同的请求体。用户修改请求内容后，必须创建新 key。

当前 `POST /api/threads` 和 `POST /api/demo/reset` 未接入幂等头，前端不得自动重试创建线程。

---

# 4. API 与完整前端流程

## 4.1 接口总表

| 前端场景 | API | 状态码 | 幂等头 | 主要写入 |
|---|---|---:|---:|---|
| 启动探活 | `GET /health` | 200/503 | 否 | API 可用状态 |
| 创建线程 | `POST /api/threads` | 201 | 当前不支持 | `activeThread`、服务端 ID |
| 恢复线程列表 | `GET /api/threads?limit=20&status=...` | 200 | 否 | 线程摘要列表 |
| 恢复完整线程 | `GET /api/threads/{thread_id}` | 200 | 否 | 整个业务聚合状态 |
| 开始理解 / 提交回答 | `POST /api/understanding/analyze` | 200 | 是 | session、回答、下一题或摘要 |
| 纠正 / 确认理解 | `POST /api/understanding/{session_id}/confirm` | 200 | 是 | 纠正、摘要、快照、步骤 |
| 创建计划 v1 | `POST /api/plans` | 201 | 是 | 当前计划与版本链 |
| 创建计划下一版本 | `POST /api/plans/{plan_id}/revise` | 201 | 是 | 旧版本、新版本、纠正记录 |
| 接受当前计划 | `POST /api/plans/{plan_id}/accept` | 200 | 是 | accepted plan、快照、步骤 |
| 提交行动反馈 | `POST /api/action-results` | 201 | 是 | 结果、修正、hypothesis、快照 |
| 获取最新系统快照 | `GET /api/users/demo-user/snapshot` | 200 | 否 | 最新快照 |
| 重置演示数据 | `POST /api/demo/reset` | 200 | 当前不支持 | 初始快照与 `idle` |

## 4.2 应用启动与恢复

启动顺序：

1. 同步读取 `localStorage` 中的缓存和草稿，先渲染可恢复界面并标记 `stale=true`。
2. 调用 `GET /health`。
3. 如果存在 `lastThreadId`，调用 `GET /api/threads/{thread_id}`。
4. 如果该线程返回 404，则调用 `GET /api/threads?limit=20`，选择最近线程或回到首页。
5. 如果没有 `lastThreadId`，可直接调用线程列表；没有线程时保持首页 `idle`。
6. 聚合响应经 `threadAggregateMapper` 写入 reducer，服务端业务事实覆盖本地缓存。

恢复时不逐个补请求理解、计划和快照，因为 `GET /api/threads/{thread_id}` 已返回：

```text
thread
active_understanding_session
current_answers
understanding_summary
recent_corrections
current_plan
plan_versions
latest_action_result
current_snapshot
```

## 4.3 首页创建线程

用户点击“开始校准”时调用：

```http
POST /api/threads
Content-Type: application/json

{
  "title": "XUANOS 暑假开发"
}
```

成功后：

- `thread.id` 写入 `activeThread.id` 和 `lastThreadId`。
- `thread.current_step=idle` 写入 `serverStep`。
- 前端 `currentStep` 进入 `expression_mode`。
- 清空上一条未绑定线程的理解和计划草稿。
- 不再使用初始 Mock 的 `thread-xuanos-summer` 作为服务端 ID。

按钮在请求中必须禁用。由于当前接口没有幂等支持，超时后不自动再次 POST；先调用线程列表让用户恢复最近线程。

## 4.4 选择表达方式并开始理解

三种模式最终调用同一个 analyze 接口。

### `ask`：XUANOS 来问我

选择后立即调用：

```json
{
  "thread_id": "server-thread-id",
  "session_id": null,
  "expression_mode": "ask",
  "user_input": null,
  "answer": null
}
```

响应应包含第一题 `desired_result`，前端进入 `asking_question`。

### `speak`：我先完整表达

选择后先本地进入 `collecting_input`。用户提交有效文本时调用：

```json
{
  "thread_id": "server-thread-id",
  "session_id": null,
  "expression_mode": "speak",
  "user_input": "用户完整表达",
  "answer": null
}
```

### `sort`：一起梳理

流程与 `speak` 相同，但 `expression_mode` 为 `sort`。当前后端要求 `speak/sort` 首次 analyze 时必须有非空 `user_input`。

首次成功响应必须保存 `session.id`，后续回答不得重新创建 session。

## 4.5 逐题提交理解回答

每次只提交服务端 `next_question` 指定的一题：

```json
{
  "thread_id": "server-thread-id",
  "session_id": "server-session-id",
  "answer": {
    "question_id": "desired_result",
    "answer_text": "用户回答"
  }
}
```

不重复发送 `expression_mode` 和原始输入。三题顺序为：

```text
desired_result
current_foundation
real_constraints
```

响应处理：

- 有 `next_question`：写入当前题，采用 `current_step=asking_question`。
- `next_question=null` 且有 `understanding`：写入理解摘要，进入 `reviewing_understanding`。
- `current_answers` 转成前端 `answers` Record，同时保留回答 ID、revision 和服务端时间元数据。

返回修改已答问题时仍调用 analyze。后端会新增 Answer revision，不覆盖旧记录。必须使用新 idempotency key；同一次未确认重试才复用旧 key。

理解已经 confirmed 后，不允许继续向旧 session 追加回答。“重新回答问题”必须以 `session_id=null` 创建新 session；服务端通过 `previous_session_id` 保留来源链。

## 4.6 理解纠正与确认

### 纠正或补充

```http
POST /api/understanding/{session_id}/confirm
Idempotency-Key: ...

{
  "assessment": "partial",
  "correction": "当前重点是……"
}
```

`partial`、`inaccurate`、`supplement` 必须提供 correction。成功后：

- 追加 mapper 后的 correction，不覆盖旧记录。
- 更新摘要和 `summaryVersion`。
- 如果响应包含 snapshot，使用 `snapshotMapper` 更新快照缓存。
- 保持 `reviewing_understanding`，等待用户再次明确确认。

### 确认准确

```json
{
  "assessment": "accurate",
  "correction": null
}
```

成功后：

- 保存 `confirmedAt` 和 session `status=confirmed`。
- `serverStep/currentStep` 更新为 `understanding_confirmed`。
- 使用响应中的 snapshot 替换当前快照。
- 此前不得允许“生成计划”按钮触发计划请求。

## 4.7 创建计划

```http
POST /api/plans
Idempotency-Key: ...

{
  "thread_id": "server-thread-id",
  "understanding_session_id": "confirmed-session-id"
}
```

只有 confirmed session 才允许请求。成功后：

- `planMapper` 生成前端当前计划。
- 以 `plan.id` 去重后写入 `planVersions`。
- 保存 `rootPlanId`、`previousPlanId`、`version`、`status` 和 items。
- `serverStep/currentStep` 更新为 `plan_generated`。

## 4.8 修改计划

前端中文原因映射为后端 code：

| UI 文案 | API code |
|---|---|
| 时间冲突 | `time_conflict` |
| 资源限制 | `resource_limit` |
| 能力限制 | `ability_limit` |
| 身体或安全原因 | `health_or_safety` |
| 个人偏好 | `personal_preference` |
| 不认可系统判断 | `reject_system_judgment` |
| 其他 | `other` |

请求：

```json
{
  "reason": "time_conflict",
  "user_final_choice": "用户最终选择",
  "expected_impact_acknowledged": true,
  "expected_version": 1
}
```

URL 中使用当前 `plan.id`，`expected_version` 使用当前服务端版本。成功后：

- `previous_plan` 和 `current_plan` 都经 `planMapper` 映射。
- 用 ID 更新 v1 的 `status=superseded`，不得删除 v1。
- 追加 v2，并以响应 `current_plan.id` 更新当前计划指针。
- `serverStep/currentStep` 更新为 `plan_modified`。

出现 `VERSION_CONFLICT` 时，不重放旧修改；先 GET 线程聚合并展示最新版本，再让用户确认是否重新提交。

## 4.9 接受计划

```http
POST /api/plans/{current_plan_id}/accept
Idempotency-Key: ...

{
  "expected_version": 2
}
```

成功后：

- 将响应 plan 设为 `currentPlan`，按 ID 更新版本链。
- 写入 acceptedAt 和 snapshot。
- `serverStep/currentStep` 更新为 `plan_accepted`。
- 用户点击“进入行动”时只做本地步骤切换到 `action_pending`，当前无需额外 API。

服务端重复接受同一当前版本会返回同一 accepted 状态，不创建新快照；前端按 plan ID 和 snapshot ID 幂等合并。

## 4.10 提交行动反馈

现有 `FeedbackPayload` 必须先改为稳定字段，不能把“约 45 分钟”等字符串直接提交。

```json
{
  "thread_id": "server-thread-id",
  "plan_id": "accepted-plan-id",
  "started": true,
  "completed": false,
  "progress_percent": 70,
  "actual_duration_minutes": 55,
  "obstacle_code": "time_conflict",
  "obstacle_detail": null,
  "energy_change": "开始后更专注",
  "unrealistic_part": "原计划范围偏大"
}
```

提交规则：

- 前端先完成与 Pydantic 相同的校验。
- 未开始时 `completed=false` 且 `progress_percent=0`。
- 已完成时 `progress_percent=100`。
- 提交期间本地进入 `feedback_submitted` 并锁定按钮。
- 只有当前 accepted plan ID 可以提交。

成功响应一次性包含：

```text
action_result
system_revision
hypothesis
snapshot
current_step=system_revised
```

因此 reducer 必须在一个 success action 中原子写入行动结果、系统修正、hypothesis、最新快照和步骤，不能先本地运行 `reviseSystem()`。

## 4.11 获取最新系统快照

行动反馈响应中的 snapshot 已是事务内生成的最新版本。为完成读后校验，进入“我的系统”页时再调用：

```http
GET /api/users/demo-user/snapshot
```

合并规则：

- 响应 `version` 大于本地版本时替换。
- version 相同且 ID 相同时视为同一快照。
- 不允许旧缓存覆盖更高版本。
- 快照 GET 失败时保留刚由反馈响应返回的版本，并显示“等待重新同步”，不回滚成功反馈。

---

# 5. DTO 与前端字段映射

## 5.1 转换策略

采用显式 mapper，不对未知对象做通用递归改名。原因是以下字段不是简单大小写转换：

- API answers 是数组，前端当前是 `Record<QuestionId, string>`。
- API plan 使用 `items` 表达维持、暂停、删除和行动项。
- API snapshot 的 `effective_patterns`、`hypotheses` 是结构化对象，前端当前是字符串数组。
- `mainGoal` 不直接存在于 `PlanRead`，需要结合确认后的理解摘要。
- 中文计划修改原因必须转换为稳定英文 code。

每个 mapper 同时提供 `fromApi` 和必要的请求构造函数，页面不得手写 snake_case。

## 5.2 Thread 映射

| API | 前端 |
|---|---|
| `id` | `id` |
| `user_id` | `userId` |
| `current_step` | `serverStep` / `activeThread.currentStep` |
| `active_understanding_session_id` | `activeUnderstandingSessionId` |
| `active_plan_id` | `activePlanId` |
| `last_activity_at` | `lastActivityAt` |
| `created_at` | `createdAt` |
| `updated_at` | `updatedAt` |

`activeThread` 必须允许 `null`。demo reset 或尚未创建线程时，不再保留假服务端线程 ID。

## 5.3 Understanding 映射

| API | 前端 |
|---|---|
| `session.id` | `activeUnderstandingSession.id` |
| `previous_session_id` | `previousSessionId` |
| `expression_mode` | `expressionMode` |
| `current_question_index` | `currentQuestionIndex` |
| `summary_version` | `summaryVersion` |
| `confirmed_at` | `confirmedAt` |
| `next_question` | `currentQuestion` |
| `understanding.real_goal` | `understanding.realGoal` |
| `understanding.constraints` | `understanding.constraints` |
| `current_answers[].answer_text` | `answers[questionId]` |
| `current_answers[].revision` | `answerMeta[questionId].revision` |

`UnderstandingSummary` 可继续保存五个展示字段，但 session 元数据应放在独立的 `UnderstandingSession` 类型中，避免把摘要内容与持久化状态混在一起。

Correction 映射：

```text
target_type       → targetType
target_id         → targetId
previous_value    → previousValue
user_value        → userValue
system_handling   → systemHandling
has_conflict      → hasConflict
created_at        → createdAt
updated_at        → updatedAt
```

## 5.4 Plan 映射

```text
root_plan_id                → rootPlanId
previous_plan_id            → previousPlanId
understanding_session_id    → understandingSessionId
primary_goal_id             → primaryGoalId
single_action               → singleAction
completion_standard         → completionStandard
review_condition            → reviewCondition
system_recommendation       → systemRecommendation
is_user_final_choice        → isUserFinalChoice
user_final_choice           → userFinalChoice
modification_reason         → modificationReason
expected_impact             → expectedImpact
warning_level               → warningLevel
accepted_at                 → acceptedAt
created_at / updated_at     → createdAt / updatedAt
```

计划项转换：

```text
item_type=maintenance → maintenanceGoals[]
item_type=paused      → pausedGoals[]
item_type=removed     → removedItems[]
item_type=action      → actionItems[]，主展示仍以 plan.single_action 为准
```

`mainGoal` 的过渡规则：

1. 优先使用当前 confirmed understanding 的 `realGoal`。
2. 恢复线程时使用 aggregate 的 `understanding_summary.real_goal`。
3. 若两者缺失，使用 snapshot `current_vector`。
4. `plan.summary` 单独保存为 `summary`，不得错误地当作主目标 ID 或原始目标。

计划版本按 `rootPlanId` 分组、按 `version` 升序显示；当前计划由 `thread.active_plan_id` 决定，不以数组最后一项猜测。

## 5.5 Action Result 映射

请求字段：

```text
progress                  → progress_percent
actualDurationMinutes     → actual_duration_minutes
obstacleCode              → obstacle_code
obstacleDetail            → obstacle_detail
energyChange              → energy_change
unrealisticPart           → unrealistic_part
```

响应字段：

```text
actual_result_summary     → actionResult.actualResultSummary
original_judgment         → actionResult.originalJudgment
revised_judgment          → actionResult.revisedJudgment
next_adjustment           → actionResult.nextAdjustment
submitted_at              → actionResult.submittedAt
system_revision.actual_result → systemRevision.actualResult
```

现有 `FeedbackPayload.duration: string` 应改为 `actualDurationMinutes: number | null`；`obstacle` 应改为 `obstacleCode`，中文标签仅供 UI 展示；`note` 应拆成 `obstacleDetail` 与 `unrealisticPart`。

## 5.6 Snapshot 映射

```text
user_id                    → userId
source_thread_id           → sourceThreadId
source_action_result_id    → sourceActionResultId
current_vector             → currentVector
current_stage              → currentStage
current_action             → currentAction
reality_boundaries         → realityBoundaries
effective_patterns         → effectivePatterns
recent_revisions           → recentRevisions
user_corrections           → userCorrections
revision_count             → revisionCount
created_at / updated_at    → createdAt / updatedAt
```

前端类型应增加：

```ts
interface EffectivePattern {
  content: string
  maturity: string
}

interface HypothesisSummary {
  id: string
  content: string
  status: string
}
```

不得再把结构化 `effective_patterns` 和 `hypotheses` 强制转换成无状态字符串数组。

## 5.7 Thread Aggregate 映射

`threadAggregateMapper` 是刷新恢复的总入口，按以下顺序组合：

1. 映射 thread 和 `serverStep`。
2. 映射 active understanding session、当前回答和摘要。
3. 映射 corrections，按服务端时间保留顺序。
4. 映射全部 plan versions，再按 `active_plan_id` 指向 current plan。
5. 映射 latest action result，并从其中恢复最近 system revision。
6. 映射 current snapshot。
7. 根据服务端步骤与本地草稿决定 UI `currentStep`，不得改变服务端事实。

如果本地缓存的 thread ID 与响应不一致，必须丢弃该线程绑定的旧草稿和 pending request，防止跨线程提交。

---

# 6. 前端状态调整

现有 `DemoSessionState` 建议演进为 API-aware 状态，至少新增或调整：

```text
dataSource: api | cache | mock
serverStep
activeThread: ActiveThread | null
activeUnderstandingSession
currentQuestion
answerMeta
latestActionResult
requestState
syncState
```

关键字段调整：

1. `schemaVersion` 移到 localStorage cache envelope，不再作为业务状态。
2. `activeThread` 增加 userId、currentStep、activePlanId、activeUnderstandingSessionId、createdAt、updatedAt，并允许 null。
3. `UnderstandingSummary` 与 `UnderstandingSession` 分离。
4. `CorrectionRecord` 增加 targetType、targetId、reason、systemHandling、hasConflict、updatedAt。
5. `PlanVersion` 增加 rootPlanId、previousPlanId、summary、primaryGoalId、items、warningLevel、acceptedAt、updatedAt。
6. `PlanModificationReason` 改为英文 code union，中文放到展示字典。
7. `FeedbackPayload` 使用分钟数和 obstacle code。
8. `SystemSnapshot` 增加 ID、userId、version、来源 ID、结构化规律/假设和服务端时间。
9. `systemRevision` 与 `latestActionResult` 保存服务端实体，不再由 `interactionMock.ts` 计算。
10. `currentPlan` 由 activePlanId 定位；`planVersions` 只做不可变历史展示。

异步请求不写进 reducer。Context 或 service 层执行 API 调用，并 dispatch 成对 action：

```text
*_REQUESTED
*_SUCCEEDED
*_FAILED
```

success action 携带 mapper 后的领域数据；reducer 只做纯状态合并。原有 `GENERATE_PLAN`、`APPLY_SYSTEM_REVISION` 等 action 在 API 模式下不得调用本地 Mock 生成函数。

---

# 7. Mapper 设计

必须新增以下 mapper：

## 7.1 `understandingMapper`

职责：

- 构造首次 analyze 和逐题 answer 请求。
- 映射 session、当前答案、下一题和理解摘要。
- 把 Answer 数组转换为 Record 与 metadata。
- 映射 confirm 返回的 correction 和可选 snapshot。

建议导出：

```text
toAnalyzeRequest
fromAnalyzeResult
toConfirmRequest
fromConfirmResult
```

## 7.2 `planMapper`

职责：

- 构造 create、revise、accept 请求。
- 映射计划版本链字段。
- 将 plan items 分组为维持、暂停、删除和行动展示项。
- 处理修改原因 code、warning level 和 acceptedAt。
- 接受主目标上下文，避免误用 plan summary。

## 7.3 `actionResultMapper`

职责：

- 将 FeedbackPayload 转为 ActionResultCreate DTO。
- 映射 ActionResult、SystemRevision 和 Hypothesis。
- 调用 `snapshotMapper` 处理事务返回的快照。
- 对完成比例与 started/completed 组合做前端预校验。

## 7.4 `snapshotMapper`

职责：

- 映射快照 ID、版本、来源和时间。
- 保留 effective pattern maturity 与 hypothesis status。
- 提供按 version/ID 合并快照的纯函数。

## 7.5 `threadAggregateMapper`

职责：

- 组合上述 mapper，生成一次可恢复的前端业务状态补丁。
- 用 active object ID 决定当前实体。
- 从 latest action result 恢复最近修正展示。
- 对本地瞬时 UI step 与服务端 step 做受控投影。

Mapper 必须有独立单元测试，覆盖 null 字段、空版本链、v1/v2、结构化 snapshot、answer revision 和聚合恢复。

---

# 8. API Client 与 Service 文件

建议新增：

```text
frontend/src/api/
├── client.ts
├── contracts.ts
├── errors.ts
├── idempotency.ts
├── threadsApi.ts
├── understandingApi.ts
├── plansApi.ts
├── actionResultsApi.ts
├── snapshotsApi.ts
└── demoApi.ts
```

职责：

- `client.ts`：base URL、JSON、timeout、envelope 解包、request ID 和统一错误。
- `contracts.ts`：与 Pydantic schema 一致的 snake_case DTO。
- `errors.ts`：`ApiError`、网络错误、超时与错误 code 类型守卫。
- `idempotency.ts`：生成、复用和释放 idempotency key。
- `*Api.ts`：只描述 URL、method、header 和 DTO，不修改 React 状态。

建议新增 service：

```text
frontend/src/services/
├── threadService.ts
├── understandingService.ts
├── planService.ts
├── actionResultService.ts
├── snapshotService.ts
└── sessionSyncService.ts
```

Service 负责串联 API、mapper、缓存与 reducer dispatch。页面只调用语义方法，例如：

```text
startCalibration
selectExpressionMode
submitInitialInput
submitAnswer
confirmUnderstanding
revisePlan
acceptPlan
submitFeedback
refreshSnapshot
resetDemo
```

---

# 9. localStorage 迁移方案

## 9.1 新缓存键

现有主数据键：

```text
xuanos:demo-user:session:v1
```

联调时建议改为：

```text
xuanos:demo-user:integration-cache:v2
```

建议结构：

```ts
interface IntegrationCacheV2 {
  schemaVersion: 2
  savedAt: string
  dataSource: 'api' | 'mock'
  lastThreadId: string | null
  lastPage: PageId
  uiStep: InteractionStep
  lastServerUpdatedAt: string | null
  snapshotVersion: number | null
  drafts: {
    expressionMode: ExpressionMode | null
    userInput: string
    currentAnswer: string
    planModification: unknown | null
    actionFeedback: FeedbackPayload
  }
  pendingRequests: Record<string, {
    idempotencyKey: string
    payloadHash: string
    createdAt: string
  }>
  cachedAggregate: unknown | null
}
```

## 9.2 最终保留内容

localStorage 最终只保留：

- 最近线程 ID、最后页面和瞬时 UI step。
- 尚未提交的用户草稿。
- 最近一次成功读取的线程聚合与快照缓存，用于先渲染后校验。
- 未知结果写请求的 idempotency key 和 payload hash。
- 非业务 UI 偏好，例如系统展示模式。
- 缓存版本、保存时间和最近服务端更新时间。

以下内容不再把 localStorage 当作权威来源：

- 已确认理解和纠正历史。
- 计划版本链和 accepted 状态。
- 已提交行动结果。
- hypothesis 状态。
- 当前系统快照版本。

## 9.3 v1 迁移

- 首次读取旧 v1 时，只提取未提交 userInput、反馈草稿和 UI 偏好。
- 不上传旧 Mock 的 thread/plan/correction ID。
- 不把旧 Mock 的确认、接受或修正状态写入服务端。
- API 首次成功恢复或用户重置后写入 v2，并移除旧 v1 键。
- 迁移失败时保留旧键但忽略其业务事实，不能让应用崩溃。

## 9.4 缓存更新

- 只在 API success action 后更新对应业务缓存。
- 输入草稿可节流保存。
- 服务端 aggregate 永远覆盖较旧缓存。
- snapshot 以 `version` 为第一比较条件，以 ID 和 updatedAt 为辅助条件。
- reset 成功后清除所有 thread-bound 草稿、pending request 和 cached aggregate，再保存初始 snapshot。

---

# 10. 失败、超时与重复提交

## 10.1 请求超时

建议默认：

```text
GET/health：8 秒
普通 GET：10 秒
写请求：20 秒
```

使用 `AbortController`。超时必须与用户主动取消、HTTP 错误和离线错误区分。

- GET 可进行一次短延迟自动重试。
- 写请求不自动生成新请求。
- 写请求结果未知时，保留 payload 和 idempotency key，用户点击重试时原样复用。
- 创建线程没有服务端幂等，超时后先读取线程列表，不自动重发。

## 10.2 重复提交

- 按钮 pending 时禁用，防止同一页面双击。
- 相同 key + 相同 payload 返回首次结果，前端按实体 ID/version 幂等合并。
- 相同 key + 不同 payload 返回 `409 DUPLICATE_SUBMISSION`，视为客户端请求管理错误。
- 用户修改草稿后产生新操作和新 key。
- idempotency key 只在明确成功、明确业务失败或用户放弃操作后释放。

## 10.3 错误 code 处理

| code / 场景 | 前端处理 |
|---|---|
| `VALIDATION_ERROR` | 保留草稿，映射 `details` 到字段；不推进步骤 |
| `RESOURCE_NOT_FOUND` | 清理失效资源指针，重新拉取线程列表或返回首页 |
| `INVALID_FLOW_STATE` | GET 线程聚合，以服务端步骤恢复 |
| `UNDERSTANDING_NOT_CONFIRMED` | 回到理解确认页，保留输入 |
| `PLAN_NOT_ACCEPTED` | 回到计划页并拉取当前计划 |
| `VERSION_CONFLICT` | 拉取 aggregate，展示最新版本后再决定修改 |
| `DUPLICATE_SUBMISSION` | 停止重试，保留 request ID 与草稿，要求重新确认 |
| `INTERNAL_ERROR` | 保留草稿和 pending key，提供重试，不伪造成功 |
| HTTP 503 / 网络失败 | 进入离线或缓存状态，按降级策略处理 |
| timeout | 标记结果未知；写请求复用原 key 查询或重试 |

任何失败都不得通过 reducer 推进到下一个服务端状态。

---

# 11. 后端不可用与 Mock 降级

允许受控 Mock 降级，但禁止无提示的双数据源写入。

建议开关：

```text
VITE_ENABLE_MOCK_FALLBACK=true   # 仅开发和演示环境
```

规则：

1. 已存在 API thread 时，后端不可用只允许读取缓存和继续编辑草稿；不得切换到 Mock 继续生成理解、计划或快照。
2. 尚未创建 API thread 且开关开启时，可以显式进入 Mock 演示模式。
3. Mock 模式必须显示离线/演示状态，并使用独立 storage namespace。
4. Mock 实体不得与服务端实体自动合并或上传。
5. 后端恢复后，API 模式重新拉取服务端聚合；Mock session 仍保持隔离。
6. 生产环境默认关闭 Mock fallback。

`interactionMock.ts` 在联调后只作为显式 Mock fallback 的规则来源，不再作为 API 模式的默认业务生成器。

---

# 12. 当前契约缺口

联调必须按当前实现处理以下差异，不得在前端假装后端已经支持：

1. `POST /api/threads` 当前没有 `Idempotency-Key`，只能依赖前端提交锁和超时后的列表恢复。
2. 服务端不单独持久化 `expression_mode` 选择页、`collecting_input`、`action_pending` 和请求中的 `feedback_submitted`，这些是前端瞬时步骤。
3. `PlanRead` 不直接返回主目标正文，只返回 `primary_goal_id`、summary 和关联 understanding ID；前端需从 confirmed understanding 或 snapshot 组合主目标。
4. “我的系统”页当前任意手工纠正没有独立后端接口。联调时只能保留为未提交草稿，不能继续以 `ADD_SYSTEM_CORRECTION` 伪装成已持久化。
5. 线程列表当前支持 `limit` 和 `status`，尚未接收 cursor；虽然 envelope 有 `next_cursor`，前端本轮不要发送 cursor。
6. mentor preferences API 尚未出现在当前 routes 中，不属于本次核心闭环联调。

前三项不阻塞完整核心流程。第 4 项不在本轮验收主链路内，后续应单独定义 API 后再接入。

---

# 13. 联调实施顺序

## 第 1 批：契约与纯转换

1. 增加 API DTO、错误类型和环境变量。
2. 实现五个 mapper 与单元测试。
3. 调整前端领域类型，暂不改页面视觉。
4. 实现 API client、timeout 和 idempotency manager。

验收：使用后端测试 fixture JSON 可以稳定生成现有页面需要的领域状态。

## 第 2 批：只读恢复

1. 接入 health。
2. 接入线程列表、线程 aggregate 和 snapshot。
3. 把 localStorage 改成 cache-first、server-revalidate。
4. 验证刷新、服务重启和最近线程恢复。

验收：页面刷新后从 SQLite 恢复，而不是从旧 Mock state 恢复业务事实。

## 第 3 批：首页与理解

1. 首页创建真实线程。
2. 三种表达模式接 analyze。
3. 三道题逐题提交。
4. 接入纠正和准确确认。
5. 验证 answer revision 与理解守卫。

## 第 4 批：计划版本链

1. 接入创建 Plan v1。
2. 接入 revise 并保留 v1。
3. 接入 accept 和 snapshot 更新。
4. 验证 `VERSION_CONFLICT` 恢复。

## 第 5 批：行动反馈与系统更新

1. 调整 feedback 字段为稳定 code/分钟数。
2. 接入行动反馈和同 key 重试。
3. 原子应用 action result、revision、hypothesis 和 snapshot。
4. 进入“我的系统”后 GET 最新 snapshot 复核。

## 第 6 批：降级与清理

1. 接入 demo reset。
2. 完成 v1 → v2 缓存迁移。
3. 隔离 Mock fallback。
4. 删除 API 模式下对本地理解、计划和修正规则的调用。
5. 完成全流程浏览器验收。

---

# 14. 验收标准

1. 首页点击“开始校准”后创建真实服务端线程并保存 UUID。
2. 三种表达方式都进入同一个后端理解 session 流程。
3. 三个问题每次只显示一个，回答记录来自 API。
4. 刷新后可由 thread aggregate 恢复当前问题、摘要、计划和快照。
5. 理解未确认时，前端不发计划请求；强行请求时能处理 409。
6. 纠正理解后保留 correction，用户再次 accurate 后才进入计划。
7. Plan v2 创建后 v1 仍可见，且 root/previous/version 链正确。
8. 接受计划后使用服务端 accepted 状态和快照。
9. 行动反馈使用稳定字段、有效 idempotency key 和 accepted plan ID。
10. 重复提交相同反馈不会新增第二个 action result 或 snapshot。
11. 反馈成功后 action result、system revision、hypothesis 和 snapshot 同时更新。
12. “我的系统”页显示最新 snapshot version，并能通过 GET 复核。
13. snake_case 不进入页面组件或 reducer 状态。
14. 服务端 ID、时间和版本不再由前端生成。
15. localStorage 清空后仍可从 SQLite 恢复核心业务流程。
16. 后端不可用时不伪造 API 成功；已有 API session 不会静默切换到 Mock 写入。
17. API 恢复后服务端事实覆盖较旧缓存，未提交草稿仍保留。
18. reset 后服务端和本地缓存都回到 `idle`，不残留旧线程 ID。
19. 五个现有页面和视觉基线保持不变，不新增 MVP 范围外页面。
20. 不接真实 AI、登录、支付或新的数据库能力。

---

# 15. 预计文件范围

## 新增

```text
frontend/.env.example
frontend/src/api/client.ts
frontend/src/api/contracts.ts
frontend/src/api/errors.ts
frontend/src/api/idempotency.ts
frontend/src/api/threadsApi.ts
frontend/src/api/understandingApi.ts
frontend/src/api/plansApi.ts
frontend/src/api/actionResultsApi.ts
frontend/src/api/snapshotsApi.ts
frontend/src/api/demoApi.ts
frontend/src/mappers/understandingMapper.ts
frontend/src/mappers/planMapper.ts
frontend/src/mappers/actionResultMapper.ts
frontend/src/mappers/snapshotMapper.ts
frontend/src/mappers/threadAggregateMapper.ts
frontend/src/services/threadService.ts
frontend/src/services/understandingService.ts
frontend/src/services/planService.ts
frontend/src/services/actionResultService.ts
frontend/src/services/snapshotService.ts
frontend/src/services/sessionSyncService.ts
```

同时建议为 mapper、client 和完整 flow 增加测试文件。

## 修改

```text
frontend/src/types/index.ts
frontend/src/state/interactionReducer.ts
frontend/src/state/InteractionContext.tsx
frontend/src/state/useInteraction.ts
frontend/src/data/interactionMock.ts
frontend/src/pages/HomePage.tsx
frontend/src/pages/UnderstandingPage.tsx
frontend/src/pages/PlanPage.tsx
frontend/src/pages/FeedbackPage.tsx
frontend/src/pages/SystemPage.tsx
frontend/src/App.tsx（仅在恢复/导航边界需要时）
```

本轮完整核心流程原则上不要求修改后端。若后续要消除当前契约缺口，可单独为线程创建幂等和系统快照纠正设计后端接口，不应夹带进首轮联调。

---

# 16. 阶段结论

联调后的职责边界应稳定为：

```text
页面收集输入并展示状态
→ service 发起语义操作
→ API client 处理协议、超时和幂等
→ 后端执行守卫、规则与事务
→ mapper 转为前端领域数据
→ reducer 原子应用成功结果
→ localStorage 只缓存结果和保留草稿
```

完整流程对应关系为：

```text
POST thread
→ POST understanding/analyze × 多次
→ POST understanding/{id}/confirm × 纠正/确认
→ POST plans
→ POST plans/{id}/revise（可选）
→ POST plans/{id}/accept
→ POST action-results
→ GET demo-user/snapshot
```

第一轮联调成功的标志不是页面“看起来仍能走通”，而是刷新浏览器、清空业务缓存或重启后端后，用户仍能从数据库恢复同一条线程、同一条计划版本链和最新系统快照。
