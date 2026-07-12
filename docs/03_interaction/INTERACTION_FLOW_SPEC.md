# XUANOS Mock 交互闭环规格 v0.1

- 文档版本：v0.1
- 当前阶段：阶段 3 - Mock 交互闭环
- 适用版本：XUANOS MVP 前端原型
- 默认用户：`demo-user`
- 状态管理：React Context + `useReducer`
- 持久化：`localStorage`
- 核心边界：不接后端、不接真实 AI、不做登录、不做数据库

---

# 1. 文档目标

本规格定义 XUANOS 五个核心页面之间的 Mock 交互闭环、状态转换、数据更新、返回与恢复规则。

本阶段只验证一件事：

> 用户能否从混乱表达开始，经过理解、确认、裁决、行动反馈，明显看到自己的系统因真实反馈而发生变化。

所有“系统生成”均由前端固定规则和 mock 数据完成，不模拟自由聊天，不发起任何 API 请求。

---

# 2. 核心用户流程

```text
首页
→ 点击“开始校准”
→ 选择表达方式
→ 输入目标或困境
→ 系统逐步追问
→ 用户逐题回答
→ 系统生成理解摘要
→ 用户确认或纠正
→ 系统生成起点档案
→ 系统生成计划裁决
→ 用户接受或修改计划
→ 用户进入行动阶段
→ 用户提交行动反馈
→ 系统展示修正结果
→ 我的系统页更新
```

流程遵守以下硬性规则：

1. 每次只显示一个关键问题。
2. 三种表达方式最终汇合到同一个理解确认节点。
3. 理解未经用户明确确认，不得生成计划。
4. 计划修改必须创建新版本，不得覆盖原版本。
5. 用户坚持非系统首选方案时必须接受，同时记录影响与声明。
6. 行动反馈必须改变系统快照，不能只显示提交成功。
7. 返回上一步和刷新页面时保留已经填写的数据。

---

# 3. 流程状态

| 状态 | 含义 | 所在页面 | 主要出口 |
|---|---|---|---|
| `idle` | 尚未开始或等待继续任务 | 首页 | `expression_mode`、恢复已保存状态 |
| `expression_mode` | 选择表达方式 | 引导式理解页 | `collecting_input`、`asking_question` |
| `collecting_input` | 收集用户的目标或困境 | 引导式理解页 | `asking_question` |
| `asking_question` | 逐个补齐关键事实 | 引导式理解页 | 下一题、`reviewing_understanding` |
| `reviewing_understanding` | 展示理解摘要并等待确认 | 引导式理解页 | 留在当前状态、`understanding_confirmed` |
| `understanding_confirmed` | 理解已确认并生成起点档案 | 引导式理解页 | `plan_generated` |
| `plan_generated` | 展示系统首版裁决 | 计划裁决页 | `plan_modified`、`plan_accepted`、`asking_question` |
| `plan_modified` | 展示用户修改后的新计划版本 | 计划裁决页 | 继续修改、`plan_accepted`、`asking_question` |
| `plan_accepted` | 当前计划版本已确认 | 计划裁决页 | `action_pending` |
| `action_pending` | 等待执行或提交行动反馈 | 行动反馈页 | `feedback_submitted` |
| `feedback_submitted` | 反馈已提交，正在形成 mock 修正 | 行动反馈页 | `system_revised` |
| `system_revised` | 修正完成，快照已更新 | 行动反馈页、我的系统页 | 查看系统、返回首页继续任务 |

`currentStep` 始终使用以上枚举值。页面导航不能绕过状态守卫直接制造后续数据。

---

# 4. 状态与交互定义

## 4.1 `idle`

- 页面位置：首页。
- 用户看到：XUANOS Hero、开始校准、查看我的系统；存在历史 session 时显示“继续上次任务”。
- 用户可以：开始校准、继续上次任务、查看当前系统。
- 点击后状态：开始校准进入 `expression_mode`；继续任务恢复保存的 `currentStep`。
- Mock 更新：新流程创建 `activeThread`，状态为“正在理解”；保留用户为 `demo-user`。
- 进入条件：无。
- 返回保留：已有 session、线程、计划版本和系统快照全部保留。

## 4.2 `expression_mode`

- 页面位置：引导式理解页。
- 用户看到：三枚表达方式选项，以及当前校准阶段。
- 用户可以：选择“我先完整表达”“XUANOS 来问我”“一起梳理”。
- 点击后状态：“XUANOS 来问我”直接进入 `asking_question`；其余两种进入 `collecting_input`。
- Mock 更新：写入 `expressionMode`；清空本轮尚未提交的临时输入，不清空已确认历史。
- 进入下一步条件：必须选择一种表达方式。
- 返回保留：已选模式和当前输入草稿保留；用户可切换模式，已有答案不删除。

## 4.3 `collecting_input`

- 页面位置：引导式理解页。
- 用户看到：“我先完整表达”显示完整输入区；“一起梳理”显示一句话输入和困境分类。
- 用户可以：输入目标、计划或困境，修改草稿并提交。
- 点击后状态：提交后进入 `asking_question`。
- Mock 更新：写入 `userInput`、线程标题候选和原始目标表达。
- 进入下一步条件：去除空格后至少有有效内容；空输入不允许提交。
- 返回保留：输入草稿、表达模式和已产生的答案全部保留。

## 4.4 `asking_question`

- 页面位置：引导式理解页。
- 用户看到：当前进度、一个问题、一个回答区；不得同时展示后续问题。
- 用户可以：回答当前问题、修改当前回答、返回上一题。
- 点击后状态：前两题提交后仍为 `asking_question` 并推进索引；第三题提交后进入 `reviewing_understanding`。
- Mock 更新：按问题 ID 写入 `answers`，同时更新理解草稿中的对应字段。
- 进入下一步条件：当前问题必须有有效回答。
- 返回保留：所有已答问题、输入原文和当前问题索引保留；重答只更新该答案，不清空后续答案。

固定问题顺序：

1. `desired_result`：你最终想完成的具体结果是什么？
2. `current_foundation`：你当前已经具备哪些基础？
3. `real_constraints`：现实中有哪些时间、资源或安排限制？

三种表达方式的差异只影响进入问题前的输入方式，不改变这三个最低必要问题，也不改变最终确认节点。

## 4.5 `reviewing_understanding`

- 页面位置：引导式理解页。
- 用户看到：一张 mock 理解摘要卡，每项最多展示核心结论和状态。
- 摘要字段：真实目标、当前基础、现实限制、主要矛盾、仍不确定。
- 用户可以：选择“准确”“部分准确”“不准确”或“补充信息”。
- 点击后状态：“准确”进入 `understanding_confirmed`；其他选择打开纠正输入，提交后仍停留在 `reviewing_understanding`，重新生成摘要并等待明确确认。
- Mock 更新：写入 `understanding`；纠正内容追加到 `corrections`，同时更新被纠正字段。
- 进入下一步条件：只有明确点击“准确”或完成纠正后再次确认准确，才能继续。
- 返回保留：原始回答、摘要版本和全部纠正记录保留。

## 4.6 `understanding_confirmed`

- 页面位置：引导式理解页。
- 用户看到：起点档案，并明确标记“初始版本，可根据行动更新”。
- 用户可以：确认并生成计划、返回修改理解。
- 点击后状态：确认并生成计划进入 `plan_generated`；返回修改进入 `reviewing_understanding`。
- Mock 更新：将确认后的真实目标、基础、限制、主要矛盾写入 `systemSnapshot` 初始版本；创建起点档案事件。
- 进入下一步条件：理解已确认，三个关键问题均有答案。
- 返回保留：起点档案保留为草稿；再次确认后生成更新版本。

## 4.7 `plan_generated`

- 页面位置：计划裁决页。
- 用户看到：Plan v1、目标取舍、当前阶段、唯一行动、完成标准和复查条件。
- 用户可以：接受计划、修改计划、不同意判断、重新回答问题。
- 点击后状态：接受进入 `plan_accepted`；修改或不同意进入 `plan_modified` 编辑流程；重新回答进入 `asking_question`。
- Mock 更新：创建 `currentPlan` 和 `planVersions[0]`，来源标记为 `system_recommended`。
- 进入下一步条件：Plan v1 必须包含所有必填裁决字段。
- 返回保留：Plan v1 永久保留；重新回答后生成计划时创建新版本，不覆盖 v1。

Mock 计划字段：

- 主目标：完成 XUANOS 静态前端原型。
- 维持目标：每周 3 次基础健身。
- 暂停目标：Flutter 客户端、完整商业系统。
- 删除事项：本阶段不继续扩展视觉方案和 MVP 外页面。
- 当前阶段：视觉系统确认。
- 当前唯一行动：完成五个页面线框。
- 完成标准：五个核心页面均可切换并呈现完整静态结构。
- 复查条件：完成本轮行动后，或连续两次未开始时。

## 4.8 `plan_modified`

- 页面位置：计划裁决页的修改区，不新增页面。
- 用户看到：系统原建议、用户最终选择、预计影响、复查条件。
- 用户可以：选择原因、修改允许字段、确认修改、取消修改、继续调整。
- 点击后状态：确认修改后仍为 `plan_modified` 并展示新版本；接受该版本进入 `plan_accepted`；重新回答进入 `asking_question`。
- Mock 更新：向 `planVersions` 追加版本并更新 `currentPlan` 指针；旧版本不可变。
- 进入下一步条件：至少选择一个原因，填写最终选择，并确认影响提示。
- 返回保留：修改草稿保留到取消或确认；已确认版本永不删除。

修改原因至少支持：

```text
时间冲突
资源限制
能力限制
身体或安全原因
个人偏好
不认可系统判断
其他
```

用户坚持修改时记录：

> 此部分为用户最终选择，并非 XUANOS 当前首选建议。

系统最多提出一轮必要追问，不持续争论。身体或安全原因直接接受并标记需复查。

## 4.9 `plan_accepted`

- 页面位置：计划裁决页。
- 用户看到：当前生效版本、唯一行动和“进入行动”按钮。
- 用户可以：进入行动、返回查看计划版本。
- 点击后状态：进入行动后变为 `action_pending`。
- Mock 更新：当前版本状态改为 `accepted`；线程状态改为“等待行动”。
- 进入下一步条件：必须存在已接受的计划版本。
- 返回保留：接受状态、版本历史和修改原因全部保留。

## 4.10 `action_pending`

- 页面位置：行动反馈页。
- 用户看到：已接受计划摘要和轻量反馈表单。
- 用户可以：填写反馈、保存草稿、提交反馈、返回查看计划。
- 点击后状态：提交进入 `feedback_submitted`。
- Mock 更新：输入过程中更新 `actionFeedback` 草稿；提交时追加行动结果事件。
- 进入下一步条件：是否开始、是否完成、完成比例、实际用时和最大阻力为必填；完成比例限制为 0–100，实际用时不得为负数。
- 返回保留：所有反馈草稿和当前计划保留。

反馈字段：

```text
是否开始
是否完成
完成比例
实际用时
最大阻力
情绪或精力变化
原计划哪里不现实
```

## 4.11 `feedback_submitted`

- 页面位置：行动反馈页。
- 用户看到：短暂的“正在校准”状态，或直接显示已生成的结果区域。
- 用户可以：等待 mock 规则计算完成；提交期间不可重复提交。
- 点击后状态：规则执行结束后自动进入 `system_revised`。
- Mock 更新：冻结本次反馈副本，生成原判断、实际结果、系统修正和下一步调整。
- 进入下一步条件：反馈已经通过字段校验且尚未处理。
- 返回保留：提交后的反馈不可被静默覆盖；修改反馈需作为新事件处理。

## 4.12 `system_revised`

- 页面位置：行动反馈页展示修正结果，并提供进入我的系统页的入口。
- 用户看到：原判断、实际结果、系统修正、下一步调整，以及“我的系统已更新”状态。
- 用户可以：查看我的系统、返回首页、继续当前线程。
- 点击后状态：查看我的系统保持 `system_revised`，仅切换当前页面；返回首页不重置 session。
- Mock 更新：更新 `systemSnapshot`、线程状态、最近修正和下一行动。
- 进入条件：修正结果和新快照都已生成。
- 返回保留：完整 session、计划版本、反馈和纠正记录全部保留。

---

# 5. Mock 数据与更新规则

## 5.1 Session 最小结构

```ts
interface DemoSessionState {
  currentStep: InteractionStep
  expressionMode: ExpressionMode | null
  userInput: string
  answers: Record<QuestionId, string>
  currentQuestionIndex: number
  understanding: UnderstandingSummary | null
  corrections: CorrectionRecord[]
  currentPlan: PlanVersion | null
  planVersions: PlanVersion[]
  actionFeedback: ActionFeedback
  systemSnapshot: SystemSnapshot
  activeThread: Thread
}
```

其中必须满足：

- `corrections`、`planVersions` 和行动结果采用追加方式保存。
- `currentPlan` 指向当前生效版本，不复制或覆盖历史版本。
- 系统判断与用户事实分开标记来源。
- `activeThread` 保存当前阶段、状态、计划版本和最近事件。

## 5.2 初始 Mock 数据

```text
当前任务：XUANOS 暑假开发
主目标：完成 XUANOS 静态前端原型
当前阶段：视觉系统确认
当前唯一行动：完成五个页面线框
维持目标：每周 3 次基础健身
暂停目标：Flutter 客户端、完整商业系统
系统仍在验证：用户可能通过继续完善文档推迟真实开发
我的系统模式：混合模式
```

## 5.3 理解确认后的更新

- `understanding` 写入确认后的真实目标、基础、限制、矛盾和不确定项。
- `corrections` 追加用户纠正，不删除系统原判断。
- `systemSnapshot.currentVector` 更新为确认后的主线。
- `systemSnapshot.realityBoundaries` 写入用户确认的现实限制。
- `activeThread.status` 更新为“理解已确认”。

## 5.4 计划接受或修改后的更新

- 生成或追加 `planVersions`。
- 更新 `currentPlan`、当前阶段和当前唯一行动。
- 保存修改原因、系统原建议、用户最终选择、预计影响和复查条件。
- 非首选修改增加 `isUserFinalChoice: true` 和固定声明。
- `activeThread.status` 更新为“等待行动”。

## 5.5 反馈后的系统修正规则

Mock 规则至少覆盖：

- 未开始：缩小唯一行动，并把“启动阻力”加入待验证判断。
- 已开始未完成：根据完成比例和实际用时调整任务范围或预计负荷。
- 已完成：将本次方法追加到“对我有效”的候选记录，并生成下一行动。
- 实际用时明显超出计划：更新现实边界和后续时段估算。
- 用户指出计划不现实：追加用户纠正记录，并降低原计划可行性判断。

提交反馈后必须更新：

```text
当前主线
当前阶段
当前唯一行动
对我有效
系统仍在验证
最近修正
用户纠正记录
```

“对我有效”在单次证据后只能标记为候选，不得直接包装成稳定个人规律。

我的系统页应显示明显但克制的更新提示：

> 我的系统已经因为这次反馈发生变化。

---

# 6. 导航、返回与流程守卫

## 6.1 页面与状态关系

```text
首页：idle，以及任意已保存状态的继续入口
引导式理解页：expression_mode 至 understanding_confirmed
计划裁决页：plan_generated、plan_modified、plan_accepted
行动反馈页：action_pending、feedback_submitted、system_revised
我的系统页：始终可查看；system_revised 后展示最新快照
```

## 6.2 返回规则

- 返回只改变 `currentStep` 或当前页面，不清空数据。
- 返回问题页时定位到最近一题，已回答内容可编辑。
- 返回理解确认时保留摘要版本和纠正记录。
- 返回计划页时默认展示当前版本，可查看旧版本。
- 从反馈页返回计划页时保留反馈草稿。
- 从我的系统返回首页时保留完整 session。

## 6.3 守卫规则

- 没有表达方式，不得进入输入或问题流程。
- 当前问题未回答，不得推进下一题。
- 理解未确认，不得创建计划。
- 没有计划，不得进入接受或反馈状态。
- 没有修改原因，不得确认计划修改。
- 没有已接受计划，不得提交行动反馈。
- 反馈未通过校验，不得生成系统修正。

直接点击全局导航时，如果目标页面需要的数据尚不存在，应展示当前可用的空状态或引导用户回到正确步骤，不伪造完成状态。

---

# 7. 前端状态管理

本阶段选择 **React Context + `useReducer`**，不同时引入 Zustand。

选择理由：

1. 当前只有一个 `demo-user`、一个核心 session 和确定性的状态机。
2. 状态更新需要显式事件、守卫和版本追加，`useReducer` 更容易审查流转。
3. React 已内置，无需为 Mock 阶段增加依赖。
4. 后续接 API 时可以保留 action 与类型，只替换数据来源和副作用层。

建议 reducer action 至少包含：

```text
START_CALIBRATION
SELECT_EXPRESSION_MODE
UPDATE_USER_INPUT
SUBMIT_USER_INPUT
ANSWER_QUESTION
GO_TO_PREVIOUS_QUESTION
REVIEW_UNDERSTANDING
ADD_CORRECTION
CONFIRM_UNDERSTANDING
GENERATE_PLAN
START_PLAN_MODIFICATION
CONFIRM_PLAN_MODIFICATION
ACCEPT_PLAN
START_ACTION
UPDATE_FEEDBACK_DRAFT
SUBMIT_FEEDBACK
APPLY_SYSTEM_REVISION
RESTORE_SESSION
RESET_DEMO_DATA
```

页面组件只 dispatch 业务 action，不直接拼装下一状态。Mock 生成规则放入独立模块，避免散落在页面中。

---

# 8. 本地保存

## 8.1 保存规则

- 存储键：`xuanos:demo-user:session:v1`。
- 应用启动时先读取并校验本地数据，再决定使用恢复状态或初始 mock。
- reducer 状态变化后保存完整 demo session。
- 输入与反馈草稿也需要保存，刷新后可以继续。
- 存储结构包含 `schemaVersion` 和 `savedAt`，未来结构变化时可以迁移或回退默认值。
- 解析失败或字段不完整时使用初始 mock，不让页面崩溃。

## 8.2 继续上次任务

存在有效 session 时，首页显示当前任务、最近状态和“继续上次任务”。继续后恢复保存的 `currentStep`，不得重复询问仍然有效且已确认的信息。

## 8.3 重置演示数据

- 在现有顶部状态菜单或“我的系统”操作区提供“重置演示数据”。
- 点击后先二次确认。
- 确认后删除 `xuanos:demo-user:session:v1`，恢复初始 mock 和 `idle`。
- 重置只影响 demo 数据，不新增设置页面。

---

# 9. 异常与失败保护

- 用户暂时不想继续回答时，保留当前 session，并允许稍后继续。
- 当前信息不足时不能生成完整计划；可以显示低风险临时行动，但必须标记“信息不足”，且不把它当作已确认计划。
- 用户重复提交反馈时，以提交锁阻止重复 action。
- `localStorage` 不可用时继续使用内存状态，并显示非阻断提示。
- 用户纠正系统判断时，不把旧判断静默删除，而是记录纠正及处理结果。
- 不保存无关敏感隐私，不把短期情绪写成长期人格结论。

---

# 10. 验收标准

1. 从首页可以完整走到“我的系统”更新。
2. 所有主要按钮都有明确、可见的行为。
3. 三种表达方式都能进入同一个理解确认节点。
4. 问题一次只显示一个，且可以返回修改答案。
5. 理解未确认前不能生成计划。
6. 用户纠正会写入当前 session，并改变理解摘要。
7. 计划修改至少选择一个原因。
8. 计划修改创建新版本，不覆盖原版本。
9. 用户坚持非首选方案时系统接受并保留声明。
10. 提交反馈后系统修正和快照同时发生变化。
11. 我的系统页展示最新主线、阶段、行动、验证项和纠正记录。
12. 刷新后流程、输入草稿和计划版本仍然存在。
13. 可以通过确认操作重置演示数据。
14. 所有生成内容来自 mock 规则和本地数据。
15. 不接真实 API，不新增 MVP 范围外页面或功能。

---

# 11. 下一步前端改造范围

下一步实施交互时，建议按以下边界修改：

1. 新增 session 类型、状态枚举和 reducer action 类型。
2. 新增 `InteractionContext`、`interactionReducer` 和本地持久化 hook。
3. 将现有 mock 数据整理为初始 session、问题、理解生成、计划生成和反馈修正规则。
4. 在 `App` 或 `AppShell` 外层接入唯一的 Context Provider。
5. 让首页按钮和全局导航 dispatch 流程 action。
6. 改造引导式理解页，实现表达方式、单题追问、摘要确认和纠正。
7. 改造计划裁决页，实现版本追加、修改原因和接受状态。
8. 改造行动反馈页，实现草稿、校验、提交锁和 mock 修正。
9. 改造我的系统页，让其读取最新 `systemSnapshot` 和纠正记录。
10. 在现有菜单中加入继续任务与重置演示数据入口，不新增页面。

实施时保持现有五页结构与视觉基线，交互状态替换静态展示数据，不进行架构重构。
