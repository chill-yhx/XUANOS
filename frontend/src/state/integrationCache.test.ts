import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { writeAuthSession } from '../api/authSession'
import { getOrCreateIdempotencyKey } from '../api/idempotency'
import { understandingQuestionAt } from '../data/understandingQuestions'
import type { ActiveThread, DemoSessionState } from '../types'
import { createInitialSession } from './initialState'
import {
  readThreadIntegrationCache,
  restoreIntegrationState,
  writeIntegrationCache,
} from './integrationCache'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

const storage = new MemoryStorage()

function authenticate(userId: string) {
  writeAuthSession({
    accessToken: `token-${userId}`,
    userId,
    expiresAt: '2099-01-01T00:00:00Z',
  })
}

function thread(userId: string, threadId: string): ActiveThread {
  return {
    id: threadId,
    userId,
    title: `Thread ${threadId}`,
    status: 'active',
    currentStep: 'idle',
    phase: 'Calibration',
    activeUnderstandingSessionId: null,
    activePlanId: null,
    lastActivityAt: '2026-07-14T01:00:00Z',
    createdAt: '2026-07-14T00:00:00Z',
    updatedAt: '2026-07-14T01:00:00Z',
  }
}

function stateFor(
  userId: string,
  threadId: string,
  draft: string,
  availableThreads: ActiveThread[],
): DemoSessionState {
  const activeThread = thread(userId, threadId)
  return {
    ...createInitialSession(),
    activeThread,
    activeThreadId: threadId,
    availableThreads,
    currentStep: 'collecting_input',
    serverStep: 'idle',
    expressionMode: 'sort',
    userInput: draft,
    dataSource: 'api',
  }
}

beforeEach(() => {
  storage.clear()
  vi.stubGlobal('window', { localStorage: storage })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('integration cache ownership and recovery', () => {
  it('keeps drafts in separate user and thread buckets', () => {
    authenticate('user-a')
    const threadA = thread('user-a', 'thread-a')
    const threadB = thread('user-a', 'thread-b')
    writeIntegrationCache(stateFor('user-a', 'thread-a', 'draft A', [threadA, threadB]))
    writeIntegrationCache(stateFor('user-a', 'thread-b', 'draft B', [threadA, threadB]))

    expect(readThreadIntegrationCache('user-a', 'thread-a')?.userInput).toBe('draft A')
    expect(readThreadIntegrationCache('user-a', 'thread-b')?.userInput).toBe('draft B')
  })

  it('does not expose one authenticated user cache to another user', () => {
    authenticate('user-a')
    const threadA = thread('user-a', 'thread-a')
    writeIntegrationCache(stateFor('user-a', 'thread-a', 'private draft', [threadA]))

    authenticate('user-b')
    const restored = restoreIntegrationState()

    expect(restored.activeThreadId).toBeNull()
    expect(restored.userInput).toBe('')
    expect(restored.availableThreads).toEqual([])
  })

  it('safely ignores corrupted cache JSON', () => {
    authenticate('user-a')
    storage.setItem('xuanos:integration-cache:v4:user:user-a', '{not-json')

    expect(() => restoreIntegrationState()).not.toThrow()
    expect(restoreIntegrationState().activeThreadId).toBeNull()
  })

  it('does not let a stale cached UI step move an idle thread to the plan page', () => {
    authenticate('user-a')
    const idleThread = thread('user-a', 'thread-idle')
    writeIntegrationCache({
      ...stateFor('user-a', idleThread.id, '', [idleThread]),
      currentStep: 'plan_generated',
      expressionMode: null,
    })

    const restored = restoreIntegrationState()
    expect(restored.serverStep).toBe('idle')
    expect(restored.currentStep).toBe('expression_mode')
    expect(restored.currentPlan).toBeNull()
  })

  it('recovers a cached partial understanding to its exact next question', () => {
    authenticate('user-a')
    const partialThread = thread('user-a', 'thread-partial')
    const base = stateFor('user-a', partialThread.id, 'initial input', [partialThread])
    writeIntegrationCache({
      ...base,
      currentStep: 'asking_question',
      serverStep: 'idle',
      activeUnderstandingSession: {
        id: 'session-partial',
        threadId: partialThread.id,
        userId: 'user-a',
        previousSessionId: null,
        expressionMode: 'sort',
        status: 'collecting',
        userInput: 'initial input',
        currentQuestionIndex: 1,
        summaryVersion: 0,
        confirmedAt: null,
        createdAt: '2026-07-14T00:00:00Z',
        updatedAt: '2026-07-14T01:00:00Z',
      },
      understandingSessionId: 'session-partial',
      understandingStatus: 'collecting',
      submittedAnswers: { desired_result: 'Ship the MVP' },
      currentQuestionIndex: 1,
      currentQuestion: understandingQuestionAt(1),
    })

    const restored = restoreIntegrationState()
    expect(restored.serverStep).toBe('asking_question')
    expect(restored.currentStep).toBe('asking_question')
    expect(restored.currentQuestion?.id).toBe('current_foundation')
    expect(restored.submittedAnswers.desired_result).toBe('Ship the MVP')
  })

  it('discards a legacy cache whose thread ownership cannot be verified', () => {
    authenticate('user-a')
    storage.setItem('xuanos:integration-cache:v3:user-a', JSON.stringify({
      schemaVersion: 3,
      userId: 'user-a',
      lastThreadId: 'thread-other',
      server: {
        serverStep: 'idle',
        activeThread: thread('user-other', 'thread-other'),
        availableThreads: [thread('user-other', 'thread-other')],
        serverSnapshot: null,
      },
    }))

    const restored = restoreIntegrationState()
    expect(restored.activeThreadId).toBeNull()
    expect(restored.userInput).toBe('')
  })

  it('stores pending idempotency keys in separate thread buckets', () => {
    authenticate('user-a')
    const keyA = getOrCreateIdempotencyKey('save-answer', { answer: 'same' }, 'thread-a')
    const keyB = getOrCreateIdempotencyKey('save-answer', { answer: 'same' }, 'thread-b')

    expect(keyA).not.toBe(keyB)
    expect(storage.getItem('xuanos:idempotency:v3:user-a:thread-a')).toContain(keyA)
    expect(storage.getItem('xuanos:idempotency:v3:user-a:thread-b')).toContain(keyB)
  })
})
