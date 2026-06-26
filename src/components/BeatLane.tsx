import type { ReactNode } from 'react'
import type { BeatAction, BeatStep } from '../types'
import { RicoBird } from './RicoBird'
import { DashIcon, ShieldIcon, SparkleIcon, HoldIcon } from './icons'

const ACTION_ICON: Record<BeatAction, (cls: string) => ReactNode> = {
  dash: (cls) => <DashIcon className={cls} />,
  shield: (cls) => <ShieldIcon className={cls} />,
  super: (cls) => <SparkleIcon className={cls} />,
  hold: (cls) => <HoldIcon className={cls} />,
}

const ACTION_COLOR: Record<BeatAction, string> = {
  dash: '#c9a227',
  shield: '#3d9e5f',
  super: '#7a5cff',
  hold: '#5b6472',
}

// What each beat throws at Rico - phrased as the hazard the action counters.
const THREAT_LABEL: Record<BeatAction, string> = {
  dash: 'Gap',
  shield: 'Blast',
  super: 'Both!',
  hold: 'Calm',
}

function actionLabel(step: BeatStep, action: BeatAction): string {
  return step.actionMeta?.[action]?.label ?? action[0].toUpperCase() + action.slice(1)
}

function Legend({ step }: { step: BeatStep }) {
  return (
    <div className="beat-legend" aria-hidden="true">
      {step.availableActions.map((action) => (
        <span key={action} className="beat-legend__chip" style={{ color: ACTION_COLOR[action] }}>
          {ACTION_ICON[action]('h-3.5 w-3.5')}
          {actionLabel(step, action)}
          {action !== 'hold' && <span className="beat-legend__threat"> vs {THREAT_LABEL[action]}</span>}
        </span>
      ))}
    </div>
  )
}

interface BeatLaneProps {
  step: BeatStep
  /** The hazard incoming on each beat (= required action; 'hold' shows no hazard). */
  threats: (BeatAction | undefined)[]
  /** Emitted action per beat, revealed as the run plays. */
  playedActions: (BeatAction | undefined)[]
  /** The beat currently pulsing during a run, or null. */
  activeBeat: number | null
  /** The beat the idle demo loop is currently highlighting, or null. */
  demoBeat: number | null
  /** The first wrong beat to mark with a hit, or null. */
  firstWrongBeat: number | null
  mood: 'explain' | 'celebrate' | 'oops'
}

export function BeatLane({
  step,
  threats,
  playedActions,
  activeBeat,
  demoBeat,
  firstWrongBeat,
  mood,
}: BeatLaneProps) {
  const beats = Array.from({ length: step.count }, (_, i) => i)
  const ricoMood = mood === 'celebrate' ? 'celebrate' : mood === 'oops' ? 'oops' : 'explain'
  return (
    <div className="beat-lane" aria-live="polite">
      <div className="beat-lane__rico">
        <RicoBird mood={ricoMood} className="h-12 w-12" onClick={() => {}} />
      </div>
      <div className="beat-lane__body">
        <ol className="beat-lane__track" role="list">
          {beats.map((beat) => {
            const threat = threats[beat]
            const played = playedActions[beat]
            const isActive = beat === activeBeat || beat === demoBeat
            const isHit = beat === firstWrongBeat
            const countered = played != null && threat != null && played === threat
            const hasThreat = threat != null && threat !== 'hold'
            const threatColor = hasThreat ? ACTION_COLOR[threat] : undefined
            const borderColor = played ? ACTION_COLOR[played] : threatColor
            return (
              <li
                key={beat}
                className={`beat-cell${isActive ? ' beat-cell--active' : ''}${isHit ? ' beat-cell--hit' : ''}`}
                style={borderColor ? { borderColor } : undefined}
              >
                <span className="beat-cell__incoming" style={{ color: threatColor ?? 'transparent' }} aria-hidden="true">
                  {hasThreat ? '▼' : '·'}
                </span>
                <span className="beat-cell__num">{beat}</span>
                {isHit ? (
                  <span className="beat-cell__action" style={{ color: '#e2574c' }}>
                    hit!
                  </span>
                ) : played ? (
                  <span className="beat-cell__action" style={{ color: ACTION_COLOR[played] }}>
                    {ACTION_ICON[played]('h-3.5 w-3.5')}
                    {countered && <span className="beat-cell__check">✓</span>}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ol>
        <Legend step={step} />
      </div>
    </div>
  )
}
