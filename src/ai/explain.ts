// Orchestrator for the on-demand "Explain my mistake" feature.
//
// Flow: flag check -> cache -> deterministic diagnostic -> grounded prompt (the
// child's ACTUAL program + run outcome) -> Gemini -> anti-leak guard (one
// regenerate) -> cache + return. On any miss/error/leak it falls back to a
// distinct diagnostic-based message (and only to an authored hint when the
// failure can't be classified), so the explanation never just echoes the hint.

import type { Instruction, MapConfig, Step, SuccessRule } from '../types'
import type { RunResult } from '../engine/map'
import { runInstructions } from '../engine/map'
import { pickHint } from '../lib/hints'
import { aiExplainEnabled } from './config'
import { buildDiagnostic } from './diagnostic'
import type { Diagnostic } from './diagnostic'
import { buildExplainPrompt } from './grounding'
import { revealsAnswer } from './leakGuard'
import { generateText } from './aiClient'
import { recordExplain } from './telemetry'

export interface ExplainRequest {
  stepId: string
  goal: string
  map: MapConfig
  successRule: SuccessRule
  optimal?: number
  instructions: Instruction[]
  run: RunResult
  solution: Instruction[]
  authoredHints: string[]
  priorFailCount: number
}

export interface ExplainResult {
  text: string
  source: 'ai' | 'diagnostic' | 'authored'
}

const cache = new Map<string, string>()

function signature(req: ExplainRequest): string {
  return `${req.stepId}|${req.run.status}|${JSON.stringify(req.instructions)}`
}

// Distinct from the authored hint: a friendly wrapper around the factual,
// spoiler-free diagnostic. Authored hint is the last resort (unknown failures).
function fallback(req: ExplainRequest, diagnostic: Diagnostic, reason: string): ExplainResult {
  if (import.meta.env.DEV) {
    console.warn(`[explain] falling back (${reason}); kind=${diagnostic.kind}`)
  }
  if (diagnostic.kind === 'unknown') {
    return { text: pickHint(req.authoredHints, req.priorFailCount), source: 'authored' }
  }
  return { text: `${diagnostic.summary} Take another look at your cards and try again.`, source: 'diagnostic' }
}

export async function getExplanation(req: ExplainRequest): Promise<ExplainResult> {
  if (!aiExplainEnabled) {
    return { text: pickHint(req.authoredHints, req.priorFailCount), source: 'authored' }
  }

  const diagnostic = buildDiagnostic({
    map: req.map,
    successRule: req.successRule,
    optimal: req.optimal,
    instructions: req.instructions,
    run: req.run,
  })

  const sig = signature(req)
  const cached = cache.get(sig)
  if (cached) {
    recordExplain('cacheHit')
    return { text: cached, source: 'ai' }
  }

  // The verified solution flattened to the moves it actually runs - used both as
  // a secret prompt reference and as the leak-guard target.
  const solutionMoves: Step[] = runInstructions(req.map, req.solution).executed

  const { system, prompt } = buildExplainPrompt({
    goal: req.goal,
    map: req.map,
    program: req.instructions,
    executedMoves: req.run.executed,
    diagnostic,
    solutionMoves,
  })

  recordExplain('requested')
  let text = await generateText({ system, prompt })

  if (text && revealsAnswer(text, solutionMoves)) {
    recordExplain('leakBlocked')
    text = await generateText({
      system: `${system}\nYour previous answer revealed too much. Do NOT spell out the path or use counts.`,
      prompt,
    })
    if (text && revealsAnswer(text, solutionMoves)) {
      recordExplain('leakBlocked')
      recordExplain('fallback')
      return fallback(req, diagnostic, 'leak')
    }
  }

  if (!text) {
    recordExplain('fallback')
    return fallback(req, diagnostic, 'empty')
  }

  recordExplain('served')
  cache.set(sig, text)
  return { text, source: 'ai' }
}

/** Test helper: clear the in-memory explanation cache. */
export function clearExplanationCache(): void {
  cache.clear()
}
