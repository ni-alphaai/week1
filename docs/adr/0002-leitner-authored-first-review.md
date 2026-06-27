# Schedule Review Sessions with Leitner boxes over authored-first items

Daily review was an AI feature: every Retrieval Item was freshly generated, so the
whole flow vanished when AI generation was off, and skills were resurfaced by an
exponential-decay heuristic (14-day half-life, fixed 7-day recency window, 0.7
threshold) that faded skills but never produced genuinely *growing* intervals or
snapped a wrong answer back to a short one. We are replacing both halves: a skill's
return is now governed by a **Box** (Leitner level 1–5 with growing intervals, e.g.
1/2/4/7/14 days) — a correct Retrieval Item promotes the skill one box, a wrong one
drops it to box 1 — and each Retrieval Item is **authored-first**: it re-serves the
authored lesson puzzle for the due skill by default (editor blank, so it is recall
not recognition), upgrading to a fresh AI-generated variant only when AI is
available. The Box also drives scaffolding: low boxes show hints and an easier
puzzle, high boxes fade support and (with AI) raise difficulty.

## Considered Options

- **Keep AI-generated-only items** — strongest novelty, but review stays an AI
  feature that disappears under the new parent AI Preference (see ADR-0003) and
  depends on generation latency/cost. Rejected: review should survive AI being off.
- **SM-2-lite (ease factor + interval)** — smoother personalization, but more
  per-skill state and harder to explain/tune for a 9–11 audience. Rejected for
  Leitner's simplicity and legibility (boxes map directly onto an end-of-session
  mastery recap).
- **Refine the existing decay model** — least churn, but bolting growing intervals
  onto decayed-rate math keeps two overlapping notions of "due." Rejected for a
  single clear model.

## Consequences

- New per-skill scheduling state (Box + last-reviewed) lives in `ReviewState`;
  `dueSkills`/`refreshDueQueue` in `adaptivity/mastery.ts` + `storage/progress.ts`
  switch from decayed-rate selection to box-interval-elapsed selection.
- A skill→authored-puzzle lookup is required so review works with no AI; skills with
  no authored puzzle fall back to AI or are skipped.
- This is the producer side of the soft mastery gate: the end-of-lesson nudge points
  at the Review Session, which is now always available.
