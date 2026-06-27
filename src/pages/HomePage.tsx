import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLearner } from '../context/LearnerContext'
import { useAuth } from '../context/AuthContext'
import { course, getLesson, listLessons } from '../content/registry'
import { courseCompletionPercent, nextRecommendedLessonId } from '../storage/progress'
import { BADGES, badgeMeta, listAllBadgeIds } from '../content/badges'
import { aiGenerationOn } from '../ai/config'
import { useAiEnabled } from '../lib/useAiEnabled'
import { warmReviewAhead } from '../ai/reviewPrefetch'
import { dueSkills } from '../adaptivity/mastery'
import {
  FlameIcon,
  CompassIcon,
  PackageIcon,
  LightbulbIcon,
  GemIcon,
  TrashIcon,
  FlagIcon,
  ChestIcon,
} from '../components/icons'
import { RicoBird } from '../components/RicoBird'
import { SoundToggle } from '../components/SoundToggle'
import { playSound } from '../lib/sound'
import { BadgeMedalGrid } from '../components/BadgeMedalGrid'
import { BadgeDetailCard } from '../components/BadgeDetailCard'

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

// The signature element of the home screen: a dotted trail from a start flag to
// the treasure chest, with the explorer's marker riding at `percent`. It turns
// the course-progress number into the literal premise of the app — guiding an
// explorer to treasure — instead of a generic bar or ring.
function QuestTrail({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)))
  const reached = clamped >= 100
  const caption = reached
    ? 'You reached the treasure — the whole map is yours!'
    : clamped === 0
      ? 'Your journey to the treasure starts here.'
      : `You're ${clamped}% of the way to the treasure.`
  return (
    <div className="quest-trail">
      <div
        className="quest-trail__track"
        role="img"
        aria-label={`${clamped}% of the way to the treasure`}
      >
        <span className="quest-trail__flag">
          <FlagIcon className="h-4 w-4" />
        </span>
        <div className="quest-trail__path">
          <div className="quest-trail__fill" style={{ width: `${clamped}%` }} />
          <span className="quest-trail__walker" style={{ left: `${clamped}%` }} aria-hidden="true" />
        </div>
        <span className={`quest-trail__chest${reached ? ' is-reached' : ''}`}>
          <ChestIcon className="h-5 w-5" />
        </span>
      </div>
      <p className="quest-trail__caption">{caption}</p>
    </div>
  )
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

  // Derive the due count from the same source ReviewPage uses — dueSkills — so
  // both the badge and the review session always agree on what is due.
  const now = Date.now()
  const dueSkillIds = state ? dueSkills(state, now) : []
  const dueCount = dueSkillIds.length

  // Warm the first few reviewable puzzles in the background the moment the
  // review card is in view, so opening Daily Review feels instant. warmReview is
  // idempotent per lesson, so re-runs on state changes are cheap no-ops.
  // Map skill ids → lesson ids (same logic as ReviewPage's warmAhead) so
  // warmReviewAhead receives the lesson-id queue it expects.
  useEffect(() => {
    if (!aiGenerationOn() || dueCount === 0) return
    const allLessons = listLessons()
    const lessonIds = dueSkillIds
      .map((skillId) => allLessons.find((l) => l.skillIds.includes(skillId))?.id ?? '')
      .filter(Boolean)
    warmReviewAhead(lessonIds, 0, state)
  // dueSkillIds is a new array reference on every render; use dueCount + state as deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, dueCount])
  const lessons = listLessons()
  const completed = state?.completedLessonIds ?? []
  const completedInCourse = course.lessonOrder.filter((id) => completed.includes(id)).length
  const recommendedId = state ? nextRecommendedLessonId(state, course) : course.lessonOrder[0]
  const recommended = getLesson(recommendedId)
  const percent = state ? courseCompletionPercent(state, course) : 0
  const streak = state?.streak.current ?? 0
  const name = activeLearner?.displayName ?? 'explorer'

  const earnedBadges = state?.badges ?? []
  const nextGoal = BADGES.find((badge) => !earnedBadges.includes(badge.id)) ?? null
  const [selectedBadge, setSelectedBadge] = useState<string | null>(null)

  const allBadgeIds = listAllBadgeIds()
  const badgeItems = allBadgeIds.map((id) => ({
    badgeId: id,
    tier: badgeMeta(id).tier,
    earned: earnedBadges.includes(id),
  }))
  const earnedCount = badgeItems.filter((i) => i.earned).length
  const totalCount = badgeItems.length

  const started = completedInCourse > 0 || percent > 0
  const finished = percent === 100
  const greeting = finished
    ? `You finished the whole course, ${name}! 🎉`
    : started
      ? `Welcome back, ${name}! Ready for the next adventure?`
      : `Hi ${name}! I'm Rico. Let's learn to code together!`
  const cta = finished ? 'Review the course' : started ? 'Continue learning' : 'Start the adventure'
  const mood = finished ? 'celebrate' : 'explain'

  function openCourse() {
    playSound('click')
    navigate('/course')
  }

  const eyebrow = finished ? 'Master explorer' : started ? 'Welcome back' : 'New explorer'

  return (
    <div className="home mx-auto max-w-2xl px-4 py-6">
      <header className="home-topbar mb-1">
        <div className="home-topbar__who">
          <span className={`home-avatar ${avatarClass(name)}`}>{name.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0">
            <p className="home-topbar__eyebrow">Explorer</p>
            <p className="home-topbar__name truncate">{name}</p>
          </div>
        </div>
        <div className="home-topbar__actions">
          {streak > 0 && (
            <span className="home-streak" title={`${streak}-day streak`}>
              <FlameIcon className="h-4 w-4" /> {streak}
            </span>
          )}
          <SoundToggle />
          <Link to="/parent" onClick={() => playSound('click')} className="btn-ghost !px-3 !py-1.5 !text-sm">
            Parents
          </Link>
        </div>
      </header>

      <section className="quest-hero animate-float-in">
        <div className="quest-hero__top">
          <span className="quest-hero__rico">
            <RicoBird mood={mood} className="quest-hero__bird" onClick={() => {}} />
          </span>
          <div className="min-w-0">
            <p className="quest-hero__eyebrow">{eyebrow}</p>
            <p className="quest-hero__greeting">{greeting}</p>
          </div>
        </div>
        <QuestTrail percent={percent} />
      </section>

      <button
        type="button"
        onClick={openCourse}
        className="quest-cta animate-float-in"
        style={{ animationDelay: '0.06s' }}
      >
        <span className="quest-cta__art" aria-hidden="true">
          <CompassIcon className="h-8 w-8" />
        </span>
        <span className="quest-cta__body">
          <span className="quest-cta__eyebrow">{finished ? 'Course complete' : started ? 'Continue your quest' : 'Begin your quest'}</span>
          <span className="quest-cta__title">{course.title}</span>
          <span className="quest-cta__meta">
            {completedInCourse} of {lessons.length} lessons
            {recommended && !finished ? ` · Up next: ${recommended.title}` : ''}
          </span>
          <span className="quest-cta__go">
            {cta} <span aria-hidden="true">→</span>
          </span>
        </span>
      </button>

      {dueCount > 0 && (
        <Link
          to="/review"
          onClick={() => playSound('click')}
          className="side-quest animate-float-in"
          style={{ animationDelay: '0.1s' }}
        >
          <span className="side-quest__icon" aria-hidden="true">
            <LightbulbIcon className="h-5 w-5" />
          </span>
          <span className="side-quest__body">
            <span className="side-quest__eyebrow">Side quest</span>
            <span className="side-quest__title">Daily review</span>
            <span className="side-quest__sub">
              {dueCount} skill{dueCount === 1 ? '' : 's'} ready for a quick refresher
            </span>
          </span>
          <span className="side-quest__chevron" aria-hidden="true">
            ›
          </span>
        </Link>
      )}

      <section className="treasures animate-float-in" style={{ animationDelay: '0.14s' }}>
        <div className="treasures__head">
          <h2 className="treasures__title">Your treasures</h2>
          <span className="treasures__count">{earnedCount} of {totalCount}</span>
        </div>
        <BadgeMedalGrid
          items={badgeItems}
          onSelect={(id) => setSelectedBadge(id)}
          className="trophy-shelf"
        />
        {earnedCount === 0 && (
          <p className="treasures__hint">
            Solve puzzles to earn your first treasure
            {nextGoal ? ` — ${nextGoal.blurb}` : '!'}
          </p>
        )}
      </section>
      {selectedBadge !== null && (
        <BadgeDetailCard
          badgeId={selectedBadge}
          earned={earnedBadges.includes(selectedBadge)}
          acquiredAt={state?.badgeAcquiredAt?.[selectedBadge]}
          earnedCount={earnedCount}
          totalCount={totalCount}
          medal={
            <BadgeMedalGrid
              items={[{ badgeId: selectedBadge, tier: badgeMeta(selectedBadge).tier, earned: earnedBadges.includes(selectedBadge) }]}
              interactive={false}
              showLabels={false}
              onSelect={() => {}}
              className="badge-detail__medal"
            />
          }
          onClose={() => setSelectedBadge(null)}
        />
      )}

      <div className="home-footer">
        <button type="button" onClick={signOut} className="btn-ghost w-full">
          Switch explorer
        </button>
        {enabled && (
          <button
            type="button"
            onClick={() => void signOutParent()}
            className="home-footer__signout"
          >
            Sign out{user?.email ? ` (${user.email})` : ''}
          </button>
        )}
      </div>
    </div>
  )
}

export function HomePage() {
  useAiEnabled() // re-renders on AI Preference change
  const { ready, activeLearner } = useLearner()
  if (!ready) {
    return <div className="flex min-h-full items-center justify-center text-muted">Loading…</div>
  }
  return activeLearner ? <HomeDashboard /> : <ProfileGate />
}
