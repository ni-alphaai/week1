// Single source of human-readable skill labels, shared by ParentPage and the
// lesson tier nudge. Falls back to the raw id for unknown skills.
export const SKILL_LABELS: Record<string, string> = {
  sequencing: 'Sequencing',
  'order-dependence': 'Ordering & planning',
  efficiency: 'Efficiency',
  conditionals: 'Conditionals (if / else)',
  loops: 'Loops (for / while)',
  planning: 'Planning & problem-solving',
}

export function skillLabel(id: string): string {
  return SKILL_LABELS[id] ?? id
}
