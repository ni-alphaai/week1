import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLearner } from '../context/LearnerContext'
import { course, listLessons } from '../content/registry'
import {
  courseCompletionPercent,
  masteryScore,
  masteryTier,
  skillStruggles,
  stuckSteps,
} from '../storage/progress'
import { BadgeIcon, FlameIcon, LockIcon } from '../components/icons'
import { ProgressRing } from '../components/ProgressRing'
import { BADGES, badgeMeta, listAllBadgeIds } from '../content/badges'
import { aiAnyOn } from '../ai/config'
import { useAiEnabled } from '../lib/useAiEnabled'
import { AiToggle } from '../components/AiToggle'
import { avatarClass } from './HomePage'
import { BadgeDetailCard } from '../components/BadgeDetailCard'
import { BadgeSortToggle } from '../components/BadgeSortToggle'
import { sortBadgeIds, formatBadgeDate, type BadgeSort } from '../content/badgeSort'
import { skillLabel } from '../content/skillLabels'
import { TIER_CLASS } from '../lib/tierClass'

interface Segment {
  value: number
  color: string
  label: string
}

function Donut({ segments, size = 132, stroke = 16 }: { segments: Segment[]; size?: number; stroke?: number }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  let acc = 0
  const solved = segments[0].value + segments[1].value

  return (
    <div className="donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-surface-strong)" strokeWidth={stroke} />
        {segments.map((seg, i) => {
          const len = (seg.value / total) * circumference
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${circumference - len}`}
              strokeDashoffset={-acc}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )
          acc += len
          return el
        })}
      </svg>
      <div className="donut__center">
        <span className="donut__num">{solved}</span>
        <span className="donut__cap">solved</span>
      </div>
    </div>
  )
}

export function ParentPage() {
  useAiEnabled() // re-renders on AI Preference change
  const { ready, activeLearner, state } = useLearner()
  const [selectedBadge, setSelectedBadge] = useState<string | null>(null)
  const [badgeSort, setBadgeSort] = useState<BadgeSort>('rarity')

  if (!ready) {
    return <div className="flex min-h-full items-center justify-center text-muted">Loading…</div>
  }

  if (!activeLearner || !state) {
    return (
      <div className="mx-auto max-w-md px-6 py-12 text-center">
        <p className="text-muted">Pick an explorer first to see their progress.</p>
        <Link to="/" className="link-accent mt-4 inline-block">
          Go to start
        </Link>
      </div>
    )
  }

  const name = activeLearner.displayName
  const percent = courseCompletionPercent(state, course)
  const lessonsDone = course.lessonOrder.filter((id) => state.completedLessonIds.includes(id)).length
  const totalPuzzles = listLessons().reduce(
    (sum, lesson) => sum + lesson.steps.filter((s) => s.type !== 'concept').length,
    0,
  )
  const stats = Object.values(state.stepStats)
  const solvedClean = stats.filter((s) => s.solved && s.incorrect === 0).length
  const solvedStruggle = stats.filter((s) => s.solved && s.incorrect > 0).length
  const puzzlesSolved = solvedClean + solvedStruggle
  const notYet = Math.max(0, totalPuzzles - puzzlesSolved)
  const skills = Object.entries(state.skillStats)
  const badges = state.badges ?? []
  const acquiredAt = state.badgeAcquiredAt ?? {}
  const sortedBadges = sortBadgeIds(badges, badgeSort, acquiredAt, () => true)
  const lockedBadges = BADGES.filter((b) => !badges.includes(b.id))
  const stuck = stuckSteps(state)
  const struggles = skillStruggles(state)
  const struggleBySkill = new Map(struggles.map((s) => [s.skillId, s]))
  const usage = state.aiUsage
  const aiActivity = aiAnyOn() && usage && Object.values(usage).some((value) => value > 0)

  const ranked = skills
    .map(([id, stat]) => ({ id, score: masteryScore(stat), attempts: stat.attempts }))
    .filter((s) => s.attempts > 0)
    .sort((a, b) => b.score - a.score)
  const topSkill = ranked[0]

  const summary =
    skills.length === 0
      ? `Once ${name} starts a lesson, you'll see their progress here.`
      : percent === 100
        ? `${name} finished the whole course — a real Master Coder! 🎉`
        : topSkill
          ? `${name} is doing great at ${skillLabel(topSkill.id)} and has solved ${puzzlesSolved} puzzle${puzzlesSolved === 1 ? '' : 's'} so far.`
          : `${name} is just getting started — nice momentum!`

  const longest = Math.max(state.streak.longest, state.streak.current)
  const dots = Math.min(Math.max(longest, 7), 14)

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`home-avatar ${avatarClass(name)}`}>
            {name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="page-eyebrow">Progress for</p>
            <h1 className="page-title">{name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AiToggle />
          <Link to="/app" className="btn-ghost !px-3 !py-1.5 !text-sm">
            Back
          </Link>
        </div>
      </header>

      <section className="parent-hero animate-float-in">
        <ProgressRing percent={percent} size={92} stroke={10} className="parent-hero__ring" />
        <div className="parent-hero__body">
          <p className="parent-hero__summary">{summary}</p>
          <div className="parent-hero__pills">
            <span className="stat-pill">{lessonsDone}/{course.lessonOrder.length} lessons</span>
            <span className="stat-pill">{puzzlesSolved} puzzles</span>
            <span className="stat-pill">
              <FlameIcon className="h-3.5 w-3.5" /> {state.streak.current} day
            </span>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="section-title">Badges</h2>
          {badges.length > 1 && <BadgeSortToggle value={badgeSort} onChange={setBadgeSort} />}
        </div>
        {badges.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {sortedBadges.map((id) => {
              const meta = badgeMeta(id)
              const earnedOn = formatBadgeDate(acquiredAt[id])
              return (
                <button
                  key={id}
                  type="button"
                  className="badge-chip badge-chip--lg"
                  title={meta.blurb}
                  onClick={() => setSelectedBadge(id)}
                >
                  <BadgeIcon className="h-5 w-5" />
                  <span className="badge-chip__text">
                    <span className="badge-chip__title">{meta.title}</span>
                    {earnedOn && <span className="badge-chip__date">{earnedOn}</span>}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="card p-4 text-sm text-muted">
            No badges yet — solve puzzles and use loops, whiles, and ifs to start earning them.
          </p>
        )}

        {lockedBadges.length > 0 && (
          <>
            <h3 className="section-label mb-2 mt-4 text-soft">Goals to unlock</h3>
            <div className="flex flex-wrap gap-2">
              {lockedBadges.map((badge) => (
                <button
                  key={badge.id}
                  type="button"
                  className="badge-chip badge-chip--lg opacity-55 grayscale"
                  title={badge.blurb}
                  onClick={() => setSelectedBadge(badge.id)}
                >
                  <LockIcon className="h-4 w-4" /> {badge.title}
                </button>
              ))}
            </div>
          </>
        )}
      </section>
      {selectedBadge !== null && (() => {
        const allBadgeIds = listAllBadgeIds()
        const earnedCount = allBadgeIds.filter((id) => badges.includes(id)).length
        const totalCount = allBadgeIds.length
        return (
          <BadgeDetailCard
            badgeId={selectedBadge}
            earned={badges.includes(selectedBadge)}
            acquiredAt={state.badgeAcquiredAt?.[selectedBadge]}
            earnedCount={earnedCount}
            totalCount={totalCount}
            onClose={() => setSelectedBadge(null)}
          />
        )
      })()}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <h2 className="section-label mb-3">Puzzle outcomes</h2>
          {totalPuzzles === 0 ? (
            <p className="text-sm text-muted">No puzzles yet.</p>
          ) : (
            <div className="flex items-center gap-4">
              <Donut
                segments={[
                  { value: solvedClean, color: 'var(--color-success)', label: 'First try' },
                  { value: solvedStruggle, color: 'var(--color-warning, #e6a817)', label: 'Took a few tries' },
                  { value: notYet, color: 'var(--color-surface-strong)', label: 'Not yet' },
                ]}
              />
              <ul className="space-y-1.5 text-sm">
                <li className="legend">
                  <span className="legend__dot" style={{ background: 'var(--color-success)' }} /> First try · {solvedClean}
                </li>
                <li className="legend">
                  <span className="legend__dot" style={{ background: 'var(--color-warning, #e6a817)' }} /> A few tries · {solvedStruggle}
                </li>
                <li className="legend">
                  <span className="legend__dot legend__dot--muted" /> Not yet · {notYet}
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="section-label mb-3">Practice streak</h2>
          <div className="streak-strip">
            {Array.from({ length: dots }).map((_, i) => (
              <span key={i} className={`streak-dot ${i < state.streak.current ? 'streak-dot--on' : ''}`} />
            ))}
          </div>
          <p className="mt-3 text-sm text-muted">
            <span className="font-bold text-[var(--color-text)]">{state.streak.current}</span> day
            {state.streak.current === 1 ? '' : 's'} in a row · best {longest}
          </p>
          <p className="mt-1 text-xs text-soft">Practising a little each day builds the habit.</p>
        </div>
      </div>

      {aiActivity && (
        <section className="mt-6">
          <h2 className="section-title mb-2">How Rico helped</h2>
          <div className="card p-5">
            <p className="text-sm text-[var(--color-text)]">
              {usage.explainServed > 0
                ? `When a puzzle got tricky, Rico sat with ${name} and talked it through ${usage.explainServed} time${usage.explainServed === 1 ? '' : 's'}`
                : `Rico has been right there cheering ${name} on`}
              {usage.genServed > 0
                ? `, and dreamed up ${usage.genServed} brand-new puzzle${usage.genServed === 1 ? '' : 's'} to keep the adventure going.`
                : '.'}
            </p>
          </div>
        </section>
      )}

      {stuck.length > 0 && (
        <section className="mt-6">
          <h2 className="section-title mb-2">Where {name} is stuck</h2>
          <div className="space-y-2">
            {stuck.map((s) => (
              <div key={s.stepId} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-[var(--color-text)]">{s.lessonTitle}</span>
                  <span className="text-xs text-muted">
                    {s.incorrect} tries · {Math.round(s.timeSpentMs / 60000)} min
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-soft">
                  This one&apos;s taken a few goes — a quick sit-together or a hint could help it click.
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="section-title mb-2">Skills &amp; mastery</h2>
        {skills.length === 0 ? (
          <p className="card p-4 text-sm text-muted">
            No practice yet. Progress shows up once {name} starts a lesson.
          </p>
        ) : (
          <div className="card mastery-list">
            {skills.map(([skillId, stat]) => {
              const score = masteryScore(stat)
              const tier = masteryTier(stat)
              return (
                <div key={skillId} className="mastery-row">
                  <div className="mastery-row__head">
                    <span className="mastery-row__skill">
                      {skillLabel(skillId)}
                      {(struggleBySkill.get(skillId)?.struggles ?? 0) > 0 && (
                        <span className="mastery-row__flag">needs review</span>
                      )}
                    </span>
                    <span className={`tier-badge ${TIER_CLASS[tier]}`}>{tier}</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${score}%` }} />
                  </div>
                  <p className="mastery-row__meta">
                    {score}% · {stat.attempts} attempts
                    {stat.struggles > 0 ? ` · extra tries ${stat.struggles}×` : ''}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </section>

    </div>
  )
}
