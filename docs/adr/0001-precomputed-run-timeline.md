# Precompute the Run Timeline instead of computing maze state during the animation tick

A Run's animation was driven by five near-identical `handleRun` loops (one per
page) that computed each tile's maze state — checkpoints, gates, keys, counter,
search window, carried tasks, facing, active strip chip — *inside* the
`setTimeout` tick. Every one of those values is a pure function of
`(RunResult, pathIndex)`, so we instead build the whole Run Timeline up front as
an ordered list of Render Frames (`MazeRenderState[]`) and have a thin
`usePuzzleRun` hook simply step an index through the frames on a timer.

We chose this over lifting the existing tick-time loop into one shared hook
because it makes the heavy logic a pure, directly unit-testable function
(removing the "only testable by mounting a component and advancing fake timers"
friction), gives each frame the shape MapGrid consumes, and concentrates the Run
concept in one module. The trade-off is a larger rewrite and eager computation
of every frame — both acceptable here, since paths are short and the helpers are
cheap. Side effects that are transitions rather than state (sounds, celebrate,
scroll-into-view, recording the Attempt) stay out of the frames and fire through
an explicit seam on the hook.
