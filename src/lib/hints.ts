/** Pick the hint for this failure — escalates with prior misses, never cycles past the last hint. */
export function pickHint(hints: string[], priorFailCount: number): string {
  if (hints.length === 0) {
    return 'Study the map and your cards again — a different order might work.'
  }
  return hints[Math.min(priorFailCount, hints.length - 1)]
}
