import { describe, it, expect } from 'vitest'
import { isConditionalStep, isSequenceStep } from '../types'
import { lesson1 } from './lessons/lesson1'
import { lesson2 } from './lessons/lesson2'
import { lesson3 } from './lessons/lesson3'
import { lesson4 } from './lessons/lesson4'
import { lesson5 } from './lessons/lesson5'
import { lesson6 } from './lessons/lesson6'
import { lesson7 } from './lessons/lesson7'
import { checkProgram } from '../engine/checker'
import type { ProgramSpec } from '../engine/checker'
import type { CardLimits, Instruction, LessonStep } from '../types'

// Counts every placed card in a solution tree, keyed the same way cardLimits is
// (by command, action, or block kind). Mirrors countUsage in CommandSequence.
function countCards(instructions: Instruction[], tally: Record<string, number> = {}): Record<string, number> {
  for (const instruction of instructions) {
    if (typeof instruction === 'string') {
      tally[instruction] = (tally[instruction] ?? 0) + 1
      continue
    }
    if (instruction.kind === 'loop') {
      tally.loop = (tally.loop ?? 0) + 1
      countCards(instruction.body, tally)
    } else if (instruction.kind === 'while') {
      tally.while = (tally.while ?? 0) + 1
      countCards(instruction.body, tally)
    } else {
      tally.if = (tally.if ?? 0) + 1
      countCards(instruction.then, tally)
      countCards(instruction.else, tally)
    }
  }
  return tally
}

// Each scored step ships a hand-written, verified solution (replayed by the
// "ghost" hint). Running it through the real interpreter proves every puzzle is
// completable and keeps the ghost demonstration honest.
function specForStep(step: LessonStep): ProgramSpec {
  if (isSequenceStep(step)) {
    return { map: step.map, successRule: step.successRule, optimal: step.optimal, feedback: step.feedback }
  }
  if (isConditionalStep(step)) {
    return { map: step.map, successRule: 'reachGoal', feedback: step.feedback }
  }
  throw new Error(`Concept step ${step.id} has no spec`)
}

describe('lesson puzzle solvability', () => {
  const lessons = [lesson1, lesson2, lesson3, lesson4, lesson5, lesson6, lesson7]

  for (const lesson of lessons) {
    describe(lesson.id, () => {
      for (const step of lesson.steps) {
        if (step.type === 'concept') continue
        it(`${step.id} has a verified solution`, () => {
          const result = checkProgram(specForStep(step), step.solution)
          expect(result.correct, `${step.id}: ${result.message} (${result.run.status})`).toBe(true)
        })
      }
    })
  }
})

// A step that limits cards must ship a solution buildable from that inventory —
// otherwise the puzzle is impossible with the cards the learner is given.
describe('lesson card limits are satisfiable', () => {
  const lessons = [lesson1, lesson2, lesson3, lesson4, lesson5, lesson6, lesson7]

  for (const lesson of lessons) {
    for (const step of lesson.steps) {
      if (step.type === 'concept') continue
      const limits = step.cardLimits as CardLimits | undefined
      if (!limits) continue
      it(`${step.id} solution fits its card limits`, () => {
        const tally = countCards(step.solution)
        for (const [card, limit] of Object.entries(limits)) {
          expect(
            tally[card] ?? 0,
            `${step.id}: solution uses ${tally[card] ?? 0} "${card}" cards but only ${limit} allowed`,
          ).toBeLessThanOrEqual(limit as number)
        }
      })
    }
  }
})
