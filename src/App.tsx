import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LearnerProvider } from './context/LearnerContext'
import { AuthPage } from './pages/AuthPage'

// Route components are loaded on demand so the initial bundle only ships the
// shell (providers + router). The lesson player in particular pulls in the
// program interpreter and the drag-and-drop editor, which need not load until a
// learner actually opens a lesson.
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })))
const CoursePage = lazy(() => import('./pages/CoursePage').then((m) => ({ default: m.CoursePage })))
const LessonPage = lazy(() => import('./pages/LessonPage').then((m) => ({ default: m.LessonPage })))
const PracticePage = lazy(() => import('./pages/PracticePage').then((m) => ({ default: m.PracticePage })))
const ParentPage = lazy(() => import('./pages/ParentPage').then((m) => ({ default: m.ParentPage })))

function AppRoutes() {
  return (
    <Suspense
      fallback={<div className="flex min-h-full items-center justify-center text-muted">Loading…</div>}
    >
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/app" element={<HomePage />} />
        <Route path="/course" element={<CoursePage />} />
        <Route path="/lesson/:lessonId" element={<LessonPage />} />
        <Route path="/practice/:lessonId" element={<PracticePage />} />
        <Route path="/parent" element={<ParentPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

function Gate() {
  const { enabled, loading, user, ownerKey } = useAuth()

  if (loading) {
    return <div className="flex min-h-full items-center justify-center text-muted">Loading…</div>
  }

  if (enabled && !user) {
    return <AuthPage />
  }

  // ownerKey is 'local' (Firebase off) or the signed-in parent's uid.
  return (
    <LearnerProvider ownerKey={ownerKey ?? 'local'}>
      <AppRoutes />
    </LearnerProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app-bg min-h-full">
          <Gate />
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}
