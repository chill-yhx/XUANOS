import type { PageId, PriorityGroup, SystemSection, ThreadSummary, TimeBlock } from '../types'

export const navigationItems: Array<{ id: PageId; label: string; code: string }> = [
  { id: 'home', label: '控制台', code: '01' },
  { id: 'understanding', label: '引导式理解', code: '02' },
  { id: 'plan', label: '计划裁决', code: '03' },
  { id: 'feedback', label: '行动执行', code: '04' },
  { id: 'system', label: '我的系统', code: '05' },
]

export const mockThread: ThreadSummary = {
  title: 'XUANOS 暑假开发',
  status: '进行中',
  phase: '视觉系统确认',
  nextReview: '完成线框后',
}

export const mockProfile = {
  user: 'demo-user',
  mentorStyle: '平衡分析',
  task: 'XUANOS 暑假开发',
  mainGoal: '完成 XUANOS 静态前端原型',
  stage: '视觉系统确认',
  systemStatus: '等待行动',
  singleAction: '完成五个页面线框',
  completion: '五个核心页面具备可交付线框',
  workload: '中等',
  maintenanceGoal: '每周 3 次基础健身',
  pausedGoals: ['Flutter 客户端', '完整商业系统'],
  hypothesis: '用户可能通过继续完善文档推迟真实开发',
  systemMode: '混合模式',
}

export const understandingSummary = {
  stage: '核对现实',
  realGoal: '不是继续讨论视觉方向，而是完成可运行的 XUANOS 静态前端原型。',
  foundation: '已具备 MVP 范围、视觉规范、页面线框和开发任务书。',
  constraints: '当前只做五个核心页面；不接后端、真实 AI、登录或数据库。',
  tension: '文档已足够进入实现，继续补充设计会推迟真实开发。',
  uncertain: '完成线框后，是否能及时进入可点击的前端实现仍需下一次行动验证。',
}

export const keyQuestion = {
  prompt: '五个页面线框完成后，最应该立即验证什么？',
  options: ['页面是否可切换', '视觉是否有系统感', '是否先补更多文档'],
}

export const decisionData = {
  mainGoal: mockProfile.mainGoal,
  reason: '验证产品气质与核心流程。',
  stage: mockProfile.stage,
  risk: '继续规划，延迟实现。',
  bottleneck: '从说明进入可运行界面。',
  buffer: '保留 20% 调整空间。',
  review: '五页可切换后复查。',
}

export const priorityGroups: PriorityGroup[] = [
  {
    title: '维持目标',
    label: 'KEEP',
    tone: 'success',
    items: [mockProfile.maintenanceGoal],
  },
  {
    title: '暂停目标',
    label: 'PAUSE',
    tone: 'impact',
    items: mockProfile.pausedGoals,
  },
  {
    title: '删除事项',
    label: 'REMOVE',
    tone: 'risk',
    items: ['无意义动效', '排行榜', '积分系统'],
  },
]

export const timeBlocks: TimeBlock[] = [
  { label: '高能时段', task: '完成核心页面的信息层级与视觉骨架。' },
  { label: '普通时段', task: '整理五页线框与组件清单。' },
  { label: '低能时段', task: '复查状态文案、边界与阅读节奏。' },
]

export const feedbackObstacles = [
  { code: 'action_unclear', label: '行动不明确' },
  { code: 'goal_rejected', label: '目标不认可' },
  { code: 'environment', label: '环境干扰' },
  { code: 'unexpected_event', label: '临时意外' },
  { code: 'other_people', label: '他人影响' },
  { code: 'emotion_change', label: '情绪变化' },
  { code: 'low_energy', label: '精力不足' },
  { code: 'ability_limit', label: '能力不足' },
  { code: 'other', label: '其他' },
]

export const systemSections: SystemSection[] = [
  {
    id: 'vector',
    title: '当前主线',
    english: 'CURRENT VECTOR',
    tone: 'gold',
    entries: [
      '当前主目标：完成 XUANOS 静态前端原型',
      '当前阶段：视觉系统确认',
      '当前唯一行动：完成五个页面线框',
    ],
  },
  {
    id: 'bounds',
    title: '现实边界',
    english: 'REALITY BOUNDS',
    tone: 'muted',
    entries: [
      '可用资源：现有规格文档已齐备',
      '固定边界：只做五个核心页面',
      '当前不做：后端、真实 AI、登录和数据库',
    ],
  },
  {
    id: 'working',
    title: '对我有效',
    english: 'WORKING PATTERNS',
    tone: 'success',
    entries: [
      '有明确交付物的任务更容易启动。',
      '同时保留过多主目标时容易失焦。',
    ],
    footnote: '基于已确认的目标取舍与本阶段计划。',
  },
  {
    id: 'review',
    title: '系统仍在验证',
    english: 'UNDER REVIEW',
    tone: 'impact',
    entries: [mockProfile.hypothesis],
    footnote: '当前证据不足，等待下一次行动结果验证。',
  },
  {
    id: 'revision',
    title: '最近修正',
    english: 'RECENT REVISION',
    tone: 'gold',
    entries: ['系统将重点从“继续完善文档”转为“完成可运行的静态原型”。'],
  },
  {
    id: 'corrections',
    title: '用户纠正',
    english: 'USER CORRECTIONS',
    tone: 'muted',
    entries: ['健身不是暂停目标，而是每周 3 次的维持目标。'],
  },
]

export const diaryEntries = [
  {
    label: '今天',
    title: '系统复述',
    content: '规格已足够开始实现。当前应避免把“继续完善文档”误当成核心推进。',
  },
  {
    label: '上次',
    title: '用户选择',
    content: '将 Flutter 客户端与完整商业系统列为暂停目标，先保护静态原型的实现范围。',
  },
  {
    label: '复查',
    title: '待验证',
    content: '完成五个页面线框后，观察是否会立即进入前端搭建，而非回到文档扩写。',
  },
]
