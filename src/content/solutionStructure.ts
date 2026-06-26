import type { Instruction, Predicate } from '../types'

function predicateKey(predicate: Predicate): string {
  switch (predicate.sensor) {
    case 'blocked':
    case 'clear':
      return `${predicate.sensor}:${predicate.dir}`
    case 'counterMod':
      return `counterMod:${predicate.divisor}:${predicate.remainder}`
    default:
      return predicate.sensor
  }
}

function describeSteps(steps: Instruction[]): string {
  let moves = 0
  let blocks = 0
  for (const step of steps) {
    if (typeof step === 'string') moves++
    else blocks++
  }
  return `m${moves}b${blocks}`
}

function describeInstruction(instruction: Instruction): string {
  if (typeof instruction === 'string') return instruction
  if (instruction.kind === 'loop') {
    return `loop>${describeBody(instruction.body)}`
  }
  if (instruction.kind === 'while') {
    return `while(${predicateKey(instruction.predicate)})>${describeBody(instruction.body)}`
  }
  return `if(${predicateKey(instruction.predicate)},then:${describeSteps(instruction.then)},else:${describeSteps(instruction.else)})`
}

function describeBody(body: Instruction[]): string {
  return body.map(describeInstruction).join('|')
}

/** Normalized program shape for comparing authored solutions within a lesson. */
export function solutionStructure(instructions: Instruction[]): string {
  return instructions.map(describeInstruction).join(';')
}

/** True when two solutions share the same block layout, sensors, and branch shapes. */
export function solutionsTooSimilar(a: Instruction[], b: Instruction[]): boolean {
  return solutionStructure(a) === solutionStructure(b)
}
