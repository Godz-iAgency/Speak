import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthGate } from './components/AuthGate.tsx'
import { SharePage } from './components/SharePage.tsx'
import { LandingPage } from './components/LandingPage.tsx'

// Hand-rolled, three-route router. /v/<id> (a shared recording) must be
// viewable by anyone with the link, so it renders outside the auth gate
// entirely. / is the public marketing page; /app is the actual product,
// gated behind sign-in.
const path = window.location.pathname
const shareMatch = path.match(/^\/v\/([^/]+)\/?$/)
const isApp = /^\/app\/?$/.test(path)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {shareMatch ? (
      <SharePage id={shareMatch[1]} />
    ) : isApp ? (
      <AuthGate>
        <App />
      </AuthGate>
    ) : (
      <LandingPage />
    )}
  </StrictMode>,
)
