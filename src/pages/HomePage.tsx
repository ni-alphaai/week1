import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLearner } from '../context/LearnerContext'
import { useAuth } from '../context/AuthContext'
import { course, getLesson, listLessons } from '../content/registry'
import { courseCompletionPercent, nextRecommendedLessonId } from '../storage/progress'
import { FlameIcon, CompassIcon, PackageIcon, LightbulbIcon, GemIcon, BadgeIcon, TrashIcon } from '../components/icons'
import { RicoBird } from '../components/RicoBird'
import { ProgressRing } from '../components/ProgressRing'
import { SoundToggle } from '../components/SoundToggle'
import { playSound } from '../lib/sound'

const AVATAR_COLORS = [
  'bg-[#6bcb3d]',
  'bg-[#3b9ec9]',
  'bg-[#3d9e5f]',
  'bg-[#e6a817]',
  'bg-[#8b6fd4]',
]

export function avatarClass(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length
  return AVATAR_COLORS[hash]
}

const LESSON_ICONS = [PackageIcon, LightbulbIcon, CompassIcon, GemIcon]

export function lessonIcon(index: number) {
  return LESSON_ICONS[index % LESSON_ICONS.length]
}

function BrandMark() {
  return (
    <div className="brand-mark">
      <CompassIcon className="h-8 w-8" />
    </div>
  )
}

function ProfileGate() {
  const { learners, createLearner, deleteLearner, selectLearner } = useLearner()
  const [name, setName] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-12">
      <div className="animate-float-in mb-8 text-center">
        <BrandMark />
        <h1 className="font-display text-3xl font-bold tracking-tight text-[var(--color-text)]">Brillant</h1>
        <p className="mt-2 text-base text-muted">Learn coding by guiding an explorer to treasure.</p>
      </div>

      {learners.length > 0 && (
        <div className="animate-float-in mb-4 space-y-2">
          <h2 className="section-label px-1">Who&apos;s learning?</h2>
          {learners.map((profile) => (
            <div key={profile.id} className="profile-row">
              <button
                type="button"
                onClick={() => {
                  playSound('click')
                  selectLearner(profile.id)
                }}
                className="card card-interactive profile-row__main flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm ${avatarClass(profile.displayName)}`}
                >
                  {profile.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="font-semibold text-[var(--color-text)]">{profile.displayName}</span>
                <span className="ml-auto text-lg text-soft">›</span>
              </button>
              {pendingDelete === profile.id ? (
                <div className="profile-row__confirm">
                  <button
                    type="button"
                    onClick={() => {
                      playSound('click')
                      deleteLearner(profile.id)
                      setPendingDelete(null)
                    }}
                    className="profile-row__danger"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(null)}
                    className="profile-row__cancel"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPendingDelete(profile.id)}
                  className="profile-row__delete"
                  title={`Delete ${profile.displayName}`}
                >
                  <TrashIcon className="h-4 w-4" />
                  <span className="sr-only">Delete {profile.displayName}</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) {
            playSound('success')
            createLearner(name)
          }
        }}
        className="card animate-float-in p-5"
      >
        <label htmlFor="learner-name" className="text-sm font-medium text-muted">
          {learners.length > 0 ? 'Add a new explorer' : 'Create your explorer'}
        </label>
        <input
          id="learner-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="First name"
          autoComplete="off"
          className="input mt-2"
        />
        <button type="submit" disabled={!name.trim()} className="btn-primary mt-4 w-full">
          Start learning
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-soft">A grown-up can check progress anytime.</p>
    </div>
  )
}

function HomeDashboard() {
  const { activeLearner, state, signOut } = useLearner()
  const { enabled, user, signOutParent } = useAuth()
  const navigate = useNavigate()
  const lessons = listLessons()
  const completed = state?.completedLessonIds ?? []
  const completedInCourse = course.lessonOrder.filter((id) => completed.includes(id)).length
  const recommendedId = state ? nextRecommendedLessonId(state, course) : course.lessonOrder[0]
  const recommended = getLesson(recommendedId)
  const percent = state ? courseCompletionPercent(state, course) : 0
  const streak = state?.streak.current ?? 0
  const name = activeLearner?.displayName ?? 'explorer'

  const started = completedInCourse > 0 || percent > 0
  const finished = percent === 100
  const greeting = finished
    ? `You finished the whole course, ${name}! 🎉`
    : started
      ? `Welcome back, ${name}! Ready for the next adventure?`
      : `Hi ${name}! I'm Rico. Let's learn to code together!`
  const cta = finished ? 'Review the course' : started ? 'Continue learning' : 'Start the adventure'
  const mood = finished ? 'celebrate' : 'explain'
  const hasMasterBadge = state?.badges?.includes('master-coder') ?? false

  function openCourse() {
    playSound('click')
    navigate('/course')
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="topbar mb-5">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm ${avatarClass(name)}`}
          >
            {name.slice(0, 1).toUpperCase()}
          </span>
          <p className="font-display text-base font-bold tracking-tight text-[var(--color-text)]">{name}</p>
        </div>
        <div className="flex items-center gap-2">
          {streak > 0 && (
            <span className="streak-badge">
              <FlameIcon className="h-3.5 w-3.5" /> {streak}
            </span>
          )}
          <SoundToggle />
          <Link to="/parent" onClick={() => playSound('click')} className="btn-ghost !px-3 !py-1.5 !text-sm">
            Parents
          </Link>
        </div>
      </header>

      <section className="home-banner animate-float-in mb-6">
        <RicoBird mood={mood} className="home-banner__bird" onClick={() => {}} />
        <div className="home-banner__text">
          <p className="home-banner__greeting">{greeting}</p>
          {hasMasterBadge && (
            <span className="badge-chip mt-2">
              <BadgeIcon className="h-4 w-4" /> Master Coder
            </span>
          )}
        </div>
        <ProgressRing percent={percent} className="home-banner__ring" size={72} stroke={8} />
      </section>

      <button type="button" onClick={openCourse} className="course-card animate-float-in" style={{ animationDelay: '0.06s' }}>
        <div className="course-card__art" aria-hidden="true">
          <CompassIcon className="h-9 w-9" />
        </div>
        <div className="course-card__body">
          <span className="course-card__kicker">Course</span>
          <h2 className="course-card__title">{course.title}</h2>
          <p className="course-card__desc">{course.description}</p>

          <div className="course-card__progress">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <span className="course-card__percent">{percent}%</span>
          </div>
          <p className="course-card__meta">
            {completedInCourse} of {lessons.length} lessons complete
            {recommended && !finished ? ` · Up next: ${recommended.title}` : ''}
          </p>

          <span className="course-card__cta">
            {cta} <span aria-hidden="true">›</span>
          </span>
        </div>
      </button>

      <div className="mt-8 space-y-2">
        <button type="button" onClick={signOut} className="btn-ghost w-full">
          Switch explorer
        </button>
        {enabled && (
          <button
            type="button"
            onClick={() => void signOutParent()}
            className="w-full cursor-pointer py-2 text-sm text-soft hover:text-muted"
          >
            Sign out{user?.email ? ` (${user.email})` : ''}
          </button>
        )}
      </div>
    </div>
  )
}

export function HomePage() {
  const { ready, activeLearner } = useLearner()
  if (!ready) {
    return <div className="flex min-h-full items-center justify-center text-muted">Loading…</div>
  }
  return activeLearner ? <HomeDashboard /> : <ProfileGate />
}
