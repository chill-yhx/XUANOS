import type { PageId } from '../types'
import { PrimaryButton } from '../components/PrimaryButton'
import { SecondaryButton } from '../components/SecondaryButton'
import { XuanosHeartCore } from '../components/XuanosHeartCore'
import { useInteraction } from '../state/useInteraction'

interface PageProps {
  onNavigate: (page: PageId) => void
}

export function HomePage({ onNavigate }: PageProps) {
  const { state, continuePage, startCalibration } = useInteraction()
  const hasProgress = Boolean(state.activeThreadId)

  const handleStart = async () => {
    if (!hasProgress || state.serverStep === 'idle') {
      const ready = await startCalibration()
      if (ready) onNavigate('understanding')
      return
    }
    onNavigate(continuePage)
  }
  const values = [
    { code: 'DIAGNOSE', title: '识别真实卡点' },
    { code: 'DECIDE', title: '裁决目标取舍' },
    { code: 'EXECUTE', title: '收束唯一行动' },
  ]

  return (
    <section className="cinematic-home">
      <div className="hero-content">
        <div className="xuanos-wordmark">XUANOS</div>
        <div className="hero-system-label">HUMAN GROWTH OS</div>
        <h1 className="hero-title">
          <span>校准你的</span>
          <span className="accent">下一步</span>
        </h1>
        <p className="hero-description">先识别真实卡点，<br />再收束成唯一行动。</p>
        <div className="hero-actions">
          <PrimaryButton onClick={() => void handleStart()} disabled={state.isLoading}>
            {state.isLoading ? '连接系统' : hasProgress ? '继续上次任务' : '开始校准'}
          </PrimaryButton>
          <SecondaryButton onClick={() => onNavigate('system')}>查看我的系统</SecondaryButton>
        </div>
        {(hasProgress || state.apiError) && (
          <div className="hero-session-state">
            {state.isOfflineCache && '离线缓存 · '}
            {state.apiError && !state.isOfflineCache
              ? state.apiError.message
              : `${state.uiThreadPhase} · ${state.uiThreadStatus}`}
            {state.availableThreads.length > 1 && ` · ${state.availableThreads.length} 个线程`}
          </div>
        )}
      </div>
      <div className="hero-visual">
        <XuanosHeartCore />
      </div>
      <div className="brand-logic" aria-label="XUANOS 核心价值">
        {values.map((value) => (
          <article className="logic-node" key={value.code}>
            <span className="logic-code">{value.code}</span>
            <strong className="logic-title">{value.title}</strong>
          </article>
        ))}
      </div>
    </section>
  )
}
