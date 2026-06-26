// Lightweight, in-memory counters for the explain + generation features. No
// PII, no network. Used to tune later (how often AI serves vs. falls back vs.
// blocks a leak, and how often generation abstains vs. serves a puzzle).
//
// Fail-closed: these counters never throw and never block generation. The
// snapshot helper is safe to call repeatedly — it returns the current counts
// and zeroes them so the app's telemetry sync effect can fold them into
// persisted AiUsage.

export type ExplainEvent = 'requested' | 'served' | 'leakBlocked' | 'fallback' | 'cacheHit'

const counts: Record<ExplainEvent, number> = {
  requested: 0,
  served: 0,
  leakBlocked: 0,
  fallback: 0,
  cacheHit: 0,
}

export function recordExplain(event: ExplainEvent): void {
  counts[event] += 1
}

export type GenEvent = 'requested' | 'served' | 'abstained' | 'fallback'

const genCounts: Record<GenEvent, number> = {
  requested: 0,
  served: 0,
  abstained: 0,
  fallback: 0,
}

export function recordGen(event: GenEvent): void {
  genCounts[event] += 1
}

// Return the current explain + gen counters AND reset them to zero. Called by
// the app's telemetry sync effect to fold counters into persisted AiUsage.
export interface TelemetrySnapshot {
  explainRequested: number
  explainServed: number
  explainFallback: number
  explainLeakBlocked: number
  genRequested: number
  genServed: number
  genAbstained: number
  genFallback: number
}

export function snapshotAndReset(): TelemetrySnapshot {
  const snap: TelemetrySnapshot = {
    explainRequested: counts.requested,
    explainServed: counts.served,
    explainFallback: counts.fallback,
    explainLeakBlocked: counts.leakBlocked,
    genRequested: genCounts.requested,
    genServed: genCounts.served,
    genAbstained: genCounts.abstained,
    genFallback: genCounts.fallback,
  }
  ;(Object.keys(counts) as ExplainEvent[]).forEach((k) => (counts[k] = 0))
  ;(Object.keys(genCounts) as GenEvent[]).forEach((k) => (genCounts[k] = 0))
  return snap
}
