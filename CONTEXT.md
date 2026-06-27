# brillant — Domain Language

brillant is a learning game where a child builds a small program out of command
cards to guide an explorer through a maze puzzle. This glossary names the
concepts shared across the lesson, practice, review, and shared-puzzle flows.

## Running a puzzle

**Run**:
A single execution of the learner's current program against a puzzle, played
back as a step-by-step animation of the explorer moving through the maze.
_Avoid_: play, attempt (an Attempt is the recorded outcome of a Run, not the Run itself)

**Run Timeline**:
The whole animation of a Run expressed as an ordered list of Render Frames — one
per tile the explorer occupies, plus a final settle frame carrying the outcome.
_Avoid_: animation, playback

**Render Frame**:
The complete visible state of the maze at one moment of a Run — where the
explorer is, which way it faces, and the state of every world feature
(checkpoints, gates, keys, counter, search window, carried tasks). Named
`MazeRenderState` in code.
_Avoid_: snapshot, tick, step-state

**Run Strip**:
The collapsed row of the program's executed steps shown beside the maze during a
Run, with the chip for the currently-resolving step highlighted.
_Avoid_: timeline (that is the Render Frame list), step bar

**Attempt**:
The recorded outcome of a Run — whether it solved the puzzle, the program used,
and how long it took — persisted to the learner's mastery record. A Run produces
at most one Attempt (a Run on a shared puzzle records none).
_Avoid_: result, submission

## Reviewing

**Replay** (a lesson):
Restarting a previously-started or completed lesson from its first step, with
saved programs cleared, so the learner re-reads the concept slides and re-solves
every puzzle. This is what the lesson card's "Review" action does.
_Avoid_: review (that is the spaced cross-lesson session below), resume (resuming
keeps prior progress; a Replay discards it)

**Review Session**:
A short, cross-lesson practice session that resurfaces skills the learner has
already met, drawing one Retrieval Item per due skill. Reached from the "Daily
review" side quest. Distinct from a Replay, which re-runs a single whole lesson.
_Avoid_: daily review, practice (Practice is open-ended same-skill drilling)

**Retrieval Item**:
One puzzle presented in a Review Session for a single due skill, always with the
editor blank so the learner recalls the solution rather than recognising it. Its
source is authored-first: the authored lesson puzzle for that skill by default, or
a fresh AI-generated variant of the same skill when AI generation is available.
_Avoid_: review puzzle, card, question

**Box**:
A skill's spacing level (1–5) in the Leitner schedule. Each box has a longer wait
before the skill becomes Due again. A correct Retrieval Item promotes the skill one
box; a wrong one drops it to box 1 so it returns soonest. The Box also drives how
much scaffolding a Retrieval Item shows: low boxes are supported (hints up-front,
easier variant), high boxes fade support (no hints, harder variant).
_Avoid_: level (that is a lesson's teaching position / AI difficulty level), bucket

**Due**:
A skill whose Box interval has elapsed since its last Review, making it eligible for
the next Review Session. Wrong answers make a skill Due sooner; mastery pushes it
further out.
_Avoid_: pending, scheduled

**Soft Gate**:
The recommendation shown when a learner reaches the end of a lesson without having
mastered its skills (below the Skilled tier). It steers them toward a Review Session
before the next lesson but never blocks the next lesson — guidance, not a lock.
_Avoid_: lock, gate (a Soft Gate never prevents progress)

## AI availability

**AI Capability**:
Whether a build is allowed to use AI at all, fixed at build time by the `VITE_AI_*`
env flags. The hard ceiling: if a build ships without an AI Capability, no runtime
setting can summon it.
_Avoid_: AI enabled (ambiguous with the parent's preference below)

**AI Preference**:
The parent-controlled on/off choice for AI features, stored on the device, that
applies only within what the AI Capability already allows. When off, every AI path
(Rico's explanations, puzzle generation, review variants, adaptive difficulty) falls
back to its authored behaviour. Hidden entirely when there is no AI Capability.
_Avoid_: AI toggle (that is the control), AI enabled
