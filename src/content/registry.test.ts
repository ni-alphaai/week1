import { describe, it, expect } from 'vitest'
import type { Command, LessonStep, MapConfig, Position } from '../types'
import { isSequenceStep } from '../types'
import { course, getLesson, getNextLessonId, listLessons } from './registry'
import { runProgram, samePos } from '../engine/map'

// Shortest-path BFS for PLAIN move puzzles (no actions/blocks/tasks). Palette
// cards are reusable stamps now, so each allowed direction can be used freely.
// Proves the authored shortest-path content is actually completable — pure search.
function solveMinMoves(map: MapConfig, moves: Command[]): number | null {
  const allowed = [...new Set(moves)]

  function legalEnd(from: Position, command: Command): Position | null {
    const run = runProgram({ ...map, start: from }, [command])
    return run.status === 'offMap' || run.status === 'hitRock' ? null : run.end
  }

  const visited = new Set<string>([`${map.start.row},${map.start.col}`])
  let frontier: Position[] = [map.start]
  let dist = 0
  while (frontier.length > 0) {
    if (frontier.some((pos) => samePos(pos, map.goal))) return dist
    const next: Position[] = []
    for (const pos of frontier) {
      for (const command of allowed) {
        const end = legalEnd(pos, command)
        if (!end) continue
        const k = `${end.row},${end.col}`
        if (visited.has(k)) continue
        visited.add(k)
        next.push(end)
      }
    }
    frontier = next
    dist += 1
  }
  return null
}

function isPlainMoveStep(step: LessonStep): boolean {
  return (
    isSequenceStep(step) &&
    !step.blocks?.length &&
    !step.availableActions?.length &&
    !step.map.tasks?.length &&
    !step.map.teleports?.length &&
    !step.map.gates?.length &&
    !step.map.ice?.length &&
    !step.map.doors?.length
  )
}

describe('course registry', () => {
  it('exposes seven lessons in the declared order', () => {
    expect(course.lessonOrder).toHaveLength(7)
    expect(listLessons().map((l) => l.id)).toEqual(course.lessonOrder)
  })

  it('resolves every lesson id in the course order', () => {
    for (const id of course.lessonOrder) {
      expect(getLesson(id)).toBeDefined()
    }
  })

  it('returns undefined for an unknown lesson', () => {
    expect(getLesson('nope')).toBeUndefined()
  })

  it('links lessons into a chain and ends with null', () => {
    expect(getNextLessonId(course.lessonOrder[0])).toBe(course.lessonOrder[1])
    expect(getNextLessonId(course.lessonOrder[5])).toBe(course.lessonOrder[6])
    expect(getNextLessonId(course.lessonOrder[6])).toBeNull()
    expect(getNextLessonId('nope')).toBeNull()
  })
})

describe('lesson structure', () => {
  const lessons = listLessons()

  it('gives every lesson a unique id, a version, and a leading concept step', () => {
    const ids = new Set<string>()
    for (const lesson of lessons) {
      expect(ids.has(lesson.id)).toBe(false)
      ids.add(lesson.id)
      expect(lesson.version).toBeGreaterThanOrEqual(1)
      expect(lesson.skillIds.length).toBeGreaterThan(0)
      expect(lesson.steps[0].type).toBe('concept')
    }
  })

  it('gives every step within a lesson a unique id', () => {
    for (const lesson of lessons) {
      const stepIds = lesson.steps.map((s) => s.id)
      expect(new Set(stepIds).size).toBe(stepIds.length)
    }
  })

  it('has 5–6 scored questions per lesson', () => {
    for (const lesson of lessons) {
      const scored = lesson.steps.filter((s: LessonStep) => s.type !== 'concept')
      expect(scored.length).toBeGreaterThanOrEqual(5)
      expect(scored.length).toBeLessThanOrEqual(6)
    }
  })

  it('gives every scored step progressive hints', () => {
    for (const lesson of lessons) {
      for (const step of lesson.steps) {
        if (step.type === 'concept') continue
        expect(step.feedback.hints.length).toBeGreaterThanOrEqual(1)
      }
    }
  })
})

describe('plain move puzzles are solvable at their declared optimum', () => {
  for (const lesson of listLessons()) {
    for (const step of lesson.steps) {
      if (!isPlainMoveStep(step) || !isSequenceStep(step)) continue
      it(`${lesson.id} / ${step.id} is solvable`, () => {
        const min = solveMinMoves(step.map, step.availableCommands)
        expect(min).not.toBeNull()
        if (step.successRule === 'shortestPath' && step.optimal !== undefined) {
          expect(min).toBe(step.optimal)
        }
      })
    }
  }
})
