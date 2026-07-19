import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RootApplication } from './RootApplication'
import { AuthProvider } from './state/AuthContext'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RootApplication />
    </AuthProvider>
  </StrictMode>,
)
