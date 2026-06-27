import type { MapConfig } from '../types'
import { describeObjectives } from '../content/objectives'

// Renders the map's auto-derived objectives as small chips under the puzzle
// goal, so a learner can see what to collect/visit/reach before pressing Run.
export function ObjectivesChips({ map }: { map: MapConfig }) {
  const objectives = describeObjectives(map)
  if (objectives.length === 0) return null
  return (
    <ul className="objectives-chips" aria-label="What to do">
      {objectives.map((line) => (
        <li key={line} className="objectives-chip">
          {line}
        </li>
      ))}
    </ul>
  )
}
