import { type MouseEvent, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLearner } from '../context/LearnerContext'
import { course, getLesson, listLessons } from '../content/registry'
import { courseCompletionPercent, lessonHasProgress, nextRecommendedLessonId } from '../storage/progress'
import { CheckIcon, ChestIcon, LockIcon, RestartIcon } from '../components/icons'
import { playSound } from '../lib/sound'
import { avatarClass, lessonIcon } from './HomePage'

export function CoursePage() {
  const { ready, activeLearner, state, restartLesson } = useLearner()
  const navigate = useNavigate()

  useEffect(() => {
    if (ready && !activeLearner) navigate('/', { replace: true })
  }, [ready, activeLearner, navigate])

  const devUnlock = useMemo(
    () => new URLSearchParams(window.location.search).get('dev') === 'unlock',
    [],
  )

  if (!ready) {
    return <div className="flex min-h-full items-center justify-center text-muted">Loading…</div>
  }
  if (!activeLearner) {
    return null
  }
  const lessons = listLessons()
  const completed = state?.completedLessonIds ?? []
  const completedInCourse = course.lessonOrder.filter((id) => completed.includes(id)).length
  const recommendedId = state ? nextRecommendedLessonId(state, course) : course.lessonOrder[0]
  const percent = state ? courseCompletionPercent(state, course) : 0

  function handleRestart(lessonId: string, event: MouseEvent) {
    event.preventDefault()
    event.stopPropagation()
    const lesson = getLesson(lessonId)
    if (!lesson) return
    playSound('click')
    restartLesson(lesson)
    navigate(`/lesson/${lessonId}`)
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 lg:max-w-4xl">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            onClick={() => playSound('click')}
            className="back-btn"
            aria-label="Back to home"
          >
            <span aria-hidden="true">‹</span>
          </Link>
          <div>
            <p className="page-eyebrow">Course</p>
            <h1 className="page-title">{course.title}</h1>
          </div>
        </div>
        <span className={`home-avatar ${avatarClass(activeLearner.displayName)}`}>
          {activeLearner.displayName.slice(0, 1).toUpperCase()}
        </span>
      </header>

      <div className="card progress-card mb-6 p-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-muted">Your progress</span>
          <span className="text-lg font-bold text-accent">{percent}%</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-2 text-xs text-soft">
          {completedInCourse} of {lessons.length} lessons complete
        </p>
      </div>

      <h2 className="section-title mb-4 px-1">Your adventure map</h2>
      <div className="roadmap">
        {lessons.map((lesson, index) => {
          const isComplete = completed.includes(lesson.id)
          const prevLessonId = index > 0 ? course.lessonOrder[index - 1] : null
          const isLocked = prevLessonId !== null && !completed.includes(prevLessonId) && !devUnlock
          const isCurrent = lesson.id === recommendedId && !isComplete && !isLocked
          const hasProgress = state ? lessonHasProgress(state, lesson.id) : false
          const showRestart = (isComplete || hasProgress) && !isLocked
          const action = isComplete ? 'Review' : isCurrent ? 'Continue' : 'Start'
          const Icon = lessonIcon(index)
          const stateClass = isLocked
            ? 'roadmap-node--locked'
            : isComplete
              ? 'roadmap-node--done'
              : isCurrent
                ? 'roadmap-node--current'
                : 'roadmap-node--upcoming'
          const kicker = isLocked
            ? 'Locked'
            : isComplete
              ? 'Completed'
              : isCurrent
                ? 'Up next'
                : `Lesson ${index + 1}`
          return (
            <div
              key={lesson.id}
              className={`roadmap-node ${stateClass} animate-float-in`}
              style={{ animationDelay: `${index * 0.06}s` }}
            >
              <span className="roadmap-node__marker">
                {isLocked ? (
                  <LockIcon className="h-5 w-5" />
                ) : isComplete ? (
                  <CheckIcon className="h-5 w-5" />
                ) : (
                  <Icon className="h-6 w-6" />
                )}
                {isCurrent && <span className="roadmap-node__pulse" aria-hidden="true" />}
              </span>
              {isLocked ? (
                <div className="roadmap-node__card roadmap-node__card--locked" aria-disabled="true">
                  <span className="roadmap-node__kicker">{kicker}</span>
                  <p className="roadmap-node__title">{lesson.title}</p>
                  <p className="roadmap-node__subtitle">{lesson.subtitle}</p>
                  <span className="roadmap-node__action roadmap-node__action--locked">
                    Complete the previous lesson to unlock
                  </span>
                </div>
              ) : (
                <Link to={`/lesson/${lesson.id}`} onClick={() => playSound('click')} className="roadmap-node__card">
                  <span className="roadmap-node__kicker">{kicker}</span>
                  <p className="roadmap-node__title">{lesson.title}</p>
                  <p className="roadmap-node__subtitle">{lesson.subtitle}</p>
                  <span className="roadmap-node__action">
                    {action} <span aria-hidden="true">›</span>
                  </span>
                </Link>
              )}
              {showRestart && (
                <button
                  type="button"
                  onClick={(event) => handleRestart(lesson.id, event)}
                  className="roadmap-node__restart"
                  title="Start this lesson from the beginning"
                >
                  <RestartIcon className="h-3.5 w-3.5" />
                  <span className="sr-only">Restart {lesson.title}</span>
                </button>
              )}
            </div>
          )
        })}
        <div className={`roadmap-finish ${percent === 100 ? 'roadmap-finish--reached' : ''}`}>
          <span className="roadmap-finish__marker">
            <ChestIcon className="h-7 w-7" />
          </span>
          <div className="roadmap-finish__text">
            <p className="roadmap-node__title">{percent === 100 ? 'Treasure unlocked!' : 'Hidden treasure'}</p>
            <p className="roadmap-node__subtitle">
              {percent === 100 ? 'You finished every lesson. Amazing!' : 'Finish all lessons to reach it.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
