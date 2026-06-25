import { Link } from 'react-router-dom'
import { useLearner } from '../context/LearnerContext'
import { course, listLessons } from '../content/registry'
import { courseCompletionPercent, masteryScore, masteryTier, type MasteryTier } from '../storage/progress'
import { ArrowIcon, DropIcon, PickupIcon, BadgeIcon, FlameIcon } from '../components/icons'
import { ProgressRing } from '../components/ProgressRing'
import { isAction } from '../types'

const SKILL_LABELS: Record<string, string> = {
  sequencing: 'Sequencing',
  'order-dependence': 'Ordering & planning',
  efficiency: 'Efficiency',
  conditionals: 'Conditionals (if / else)',
  loops: 'Loops (for / while)',
  planning: 'Planning & problem-solving',
}

const BADGE_LABELS: Record<string, string> = {
  'combo-coder': 'Combo Coder',
  'master-coder': 'Master Coder',
  'counter-coder': 'Counter Coder',
  'algorithm-ace': 'Algorithm Ace',
}

const TIER_CLASS: Record<MasteryTier, string> = {
  Novice: 'tier--novice',
  Apprentice: 'tier--apprentice',
  Skilled: 'tier--skilled',
  Master: 'tier--master',
}

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
  const { ready, activeLearner, state } = useLearner()

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
          ? `${name} is doing great at ${SKILL_LABELS[topSkill.id] ?? topSkill.id} and has solved ${puzzlesSolved} puzzle${puzzlesSolved === 1 ? '' : 's'} so far.`
          : `${name} is just getting started — nice momentum!`

  const longest = Math.max(state.streak.longest, state.streak.current)
  const dots = Math.min(Math.max(longest, 7), 14)

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#3b9ec9] text-base font-bold text-white shadow-sm">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="text-xs text-muted">Progress for</p>
            <h1 className="font-display text-xl font-bold text-[var(--color-text)]">{name}</h1>
          </div>
        </div>
        <Link to="/app" className="btn-ghost !px-3 !py-1.5 !text-sm">
          Back
        </Link>
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

      {badges.length > 0 && (
        <section className="mt-6">
          <h2 className="section-label mb-2">Badges</h2>
          <div className="flex flex-wrap gap-2">
            {badges.map((id) => (
              <span key={id} className="badge-chip badge-chip--lg">
                <BadgeIcon className="h-5 w-5" /> {BADGE_LABELS[id] ?? id}
              </span>
            ))}
          </div>
        </section>
      )}

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

      <section className="mt-6">
        <h2 className="section-label mb-2">Skills &amp; mastery</h2>
        {skills.length === 0 ? (
          <p className="card p-4 text-sm text-muted">
            No practice yet. Progress shows up once {name} starts a lesson.
          </p>
        ) : (
          <div className="space-y-2">
            {skills.map(([skillId, stat]) => {
              const score = masteryScore(stat)
              const tier = masteryTier(stat)
              return (
                <div key={skillId} className="card p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-medium text-[var(--color-text)]">{SKILL_LABELS[skillId] ?? skillId}</span>
                    <span className={`tier-badge ${TIER_CLASS[tier]}`}>{tier}</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${score}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    {score}% · {stat.attempts} attempts
                    {stat.struggles > 0 ? ` · extra tries ${stat.struggles}×` : ''}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="section-label mb-2">Recent creations</h2>
        {state.portfolio.length === 0 ? (
          <p className="card p-4 text-sm text-muted">Solved puzzles will appear here as little programs.</p>
        ) : (
          <div className="space-y-2">
            {state.portfolio.slice(0, 8).map((artifact) => (
              <div key={artifact.id} className="card flex flex-wrap items-center gap-2 p-3">
                <span className="mr-1 text-sm font-medium text-[var(--color-text)]">{artifact.lessonTitle}</span>
                {artifact.commands.map((step, index) =>
                  isAction(step) ? (
                    step === 'pickup' ? (
                      <PickupIcon key={index} className="h-4 w-4 text-[var(--color-task)]" />
                    ) : (
                      <DropIcon key={index} className="h-4 w-4 text-[var(--color-task)]" />
                    )
                  ) : (
                    <ArrowIcon key={index} command={step} className="h-4 w-4 text-accent" />
                  ),
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
