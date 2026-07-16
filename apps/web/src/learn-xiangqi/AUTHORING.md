# Xiangqi Learn — stage authoring guide

How to author a stage file under `stages/`. Written for parallel agent waves;
also the human reference. Read this fully before writing levels.

## Ownership rules (waves run in parallel)

- You own EXACTLY ONE file: `stages/<your-key>.ts`. Never edit any other file
  (no registry, no copy table, no runner, no other stage).
- Your stage is already registered in `stages/index.ts` as a stub. Overwrite
  the stub in place; keep the same export name and `key`.
- Do NOT commit. The lead reviews and commits batches.
- If the verifier run fails with a syntax/import error in a file that is not
  yours, another agent is mid-write: wait ~20s and rerun. Only your stage's
  test failures are yours to fix.

## Verify your work (must pass before you report done)

```
cd <worktree>/apps/web
npx vitest run src/learn-xiangqi/learn-verifier.test.ts -t "stage <your-key>"
npx tsc --noEmit
```

## Board geometry crash course

- Intersections are `<file><rank>`: files `a`..`i` (a = red's left), ranks
  `1`..`10` (1 = red's back rank, 10 = black's back rank).
- The river runs between ranks 5 and 6.
- Palaces: red `d1`-`f3`, black `d8`-`f10` (files d/e/f only).
- Piece moves:
  - Chariot (R): slides any distance along rank/file.
  - Cannon (C): moves like a chariot; CAPTURES only by jumping exactly one
    piece (the screen, any color) on the line.
  - Horse (N): one orthogonal step then one diagonal outward; blocked when the
    adjacent orthogonal point (the "leg") is occupied.
  - Elephant (B): exactly two diagonal steps; blocked when the midpoint (the
    "eye") is occupied; may NEVER cross the river. Red elephant points are
    only: a3 c1 c5 e3 g1 g5 i3 (mirror for black).
  - Advisor (A): one diagonal step, confined to the palace. Red advisor
    points: d1 f1 e2 d3 f3.
  - General (K): one orthogonal step, confined to the palace. Flying-general:
    the two generals may never face each other on an open file (strict mode
    enforces this).
  - Soldier (P): one step forward (red moves toward rank 10, black toward
    rank 1); after crossing the river also one step sideways; never backward.

## FEN format

`'<placement> <w|b>'` — placement rows run rank 10 DOWN to rank 1, digits are
empty runs, uppercase = red, lowercase = black. `w` = red to move. Letters:
`R` chariot, `C` cannon, `N` horse, `B` elephant, `A` advisor, `K` general,
`P` soldier.

Example: `'9/9/9/9/9/4P4/9/9/4C4/9 w'` = red soldier e5, red cannon e2.
Count carefully: each row's letters + digits must sum to 9.

## Level schema (see learn-types.ts for the full contract)

Key fields and their defaults (`toLevel`):
- `rules`: `'relaxed'` (geometry-only movegen, generals optional, no check
  rules) — the default. `'strict'` = the real kernel: BOTH generals must be on
  the board in their palaces, the position must be legal for elephantops
  (generals not facing!), and checkmate/stalemate are detected by apply.
- `keepTurn`: true when there is no scenario (the opponent is frozen; the
  student keeps moving). Scenario levels get normal turn alternation.
- `detectCapture`: `false` when the level has apples, `'unprotected'`
  otherwise. `'unprotected'` = after your move, if the opponent can capture
  one of your pieces and you cannot recapture on that point, you FAIL (with
  the capture demonstrated). This is the whole game for protection-style
  levels; set `detectCapture: false` explicitly on check/mate/scenario levels
  where a "hanging" piece is fine.
  On STRICT levels the scan uses real legal moves for both the opponent's
  capture and your recapture (lila parity). Consequence one: if your move
  gives check, the only capture that can refute you is a legal answer to the
  check, almost always a capture of your checker; a piece hanging elsewhere
  is not a refutation (grabbing it would ignore the check, an illegal move).
  Consequence two: a recapture does not count when it is illegal, e.g. the
  recapturer is a check blocker, or a sideways soldier recapture that would
  bare the file between the generals (flying general).
- `color`: derived from the FEN side-to-move. Opponent-first scenario levels
  (FEN gives the opponent the move) must set `color` explicitly.

## The three level genres, and how each is PROVEN in CI

Every level must be provable. The verifier enforces:

1. **Apple levels** (`apples: 'e5 g5 ...'`): the player collects stars.
   Apples materialize as enemy soldiers, so captures obey real geometry: a
   cannon needs a screen to take an apple, a horse respects leg blocks, an
   elephant respects its eye. `emptyApples: true` skips materialization (bare
   markers, plain moves onto the point) — use for movement-only teaching
   (general/soldier stages, cannon movement levels).
   PROOF: BFS computes the true optimal move count; `nbMoves` must EQUAL it.
   Workflow: write the level, run the verifier, and if BFS disagrees with
   your intended par, first check whether a degenerate shortcut exists (then
   redesign the position), else fix `nbMoves`.
2. **Scenario levels** (`scenario: [...]`): a flat move list from the start
   position, strict turn order. Steps on the player's turn are the ONLY
   accepted player moves; opponent steps auto-play after a beat, optionally
   with annotation `shapes`. MUST set an explicit `success`
   (usually `scenarioComplete` or `mate('red')`) — the default success is
   trivially true for no-apple levels and would complete the level on move 1.
   Moves are `{ from: 'h10', to: 'h6' }` objects.
   PROOF: the verifier walks the script (legality, success, nbMoves ==
   scripted player moves) AND, by default, proves every scripted opponent
   reply is the opponent's ONLY legal move (`forcedReplies`, default true on
   scenario levels). A scripted "defense" the opponent was free to dodge
   makes the level's claim false against real play: a "mate in 2" where the
   king had a quiet sidestep is not a mate in 2. Set `forcedReplies: false`
   ONLY on demo scenarios whose copy frames the opponent's move as a choice
   or a blunder (cannon's chariot-blunder level, the perpetual-check demos),
   never on a pattern or mate claim.
   Forcing toolbox, proven across mate-patterns: make every red move a
   check whose unique answer is a king step or a single recapture; wall the
   king with its OWN pieces; cover flight squares with the flying-general
   rule (a red king on an open file bars that file's palace squares, and
   bars capturing a checker when taking it would empty the file); pin
   would-be defenders with a top-rank chariot or a cannon's second screen
   (a piece that is one of two screens on the general's file can never
   move); and give black a single quiet-move soldier as the tempo piece on
   levels whose first red move is quiet. Filler-soldier legality: on its
   OWN half a black soldier must sit on files a/c/e/g/i at rank 7 or 6
   (forward-only, exactly one move); crossed soldiers gain sidesteps and
   are NOT single-move fillers; a soldier off its start files on its own
   half is an illegal position (elephantops ERR_PAWNS).
3. **Everything else** (protection/check/mate/setup-style): provide
   `sampleSolution: 'g1e1'` (space-separated from-to pairs, player moves
   only). PROOF: the verifier replays it through the exact runner pipeline
   (capture scan → failure assert → success) and requires completion in
   exactly `nbMoves` player moves.

## Strict-mode gotchas

- Strict multi-move levels DO NOT work without a scenario: strict apply hands
  the turn to the opponent, and with no script the level stalls. So:
  - one-move strict levels (check-in-one, mate-in-one, stalemate): fine —
    success is evaluated immediately after the player's move.
  - multi-move strict levels (mate patterns): script the opponent's replies
    with a `scenario` and set `success: mate('red')`.
  - multi-move check exercises that want a frozen opponent: use `rules:
    'relaxed'` with `checkIn/noCheckIn` asserts. The `check` family reads
    `playerColor` from AssertData (not the state turn), so it correctly asks
    "did the player check the opponent" even on keepTurn levels where the turn
    stays pinned to the player. Both generals must be on the board.
- Strict FENs must be elephantops-legal: both generals in their palaces, not
  facing each other on an open file, plausible piece counts. An illegal FEN
  makes movegen throw and your verifier test fail loudly.

## Assert library (learn-assert.ts)

`and, or, not, pieceOn, pieceNotOn, noPieceOn, extinct, check, mate(winner?),
stalemateWin(winner?), checkIn(n), noCheckIn(n), scenarioComplete,
scenarioFailed, applesEaten, stillHas, selfCheck`.

Capture-stage pattern: `success: extinct('black')`, `pointsForCapture: true`,
`captures: <n>` (feeds the max-score calc), optionally `showPieceValues: true`
to score by piece value (chariot 90, cannon 45, horse 40, elephant/advisor 20,
soldier 10).

## Intent (the craft contract for one-move puzzles)

A one-move level with no failure stakes is an exercise, not a puzzle. The
craft standard (from lila, where `detectCapture: 'unprotected'` is the
default even on check stages): several moves LOOK right, exactly one survives
the refutation, and the wrong ones fail with the refutation demonstrated on
the board.

Declare that contract with `intent` and the verifier PROVES it by running
every legal first move through the exact runner pipeline:

```ts
intent: { solutions: 1, candidates: { assert: check, min: 3 } }
```

- `solutions`: exactly this many first moves complete the level (gates
  included). Almost always 1.
- `candidates`: at least `min` first moves satisfy the assert on the raw
  post-move position, BEFORE the capture-threat and failure gates: the
  tempting choices the student must pick among. Solutions count toward it.

Only valid on levels with `nbMoves: 1` and neither apples nor a scenario.

Composition workflow: leave `detectCapture` on its default, place refuters
(a chariot down a file, a horse watching a landing point, the enemy general
next to an unprotected checker), declare the intent, run the verifier, and
iterate on the FEN until the counts prove out. Traps the verifier has
already caught in practice: a "refuted" chariot check that is accidentally
CHECKMATE because your own general on the same file makes the recapture an
illegal flying-general move; a "hanging" piece that is retroactively
protected by the piece you just moved; a wrong check "refuted" only by an
illegal reply (the strict scan is check-legal: while in check the opponent
can only punish by capturing your CHECKER, so a watcher of a discovered
checker's landing square refutes nothing); a defended blocker whose
defender's recapture is an illegal pin-break; and a hero piece that guards
the very squares your decoy checks are supposed to hang on (a soldier's
sideways recapture can be neutralized by flying general, but only when the
file between the generals is otherwise EMPTY). Do not trust your head;
trust the counts. Exemplar: `stages/check1.ts`.

## Copy

- The stage file owns ALL its strings in `copy` (keys
  `learn.xiangqi.<stageCamel>.*`). The goal/title/subtitle/intro/complete keys
  you reference must exist there.
- Tone: short, playful, imperative. Match chariot/cannon. Second person.
- HARD RULE: no em dashes in user-facing copy. Use commas, colons, or split
  sentences.
- Goals may be shared across levels (see protection: one `goal.escape` key
  used by several levels).

## Exemplars

- `stages/chariot.ts` — apple levels, hint arrows.
- `stages/cannon.ts` — emptyApples movement, screen captures, one scenario
  level (opponent-first, explicit `color`, `success: scenarioComplete`).
- `stages/protection.ts` — sampleSolution levels riding the
  detectCapture('unprotected') scan; shared goal keys.

## Design taste

- One idea per level; escalate within the stage; the last level is a small
  capstone.
- Prefer sparse boards: every piece on the board should serve the lesson.
- Use `shapes` (arrow/circle) on level 1 of a new mechanic, then withhold.
- Xiangqi-first pedagogy: teach with the mechanics chess doesn't have
  (screens, legs, eyes, river, palace) rather than transliterating chess.
