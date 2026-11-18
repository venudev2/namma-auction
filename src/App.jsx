import React, { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { AuctionProvider } from './contexts/AuctionContext'
import { QuotaProvider } from './contexts/QuotaContext'
import { ConnectionAlertProvider } from './contexts/ConnectionAlertContext'
import ScrollToTop from './components/ScrollToTop'
import PageLoader from './components/PageLoader'
import LandingPage from './pages/LandingPage'
import './index.css'

// ── Resilient Lazy Loading (prevents adblockers from crashing the app) ────────
const safeLazy = (importFn) =>
  lazy(() =>
    importFn().catch((err) => {
      console.warn('Dynamic import blocked or failed to fetch:', err);
      return { default: () => null };
    })
  );

// ── Lazy-loaded routes (split out of the initial bundle) ──────────────────────
const AuctionRoom     = lazy(() => import('./pages/AuctionRoom'))
const AuctionSummary  = lazy(() => import('./pages/AuctionSummary'))
const Lobby           = lazy(() => import('./pages/Lobby'))
const GameGuide       = lazy(() => import('./pages/GameGuide'))
const AboutUs         = lazy(() => import('./pages/AboutUs'))
const PrivacyPolicy   = lazy(() => import('./pages/PrivacyPolicy'))
const TermsConditions = lazy(() => import('./pages/TermsConditions'))
const PhotoCredits    = lazy(() => import('./pages/PhotoCredits'))
const AdminPanel      = lazy(() => import('./pages/AdminPanel'))
const NotFound        = lazy(() => import('./pages/NotFound'))

// ── Lazy-loaded heavy modals (safe against adblockers) ────────────────────────
const QuotaExceededModal   = safeLazy(() => import('./components/QuotaExceededModal'))
const ConnectionAlertModal = safeLazy(() => import('./components/ConnectionAlertModal'))
const FeedbackModal        = safeLazy(() => import('./components/FeedbackModal'))

// ── Minimal fallback — uniform with PageLoader ────────────────────────────────
const PageFallback = () => <PageLoader />

function App() {
  return (
    <Router>
      <ScrollToTop />
      <QuotaProvider>
        <ConnectionAlertProvider>
          <AuthProvider>
            <AuctionProvider>
              <div className="min-h-screen bg-ipl-dark text-white">
                {/* Modals are not needed on first paint — lazy load them */}
                <Suspense fallback={null}>
                  <ConnectionAlertModal />
                  <QuotaExceededModal />
                  <FeedbackModal />
                </Suspense>

                <Routes>
                  {/* LandingPage is eagerly loaded — it IS the first paint */}
                  <Route path="/" element={<LandingPage />} />

                  {/* All other routes are code-split into separate chunks */}
                  <Route path="/admin" element={
                    <Suspense fallback={<PageFallback />}><AdminPanel /></Suspense>
                  } />
                  <Route path="/admin/:tab" element={
                    <Suspense fallback={<PageFallback />}><AdminPanel /></Suspense>
                  } />
                  <Route path="/guide" element={
                    <Suspense fallback={<PageFallback />}><GameGuide /></Suspense>
                  } />
                  <Route path="/about" element={
                    <Suspense fallback={<PageFallback />}><AboutUs /></Suspense>
                  } />
                  <Route path="/privacy" element={
                    <Suspense fallback={<PageFallback />}><PrivacyPolicy /></Suspense>
                  } />
                  <Route path="/terms" element={
                    <Suspense fallback={<PageFallback />}><TermsConditions /></Suspense>
                  } />
                  <Route path="/credits" element={
                    <Suspense fallback={<PageFallback />}><PhotoCredits /></Suspense>
                  } />
                  <Route path="/photo-credits" element={
                    <Suspense fallback={<PageFallback />}><PhotoCredits /></Suspense>
                  } />
                  <Route path="/lobby/:id" element={
                    <Suspense fallback={<PageFallback />}><Lobby /></Suspense>
                  } />
                  <Route path="/auction/:id" element={
                    <Suspense fallback={<PageFallback />}><AuctionRoom /></Suspense>
                  } />
                  <Route path="/summary/:id" element={
                    <Suspense fallback={<PageFallback />}><AuctionSummary /></Suspense>
                  } />
                  <Route path="*" element={
                    <Suspense fallback={<PageFallback />}><NotFound /></Suspense>
                  } />
                </Routes>
              </div>
            </AuctionProvider>
          </AuthProvider>
        </ConnectionAlertProvider>
      </QuotaProvider>
    </Router>
  )
}

export default App
