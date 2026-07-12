# XUANOS 后端 MVP 规格 v0.1

- 文档版本：v0.1
- 当前阶段：阶段 4 - 后端基础设计
- 适用版本：XUANOS MVP
- 默认用户：`demo-user`
- 生成方式：固定 Mock 规则
- 当前边界：不接真实 AI、不做登录、不做支付

---

# 1. 文档目标

本规格定义 XUANOS MVP 后端的技术栈、职责边界、数据模型、API、流程守卫、错误处理，以及前端从 `localStorage` 迁移到 API 的方案。

后端第一阶段只验证一件事：

> 同一个 `demo-user` 的目标、理解、纠正、计划版本、行动反馈和个人系统快照，能否跨页面、跨刷新、跨服务重启持续存在，并形成第二版判断。

后端不是聊天服务，也不负责前端视觉状态。它负责保存事实、执行流程约束、运行确定性 Mock 规则，并返回可追溯结果。

---

# 2. 技术栈

## 2.1 核心技术

```text
Python 3.12+
FastAPI
Pydantic v2
SQLAlchemy 2.x
SQLite（开发期）
PostgreSQL（上线期）
Alembic（数据库迁移）
Pytest（接口与服务测试）
Uvicorn（开发运行）
```

## 2.2 实现约束

- API 使用同步或异步 SQLAlchemy 均可，MVP 推荐同步 Session，降低早期复杂度。
- ORM 模型与 Pydantic API Schema 必须分离。
- 业务规则放在 service/rules 层，不写入路由函数或 ORM 模型。
- SQLite 与 PostgreSQL 使用同一套 SQLAlchemy 模型和 Alembic 迁移。
- 开发期数据库文件建议为 `backend/data/xuanos_dev.db`，不得提交真实用户数据。
- 时间统一保存为 UTC，API 输出 ISO 8601，例如 `2026-07-12T08:30:00Z`。
- 主键推荐 UUID 字符串，`demo-user` 是唯一例外，可使用稳定字符串主键。
- 枚举在数据库保存稳定英文 code，中文只作为前端展示文案。
- 不依赖数据库自带的 SQLite 特有行为，保证后续可切换 PostgreSQL。

## 2.3 配置

环境变量至少包含：

```text
APP_ENV=development
DATABASE_URL=sqlite:///./data/xuanos_dev.db
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
LOG_LEVEL=INFO
DEMO_RESET_ENABLED=true
```

上线期改为 PostgreSQL URL，并将 `DEMO_RESET_ENABLED` 设为 `false`。

---

# 3. 后端职责与边界

## 3.1 后端负责

- 保存固定用户 `demo-user` 和导师偏好。
- 创建、读取和恢复任务线程。
- 保存表达方式、用户原始输入和逐题回答。
- 生成并保存 Mock 理解摘要。
- 确认理解并保存用户纠正记录。
- 保存目标与现实约束。
- 生成计划、接受计划并保存所有历史版本。
- 保存行动反馈并防止重复提交。
- 根据行动结果运行 Mock 修正规则。
- 更新系统假设和用户当前快照。
- 执行流程状态守卫和数据校验。
- 返回稳定、可版本化的 API 数据结构。

## 3.2 后端暂不负责

- 真实 AI 推理或自由对话。
- 登录、注册、Token、权限系统和多租户。
- 支付、订阅、通知、排行榜和社区。
- 文件上传、语音识别和移动端推送。
- 复杂推荐系统、统计模型和精确成功概率。
- 保存无关敏感隐私或建立不可纠正的人格画像。

## 3.3 三层数据原则

后端数据分为三层：

1. 原始记录：用户输入、回答、纠正、计划版本、行动结果，只追加，不静默覆盖。
2. 结构化模型：目标、约束、假设和计划，将当前有效状态与历史分开。
3. 当前快照：供前端快速读取的用户系统摘要，每次修正新增版本。

---

# 4. 通用数据约定

## 4.1 所有对象公共字段

所有核心对象至少具有：

```text
id
created_at
updated_at
```

需要软失效的对象增加：

```text
status
valid_until
```

关系字段统一使用 `{object}_id`，例如 `thread_id`、`plan_id`。

## 4.2 标识与版本

- `users.id` 当前固定为 `demo-user`。
- 其他实体使用 UUID。
- 计划使用 `root_plan_id + version` 唯一标识版本链。
- 快照使用 `user_id + version` 唯一标识快照版本。
- 理解摘要可以在同一 session 内增加 `summary_version`。
- API 不接受前端用 `Date.now()` 生成的 ID 作为数据库主键。

## 4.3 数据来源与可信度

结构化判断必须保存来源：

```text
user_expression       L1 用户表达
user_confirmed        L2 用户确认事实
system_hypothesis     L3 系统假设
action_evidence       L4 单次行为证据
stable_pattern        L5 稳定规律
```

待验证判断必须写入 `hypotheses`，不得混入已确认事实字段。单次行动只能形成候选规律，不能直接升级为稳定规律。

## 4.4 事务边界

以下操作必须在单个数据库事务中完成：

- 理解确认 + 用户纠正 + 目标/约束初始写入。
- 计划修订 + 新计划版本 + 新计划项 + 当前计划指针更新。
- 计划接受 + 计划状态更新 + 线程状态更新。
- 行动结果写入 + 假设修正 + 新快照版本 + 当前快照指针更新。
- demo reset 的全部删除与初始数据重建。

任一环节失败时整笔事务回滚，不留下半份快照或断裂版本链。

---

# 5. 核心数据模型

## 5.1 `users`

当前只有一条开发用户记录。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | string | 是 | 固定为 `demo-user` |
| `display_name` | string | 否 | 默认“演示用户” |
| `timezone` | string | 是 | 默认 `Asia/Shanghai` |
| `student_stage` | string | 否 | 初中、高中、大学或其他 |
| `consent_version` | string | 是 | 当前数据规则版本 |
| `current_snapshot_id` | UUID FK | 否 | 指向最新快照 |
| `created_at` | datetime | 是 | UTC |
| `updated_at` | datetime | 是 | UTC |

关系：一个用户拥有多个线程、目标、约束、假设和快照；拥有一条当前导师偏好。

## 5.2 `mentor_preferences`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | UUID | 是 | 主键 |
| `user_id` | string FK | 是 | 当前为 `demo-user`，唯一 |
| `directness` | enum | 是 | `gentle/balanced/direct` |
| `explanation_depth` | enum | 是 | `brief/standard/deep` |
| `decision_style` | enum | 是 | `options/recommendation` |
| `challenge_level` | enum | 是 | `low/medium/high` |
| `emotion_response` | enum | 是 | `low/medium/high` |
| `user_selected` | bool | 是 | 是否由用户主动选择 |
| `system_adjustment` | text | 否 | Mock 规则建议，不静默生效 |
| `last_confirmed_at` | datetime | 否 | 最近确认时间 |
| `created_at` / `updated_at` | datetime | 是 | 公共字段 |

## 5.3 `threads`

线程是一次目标闭环的聚合根，保存当前流程位置和当前对象指针。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | UUID | 是 | 线程 ID |
| `user_id` | string FK | 是 | 当前为 `demo-user` |
| `title` | string | 是 | 例如“XUANOS 暑假开发” |
| `status` | enum | 是 | `active/waiting_action/revising/completed/archived` |
| `current_step` | enum | 是 | 与前端 `InteractionStep` 对齐 |
| `phase` | string | 是 | 当前产品阶段文案 |
| `active_understanding_session_id` | UUID FK | 否 | 当前理解 session |
| `active_plan_id` | UUID FK | 否 | 当前计划版本 |
| `last_activity_at` | datetime | 是 | 恢复任务排序依据 |
| `created_at` / `updated_at` | datetime | 是 | 公共字段 |

`current_step` 只用于流程恢复和守卫，不替代理解、计划或反馈实体。

## 5.4 `understanding_sessions`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | UUID | 是 | 理解会话 ID |
| `thread_id` | UUID FK | 是 | 所属线程 |
| `user_id` | string FK | 是 | 当前为 `demo-user` |
| `expression_mode` | enum | 是 | `speak/ask/sort` |
| `status` | enum | 是 | `collecting/reviewing/confirmed/reopened` |
| `user_input` | text | 否 | 用户首次自由表达 |
| `current_question_index` | int | 是 | 用于中途恢复 |
| `summary_version` | int | 是 | 摘要版本 |
| `real_goal` | text | 否 | 理解摘要字段 |
| `foundation` | text | 否 | 理解摘要字段 |
| `constraints_summary` | text | 否 | 理解摘要字段 |
| `tension` | text | 否 | 主要矛盾 |
| `uncertain` | text | 否 | 仍不确定 |
| `confirmed_at` | datetime | 否 | 明确确认时间 |
| `created_at` / `updated_at` | datetime | 是 | 公共字段 |

重新回答问题时，可以将旧 session 标记 `reopened` 并在同一 session 继续，也可以创建新 session。MVP 推荐同线程创建新 session，并保留 `previous_session_id`，更容易追溯计划依据。

## 5.5 `answers`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | UUID | 是 | 回答 ID |
| `understanding_session_id` | UUID FK | 是 | 所属理解会话 |
| `question_id` | string | 是 | `desired_result/current_foundation/real_constraints` |
| `question_text` | text | 是 | 保存当时的问题文本 |
| `question_order` | int | 是 | 展示顺序 |
| `answer_text` | text | 是 | 用户回答 |
| `revision` | int | 是 | 同一问题的回答版本 |
| `is_current` | bool | 是 | 当前有效回答 |
| `supersedes_answer_id` | UUID FK | 否 | 指向上一回答 |
| `answered_at` | datetime | 是 | 提交时间 |
| `created_at` / `updated_at` | datetime | 是 | 公共字段 |

回答被修改时新增记录，旧回答设置 `is_current=false`，不得直接覆盖原文本。

## 5.6 `user_corrections`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | UUID | 是 | 纠正 ID |
| `user_id` | string FK | 是 | 当前为 `demo-user` |
| `thread_id` | UUID FK | 否 | 所属线程 |
| `target_type` | enum | 是 | `understanding/goal/constraint/plan/snapshot/hypothesis` |
| `target_id` | UUID/string | 否 | 被纠正对象 |
| `assessment` | enum | 是 | `partial/inaccurate/supplement/system_snapshot` |
| `previous_value` | text/JSON | 是 | 系统原内容 |
| `user_value` | text/JSON | 是 | 用户修正内容 |
| `reason` | text | 否 | 修正原因 |
| `system_handling` | text | 否 | 系统如何处理 |
| `has_conflict` | bool | 是 | 是否仍有未解决矛盾 |
| `created_at` / `updated_at` | datetime | 是 | 公共字段 |

纠正记录只追加。修正目标对象不等于删除纠正历史。

## 5.7 `goals`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | UUID | 是 | 目标 ID |
| `user_id` / `thread_id` | FK | 是 | 所属用户与线程 |
| `understanding_session_id` | UUID FK | 否 | 来源理解会话 |
| `original_expression` | text | 是 | 用户原话 |
| `title` | string | 是 | 澄清后名称 |
| `desired_outcome` | text | 是 | 可判断结果 |
| `success_criteria` | text | 是 | 完成标准 |
| `goal_type` | enum | 是 | `learning/project/habit/exam/health/other` |
| `priority` | enum | 是 | `primary/maintenance/paused/dropped` |
| `status` | enum | 是 | `pending/active/paused/completed/cancelled` |
| `current_stage` | string | 否 | 当前阶段 |
| `deadline` | datetime | 否 | 截止时间 |
| `estimated_load` | enum | 否 | `low/medium/high/overload` |
| `feasibility` | enum | 否 | `low/medium/high` |
| `feasibility_basis` | text | 否 | 判断依据 |
| `user_confirmed` | bool | 是 | 是否确认 |
| `valid_until` | datetime | 否 | 有效期 |
| `created_at` / `updated_at` | datetime | 是 | 公共字段 |

原始表达和澄清结果必须同时保存。

## 5.8 `constraints`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | UUID | 是 | 约束 ID |
| `user_id` / `thread_id` | FK | 是 | 所属用户与线程 |
| `goal_id` | UUID FK | 否 | 影响的目标 |
| `content` | text | 是 | 约束内容 |
| `constraint_type` | enum | 是 | `safety/fixed/resource/ability/preference/temporary_event` |
| `severity` | enum | 是 | `low/medium/high` |
| `source_type` | enum | 是 | 来源与可信度 |
| `is_hard` | bool | 是 | 是否硬性约束 |
| `user_confirmed` | bool | 是 | 是否确认 |
| `evidence` | text/JSON | 否 | 判断依据 |
| `starts_at` / `ends_at` | datetime | 否 | 生效区间 |
| `last_reviewed_at` | datetime | 否 | 最近复核 |
| `created_at` / `updated_at` | datetime | 是 | 公共字段 |

## 5.9 `plans`

每个版本是一条独立且内容不可变的 `plans` 记录。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | UUID | 是 | 当前版本 ID |
| `root_plan_id` | UUID | 是 | 整条版本链的根 ID |
| `previous_plan_id` | UUID FK | 否 | 上一版本 |
| `thread_id` / `user_id` | FK | 是 | 所属线程和用户 |
| `understanding_session_id` | UUID FK | 是 | 计划依据，必须已确认 |
| `primary_goal_id` | UUID FK | 是 | 主目标 |
| `version` | int | 是 | 从 1 递增 |
| `status` | enum | 是 | `generated/accepted/superseded/cancelled` |
| `stage` | string | 是 | 当前阶段 |
| `summary` | text | 是 | 计划摘要 |
| `single_action` | text | 是 | 当前唯一行动 |
| `completion_standard` | text | 是 | 完成标准 |
| `review_condition` | text | 是 | 复查条件 |
| `workload` | enum | 是 | `low/medium/high/overload` |
| `system_recommendation` | text | 是 | 系统首选建议 |
| `is_user_final_choice` | bool | 是 | 是否为非首选用户选择 |
| `user_final_choice` | text | 否 | 用户最终选择 |
| `modification_reason` | enum | 否 | 修改原因 code |
| `expected_impact` | text | 否 | 预计影响 |
| `warning_level` | enum | 是 | `info/impact/risk` |
| `accepted_at` | datetime | 否 | 接受时间 |
| `created_at` / `updated_at` | datetime | 是 | 公共字段 |

数据库约束：`UNIQUE(root_plan_id, version)`。创建 v2 时复制必要计划项并修改指定内容；v1 内容保持不变，仅状态可变为 `superseded`。

## 5.10 `plan_items`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | UUID | 是 | 计划项 ID |
| `plan_id` | UUID FK | 是 | 精确关联某一版本 |
| `goal_id` | UUID FK | 否 | 关联目标 |
| `item_type` | enum | 是 | `time_block/action/maintenance/paused/removed` |
| `title` | string | 是 | 任务或目标内容 |
| `time_block` | enum | 否 | `high_energy/normal/low_energy/flexible` |
| `estimated_minutes` | int | 否 | 预计用时 |
| `difficulty` | int | 否 | 1–5 |
| `completion_standard` | text | 否 | 完成标准 |
| `is_optional` | bool | 是 | 是否可选 |
| `source` | enum | 是 | `system/user` |
| `is_user_modified` | bool | 是 | 是否由用户修改 |
| `modification_note` | text | 否 | 修改说明 |
| `sort_order` | int | 是 | 展示顺序 |
| `created_at` / `updated_at` | datetime | 是 | 公共字段 |

## 5.11 `action_results`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | UUID | 是 | 行动结果 ID |
| `user_id` / `thread_id` | FK | 是 | 所属用户和线程 |
| `plan_id` | UUID FK | 是 | 必须是已接受计划 |
| `idempotency_key` | string | 是 | 防止重复提交 |
| `started` | bool | 是 | 是否开始 |
| `completed` | bool | 是 | 是否完成 |
| `progress_percent` | int | 是 | 0–100 |
| `actual_duration_minutes` | int | 否 | 实际分钟数 |
| `obstacle_code` | enum | 是 | 稳定英文 code |
| `obstacle_detail` | text | 否 | 补充说明 |
| `energy_change` | text | 否 | 情绪或精力变化 |
| `unrealistic_part` | text | 否 | 原计划不现实之处 |
| `original_judgment` | text | 是 | 修正输出 |
| `actual_result_summary` | text | 是 | 修正输出 |
| `revised_judgment` | text | 是 | 修正输出 |
| `next_adjustment` | text | 是 | 修正输出 |
| `submitted_at` | datetime | 是 | 提交时间 |
| `created_at` / `updated_at` | datetime | 是 | 公共字段 |

数据库约束：同一用户下 `idempotency_key` 唯一。重复请求返回已有结果，不重复修正快照。

## 5.12 `hypotheses`

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | UUID | 是 | 假设 ID |
| `user_id` / `thread_id` | FK | 是 | 所属范围 |
| `content` | text | 是 | 假设内容 |
| `category` | string | 是 | 例如 `execution_avoidance` |
| `status` | enum | 是 | `pending/supported/weakened/rejected/expired` |
| `confidence_internal` | decimal | 否 | 仅内部使用，不直接展示百分比 |
| `supporting_evidence` | JSON | 是 | 关联行动结果或用户表达 |
| `opposing_evidence` | JSON | 是 | 反对证据 |
| `requires_confirmation` | bool | 是 | 是否需要用户确认 |
| `user_attitude` | enum | 否 | `accepted/partial/rejected/unknown` |
| `last_reviewed_at` | datetime | 否 | 最近复核 |
| `valid_until` | datetime | 否 | 有效期 |
| `created_at` / `updated_at` | datetime | 是 | 公共字段 |

前端“系统仍在验证”只读取 `pending/supported/weakened` 且仍有效的假设，并显示状态文字，不显示内部置信度。

## 5.13 `user_snapshots`

快照采用追加版本，不覆盖旧快照。

| 字段 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `id` | UUID | 是 | 快照 ID |
| `user_id` | string FK | 是 | 当前为 `demo-user` |
| `version` | int | 是 | 从 1 递增 |
| `source_thread_id` | UUID FK | 否 | 本次变化来源 |
| `source_action_result_id` | UUID FK | 否 | 本次反馈来源 |
| `current_vector` | text | 是 | 当前主线 |
| `current_stage` | string | 是 | 当前阶段 |
| `current_action` | text | 是 | 当前唯一行动 |
| `reality_boundaries` | JSON | 是 | 当前关键边界 |
| `effective_patterns` | JSON | 是 | 已验证或候选模式，带成熟度 |
| `hypothesis_ids` | JSON | 是 | 当前待验证假设 ID |
| `recent_revisions` | JSON | 是 | 最近修正摘要 |
| `recent_correction_ids` | JSON | 是 | 最近纠正 ID |
| `revision_count` | int | 是 | 修正次数 |
| `created_at` / `updated_at` | datetime | 是 | 公共字段 |

数据库约束：`UNIQUE(user_id, version)`。`users.current_snapshot_id` 指向最新版本，GET snapshot 不需要扫描全部历史。

---

# 6. 模型关系总览

```text
users
├── mentor_preferences (1:1)
├── threads (1:N)
│   ├── understanding_sessions (1:N)
│   │   └── answers (1:N, 可修订)
│   ├── user_corrections (1:N)
│   ├── goals (1:N)
│   ├── constraints (1:N)
│   ├── plans (1:N, root_plan_id 形成版本链)
│   │   └── plan_items (1:N, 隶属具体版本)
│   └── action_results (1:N)
├── hypotheses (1:N)
└── user_snapshots (1:N, current_snapshot_id 指向当前版本)
```

MVP 暂不单独实现 `personal_rules` 和完整 `user_events` 表。“对我有效”先保存在快照的带成熟度条目中；需要更完整审计时再增加 append-only `user_events`，不得通过当前表结构伪造完整事件日志。

---

# 7. API 通用约定

## 7.1 基础约定

- 基础路径：`/api`。
- Content-Type：`application/json`。
- 时间格式：UTC ISO 8601。
- JSON 字段使用 `snake_case`，前端通过 adapter 映射为 `camelCase`。
- 所有响应携带 `request_id`，便于错误定位。
- 写接口支持 `Idempotency-Key` 请求头。
- 列表接口采用 `limit`、`cursor`，MVP 默认 `limit=20`。
- 当前用户由固定常量解析为 `demo-user`，不接受客户端随意指定其他用户。

## 7.2 成功响应

单对象：

```json
{
  "data": {},
  "meta": { "request_id": "req_..." }
}
```

列表：

```json
{
  "data": [],
  "meta": { "request_id": "req_...", "next_cursor": null }
}
```

## 7.3 流程状态

服务端持久化与前端一致的 `InteractionStep`：

```text
idle
expression_mode
collecting_input
asking_question
reviewing_understanding
understanding_confirmed
plan_generated
plan_modified
plan_accepted
action_pending
feedback_submitted
system_revised
```

路由不信任客户端传入的下一状态。service 根据当前实体和操作决定下一状态，并随响应返回 `current_step`。

---

# 8. API 范围与契约

## 8.1 `GET /health`

职责：检查服务进程和数据库连接。

响应 `200`：

```json
{
  "status": "ok",
  "service": "xuanos-backend",
  "database": "ok",
  "version": "0.1.0"
}
```

数据库不可用时返回 `503 SERVICE_UNAVAILABLE`，不能仍返回假健康。

## 8.2 `POST /api/threads`

职责：为 `demo-user` 创建任务线程。

请求头：`Idempotency-Key: thread-{client-uuid}`。

请求：

```json
{
  "title": "XUANOS 暑假开发"
}
```

行为：创建线程，`current_step=idle`。相同 key 与相同请求返回首次结果，不创建第二条线程；相同 key 与不同请求返回 `409 DUPLICATE_SUBMISSION`。

响应：`201`，返回线程、当前步骤和当前对象指针。

## 8.3 `GET /api/threads`

职责：返回 `demo-user` 的线程摘要，按 `last_activity_at DESC` 排序。

查询参数：`status`、`limit`、`cursor`。

每项至少包含：`id`、`title`、`status`、`current_step`、`phase`、`active_plan_id`、`last_activity_at`。

## 8.4 `GET /api/threads/{thread_id}`

职责：恢复完整流程所需的聚合数据。

响应至少包含：

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

不存在或不属于 `demo-user` 时返回 `404 RESOURCE_NOT_FOUND`。

## 8.5 `POST /api/understanding/analyze`

职责：保存表达与当前回答，返回下一问题或 Mock 理解摘要。

请求：

```json
{
  "thread_id": "uuid",
  "session_id": "uuid-or-null",
  "expression_mode": "speak",
  "user_input": "我想完成 XUANOS Mock 闭环",
  "answer": {
    "question_id": "desired_result",
    "answer_text": "五个页面可以完整走通"
  }
}
```

调用方式：首次调用可只创建 session；每回答一题再次调用。服务端根据当前答案返回：

- `next_question`：仍缺少关键信息时，只返回一个问题。
- `understanding`：三题齐备后生成摘要。
- `current_step`：`asking_question` 或 `reviewing_understanding`。

三题固定为：

```text
desired_result
current_foundation
real_constraints
```

修改既有答案时新增 answer revision，并保留上一记录。

## 8.6 `POST /api/understanding/{session_id}/confirm`

职责：确认理解或提交纠正。

请求：

```json
{
  "assessment": "partial",
  "correction": "当前重点是完成前端状态闭环"
}
```

规则：

- `accurate`：三题和摘要齐备时，将 session 标记为 confirmed。
- `partial/inaccurate/supplement`：必须有 correction，追加 `user_corrections`，更新摘要版本，仍停留在 reviewing。
- 纠正后必须再次明确提交 `accurate` 才能确认。
- 确认事务内创建或更新结构化 goal/constraint 初始记录。

响应返回最新摘要、纠正记录、`confirmed_at` 和 `current_step`。

## 8.7 `POST /api/plans`

职责：基于已确认理解生成 Plan v1 或新的计划链。

请求：

```json
{
  "thread_id": "uuid",
  "understanding_session_id": "uuid"
}
```

守卫：理解 session 必须属于线程且状态为 confirmed。否则返回 `409 UNDERSTANDING_NOT_CONFIRMED`。

Mock 规则输出主目标、维持目标、暂停目标、删除事项、阶段、唯一行动、完成标准、复查条件和计划项。

响应：`201`，返回完整 Plan v1 和 `current_step=plan_generated`。

## 8.8 `POST /api/plans/{plan_id}/revise`

职责：创建新计划版本，绝不覆盖 `{plan_id}` 内容。

请求：

```json
{
  "reason": "time_conflict",
  "user_final_choice": "先完成首页与理解页状态接线",
  "expected_impact_acknowledged": true,
  "expected_version": 1
}
```

规则：

- 原计划必须属于当前线程且不是 cancelled。
- `expected_version` 与当前版本不一致时返回 `409 VERSION_CONFLICT`。
- 至少提供一个修改原因。
- 创建新 `plans` 行和对应 `plan_items`，版本号递增。
- 原版本仅更新状态为 superseded，内容保持不变。
- 非首选选择保存 `is_user_final_choice=true` 和固定提示语。

响应：`201`，同时返回 `previous_plan` 摘要和 `current_plan` 完整数据。

## 8.9 `POST /api/plans/{plan_id}/accept`

职责：接受指定计划版本。

请求：

```json
{
  "expected_version": 2
}
```

规则：计划必须是当前版本且状态为 generated。重复接受同一版本视为幂等成功；接受旧版本返回 `409 VERSION_CONFLICT`。成功后更新 `threads.active_plan_id`、线程状态和当前快照中的阶段/唯一行动。

响应返回 accepted plan、thread 和 `current_step=plan_accepted`。

## 8.10 `POST /api/action-results`

职责：保存行动反馈，运行 Mock 修正，并新增用户快照版本。

请求头：`Idempotency-Key: action-result-{client-uuid}`。

请求：

```json
{
  "thread_id": "uuid",
  "plan_id": "uuid",
  "started": true,
  "completed": false,
  "progress_percent": 70,
  "actual_duration_minutes": 45,
  "obstacle_code": "time_conflict",
  "obstacle_detail": null,
  "energy_change": "开始后更专注",
  "unrealistic_part": "原计划范围偏大"
}
```

守卫：plan 必须已接受，进度为 0–100；`completed=true` 时进度应为 100；未开始时完成值必须为 false。

同一事务内：

1. 创建 `action_results`。
2. 生成原判断、实际结果、系统修正和下一步调整。
3. 更新相关 hypothesis 状态与证据。
4. 创建新的 `user_snapshots` 版本。
5. 更新 `users.current_snapshot_id` 和 thread 当前步骤。

响应 `201`：返回 action result、system revision、updated snapshot 和 `current_step=system_revised`。

## 8.11 `GET /api/users/demo-user/snapshot`

职责：返回当前快照，不返回完整后台历史。

响应字段：

```text
id
version
current_vector
current_stage
current_action
reality_boundaries
effective_patterns
hypotheses（前台安全表达）
recent_revisions
user_corrections
revision_count
updated_at
```

如果用户还没有快照，服务端创建或返回初始 demo snapshot。

## 8.12 `POST /api/users/demo-user/corrections`

职责：追加用户对理解、目标、约束、计划、快照、假设或系统快照区域的纠正。

请求头：`Idempotency-Key: correction-{client-uuid}`。

请求字段：`target_type`、`target_id`、`correction_type`、`original_value`、`corrected_value`、`reason`。

`correction_type` 支持：`accurate`、`partial`、`inaccurate`、`changed`、`discontinue`。

规则：

- 每次提交新增 `user_corrections` 记录，不覆盖原始对象或旧纠正。
- `accurate` 只追加确认记录并返回当前快照。
- 其他类型创建新版快照，写入用户纠正和最近修正；命中主线、行动、边界、规律或假设时同步修正快照投影。
- `discontinue` 停止在当前快照中继续采用目标内容；对 hypothesis 同时保留用户拒绝态，后续规则不得静默恢复。
- 相同幂等 key 与相同请求返回首次纠正和快照，不重复升版。

响应 `201`：返回最新 correction、当前或新版 snapshot，以及 `snapshot_updated`。

## 8.13 `PUT /api/users/demo-user/mentor-preferences`

职责：创建或更新当前导师偏好。

请求包含：`directness`、`explanation_depth`、`decision_style`、`challenge_level`、`emotion_response`。

服务端不得静默把 `system_adjustment` 变成用户选择；只有用户提交后才更新实际偏好。

## 8.14 `POST /api/demo/reset`

职责：清理并重建 `demo-user` 的演示数据。

规则：

- 仅在 `DEMO_RESET_ENABLED=true` 时开放。
- 请求必须携带显式确认字段 `{"confirm": true}`。
- 在一个事务中删除 demo-user 的线程相关数据、计划版本、反馈、假设和快照，再写入初始用户、偏好和快照。
- 不接收任意 user ID。

响应返回新的初始 snapshot 和 `current_step=idle`。生产环境返回 `404`，避免暴露该能力。

---

# 9. Mock 业务规则

Mock 规则必须集中在 `app/rules/`，输入输出使用 Pydantic 模型，不直接操作数据库。

## 9.1 理解规则

- 三个关键回答齐备后才生成完整摘要。
- `real_goal` 优先使用 `desired_result`，否则使用 `user_input`。
- `foundation` 来自 `current_foundation`。
- `constraints_summary` 来自 `real_constraints`。
- `tension` 与 `uncertain` 使用固定模板，但必须明确为系统判断。

## 9.2 计划规则

- 只从已确认 understanding session 生成。
- 默认主目标来自确认后的真实目标。
- 维持目标默认“每周 3 次基础健身”。
- 暂停目标默认“Flutter 客户端、完整商业系统”。
- 当前唯一行动必须是一个可判断的行动，不生成长任务列表。
- 用户修改必须保留原建议、修改原因、影响和复查条件。

## 9.3 反馈修正规则

- 未开始：缩小行动，增加或支持“启动阻力”假设。
- 已开始未完成：根据完成比例和实际用时缩小范围或调整负荷。
- 已完成：形成候选有效模式，生成下一行动；单次证据不升级为稳定规律。
- 用户指出计划不现实：创建 correction 或关联 correction 记录。
- 完成反馈后始终生成一个新快照版本。

Mock 规则返回确定性结构，方便测试；后续接真实 AI 时只替换规则实现，不改变 API 契约和持久化规则。

---

# 10. 前端字段映射

## 10.1 当前字段到后端模型

| 前端字段 | 后端来源 | 迁移说明 |
|---|---|---|
| `schemaVersion` | API schema/version metadata | 不作为业务表字段 |
| `currentStep` | `threads.current_step` | 由服务端操作结果推进，前端不可任意指定 |
| `expressionMode` | `understanding_sessions.expression_mode` | 前端 code 保持 `speak/ask/sort` |
| `userInput` | `understanding_sessions.user_input` | 仅保存与目标闭环有关的内容 |
| `answers` | `answers` 当前版本集合 | API 返回数组，adapter 转为前端 Record |
| `currentQuestionIndex` | `understanding_sessions.current_question_index` | 也可由当前答案推导 |
| `understanding` | `understanding_sessions` 摘要字段 | 增加 `id/status/summary_version/confirmed_at` |
| `corrections` | `user_corrections` | target 与 assessment 改为稳定 code |
| `currentPlan` | `threads.active_plan_id` 对应 plan | 不再在 session 内复制完整事实 |
| `planVersions` | `plans` 版本链 | GET thread 返回版本摘要列表 |
| `actionFeedback` | 提交前为本地草稿；提交后为 `action_results` | 草稿可继续保留本地 |
| `systemRevision` | `action_results` 的修正输出字段 | 后端生成并持久化 |
| `systemSnapshot` | `users.current_snapshot_id` 对应 snapshot | GET snapshot 获取 |
| `activeThread` | `threads` | 增加服务端 UUID 与对象指针 |

## 10.2 前端类型需要调整

接 API 时建议调整以下字段：

1. `PlanVersion` 增加 `rootPlanId`、`previousPlanId`、`updatedAt`、`acceptedAt`。
2. `UnderstandingSummary` 增加 `id`、`status`、`summaryVersion`、`confirmedAt`。
3. `CorrectionRecord.target` 改为 `targetType + targetId`，增加 `reason`、`systemHandling`。
4. `FeedbackPayload.duration` 从中文字符串改为 `actualDurationMinutes: number | null`。
5. `FeedbackPayload.obstacle` 改为稳定 `obstacleCode`，中文标签留在 UI。
6. `SystemSnapshot` 增加 `id`、`version` 和来源 ID；候选规律需要成熟度字段。
7. `ActiveThread` 增加 `userId`、`currentStep`、`activePlanId`、`activeUnderstandingSessionId`。
8. 所有后端对象补齐 `createdAt`、`updatedAt`。
9. 写请求增加 `idempotencyKey` 或由 API client 自动生成请求头。
10. `answers` 可继续在 UI 中使用 Record，但 API adapter 必须在数组记录与 Record 之间转换。

不要让页面组件直接处理 snake_case、数据库 ID 或错误响应；统一放在 `api/` 与 mapper 层。

---

# 11. 前后端迁移方案

## 11.1 第一阶段：API 试接，保留 localStorage 降级

- 保留当前 Context + reducer 和存储键 `xuanos:demo-user:session:v1`。
- 新增 API client、repository 和 DTO mapper。
- 首先接入 health、threads 和 snapshot。
- 服务可用时优先读取服务端线程；不可用时恢复 localStorage。
- 用户输入草稿和未提交反馈仍只保存在 localStorage。
- 写请求附带 idempotency key；网络失败时标记 `pending_sync`，不伪装成已保存。
- localStorage 增加 `server_ids`、`sync_status`、`last_server_updated_at`，用于恢复与冲突判断。

## 11.2 第二阶段：API 成为持久化事实来源

- 理解、确认、计划、计划版本、接受、反馈和快照全部改用 API。
- reducer 保留 UI 状态与乐观展示，但成功响应覆盖对应服务端实体。
- 页面刷新优先调用 `GET /api/threads/{thread_id}` 恢复。
- localStorage 只缓存最近一次成功响应、页面位置和未提交草稿。
- 服务端 `updated_at/version` 新于本地缓存时，以服务端为准。
- 本地未同步写入与服务端冲突时，不自动覆盖，提示用户重新加载或再次确认。

## 11.3 第三阶段：移除核心业务对 localStorage 的依赖

- 计划版本、纠正、反馈和快照只以 API/数据库为准。
- localStorage 仅保存非业务 UI 偏好、短期草稿和最近线程 ID。
- 删除从完整 `DemoSessionState` 恢复核心业务事实的逻辑。
- 保留网络中断提示，但不在本地伪造服务器已确认状态。

## 11.4 建议前端模块

```text
frontend/src/
├── api/
│   ├── client.ts
│   ├── threads.ts
│   ├── understanding.ts
│   ├── plans.ts
│   ├── actionResults.ts
│   └── snapshot.ts
├── mappers/
│   ├── threadMapper.ts
│   ├── planMapper.ts
│   └── snapshotMapper.ts
└── state/
    ├── InteractionContext.tsx
    ├── interactionReducer.ts
    └── interactionRepository.ts
```

---

# 12. 错误处理

## 12.1 统一错误结构

```json
{
  "error": {
    "code": "UNDERSTANDING_NOT_CONFIRMED",
    "message": "理解尚未确认，不能生成计划。",
    "details": {
      "thread_id": "uuid",
      "current_step": "reviewing_understanding"
    },
    "request_id": "req_..."
  }
}
```

错误文案可供前端展示，但前端流程判断必须优先使用稳定 `code`。

## 12.2 错误分类

| HTTP | code | 场景 | 前端处理 |
|---:|---|---|---|
| 400 | `INVALID_REQUEST` | 请求语义错误 | 保留输入并提示 |
| 404 | `RESOURCE_NOT_FOUND` | 线程、session、plan 不存在 | 返回可恢复页面 |
| 409 | `INVALID_FLOW_STATE` | 当前流程不允许该操作 | 使用响应中的 current_step 恢复 |
| 409 | `UNDERSTANDING_NOT_CONFIRMED` | 未确认理解即生成计划 | 回到理解确认 |
| 409 | `PLAN_NOT_ACCEPTED` | 未接受计划即提交反馈 | 回到计划页 |
| 409 | `VERSION_CONFLICT` | 修改了非当前计划版本 | 拉取最新版本再决定 |
| 409 | `DUPLICATE_SUBMISSION` | 重复写请求且请求体冲突 | 不重复处理，提示刷新 |
| 422 | `VALIDATION_ERROR` | Pydantic 字段校验失败 | 映射到具体字段 |
| 500 | `INTERNAL_ERROR` | 未预期服务异常 | 保留本地草稿，可重试 |
| 503 | `SERVICE_UNAVAILABLE` | 数据库或服务不可用 | 第一阶段降级 localStorage |

## 12.3 重复提交

- 创建线程、生成计划、修订计划和提交反馈支持 `Idempotency-Key`。
- 相同 key、相同请求体：返回首次成功结果，不新增记录。
- 相同 key、不同请求体：返回 `409 DUPLICATE_SUBMISSION`。
- 计划接受本身设计为幂等操作。
- 幂等记录至少保存 key、user、route、request hash、response status、resource ID 和创建时间；可使用独立内部表，不列入产品核心对象。

## 12.4 日志与隐私

- 日志记录 request ID、路由、状态码、耗时和资源 ID。
- 默认不记录用户完整输入、回答和纠正文案。
- 500 错误返回通用信息，不暴露 SQL、堆栈或数据库路径。

---

# 13. 推荐后端目录结构

```text
backend/
├── app/
│   ├── main.py
│   ├── api/
│   │   ├── router.py
│   │   └── routes/
│   │       ├── health.py
│   │       ├── threads.py
│   │       ├── understanding.py
│   │       ├── plans.py
│   │       ├── action_results.py
│   │       ├── snapshots.py
│   │       ├── mentor_preferences.py
│   │       └── demo.py
│   ├── core/
│   │   ├── config.py
│   │   ├── errors.py
│   │   ├── logging.py
│   │   └── idempotency.py
│   ├── db/
│   │   ├── base.py
│   │   ├── session.py
│   │   └── seed.py
│   ├── models/
│   │   ├── user.py
│   │   ├── thread.py
│   │   ├── understanding.py
│   │   ├── goal.py
│   │   ├── plan.py
│   │   ├── action_result.py
│   │   └── snapshot.py
│   ├── schemas/
│   │   ├── common.py
│   │   ├── thread.py
│   │   ├── understanding.py
│   │   ├── plan.py
│   │   ├── action_result.py
│   │   └── snapshot.py
│   ├── repositories/
│   │   ├── threads.py
│   │   ├── understanding.py
│   │   ├── plans.py
│   │   └── snapshots.py
│   ├── services/
│   │   ├── thread_service.py
│   │   ├── understanding_service.py
│   │   ├── plan_service.py
│   │   ├── feedback_service.py
│   │   └── snapshot_service.py
│   └── rules/
│       ├── understanding_mock.py
│       ├── plan_mock.py
│       └── revision_mock.py
├── alembic/
│   └── versions/
├── tests/
│   ├── api/
│   ├── services/
│   └── conftest.py
├── data/
│   └── .gitkeep
├── alembic.ini
├── pyproject.toml
├── .env.example
└── README.md
```

路由只负责解析请求、调用 service 和返回 schema；service 执行守卫与事务；repository 封装查询；rules 只做确定性计算。

---

# 14. 实现顺序

## 第一批：服务与持久化骨架

1. `GET /health`
2. `POST /api/demo/reset`
3. `POST /api/threads`
4. `GET /api/threads`
5. `GET /api/threads/{thread_id}`
6. `GET /api/users/demo-user/snapshot`

这一批先验证 FastAPI 启动、SQLite 持久化、Alembic、demo seed、线程恢复和快照读取。完成后前端可以先替换“继续任务”和“我的系统”的读取来源。

## 第二批：理解闭环

1. `POST /api/understanding/analyze`
2. `POST /api/understanding/{session_id}/confirm`
3. `PUT /api/users/demo-user/mentor-preferences`

## 第三批：计划与反馈闭环

1. `POST /api/plans`
2. `POST /api/plans/{plan_id}/revise`
3. `POST /api/plans/{plan_id}/accept`
4. `POST /api/action-results`

完成第三批后，前端当前 Mock 闭环才能完整迁移到数据库。

---

# 15. 测试要求

## 15.1 数据测试

- 创建和读取 `demo-user`。
- 创建线程后重启测试应用，数据仍存在。
- 修改回答后旧 answer revision 仍存在。
- 理解纠正后旧摘要与 correction 可追溯。
- 计划 v2 创建后 v1 内容不变。
- 同一 root plan 的版本号唯一且递增。
- feedback 生成新 snapshot，旧 snapshot 不变。
- hypothesis 与 confirmed fact 分开返回。

## 15.2 API 测试

- health 在数据库正常和异常时返回正确状态。
- 未确认理解生成计划返回 409。
- 未接受计划提交反馈返回 409。
- 重复 feedback idempotency key 不产生第二份快照。
- plan expected_version 冲突返回 409。
- 资源不存在返回统一 404。
- Pydantic 校验错误返回统一 422 格式。
- demo reset 后恢复初始用户和快照。

## 15.3 SQLite/PostgreSQL 兼容性

- CI 至少运行 SQLite 测试。
- 上线前使用 PostgreSQL 跑同一组迁移和核心 API 测试。
- 不依赖 SQLite 宽松类型、隐式布尔值或数据库文件锁作为业务机制。

---

# 16. 验收标准

1. 后端可以通过一条命令独立启动。
2. `GET /health` 正确检查服务和数据库。
3. 可以创建、列出并读取任务线程。
4. 可以保存三个引导回答、理解摘要和用户纠正。
5. 理解未确认前不能生成计划。
6. 计划修改创建新版本，旧版本内容不被覆盖。
7. 可以接受指定的当前计划版本。
8. 可以提交行动反馈，并防止重复处理。
9. 行动反馈会更新假设并创建新用户快照版本。
10. `GET snapshot` 返回最新主线、阶段、行动、验证项、修正和纠正记录。
11. 服务重启后数据不丢失。
12. SQLite 开发数据可通过迁移结构切换到 PostgreSQL。
13. API 错误具有稳定 code 和 request ID。
14. 前端可以继续使用 localStorage 作为第一阶段降级方案。
15. 不接真实 AI，不做登录、数据库外账号体系或支付。

---

# 17. 阶段结论

XUANOS 后端 MVP 的核心不是提供大量 CRUD，而是保护以下不可破坏的链路：

```text
用户表达与回答可追溯
→ 理解必须确认
→ 计划必须版本化
→ 用户最终决定被保留
→ 行动反馈成为证据
→ 假设被修正
→ 新快照被创建
```

第一版后端成功的标志是：

> `demo-user` 第二次回来时，系统读取的是上一次真实留下的线程、纠正、计划版本和行动结果，而不是重新开始一场失忆的 Mock 演示。
