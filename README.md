# Switch Back

A faithful recreation of **Switchback** (Binary Arts Corporation #6400, 1993) — a marble
puzzle on a tilting tray — plus tooling to explore which arrangements its move set can
actually reach.

You rearrange marbles two ways and only two ways: slide one of eight row bars sideways by
one column, or tilt the whole tray so gravity resolves every open channel at once. There
is no way to move a single chosen marble, and the app makes no illegal move representable.

## Running it

```sh
npm install
npm run serve      # then open http://localhost:8000
```

ES modules need to be served over HTTP; `file://` will not work. `npm run build` also
produces `switchback.html`, a single self-contained file with no external requests that
opens straight from disk.

```sh
npm run check      # unit tests, app smoke test, build, bundle smoke test
```

## How the board is modelled

The tray reads as 9 columns × 8 rows, but only 32 cells are ever active — exactly 8 rows
of 4 hole-slots. Slot space is therefore the state representation, and column space is
presentation:

```
column(row, slot) = 2*slot + typeOffset(row) + shift(row)
```

Two consequences the whole codebase leans on:

- **A slide cannot change what a row contains.** The bar carries its four holes and their
  contents sideways as a rigid unit. Only tilts move marbles between rows.
- **A tilt cannot change a marble's column.** Marbles cross between rows only through a
  shared column.

Between two vertically adjacent rows there are exactly 0, 3, or 4 open gates depending on
the two sliders. Where a row's outermost hole has no partner, a marble there cannot be
moved by any tilt — the box calls this *using the edges for shelter*, and it is the
player's only way to hold a marble still through a gravity resolution.

## Layout

| Path | What it is |
| --- | --- |
| `engine.mjs` | State and moves. Pure, no rendering, runs in Node and the browser. |
| `patterns.mjs` | Target matching, in column space. |
| `booklet.mjs` | **Generated.** The 52 booklet challenges. |
| `solver.mjs` | Beam search from one board to another. |
| `analysis.mjs` | Reachability search and permutation structure. |
| `occupancy/` | C tools: the exact hole-pattern graph, and the colour-orbit solver. |
| `groupsweep.mjs` | Fills the matrix with the colour-orbit solver. |
| `board.mjs` | Shared board renderer. |
| `view-3d.mjs` | The 3D tray (three.js), in strict and free modes. |
| `freeplay.mjs` | Continuous gravity for free mode; settles exactly where the engine does. |
| `theme.mjs` | The appearance menu: light or dark, marble colours, board look. |
| `vendor/` | three.js, vendored as one ES module so there is still no build step. |
| `app.mjs`, `view-*.mjs`, `store.mjs` | The routed app. |
| `build.mjs` | Bundles the modules into `switchback.html`. |
| `tools/` | Python that transcribed the booklet scan. |

The engine is deliberately UI-independent: the analysis and the solver run the exact same
code the app runs, so nothing analysed here is a reimplementation of the game.

## The booklet

`booklet.mjs` is generated from a scan of the challenge booklet, not typed by hand. Boards
are located by their printed silhouette, marbles by colour against a mask of the board's
interior, and the hole lattice is fitted per board. Regenerate with:

```sh
cd tools && python3 run_extract.py && python3 gen_patterns.py
```

Every transcription is validated against the rules of the physical board, all 52 are
mutually distinct, and the whole extraction was reproduced identically from two
independent rasterisations of the scan.

**All 52 printed targets have every slider at rest** — the zero-gate configuration in
which no tilt can move anything. Every booklet solution therefore ends frozen, which is
presumably why a solved board stays put while you check it against the page.

## What is known so far

On a reduced 4×2 board with two marbles of each colour, exhaustive search reaches 26,112
states and 408 of the 420 arrangements. The 12 unreachable ones are two hole patterns ×
six colourings each. Both are the alternating staircase, one marble per row with the
filled slot alternating side to side.

They are unreachable for a mechanical reason rather than a conservation law: delivering a
marble into a lower slot means opening the channel above it, and channels open in aligned
sets, so the marble already placed beside it falls out at the same moment. The pattern
defeats itself.

Two things follow. Colour is irrelevant — every reachable hole pattern is reachable in all
six of its colourings, so there is no permutation obstruction. And the state graph is
**directed**: from one of these positions you can reach 6,544 states including the normal
start, but never return. Tilts destroy information, the move set is not a group, and
ordinary reachability intuitions do not apply.

The full 8×4 board has the same shape, and it is now settled exactly: see
*The full board, settled* below.

## Solver

The Solve tab searches for a route between any two boards. It is a beam search, so it
finds a route rather than the shortest one, and on hard pairs it fails and says so. On a
sample of eight pattern pairs it solved five, with solutions running 69 to 920 moves.

Distance is measured in **slot space**, not column space. Scoring in column space charges
four misplaced marbles for a row sitting one slide from correct, which stalls the search
completely — a slide cannot change a row's contents, so contents are the expensive part of
the distance and alignment is nearly free.

It can also search in **switches** — slide a set of rows, tilt once, slide them back —
which gives plans of twenty-odd moves rather than several hundred. That mode is off by
default and offered as "prefer short plans", because it finds a route noticeably less
often and costs a large fixed chunk of the budget up front.

### Validated against real play

`routes.mjs` holds routes played by hand on the physical puzzle, and
`routes.test.mjs` replays them through the engine. Every move changes the board
and each route lands exactly on its target. That is the strongest check the
engine has — a change to the gravity model that breaks a real game now fails the
build.

| Route | Moves | Worst detour |
| --- | --- | --- |
| pattern 2 to pattern 1 | 444 | 20 |
| the opening board to pattern 4 | 741 | 9 |

**Worst detour** is how far above its own best-so-far a route is ever willing to
go, and it is the number that matters for search design: it is exactly the
amount of worsening a search must tolerate to stay on the path. The solver's
beam prunes anything worse than its best within a level or two, which is one to
two orders of magnitude less slack than these routes need.

### The plateau, and why the search cannot climb it

The failures are strikingly uniform: the search stops with exactly two holes wrong, which
is one marble and the hole it should be in. Pattern 1 to pattern 2 is known solvable by
hand, so this is the search failing, not an obstruction — and a parity obstruction is
impossible here anyway, since with twelve identical marbles of each colour every
rearrangement has both an even and an odd representative.

Things tried that did **not** clear it, recorded so they are not tried again blindly:

- Widening the beam. Past about 900 it gets worse, because the state budget then buys
  fewer levels and solutions run deep.
- Reserving a quarter of the beam for worse-scoring positions, to keep the moves that
  displace a correctly placed marble.
- Searching in switches rather than single moves. Much shorter plans, same plateau.
- Weighting rows by position — outer rows heavier, or top-down, or bottom-up. The
  reasoning is sound (a top-row marble can only leave downwards, so the edges are both
  harder to fill and harder to disturb) but it made no measured difference.
- Iterated local search: perturb the stalled position with a few random switches, then
  re-optimise. Fifty-six perturbations, no improvement.
- Bounded-worsening breadth-first search over switches.
- Rollout search (`rollout.mjs`): judge a whole sampled sequence by where it ends
  up and never score the intermediate steps, so a plan is free to wreck the board
  on the way. This removes the pruning objection entirely and still fails —
  a thousand iterations of hundreds of random walks never improves on two. Random
  walks are simply not going to stumble onto a specific four-hundred-move route.
- Searching from both ends. This cannot work: meeting in the middle needs backward
  steps from the target, and tilts have no inverse. Running forward from both ends
  yields `A -> M` and `B -> M`, which do not compose into `A -> B`.

The hand-played route in `routes.mjs` settles why. It starts **2** holes from the target
and ends at 0, but on the way it climbs to **22** — further from the target than the two
patterns are from each other. The board is dismantled completely and rebuilt.

No amount of tuning saves a distance-guided search from that. Every method above prunes on
distance, and the route's first move alone makes the position nine holes worse; a beam
throws it away immediately and never sees the remaining four hundred moves. The heuristic
is not weak, it is pointing the wrong way.

Rollout search rules out the simplest diagnosis. Removing the pruning does not help,
because the problem is not only that good plans get pruned — it is that there is no
gradient to follow and no way to stumble onto the route by chance.

What is left is search over **subgoals** rather than over positions. The structure that
makes this plausible: a slide moves a row's four holes as a rigid unit, so it cannot
reorder a row's contents. A row's contents can only ever be assembled by tilts. That makes
"give row *r* its target contents" an atomic sub-problem, and the natural plan is a
sequence of those, with already-finished rows as constraints the search must restore
before moving on — not preserve throughout, since a real solution does break them.

The route in `routes.mjs` is the benchmark. A search that finds it is a search that works.

The plateau was eventually beaten by changing the unit of search rather than
the heuristic: route the hole pattern first, then fix colours with loops that
return to it. See *The full board, settled*.

## The solution matrix

`results/solutions.json` holds every pattern-to-pattern result found so far,
keyed `from>to`, so the full 53 × 53 matrix can be filled in over many runs. The
Matrix tab plots it and lets you step through any stored route.

```sh
node sweep.mjs --for 250          # the cycle 0 -> 1 -> ... -> 52 -> 0, resumable
node sweep.mjs --edges 3>7,7>3    # specific pairs
node sweep.mjs --retry            # try the failures again
node gen_solutions.mjs            # rebuild solutions.mjs for the app
```

Every stored route is replayed through the engine before it is written, and has
its loops removed: if a route visits the same position twice, the stretch in
between did nothing and is cut. That is not optimisation, but every move it
removes is provably wasted. The hand-played route to pattern 4 went from 741
moves to 495 that way.

**A failed edge is not an impossible edge.** It means this search, at this
budget, stopped short. (The colour-orbit solver below has since filled every
cell; this paragraph describes the beam search.) The first cycle solved 3 of 53 edges; 21 of the failures
stopped exactly one marble from done. Pattern 0 to 4 is unsolved by the search
and solved by hand.

## Patterns 2 and 5 are unreachable

Two of the 52 booklet patterns cannot be reached from any other marble
arrangement. You can only ever start on them.

The proof is a backward search. A slide is its own inverse, and although a tilt
is not — many positions fall onto the same result — the set of positions that
tilt onto a given one can be listed (`predecessors.mjs`). Tilts never change a
column, so within each column's run of connected cells a tilt just packs the
marbles to one end in order, and any placement of the same marbles in the same
order further along the run falls onto the same result.

Searching backwards from pattern 2 finds exactly 256 positions — 1, 8, 28, 56,
70, 56, 28, 8, 1 by distance, which is every way of setting the eight sliders —
and then runs dry. Under no slider setting can a tilt produce pattern 2's
arrangement. The same holds for pattern 5.

This was checked a second way that does not depend on the backward search at
all: for every slider setting, every marble was moved to every empty hole in its
own column — the only place a tilt could have brought it from — and tilted both
ways. Across 4,096 attempts per pattern, nothing lands back on it. Both checks
run in `sealed.test.mjs`.

So every edge into pattern 2 or 5 is impossible, which settles 104 cells of the
matrix outright. It also explains the hand-played route: it goes from 2 to 1,
and 1 to 2 was never going to work.

**Why the backward search helps the solver.** Targets have their sliders at
rest, where no channel is open, so a target has only eight predecessors and the
region around it grows slowly. The forward search reliably gets close and then
stalls one marble short. `perimeter.mjs` builds the region around the target
backwards, and the forward search stops the moment it touches it — the rest of
the route is already known. That solved 12 to 13, which had been stuck one
marble short. It did not solve three other such edges, so it is a real
improvement rather than the answer.

## Does colour matter?

Colour never affects movement — a marble falls because the hole below is empty,
not because of its colour — so the pattern of filled holes evolves on its own.
That makes hole-pattern reachability **necessary**: if one hole pattern cannot
reach another, no colouring of it can.

Whether it is also **sufficient** was tested exhaustively on six reduced boards,
including two at the real width of four holes per row
(`experiments/colourblind.mjs`). Every one has the same shape:

| Board | Hole patterns | In the giant component | Colourings reached there |
| --- | --- | --- | --- |
| 4×2, 2+2 | 70 | 68 | all 6 of every pattern |
| 4×3, 3+3 | 924 | 912 | all 20 |
| 6×2, 3+3 | 924 | 922 | all 20 |
| 4×3, 2+4 | 924 | 912 | all 15 |
| 4×4, 3+3 | 8,008 | 7,296 | all 20 |
| 4×4, 4+4 | 12,870 | 11,940 | all 70 |

- One giant component holds nearly every hole pattern, and it is **closed**:
  nothing leaves it.
- Everything outside it only flows in — singletons, and at full width small
  clusters — so those positions can be started from but never returned to.
- Inside the giant component, **every hole pattern is reached in every
  colouring.** Colour is irrelevant there.

The 53 booklet patterns use only 37 distinct hole patterns, and patterns 2 and 5
share one. That is why both are sealed: sealed-ness is a property of the holes.
It also means 2 and 5 cannot reach each other — any tilt that moves a marble
changes the holes, and no tilt can ever produce that hole pattern again.

Every other booklet pattern has a backward region still growing past 40,000
positions, so none is trapped in a small cluster.

**The conjecture for the full board**, now a theorem (next section): every
booklet pattern except 2 and 5 can reach every other one except 2 and 5; 2 and
5 can reach the rest, and nothing reaches them.

## The full board, settled

Both halves of the conjecture are proved by exhaustive computation, in C for
speed (`occupancy/`). The C tilt is a table lookup — within each column's run
of connected holes a tilt just counts the marbles and packs that many at the
far end, in order — and `occupancy.test.mjs` checks it against the engine on
thousands of random labelled boards, including where every marble lands.

### Hole patterns: one closed giant, plus 6,562 dead starts

`occupancy/scc.c` computes the strongly connected components of the whole
occupancy graph: all 10,518,300 ways to put 24 marbles in 32 holes, with an
edge for every tilt under every one of the 256 slider settings.

| | |
| --- | --- |
| Hole patterns | 10,518,300 |
| Strongly connected components | 6,563 |
| Giant component | 10,511,738 hole patterns, **closed** — no tilt leaves it |
| Everything else | 6,562 singletons, each with **no predecessor at all** |

So on the full board the picture is as simple as it could be. A hole pattern
either has no predecessor — it can only ever be a starting position — or it is
in the giant component, from which every other giant-component pattern can be
reached. There are no small traps and no one-way clusters.

A hole pattern with no predecessor is one that no tilt can leave behind: for
every slider setting and direction, either some column run is not packed to
that end, or every run is completely full or completely empty, so the only
position that tilts onto it is itself. Patterns 2 and 5 share such a hole
pattern. Every other booklet pattern, and the opening board, is in the giant.

### Colour: every colouring of every target is reachable

Colour never moves anything, so a sequence of tilts that leaves a target's hole
pattern and comes back to it moves every marble to a hole that does not depend
on colours: it is a fixed **permutation** of the 24 marbles. Loops compose,
and a finite set of permutations closed under composition is a group. The
colourings that can be produced at the target's holes are therefore exactly an
orbit of that group.

`occupancy/groupsolve.c` finds, for each target, every loop through hole
patterns within a few tilts of it (typically several hundred distinct
permutations), then searches the orbit over all C(24,12) = 2,704,156
colourings. **For every one of the 51 reachable targets the orbit is
complete**: every colouring of its holes can be rearranged into it. The orbit
sizes are recorded in `results/solutions.json` and asserted in
`occupancy.test.mjs`.

### The matrix is settled

Putting the two together: for any two patterns *A* ≠ *B*,

- if *B* is 2 or 5, *A* → *B* is **impossible**;
- otherwise *A* → *B* is **solvable** — *A*'s hole pattern reaches *B*'s
  (it is in, or flows into, the closed giant), and once there the colours can
  always be fixed.

That is 104 impossible cells and 2,652 solvable ones, and 2 and 5 can reach
each other in neither direction.

### And the solver that comes with it

The proof is constructive, so it is also a solver, and it does not stall:

1. Route the hole pattern: breadth-first over hole patterns from *A* until it
   meets the region worked out backwards from *B*.
2. Fix the colours: follow the orbit search, one loop at a time, to *B*'s
   colouring.

```sh
node groupsweep.mjs               # every target, four solver processes at once
node groupsweep.mjs --to 4,9      # only these targets
node gen_solutions.mjs            # rebuild solutions.mjs for the app
```

Each target takes well under a minute. Every route is replayed through the JS
engine before it is stored, so the C code is never trusted on its own, and a
route only replaces an earlier one if it is shorter.

The whole matrix is now filled: **2,652 routes and 104 proved impossible, with
nothing unknown.** Routes run from 12 to 488 moves, median 147 — shorter than
anything found before, including the hand-played ones (the opening board to
pattern 1 went from 260 moves to 86, and to pattern 4 from 495 to 163). The
edges the beam search could never finish, such as 9 to 10, are ordinary routes
of around 150 moves.

## The 3D tray

The 3D tab draws the physical 1993 tray with three.js, modelled on photos of it:
the grey frame with its printed pattern bezels, the side pillars, eight light
slider bars whose ribbed ends stick out of the open sides, and a smoked clear
backing behind the holes. Drag to turn it, scroll or pinch to zoom, tap a bar to
slide it. The first print on the frame is the current target.

It has two modes:

- **Strict — engine rules.** Every move goes through `engine.mjs` and onto the
  same history as the Play tab, so undo, replay codes and targets carry over. A
  tilt tips the tray and the marbles the engine moved fall along their columns.
- **Free — real gravity.** `freeplay.mjs` replaces the engine's instant tilt
  with continuous physics. Hold the tray at any angle: marbles accelerate, stack
  and can be stopped halfway between rows. Bars take time to move and can be
  dragged and held part-way, and a bar that moves while marbles stream through
  it catches whichever one is in it — so the physical tricks work, like letting
  a few marbles through and shutting the bar on the rest. A marble can only
  enter a row through a hole that lines up exactly, so it can never be inside a
  block, and a bar with a marble half in it will not move. Arrow keys and the
  phone's own tilt pull toward that edge of the *screen*, however the tray has
  been turned. Undo goes back to the last still position, and a position at
  rest in holes can be copied as a board code or taken back into strict mode.

`freeplay.test.mjs` checks the physics against the engine: on hundreds of
random boards and slider settings a free-mode tilt left to settle lands exactly
where the engine's tilt does, and hundreds of random games of tilting, tapping
and half-holding bars never put a marble inside a block.

Appearance — light, dark or following the system, the 1993 purple and teal or
the 1998 orange and green marbles, and the look of the flat board — is one menu
in the header, remembered between visits.

## Sharing a game

The code in the play view is the whole game: the starting board, then every move, with
slides as row numbers and tilts as `U` and `D`.

```
11111111111100000000222222222222|00000000~13D
```

Paste one back in and it replays through the same engine, move for move, with the history
intact so you can step back through it.

## Provenance

Switchback was invented by Ira Friedman and published by Binary Arts Corporation. This is
an independent recreation for study; the puzzle design is not mine.
