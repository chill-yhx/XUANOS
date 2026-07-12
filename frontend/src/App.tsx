import { useEffect, useState } from 'react'
import { AppShell } from './components/AppShell'
import { FeedbackPage } from './pages/FeedbackPage'
import { HomePage } from './pages/HomePage'
import { PlanPage } from './pages/PlanPage'
import { SystemPage } from './pages/SystemPage'
import { UnderstandingPage } from './pages/UnderstandingPage'
import type { PageId } from './types'
import { useInteraction } from './state/useInteraction'
import './App.css'

function App() {
  const [currentPage, setCurrentPage] = useState<PageId>('home')
  const { state, dispatch } = useInteraction()

  useEffect(() => {
    if (state.currentStep === 'plan_generated' && currentPage === 'understanding') {
      setCurrentPage('plan')
    }
  }, [currentPage, state.currentStep])

  const navigate = (page: PageId) => {
    const understandingInProgress = ['expression_mode', 'collecting_input', 'asking_question', 'reviewing_understanding', 'understanding_confirmed'].includes(state.currentStep)
    if (page === 'understanding' && state.currentStep === 'idle') {
      dispatch({ type: 'START_CALIBRATION' })
    }
    if (page === 'plan' && (!state.currentPlan || understandingInProgress)) {
      if (state.currentStep === 'idle') dispatch({ type: 'START_CALIBRATION' })
      setCurrentPage('understanding')
      return
    }
    if (page === 'feedback' && (state.currentPlan?.status !== 'accepted' || understandingInProgress)) {
      setCurrentPage(understandingInProgress || !state.currentPlan ? 'understanding' : 'plan')
      return
    }
    setCurrentPage(page)
  }

  const renderPage = () => {
    const pageProps = { onNavigate: navigate }

    switch (currentPage) {
      case 'understanding':
        return <UnderstandingPage {...pageProps} />
      case 'plan':
        return <PlanPage {...pageProps} />
      case 'feedback':
        return <FeedbackPage {...pageProps} />
      case 'system':
        return <SystemPage {...pageProps} />
      default:
        return <HomePage {...pageProps} />
    }
  }

  return (
    <AppShell currentPage={currentPage} onNavigate={navigate}>
      {renderPage()}
    </AppShell>
  )
}

export default App
