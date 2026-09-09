/* eslint-disable react-refresh/only-export-components -- This is the root mount, not a reusable component module. */
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
const App = lazy(() => import('./App.tsx'))
const AuthGate = lazy(() => import('./components/AuthGate.tsx').then(m => ({ default: m.AuthGate })))
const SharePage = lazy(() => import('./components/SharePage.tsx').then(m => ({ default: m.SharePage })))
const LandingPage = lazy(() => import('./components/LandingPage.tsx').then(m => ({ default: m.LandingPage })))

// Hand-rolled, three-route router. /v/<id> (a shared recording) must be
// viewable by anyone with the link, so it renders outside the auth gate
// entirely. / is the public marketing page; /app is the actual product,
// gated behind sign-in.
const path = window.location.pathname
const shareMatch = path.match(/^\/v\/([^/]+)\/?$/)
const isApp = /^\/app\/?$/.test(path)

createRoot(document.getElementById('root')!).render(
  <StrictMode><Suspense fallback={<div className="app">Loading speak.…</div>}>
    {shareMatch ? (
      <SharePage id={shareMatch[1]} />
    ) : isApp ? (
      <AuthGate>
        <App />
      </AuthGate>
    ) : (
      <LandingPage />
    )}
  </Suspense></StrictMode>,
)
