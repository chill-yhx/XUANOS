import type { PageId, UnderstandingAssessment } from '../types'
import { GlassPanel } from '../components/GlassPanel'
import { ModeSelector } from '../components/ModeSelector'
import { PrimaryButton } from '../components/PrimaryButton'
import { QuestionCard } from '../components/QuestionCard'
import { SecondaryButton } from '../components/SecondaryButton'
import { Tag } from '../components/Tag'
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
  const {
    state,
    dispatch,
    selectExpressionMode,
    submitInitialInput,
    submitUnderstandingAnswer,
    confirmUnderstanding,
  } = useInteraction()
  const question = state.currentQuestion
  const summary = state.serverUnderstanding ?? state.understanding
  const isLoading = state.understandingRequestStatus === 'loading'
  const assessment = state.understandingAssessmentDraft
  const correction = state.understandingCorrectionDraft
  const isPastUnderstanding = [
    'plan_generated',
    'plan_modified',
    'plan_accepted',
    'action_pending',
    'feedback_submitted',
    'system_revised',
  ].includes(state.currentStep)

  const chooseAssessment = (value: UnderstandingAssessment | null) => {
    dispatch({ type: 'UPDATE_UNDERSTANDING_ASSESSMENT', assessment: value })
  }

  const sourceTag = state.understandingSource === 'api'
    ? <Tag tone="success">SERVER RESULT</Tag>
    : state.understandingSource === 'cache'
      ? <Tag tone="impact">OFFLINE CACHE</Tag>
      : <Tag tone="muted">DEVELOPMENT MOCK</Tag>

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

      {!state.activeThreadId && (
        <WarningBanner tone="impact">请先从首页创建真实任务线程，再开始理解。</WarningBanner>
      )}

      {state.understandingApiError && (
        <WarningBanner tone="impact">
          {state.understandingApiError.message} 当前输入仍已保留，可直接重试。
        </WarningBanner>
      )}

      {state.currentStep === 'expression_mode' && (
        <GlassPanel variant="primary" eyebrow="EXPRESSION MODE" title="选择表达方式">
          <ModeSelector
            value={state.expressionMode}
            onChange={(mode) => void selectExpressionMode(mode)}
            disabled={isLoading || !state.activeThreadId}
          />
          {isLoading && <div className="request-state"><span className="status-pulse" />正在建立服务端理解会话</div>}
          {!isLoading && state.expressionMode === 'ask' && state.understandingApiError && (
            <div className="button-row">
              <PrimaryButton onClick={() => void selectExpressionMode('ask')}>重试进入问题</PrimaryButton>
            </div>
          )}
        </GlassPanel>
      )}

      {state.currentStep === 'collecting_input' && (
        <GlassPanel variant="primary" eyebrow="YOUR CONTEXT" title={state.expressionMode === 'sort' ? '先说一句' : '完整表达'}>
          <textarea
            className="short-input understanding-input"
            value={state.userInput}
            onChange={(event) => dispatch({ type: 'UPDATE_USER_INPUT', value: event.target.value })}
            placeholder="输入你的目标、困境，或当前最需要梳理的事情。"
            disabled={isLoading}
          />
          <div className="button-row">
            <SecondaryButton onClick={() => dispatch({ type: 'START_CALIBRATION' })} disabled={isLoading}>重选方式</SecondaryButton>
            <PrimaryButton onClick={() => void submitInitialInput()} disabled={!state.userInput.trim() || isLoading}>
              {isLoading ? '正在保存目标' : state.understandingApiError ? '重试提交' : '进入关键问题'}
            </PrimaryButton>
          </div>
        </GlassPanel>
      )}

      {state.currentStep === 'asking_question' && question && (
        <GlassPanel variant="primary" title="当前问题" eyebrow="ONE QUESTION AT A TIME">
          <QuestionCard
            prompt={question.prompt}
            hint={question.hint}
            value={state.currentAnswerDraft}
            index={question.index}
            total={question.total}
            onChange={(value) => dispatch({ type: 'UPDATE_ANSWER_DRAFT', value })}
            onSubmit={() => void submitUnderstandingAnswer()}
            onBack={state.currentQuestionIndex > 0 ? () => dispatch({ type: 'GO_TO_PREVIOUS_QUESTION' }) : undefined}
            isLoading={isLoading}
          />
        </GlassPanel>
      )}

      {state.currentStep === 'asking_question' && !question && (
        <GlassPanel variant="secondary" eyebrow="QUESTION SYNC" title="等待当前问题">
          <div className="request-state">
            <span className="status-pulse" />
            {isLoading ? '正在读取服务端问题' : '当前问题尚未同步，请重试上一项提交。'}
          </div>
        </GlassPanel>
      )}

      {state.currentStep === 'reviewing_understanding' && summary && (
        <>
          <GlassPanel variant="primary" eyebrow="SYSTEM READ" title="请确认理解">
            <div className="understanding-source-line">
              {sourceTag}
              {state.lastSuccessfulUnderstandingAt && <span>最近同步 {new Date(state.lastSuccessfulUnderstandingAt).toLocaleString()}</span>}
            </div>
            <UnderstandingCard summary={summary} />
          </GlassPanel>
          <GlassPanel variant="ghost" title="你的判断" eyebrow="CONFIRM OR CORRECT">
            {state.understandingSource === 'cache' && (
              <WarningBanner tone="gold">当前展示最近缓存。确认仍会发送到服务端，后端不可用时不会推进流程。</WarningBanner>
            )}
            {state.understandingSource === 'mock' && (
              <WarningBanner tone="impact">开发 Mock 仅供展示，不能用于正式确认。</WarningBanner>
            )}
            {!assessment ? (
              <div className="feedback-choice-row">
                <PrimaryButton
                  onClick={() => void confirmUnderstanding('accurate')}
                  disabled={isLoading || state.understandingSource === 'mock'}
                >
                  {isLoading ? '正在确认' : '准确'}
                </PrimaryButton>
                <SecondaryButton onClick={() => chooseAssessment('partial')} disabled={isLoading}>部分准确</SecondaryButton>
                <SecondaryButton onClick={() => chooseAssessment('inaccurate')} disabled={isLoading}>不准确</SecondaryButton>
                <SecondaryButton onClick={() => chooseAssessment('supplement')} disabled={isLoading}>补充信息</SecondaryButton>
              </div>
            ) : (
              <div className="correction-entry">
                <textarea
                  className="short-input"
                  value={correction}
                  onChange={(event) => dispatch({ type: 'UPDATE_UNDERSTANDING_CORRECTION', value: event.target.value })}
                  placeholder="写下需要修正或补充的内容。"
                  disabled={isLoading}
                />
                <div className="button-row">
                  <PrimaryButton
                    onClick={() => void confirmUnderstanding(assessment, correction)}
                    disabled={!correction.trim() || isLoading || state.understandingSource === 'mock'}
                  >
                    {isLoading ? '正在保存纠正' : state.understandingApiError ? '重试保存纠正' : '写入本次理解'}
                  </PrimaryButton>
                  <SecondaryButton onClick={() => chooseAssessment(null)} disabled={isLoading}>取消</SecondaryButton>
                </div>
              </div>
            )}
            {state.corrections.length > 0 && (
              <WarningBanner tone="gold">已保存 {state.corrections.length} 条服务端纠正。请再次确认更新后的摘要。</WarningBanner>
            )}
          </GlassPanel>
        </>
      )}

      {state.currentStep === 'understanding_confirmed' && summary && (
        <GlassPanel variant="primary" eyebrow="STARTING PROFILE" title="起点档案已确认">
          <div className="understanding-source-line">{sourceTag}</div>
          <div className="start-profile-grid">
            <div><span className="metric-label">当前主线</span><p>{summary.realGoal}</p></div>
            <div><span className="metric-label">现实边界</span><p>{summary.constraints}</p></div>
            <div><span className="metric-label">系统仍在验证</span><p>{summary.uncertain}</p></div>
          </div>
          <WarningBanner tone="gold">这是服务端保存的起点版本，不是固定定义。</WarningBanner>
          <div className="button-row">
            <PrimaryButton
              onClick={() => { dispatch({ type: 'GENERATE_PLAN' }); onNavigate('plan') }}
              disabled={state.understandingSource !== 'api' || state.isOfflineCache}
            >
              进入 Mock 计划裁决
            </PrimaryButton>
            <SecondaryButton onClick={() => onNavigate('home')}>暂时离开</SecondaryButton>
          </div>
        </GlassPanel>
      )}

      {isPastUnderstanding && summary && (
        <GlassPanel variant="secondary" eyebrow="CONFIRMED READ" title="理解已经确认">
          <div className="understanding-source-line">{sourceTag}</div>
          <UnderstandingCard summary={summary} />
          <div className="button-row">
            <PrimaryButton onClick={() => onNavigate(state.currentPlan ? 'plan' : 'understanding')}>查看当前裁决</PrimaryButton>
            <SecondaryButton onClick={() => dispatch({ type: 'REOPEN_QUESTIONS' })}>重新回答问题</SecondaryButton>
          </div>
        </GlassPanel>
      )}
    </section>
  )
}
