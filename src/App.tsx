import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { LearnerProvider } from './context/LearnerContext'
import { HomePage } from './pages/HomePage'
import { CoursePage } from './pages/CoursePage'
import { LessonPage } from './pages/LessonPage'
import { ParentPage } from './pages/ParentPage'
import { AuthPage } from './pages/AuthPage'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/app" element={<HomePage />} />
      <Route path="/course" element={<CoursePage />} />
      <Route path="/lesson/:lessonId" element={<LessonPage />} />
      <Route path="/parent" element={<ParentPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
