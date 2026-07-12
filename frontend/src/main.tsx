import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { InteractionProvider } from './state/InteractionContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <InteractionProvider>
      <App />
    </InteractionProvider>
  </StrictMode>,
)
