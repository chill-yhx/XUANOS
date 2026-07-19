import App from './App'
import { LoginPage } from './pages/LoginPage'
import { InteractionProvider } from './state/InteractionContext'
import { useAuth } from './state/useAuth'

export function RootApplication() {
  const auth = useAuth()
  if (auth.status === 'loading') {
    return <main className="auth-loading"><span className="status-pulse" />正在恢复安全会话</main>
  }
  if (auth.status === 'unauthenticated') return <LoginPage />
  return (
    <InteractionProvider>
      <App />
    </InteractionProvider>
  )
}
