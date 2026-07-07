# Xiangqi Broadcast Track

Tracking issue: https://github.com/brianhliou/mistboard/issues/100

Mistboard should support Lichess-style xiangqi tournament broadcasts: an
organizer creates an event, rounds contain boards, board feeds update over time,
and viewers get a clean live/replay experience for top games without joining a
live room.

The broadcast system is publishing and study infrastructure. It is not
matchmaking, ratings, chat, or a general tournament server.

## Product Bar

The first public version should make elite xiangqi enjoyable to watch:

- event, round, board, player, federation, and result context are visible without
  making the board feel cramped;
- a round grid makes many boards scannable at once;
- a featured-board view gives one game the full theater treatment;
- replay controls are fast and deterministic;
- source/sync errors are visible to organizers, not spectators;
- completed broadcasts remain useful as permanent public game records.

Engine eval is intentionally outside the first broadcast slice. It can be added
after the core broadcast loop is trusted.

## Architecture Decision

Broadcasts should be separate from live rooms.

Live rooms own clocks, seats, hidden-info redaction, resign/abort/rematch, and
match lifecycle. Broadcasts need source ingestion, correction, replay, export,
and many spectators. Reusing live rooms would mix two different contracts.

The broadcast stack should instead create a small domain above the existing
xiangqi rules and watch/replay surfaces:

- `BroadcastTour`: public event shell.
- `BroadcastRound`: section, day, or round inside a tour.
- `BroadcastBoard`: one game stream with players, board number, result, and
  source identity.
- `BroadcastBoardState`: normalized moves, current status, tags, validation
  state, and last source checksum.
- `BroadcastSyncLog`: source snapshots, validation failures, corrections, and
  operator-visible health messages.

The board renderer and replay controls should reuse the standard xiangqi watch
stack where possible (`watch-xiangqi-replay.ts`, `xiangqi-postgame.ts`,
`renderXiangqiBoardSvg`) rather than building a second xiangqi board UI.

## Canonical Data

Xiangqi notation is fragmented, so Mistboard should not make WXF text notation,
DhtmlXQ, PGN-like text, or elephantops PGN the canonical format.

Canonical board updates use Mistboard coordinate moves:

```json
{
  "schema": "mistboard.xiangqi.broadcast.v1",
  "variant": "xiangqi",
  "tour": {
    "slug": "2025-wxc-sample",
    "name": "2025 World Xiangqi Championship"
  },
  "round": {
    "id": "men-r1",
    "name": "Men Round 1"
  },
  "boards": [
    {
      "sourceBoardId": "men-r1-b01",
      "boardNumber": 1,
      "red": { "name": "Red Player", "federation": "CHN" },
      "black": { "name": "Black Player", "federation": "SGP" },
      "moves": [
        { "from": "h3", "to": "e3" },
        { "from": "h8", "to": "e8" }
      ],
      "result": "*"
    }
  ]
}
```

Adapters may ingest WXF pages, DhtmlXQ files, UCCI strings, elephantops PGN-like
records, CSV pairings, or manual input, but all of them must normalize to the
same coordinate move list before persistence.

Every imported or pushed move must validate through the standard xiangqi rules
engine before it becomes public board state.

## Source Matching

Board updates should be idempotent and correction-friendly. Match incoming games
in this order:

1. `sourceBoardId`
2. round id plus board number
3. exact player names plus starting position
4. fuzzy player names only as an operator-reviewed fallback

Incoming updates are accepted when they are an identical replay, a legal prefix
extension, a tag/result-only update, or an explicit correction from an authorized
source. Illegal moves, incompatible prefixes, and ambiguous board matches go to
the sync log.

## Local Testing Requirement

Broadcast development must not depend on a real live event. The first milestone
must include deterministic local sources.

### Fixtures

Store small public-safe fixture packs:

```text
packages/game/fixtures/xiangqi-broadcast/2025-wxc-sample/
  tour.json
  rounds.json
  boards.json
  games/
    men-r1-b01.json
    men-r1-b02-live.json
    men-r1-b03-invalid.json
```

Fixtures cover completed imports, invalid records, corrections, and multi-board
rounds.

### Event Tapes

Timed tapes simulate a live broadcast from static games:

```json
[
  { "atMs": 0, "board": "men-r1-b01", "moves": [] },
  { "atMs": 3000, "board": "men-r1-b01", "append": [{ "from": "h3", "to": "e3" }] },
  { "atMs": 9000, "board": "men-r1-b01", "result": "1-0" }
]
```

The same tape should run instant, realtime, or accelerated (`10x`, `60x`) so a
full round can be tested locally in minutes.

### Fake Source Server

Add a local source simulator before live polling:

```bash
npm run broadcast:fixture -- 2025-wxc-sample
npm run broadcast:sim -- 2025-wxc-sample --speed 20
npm run broadcast:source -- 2025-wxc-sample --mode clean
npm run broadcast:source -- 2025-wxc-sample --mode flaky
```

Simulator modes should cover:

- clean incremental updates;
- stale responses;
- repeated payloads;
- out-of-order updates;
- corrected move lists;
- missing boards;
- malformed records;
- illegal moves;
- source 500s and timeouts.

## Milestones

### M0: Broadcast Brief And Fixture Schema

- Define TypeScript types for canonical broadcast payloads.
- Add runtime validation for fixture packs.
- Convert a tiny public xiangqi sample into canonical coordinates.
- Add validation tests that replay fixture moves through the standard xiangqi
  rules engine.

Done means a contributor can run a local command and prove fixture records are
legal xiangqi.

### M1: Offline Import

- Add persistence for tour, round, board, board state, and sync logs.
- Import canonical coordinate JSON fixtures.
- Persist validated board states.
- Expose read APIs for tournament, round, and board replay.
- Export canonical JSON.

Done means Mistboard can publish completed tournament records.

Local import command:

```bash
npm run db:import:xiangqi-broadcast -- \
  --dir packages/game/fixtures/xiangqi-broadcast/2025-wxc-sample
```

Add `--include-game-files` to also ingest `games/*.json`, including the
intentionally illegal fixture used to exercise sync-log failures.

Read APIs:

- `GET /api/xiangqi/broadcasts/:tourSlug`
- `GET /api/xiangqi/broadcasts/:tourSlug/rounds/:roundId`
- `GET /api/xiangqi/broadcasts/boards/:boardId`
- `GET /api/xiangqi/broadcasts/boards/:boardId/export`

### M2: Local Live Simulation

- Add event tape runner.
- Add fake source HTTP server.
- Add push simulator that posts board updates into the local app.
- Add tests for duplicate payloads, legal extensions, corrections, and illegal
  move rejection.

Done means live broadcast behavior is reproducible without a real tournament.

Local tape runner:

```bash
npm run db:simulate:xiangqi-broadcast -- \
  --dir packages/game/fixtures/xiangqi-broadcast/2025-wxc-sample \
  --speed instant
```

Fake source server:

```bash
npm run source:xiangqi-broadcast -- \
  --dir packages/game/fixtures/xiangqi-broadcast/2025-wxc-sample \
  --mode clean \
  --port 3127
```

Source modes:

- `clean`: current board snapshots at wall-clock or `?atMs=...`.
- `stale`: snapshots lag the requested time by five simulated seconds.
- `malformed`: HTTP 200 with an invalid body shape.
- `error`: HTTP 500 fixture-source failure.

The committed `tape.json` is deterministic and can be run instant, realtime,
or accelerated by numeric `--speed`.

### M3: Public Viewer

- Tournament page: event identity, schedule, active rounds, featured games.
- Round page: multi-board grid optimized for scanning.
- Board page: large board, player headers, move list, result/status, replay
  controls.
- Theater mode for a single featured board.
- Mobile layout with a usable board and non-overlapping controls.

Done means a simulated round is enjoyable to watch.

### M4: Live Updates

- Add broadcast websocket or SSE channel.
- Push board-state diffs to round and board viewers.
- Handle corrections without page reload.
- Keep reconnect deterministic by loading persisted board state first.

Done means local event tapes animate the public viewer in real time.

### M5: Organizer Console

- Create/edit tour, rounds, and boards.
- Attach source URLs or push credentials.
- Show sync health and per-board errors.
- Allow authorized correction/replacement of a board source.

Done means a non-developer can run a small event.

### M6: Source Adapters

- Add DhtmlXQ adapter using the existing conversion knowledge from
  `import-famous-xiangqi.ts`.
- Add WXF/public-page importer only after selecting one real event page shape.
- Keep adapter failures isolated to sync logs.

Done means Mistboard can import at least one real public tournament source
end-to-end.

## Test Matrix

Unit tests:

- canonical payload validation;
- DhtmlXQ coordinate conversion;
- legal move replay;
- illegal move diagnostics;
- result and player tag normalization;
- board matching and ambiguity detection;
- idempotent duplicate payload handling;
- explicit correction handling.

Integration tests:

- create tour, round, boards;
- import completed fixture;
- push incremental update;
- reject illegal ply while preserving prior public state;
- write sync log;
- export canonical JSON;
- reconnect/read current board state from persistence.

Browser tests:

- tournament page loads;
- round grid displays 16 and 32 boards without layout breakage;
- board page appends moves live;
- correction updates move list and board position cleanly;
- theater mode works on desktop and mobile;
- no UI overlap at narrow widths.

Load smoke:

- 32 boards;
- one update every 1-5 seconds per active board;
- 100 lightweight spectator connections;
- no unbounded event backlog, runaway memory, or visible UI churn.

## Issue-Ready Slices

1. Define xiangqi broadcast canonical payload types and fixtures.
2. Add fixture validation and legal-move replay tests.
3. Add broadcast persistence schema.
4. Add offline coordinate JSON importer.
5. Add public broadcast read APIs.
6. Add canonical JSON export.
7. Add event tape runner.
8. Add fake broadcast source server.
9. Add authenticated local push endpoint.
10. Build tournament and round viewer pages.
11. Build board/theater viewer page on the standard xiangqi renderer.
12. Add live update channel for broadcast boards.
13. Add organizer sync log view.
14. Add DhtmlXQ adapter.
15. Add first WXF event adapter/proof import.

## Recommended Defaults

- Gate broadcasts separately from standard xiangqi live rooms. Broadcasts can
  launch as public study/viewer content without opening player-created xiangqi
  rooms.
- Keep broadcast persistence separate from finished-game persistence, but expose
  a replay-compatible API shape so the xiangqi watch renderer can be reused.
- Start fixtures with a tiny hand-curated coordinate pack, then add DhtmlXQ
  because existing local conversion code already knows that source shape, then
  prove WXF on one selected event page.
- Defer comments and annotations until the import, live simulation, sync log,
  and viewer loops are stable.
