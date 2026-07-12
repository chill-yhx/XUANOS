import { useEffect, useState } from 'react'
import type { PageId, UnderstandingAssessment } from '../types'
import { interactionQuestions } from '../data/interactionMock'
import { GlassPanel } from '../components/GlassPanel'
import { ModeSelector } from '../components/ModeSelector'
import { PrimaryButton } from '../components/PrimaryButton'
import { QuestionCard } from '../components/QuestionCard'
import { SecondaryButton } from '../components/SecondaryButton'
import { UnderstandingCard } from '../components/UnderstandingCard'
import { WarningBanner } from '../components/WarningBanner'
import { useInteraction } from '../state/useInteraction'

interface PageProps {
  onNavigate: (page: PageId) => void
}

const stages = ['理解目标', '核对现实', '理解确认', '起点档案', '准备计划']

function stageIndex(step: string) {
  if (step === 'asking_question') return 1
  if (step === 'reviewing_understanding') return 2
  if (step === 'understanding_confirmed') return 3
  return 0
}

export function UnderstandingPage({ onNavigate }: PageProps) {
  const { state, dispatch } = useInteraction()
  const [answer, setAnswer] = useState('')
  const [assessment, setAssessment] = useState<UnderstandingAssessment | null>(null)
  const [correction, setCorrection] = useState('')
  const question = interactionQuestions[state.currentQuestionIndex]
  const isPastUnderstanding = ['plan_generated', 'plan_modified', 'plan_accepted', 'action_pending', 'feedback_submitted', 'system_revised'].includes(state.currentStep)

  useEffect(() => {
    if (question) setAnswer(state.answers[question.id] || '')
  }, [question, state.answers])

  const submitAnswer = () => {
    dispatch({ type: 'ANSWER_QUESTION', answer })
    setAnswer('')
  }

  const submitCorrection = () => {
    if (!assessment || !correction.trim()) return
    dispatch({ type: 'ADD_CORRECTION', assessment, value: correction })
    setCorrection('')
    setAssessment(null)
  }

  return (
    <section className="page understanding-layout">
      <header className="page-heading">
        <div>
          <div className="eyebrow">GUIDED UNDERSTANDING</div>
          <h1>引导式理解</h1>
        </div>
        <p className="page-heading-copy">一次只确认一个信息。理解完成后，系统才会给出裁决。</p>
      </header>

      <div className="stage-track" aria-label="当前理解阶段">
        {stages.map((stage, index) => (
          <span key={stage} className={`stage-item ${index === stageIndex(state.currentStep) ? 'is-current' : ''}`}>
            <span className="stage-dot" />{stage}
          </span>
        ))}
      </div>

      {state.currentStep === 'expression_mode' && (
        <GlassPanel variant="primary" eyebrow="EXPRESSION MODE" title="选择表达方式">
          <ModeSelector value={state.expressionMode} onChange={(mode) => dispatch({ type: 'SELECT_EXPRESSION_MODE', mode })} />
        </GlassPanel>
      )}

      {state.currentStep === 'collecting_input' && (
        <GlassPanel variant="primary" eyebrow="YOUR CONTEXT" title={state.expressionMode === 'sort' ? '先说一句' : '完整表达'}>
          <textarea
            className="short-input understanding-input"
            value={state.userInput}
            onChange={(event) => dispatch({ type: 'UPDATE_USER_INPUT', value: event.target.value })}
            placeholder="输入你的目标、困境，或当前最需要梳理的事情。"
          />
          <div className="button-row">
            <SecondaryButton onClick={() => dispatch({ type: 'START_CALIBRATION' })}>重选方式</SecondaryButton>
            <PrimaryButton onClick={() => dispatch({ type: 'SUBMIT_USER_INPUT' })} disabled={!state.userInput.trim()}>进入关键问题</PrimaryButton>
          </div>
        </GlassPanel>
      )}

      {state.currentStep === 'asking_question' && question && (
        <GlassPanel variant="primary" title="当前问题" eyebrow="ONE QUESTION AT A TIME">
          <QuestionCard
            prompt={question.prompt}
            hint={question.hint}
            value={answer}
            index={state.currentQuestionIndex}
            total={interactionQuestions.length}
            onChange={setAnswer}
            onSubmit={submitAnswer}
            onBack={state.currentQuestionIndex > 0 ? () => dispatch({ type: 'GO_TO_PREVIOUS_QUESTION' }) : undefined}
          />
        </GlassPanel>
      )}

      {state.currentStep === 'reviewing_understanding' && state.understanding && (
        <>
          <GlassPanel variant="primary" eyebrow="SYSTEM READ" title="请确认理解">
            <UnderstandingCard summary={state.understanding} />
          </GlassPanel>
          <GlassPanel variant="ghost" title="你的判断" eyebrow="CONFIRM OR CORRECT">
            {!assessment ? (
              <div className="feedback-choice-row">
                <PrimaryButton onClick={() => dispatch({ type: 'CONFIRM_UNDERSTANDING' })}>准确</PrimaryButton>
                <SecondaryButton onClick={() => setAssessment('partial')}>部分准确</SecondaryButton>
                <SecondaryButton onClick={() => setAssessment('inaccurate')}>不准确</SecondaryButton>
                <SecondaryButton onClick={() => setAssessment('supplement')}>补充信息</SecondaryButton>
              </div>
            ) : (
              <div className="correction-entry">
                <textarea className="short-input" value={correction} onChange={(event) => setCorrection(event.target.value)} placeholder="写下需要修正或补充的内容。" />
                <div className="button-row">
                  <PrimaryButton onClick={submitCorrection} disabled={!correction.trim()}>写入本次理解</PrimaryButton>
                  <SecondaryButton onClick={() => setAssessment(null)}>取消</SecondaryButton>
                </div>
              </div>
            )}
            {state.corrections.length > 0 && <WarningBanner tone="gold">已记录 {state.corrections.length} 条用户纠正。请再次确认更新后的摘要。</WarningBanner>}
          </GlassPanel>
        </>
      )}

      {state.currentStep === 'understanding_confirmed' && state.understanding && (
        <GlassPanel variant="primary" eyebrow="STARTING PROFILE" title="起点档案已确认">
          <div className="start-profile-grid">
            <div><span className="metric-label">当前主线</span><p>{state.understanding.realGoal}</p></div>
            <div><span className="metric-label">现实边界</span><p>{state.understanding.constraints}</p></div>
            <div><span className="metric-label">系统仍在验证</span><p>{state.understanding.uncertain}</p></div>
          </div>
          <WarningBanner tone="gold">这是初始版本，不是固定定义。后续会根据真实行动更新。</WarningBanner>
          <div className="button-row">
            <PrimaryButton onClick={() => { dispatch({ type: 'GENERATE_PLAN' }); onNavigate('plan') }}>生成计划裁决</PrimaryButton>
            <SecondaryButton onClick={() => onNavigate('home')}>暂时离开</SecondaryButton>
          </div>
        </GlassPanel>
      )}

      {isPastUnderstanding && state.understanding && (
        <GlassPanel variant="secondary" eyebrow="CONFIRMED READ" title="理解已经确认">
          <UnderstandingCard summary={state.understanding} />
          <div className="button-row">
            <PrimaryButton onClick={() => onNavigate(state.currentPlan ? 'plan' : 'understanding')}>查看当前裁决</PrimaryButton>
            <SecondaryButton onClick={() => dispatch({ type: 'REOPEN_QUESTIONS' })}>重新回答问题</SecondaryButton>
          </div>
        </GlassPanel>
      )}
    </section>
  )
}
