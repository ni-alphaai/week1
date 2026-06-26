// Lightweight, in-memory counters for the explain feature. No PII, no network.
// Used to tune later (how often AI serves vs. falls back vs. blocks a leak).

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
