import { describe, expect, it } from 'vitest'

import type { AnswerDto, ThreadAggregateDto } from '../api/dto'
import { threadAggregateMapper } from './threadAggregateMapper'

const now = '2026-07-15T00:00:00Z'

function aggregate(answers: AnswerDto[] = []): ThreadAggregateDto {
  return {
    thread: {
      id: 'thread-1',
      user_id: 'user-1',
      title: 'IELTS goal',
      status: 'active',
      current_step: 'asking_question',
      phase: 'understanding',
      active_understanding_session_id: 'session-1',
      active_plan_id: null,
      last_activity_at: now,
      created_at: now,
      updated_at: now,
    },
    active_understanding_session: {
      id: 'session-1',
      thread_id: 'thread-1',
      user_id: 'user-1',
      previous_session_id: null,
      expression_mode: 'speak',
      status: 'collecting',
      user_input: 'I want an IELTS 7.5 score.',
      current_question_index: 0,
      summary_version: 0,
      confirmed_at: null,
      created_at: now,
      updated_at: now,
    },
    current_answers: answers,
    understanding_summary: null,
    recent_corrections: [],
    current_plan: null,
    plan_versions: [],
    latest_action_result: null,
    current_snapshot: {
      id: 'snapshot-1',
      user_id: 'user-1',
      version: 1,
      source_thread_id: null,
      source_action_result_id: null,
      current_vector: 'Waiting',
      current_stage: 'Waiting',
      current_action: 'Waiting',
      reality_boundaries: [],
      effective_patterns: [],
      hypotheses: [],
      recent_revisions: [],
      user_corrections: [],
      revision_count: 0,
      created_at: now,
      updated_at: now,
    },
  }
}

describe('threadAggregateMapper', () => {
  it('restores the next missing question after an initial expression already supplied the goal', () => {
    const first = threadAggregateMapper(aggregate())
    expect(first.currentQuestion?.id).toBe('current_foundation')
    expect(first.currentQuestion?.index).toBe(0)
    expect(first.currentQuestion?.total).toBe(2)

    const second = threadAggregateMapper(aggregate([
      {
        id: 'answer-1',
        question_id: 'current_foundation',
        question_text: 'foundation',
        question_order: 1,
        answer_text: 'Current level is 6.0.',
        revision: 1,
        is_current: true,
        answered_at: now,
        created_at: now,
        updated_at: now,
      },
    ]))
    expect(second.currentQuestion?.id).toBe('real_constraints')
    expect(second.currentQuestion?.index).toBe(1)
    expect(second.currentQuestion?.total).toBe(2)
  })
})
