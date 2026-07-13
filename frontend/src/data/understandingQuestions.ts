import type { UnderstandingQuestion } from '../types'

export const understandingQuestions: UnderstandingQuestion[] = [
  {
    id: 'desired_result',
    prompt: '你最终想完成的具体结果是什么？',
    hint: '描述一个可以判断是否完成的结果。',
    index: 0,
    total: 3,
  },
  {
    id: 'current_foundation',
    prompt: '你当前已经具备哪些基础？',
    hint: '写下已有文档、能力、资源或已经完成的部分。',
    index: 1,
    total: 3,
  },
  {
    id: 'real_constraints',
    prompt: '现实中有哪些时间、资源或安排限制？',
    hint: '只写真正会影响执行的边界。',
    index: 2,
    total: 3,
  },
]

export function understandingQuestionAt(index: number): UnderstandingQuestion | null {
  return understandingQuestions[index] ?? null
}
