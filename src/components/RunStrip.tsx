import { useEffect, useRef } from 'react'
import type { Action, Command, Step } from '../types'
import { isAction } from '../types'
import {
  ArrowIcon,
  CompassIcon,
  DashIcon,
  DropIcon,
  HoldIcon,
  PickupIcon,
  ShieldIcon,
  SparkleIcon,
} from './icons'

const MOVE_LABEL: Record<Command, string> = { up: 'Up', down: 'Down', left: 'Left', right: 'Right' }
const ACTION_LABEL: Record<Action, string> = {
  pickup: 'Pick up',
  drop: 'Drop',
  toMiddle: 'Middle',
  discardLower: 'Lower',
  discardUpper: 'Upper',
  dash: 'Dash',
  shield: 'Shield',
  super: 'Super',
  hold: 'Hold',
}

function StepIcon({ step, className }: { step: Step; className?: string }) {
  if (!isAction(step)) return <ArrowIcon command={step} className={className} />
  switch (step) {
    case 'pickup':
      return <PickupIcon className={className} />
    case 'drop':
      return <DropIcon className={className} />
    case 'toMiddle':
      return <CompassIcon className={className} />
    case 'discardLower':
      return <ArrowIcon command="right" className={className} />
    case 'discardUpper':
      return <ArrowIcon command="left" className={className} />
    case 'dash':
      return <DashIcon className={className} />
    case 'shield':
      return <ShieldIcon className={className} />
    case 'super':
      return <SparkleIcon className={className} />
    case 'hold':
      return <HoldIcon className={className} />
  }
}

function stepLabel(step: Step): string {
  return isAction(step) ? ACTION_LABEL[step] : MOVE_LABEL[step]
}

// A collapsed, horizontally scrollable read-out of the program actually running.
// `activeIndex` (the current Render Frame's activeStepIndex) marks the step
// matching the explorer's current tile so the chip tracks the maze animation;
// completed chips dim, the active chip pops and auto-scrolls into view.
export function RunStrip({ chips, activeIndex }: { chips: Step[]; activeIndex: number }) {
  const activeRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [activeIndex])

  if (chips.length === 0) {
    return <div className="run-strip run-strip--empty">No cards to run yet</div>
  }

  return (
    <div className="run-strip" role="list" aria-label="Program steps running">
      {chips.map((step, index) => {
        const state = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending'
        const tone = isAction(step) ? 'run-chip--action' : 'run-chip--move'
        return (
          <span
            key={index}
            ref={index === activeIndex ? activeRef : undefined}
            role="listitem"
            className={`run-chip run-chip--${state} ${tone}`}
          >
            <StepIcon step={step} className="h-3.5 w-3.5" />
            <span className="run-chip__label">{stepLabel(step)}</span>
          </span>
        )
      })}
    </div>
  )
}
