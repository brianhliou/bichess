# Mistboard — Codebase Index

Fast orientation for agents. One line per file. Read this before opening any source file.
Run `npm run agent:scan` after the required git checks for live dirty-state,
worktree, large-file, and targeted-test guidance.
Edit task → find file → open only that file.

> **Sprint 2 god-file work complete (2026-05-22 → 2026-05-23):** all major splits shipped — web side: `live-sound.ts`, `time-controls.ts`, `review.ts`, `contact.ts`, `account.ts`, `profile.ts`, `pages-static.ts`, `live-replay.ts`. Server side: `http-api.ts` decomposed into `routes/{lib,annotations,auth,account,engines,feedback,meta,rooms,lobby,games,users,leaderboard}.ts` (Tier-4 in audit). Biome format + lint:fix passes also landed.

## packages/game/src/ — Pure game logic (no server/browser deps)

| File | Owns |
|------|------|
| `types.ts` | Shared types: `Color`, `Square`, `Board`, `Move`, `GameState`, `PlayerView`, `Variant` |
| `game-specs.ts` | Game-family taxonomy and stable spec ids: current dark chess/Draft960 plus hidden/future Xiangqi, Shogi, Omega, and other dark variants |
| `engine-protocol.ts` | Public redacted engine request/response contract shared by server and external/first-party engines |
| `bughouse-engine-protocol.ts` | Draft Chess Bughouse partner-bot request/response contract, validators, seat/team mappings, clocks, legal actions, reserve needs, and cross-seat signaling rules |
| `bughouse-engine-protocol.fixtures.ts` | JSON-stable partner-bot protocol fixtures for engine-side contract tests and Mistboard/server validation |
| `bughouse.ts` | Pure Chess Bughouse aggregate: two-board match state, capture transfer, drops, clocks, timeouts, event replay, and partner-request projection |
| `variants.ts` | Variants (`draft960Variant`, `darkChessVariant`); fog kernel: `fogVisibleSquares`, `fogMovesFrom`, `fogPawnMoves`, `fogSlideMoves`, `fogCastlingMoves`, `applyFogMove` |
| `variants-xiangqi.ts` | FoW Xiangqi variant (flagged/dev-only live room + `/xiangqi-spike`); cannon vision = field of fire |
| `xiangqi-broadcast.ts` | Canonical xiangqi broadcast payload types, runtime validators, fixture replay validation, and the Mistboard coordinate schema for tournament broadcasts |
| `xiangqi-vision-kernel.ts` | Geometry-parameterized FoW vision walks shared by the xiangqi-family kernels (full Xiangqi, Dark Mini Xiangqi, Crossroads Chess): the cannon screen-walk, horse blocked-leg walk, and rook/slider ray walk + `VisionAccum`/`emptyVision`, driven by a per-variant `VisionProbe`. Per-piece rules that genuinely differ (general/advisor/elephant/soldier/pawn) stay in each variant kernel |
| `variants-shogi.ts` | Shogi rules kernel reserved for future hidden-information variants |
| `events.ts` | `GameEvent` union type, `replayGameEvents` reducer, `GameProjection` |
| `notation.ts` | `algebraicMoveLabels` — algebraic/coordinate notation for move lists and replay |
| `clocks.ts` | `createClock`, `advanceClock`, `clockRemainingMs`, `expireClock` |
| `chess960.ts` | Chess960 start generation, `pickDraft960Offer` |
| `time-controls.ts` | `TIME_CONTROLS` list + `timeClassFromTimeControl()` + `findTimeControl()` + `isOfficialTimeControl()` — single source for time-control defs. All callers (rating-buckets, landing picker, http-api PvE allowlist, persistence SQL, loadtest scenarios, analytics) derive from this list |
| `index.ts` | Barrel re-export — everything the game package exposes publicly |

**Change fog visibility or move rules** → `variants.ts`
**Change clock math** → `clocks.ts`
**Change event replay** → `events.ts`
**Change move notation** → `notation.ts`
**Add/rename a time control** → `time-controls.ts`

## packages/board-render/src/ — Shared SVG board renderer

| File | Owns |
|------|------|
| `board-svg.ts` | Server- and build-safe SVG board renderer (for OG images + article triptychs) |
| `composition.ts` | Triptych + grid compositions |
| `layouts.ts` | Layout primitives for composed renders |
| `pieces.ts` | Piece SVG sprite refs |
| `positions.ts` | FEN → board position parsing |
| `tokens.ts` | Color/size tokens |
| `article-positions.ts` | Reusable article board positions |
| `interactive/board.ts` | Browser-side interactive board |
| `interactive/index.ts` | Browser interactive renderer exports |
| `interactive/live-boards.ts` | Pool of interactive boards keyed by id |
| `interactive/stepper.ts` | Triptych stepper UI (article triptychs) |
| `interactive/thumbnail.ts` | Thumbnail renderer |
| `index.ts` | Barrel re-export |

## apps/server/src/ — WebSocket server + HTTP API

| File | Owns |
|------|------|
| `main.ts` | Prod entry point. Calls `installShutdownHandlers()` then `startServer({port})`. Tiny — all logic lives in `index.ts`. |
| `index.ts` | Server library: exports `startServer`, `installShutdownHandlers`, `stopServer`. Module-load side-effect-free so the integration harness can boot a test instance on a random port. Owns canonical maps, startup wiring, shutdown composition, game-flow callbacks, and persistence-error status while delegating HTTP, WebSocket, and room lifecycle edges. |
| `server-http.ts` | HTTP entry routing: `/health`, admin drain handoff, API context dispatch, OG/static page routes, robots/sitemap, article/game shell fallbacks, and SPA static fallback. |
| `server-lifecycle.ts` | Server shutdown/test-teardown mechanics: pause active rooms, clear room timers, close room sockets, wait for room writes, and close HTTP/WebSocket servers. |
| `server-static-pages.ts` | Static page helpers for non-API HTTP routes: per-game/article page-meta injection, article shell/prerender serving, articles index shell, and sitemap generation. |
| `server-drain.ts` | Admin drain controller: drain deadline state, active-game counting, rate limiting, token-gated drain/cancel HTTP handling, and restart/cancel WebSocket broadcasts. |
| `server-ws-connection.ts` | WebSocket edge handling: connection handshake, game-spec gate, account/session lookup, seat assignment, hello snapshot, message dispatch, rate limiting, debug auth, rematch messages, and disconnect behavior. Injects room lifecycle/game-flow callbacks from `index.ts`. |
| `server-ws-dark-xiangqi.ts` | Thin adapter over the generic tenant WebSocket runtime (`variant-tenant/ws.ts`) for hidden Dark Xiangqi — the last tenant to converge off a hand-rolled handler at the registry dispatch collapse (2026-06-11). Its quirks (latency-sample, unknown-message logging, strict client-id regex, sync expiry-on-move) moved into the generic runtime; re-exports the bound functions under their pre-migration names. |
| `dark-xiangqi-tenant.ts` | Hidden Dark Xiangqi `VariantTenant` (P1 near-copy migration): looser-than-DMX event redaction, shrouded-piece wire board, seat-vacated acceptance, legacy GameSummary shape, no snapshot extras. The `dark-xiangqi-runtime` (types-only) + `server-dark-xiangqi-room-factory` + `server-ws-dark-xiangqi` files bind the generic `variant-tenant/` functions (events/seat-session/lifecycle/transport adapters removed 2026-07-01; callers call the generic `tenant*` directly). |
| `dark-xiangqi-runtime.ts` | Dark Xiangqi live-room type aliases over the generic `variant-tenant/` runtime (types-only — no legacy export names; ws/factory/engine/routes/registration/golden-wire call the generic `tenant*` functions directly). |
| `server-dark-xiangqi-room-factory.ts` | Hidden Dark Xiangqi room creation/store/persistence factory behind server feature flags. |
| `server-dark-xiangqi-types.ts` | Shared Dark Xiangqi live-room/client type aliases for the tenant WebSocket/engine modules (breaks the ws↔engine import cycle). |
| `crossroads-chess-tenant.ts` | Crossroads Chess `VariantTenant` (P1, first perfect-info tenant): pass-through event visibility, open view for all seats, state-dependent `canonicalMove` (promotion rides the legal-move object), legacy `dual-chess` spec alias, roomMode/pveEngineId/forfeitDeadline/rematch snapshot extras. The `crossroads-chess-runtime` (types-only) + `server-crossroads-chess-{engine,room-factory,rematch}` + `server-ws-crossroads-chess` files bind the generic `variant-tenant/` functions (events/lifecycle/seat-session adapters removed 2026-07-01; rematch kept for its createRoom-signature bridge). |
| `crossroads-chess-runtime.ts` | Crossroads Chess live-room type aliases over the generic `variant-tenant/` runtime (types-only — no legacy export names; ws/factory/engine/rematch/routes/registration/golden-wire call the generic `tenant*` functions directly). |
| `dark-crossroads-chess-tenant.ts` | Hidden Dark Crossroads Chess `VariantTenant` (fog sibling of `crossroads-chess-tenant.ts`, built on the Dark Xiangqi fog policy): per-seat move-played redaction, the fog player view (color-only shrouded silhouettes, already wire-safe so no re-encode), own-moves-only lastMove, spectator-empty view, bare snapshot (no roomMode/rematch extras). PvP-only, no PvE. The `dark-crossroads-chess-runtime` (types-only) + `server-dark-crossroads-chess-room-factory` + `server-ws-dark-crossroads-chess` files bind the generic `variant-tenant/` functions. |
| `dark-crossroads-chess-runtime.ts` | Dark Crossroads Chess live-room type aliases over the generic `variant-tenant/` runtime (types-only — no legacy export names; ws/factory/routes/registration/golden-wire call the generic `tenant*` functions directly). |
| `server-dark-crossroads-chess-room-factory.ts` | Thin adapter over `variant-tenant/room-factory.ts` for hidden Dark Crossroads Chess (no running-game record; PvP-only casual rooms). |
| `server-ws-dark-crossroads-chess.ts` | Thin adapter over `variant-tenant/ws.ts` for hidden Dark Crossroads Chess; PvP-only, no rematch (the optional ws rematch capability stays absent), no PvE. |
| `dark-shogi-tenant.ts` | Hidden Dark Shogi (9x9) `VariantTenant` (fog tenant on the Dark Crossroads pattern): per-seat move-played redaction, the fog player view carrying only pieces-in-vision + the viewer's OWN hand (private reserves under fog), own-moves-only lastMove, spectator-empty view, bare snapshot. Win = king-capture, PvP-only, no PvE. Drops + promotion ride the chess-shaped move message (`from:"*<role>"` = drop, `promotion:"promote"`). `dark-shogi-runtime` (types-only) + `server-dark-shogi-room-factory` + `server-ws-dark-shogi` bind the generic `variant-tenant/` functions. |
| `dark-shogi-runtime.ts` | Dark Shogi live-room type aliases over the generic `variant-tenant/` runtime (types-only — no legacy export names; ws/factory/routes/registration/golden-wire call the generic `tenant*` functions directly). |
| `server-dark-shogi-room-factory.ts` | Thin adapter over `variant-tenant/room-factory.ts` for hidden Dark Shogi (no running-game record; PvP-only casual rooms). |
| `server-ws-dark-shogi.ts` | Thin adapter over `variant-tenant/ws.ts` for hidden Dark Shogi; PvP-only, no rematch, no PvE. |
| `dark-crazyhouse-tenant.ts` | Hidden Dark Crazyhouse (chess + drops under fog) `VariantTenant` (Dark Shogi hands/drops pattern over the dark-chess fog kernel): per-seat move-played redaction, fog player view carrying only pieces-in-vision + the viewer's OWN hand (private reserves), own-moves-only lastMove, spectator-empty view, bare snapshot. Win = king-capture, PvP-only. Drops ride `from:"*<letter>"` (Q/R/B/N/P); promotion `promotion:"q"\|"queen"\|…`. PARACHUTE drop rule: `wire.rejectionFor` bounces a drop onto a truly-occupied square (a probe). `dark-crazyhouse-runtime` (types-only) + `server-dark-crazyhouse-room-factory` + `server-ws-dark-crazyhouse` bind the generic `variant-tenant/` functions. |
| `dark-crazyhouse-runtime.ts` | Dark Crazyhouse live-room type aliases over the generic `variant-tenant/` runtime (types-only — no legacy export names; ws/factory/routes/registration/golden-wire call the generic `tenant*` functions directly). |
| `server-dark-crazyhouse-room-factory.ts` | Thin adapter over `variant-tenant/room-factory.ts` for hidden Dark Crazyhouse (no running-game record; PvP-only casual rooms). |
| `server-ws-dark-crazyhouse.ts` | Thin adapter over `variant-tenant/ws.ts` for hidden Dark Crazyhouse; PvP-only, no rematch, no PvE. |
| `kriegspiel-tenant.ts` | Kriegspiel (standard chess played blind, ICC wild-16) `VariantTenant`: own-pieces-only player view (stricter than fog, no enemy square ever sent), the UMPIRE-ANNOUNCEMENT redaction model — `canonicalMove` stamps the capture (square + pawn/piece) + check category onto the move, `clientEventFor` gives the mover the full move but the opponent only the announcement (from/to stripped). Real checkmate; fifty-move + threefold draws. Try-loop bounce via `wire.rejectionFor`. PvP-only, no PvE. `kriegspiel-runtime` (types-only) + `server-kriegspiel-room-factory` + `server-ws-kriegspiel` bind the generic `variant-tenant/` functions. |
| `kriegspiel-runtime.ts` | Kriegspiel live-room type aliases over the generic `variant-tenant/` runtime (types-only — no legacy export names; ws/factory/routes/registration/golden-wire call the generic `tenant*` functions directly). |
| `server-kriegspiel-room-factory.ts` | Thin adapter over `variant-tenant/room-factory.ts` for Kriegspiel (no running-game record; PvP-only casual rooms). |
| `server-ws-kriegspiel.ts` | Thin adapter over `variant-tenant/ws.ts` for Kriegspiel; PvP-only, no rematch, no PvE. |
| `crossroads-chess-golden-wire.test.ts` | Golden wire-parity suite pinning Crossroads per-seat transport snapshot/event payloads (fixture in `fixtures/`) plus fixture-independent perfect-info invariants (all-seats event streams, PvE roomMode/engine marking, forfeit-deadline gating, dual-chess alias hydration). Regenerate only for intentional wire changes (`MISTBOARD_GOLDEN_RECORD=1`). |
| `variant-tenant/` | Generic Layer-3 live-room runtime over a `VariantTenant` (tenant.ts = the contract; runtime/events/seat-session/lifecycle/rematch/ws/room-factory = shared plumbing; registry.ts = prefix-to-tenant routing). The rules module is the type boundary; per-seat redaction is tenant policy. |
| `dark-mini-xiangqi-tenant.ts` | Dark Mini Xiangqi `VariantTenant` (P0 reference tenant): DMX fog event redaction, spectator empty view, lastMove stripping, colors/rules/engine/persistence config. The `dark-mini-xiangqi-runtime` (types-only) + `server-dark-mini-xiangqi-{engine,room-factory,rematch}` + `server-ws-dark-mini-xiangqi` files bind the generic `variant-tenant/` functions (events/lifecycle/seat-session adapters removed 2026-07-01; rematch kept for its stateful coverage). |
| `dark-mini-xiangqi-golden-wire.test.ts` | Golden wire-parity suite pinning DMX per-seat snapshot/event payloads (fixture in `fixtures/`) plus fixture-independent hidden-info invariants. Regenerate only for intentional wire changes (`MISTBOARD_GOLDEN_RECORD=1`). |
| `jieqi-golden-wire.test.ts` | Golden wire-parity suite for the IDENTITY-hidden Jieqi tenant (fixture in `fixtures/`) plus fixture-independent hidden-info invariants: the server-secret deal never reaches a client, a face-down entry keeps its colour but never its role, capture reveal is CAPTURER-ONLY (the victim never learns it), and the position is public (both seats share moves + lastMove; spectators get an empty view). Regenerate only for intentional wire changes (`MISTBOARD_GOLDEN_RECORD=1`). |
| `banqi-golden-wire.test.ts` | Golden wire-parity suite for the SYMMETRIC-info Banqi tenant (fixture in `fixtures/`) plus fixture-independent hidden-info invariants: the server-secret deal never reaches a client, a face-down tile carries neither ink nor role (revealed tiles carry both), both seats see a byte-identical view, `firstColor` binds only on the opening flip, and spectators get an empty view. Regenerate only for intentional wire changes (`MISTBOARD_GOLDEN_RECORD=1`). |
| `server-room-lifecycle.ts` | Room lifecycle edge handling: room creation/hydration, Draft960 offer seeding, abandoned-room aborts, seat-vacate timers, stale guest prestart abort sweeps, stale paused-room sweeps, paused-room grace resume, and runtime room reset. Injects canonical maps/callbacks from `index.ts`. |
| `rematch.ts` | Mutual-confirm rematch state machine + finalize. `offerRematch`, `cancelRematch`, `declineRematch`, `finalizeRematchIfReady`, `maybeReplayRematchRedirect`. |
| `room-manager.ts` | Core game loop: `playMove`, `appendEvent`, `broadcastSnapshot`, `scheduleClockTimeout`, `expireActiveClock`, `scheduleRandomEngineMove`, `playRandomEngineMoveIfReady`, seat token persistence, bid/draft resolution. Context: `RoomManagerContext`. |
| `lifecycle-windows.ts` | Neutral leaf holding the `ABORT_WINDOW_MS` (pregame first-move) and `FORFEIT_WINDOW_MS` (disconnect) constants, shared by both live-room stacks (legacy `room-manager` + generic `variant-tenant/lifecycle`) so the tenant runtime imports no game-lifecycle constant from the legacy stack |
| `http-api.ts` | Thin HTTP dispatcher (79 LOC). Walks `routes/*` modules in declared order; each `tryHandle()` returns true to claim the request or false to fall through. Re-exports `HttpApiContext`, `parseVariantId`, `parseHiddenDraft960`, `parseRoomTimeControl`, `isPveAllowedTimeControl`, `readJsonBody`, `writeJson`, `requireMethod`, `requirePersistence` from `routes/lib.ts` so external consumers (`index.ts`, loadtest) don't need to know things moved |
| `routes/lib.ts` | Shared HTTP utilities: `HttpApiContext` interface, `writeJson`, `requireMethod`, `requirePersistence`, `readJsonBody`, the parse helpers, `hashIp`, `isHttpAdminAuthorized`. Imported by every route module |
| `routes/auth.ts` | `/api/auth/{me,logout,email/start,email/confirm}` |
| `routes/account.ts` | `/api/account/profile` (PATCH) |
| `routes/users.ts` | `/api/users/:handle/profile` |
| `routes/rooms.ts` | POST `/api/rooms`, `/api/rooms/:id/abandon`, plus `parseRoomMode` / `parsePlayablePveEngineId` |
| `routes/dark-xiangqi-rooms.ts` | Hidden Dark Xiangqi direct room creation branch for `POST /api/rooms`: request claiming, flag behavior, supported-surface gate, and room factory result mapping |
| `routes/dark-xiangqi-games.ts` | Hidden Dark Xiangqi postgame/review API branch; keeps non-chess finished-game records out of generic chess replay APIs |
| `routes/lobby.ts` | `/api/lobby`, `/api/lobby/:ticketId`, plus `joinLobby` / `cancelLobbyTicket` / `pruneLobbyTickets` / `lobbyTicketResponse` / `lobbyOpenRequests` |
| `routes/games.ts` | All `/api/games/*` + `/api/eve-games/recent` (8 routes) + game-data helpers (`gameSummaryForApi`, `gameEventsForApi`, `gameReviewForApi`, `gameArtifactsForApi`, engine-color helpers) |
| `routes/leaderboard.ts` | `/api/leaderboard` + `/api/leaderboard/summary` (top-N per variant in one query) |
| `routes/feedback.ts` | `/api/feedback` + honeypot + anon rate-limit + email-and-persist fan-out |
| `routes/forum.ts` | `/api/forum/*`: category/topic/search reads, account-gated topic/reply/report writes, topic/post edits, admin move/pin/lock/hide moderation, admin report queue, validation, and per-account posting rate limits |
| `routes/annotations.ts` | `/api/annotations` (admin GET/POST/PUT, JSON-lines file backed) |
| `routes/meta.ts` | `/api/server-status`, `/api/live-stats`, `/api/players/online` |
| `routes/relations.ts` | Follow/block kernel: `POST/DELETE /api/users/:handle/{follow,block}`, `GET /api/relations/{following,blocks,online-following}` (online-following returns rating+playing-enriched rows) |
| `live-room-stats.ts` | `collectLiveRoomStats(ctx)` — one pass over all live rooms (legacy + tenants) for online/playing counts; shared by `routes/meta.ts` (`/api/players/online`) and `routes/relations.ts` (online-following) |
| `routes/engines.ts` | `/api/engines/playable` |
| `routes/correspondence-rooms.ts` | POST `/api/correspondence/rooms` (days-per-move dark-chess seeks/rooms); account-gated, `correspondenceEnabled` flag |
| `routes/correspondence-games.ts` | GET `/api/correspondence/games` — signed-in player's in-flight correspondence games (your-move-first) + nav-badge count; reads the `room_deadlines` index |
| `routes/crossroads-chess-rooms.ts` | Crossroads Chess room-creation branch for `POST /api/rooms` (`crossroadsChessEnabled` flag, engine-id parsing) |
| `routes/dark-crossroads-chess-rooms.ts` | Hidden Dark Crossroads Chess direct room creation branch for `POST /api/rooms`: request claiming, flag/supported-surface gate (PvP-only, no rated/engine), room-factory result mapping. Factory-bound (`variant-tenant/rooms-route.ts`) |
| `routes/dark-shogi-rooms.ts` | Hidden Dark Shogi direct room creation branch for `POST /api/rooms`: request claiming, flag/supported-surface gate (PvP-only, no rated/engine), room-factory result mapping. Factory-bound (`variant-tenant/rooms-route.ts`) |
| `routes/dark-crazyhouse-rooms.ts` | Hidden Dark Crazyhouse direct room creation branch for `POST /api/rooms`: request claiming, flag/supported-surface gate (PvP-only, no rated/engine), room-factory result mapping. Factory-bound (`variant-tenant/rooms-route.ts`) |
| `routes/kriegspiel-rooms.ts` | Kriegspiel direct room creation branch for `POST /api/rooms`: request claiming, flag/supported-surface gate (PvP-only, no rated/engine), room-factory result mapping. Factory-bound (`variant-tenant/rooms-route.ts`) |
| `routes/dark-crossroads-chess-games.ts` | Hidden Dark Crossroads Chess postgame/review API branch (`GET /api/dark-crossroads-chess/games/:id`): the reveal gate (only a FINISHED game exposes the truth board + opponent history), per-seat fog views, per-ply history, timeline. Injectable persistence for the reveal-gate unit test |
| `routes/dark-shogi-games.ts` | Hidden Dark Shogi postgame/review API branch (`GET /api/dark-shogi/games/:id`): the reveal gate (only a FINISHED game exposes the truth board + opponent history + both reserves), per-seat fog views (each carrying its own hand), per-ply history, timeline. Injectable persistence for the reveal-gate unit test |
| `routes/dark-crazyhouse-games.ts` | Hidden Dark Crazyhouse postgame/review API branch (`GET /api/dark-crazyhouse/games/:id`): the reveal gate (only a FINISHED game exposes the truth board + opponent history + both reserves), per-seat fog views (each carrying its own hand), per-ply history, timeline. Injectable persistence for the reveal-gate unit test |
| `routes/kriegspiel-games.ts` | Kriegspiel postgame/review API branch (`GET /api/kriegspiel/games/:id`): the reveal gate (only a FINISHED game exposes the truth board + history), per-seat own-pieces views, per-ply history, timeline. Injectable persistence for the reveal-gate unit test |
| `routes/crossroads-chess.ts` | Crossroads Chess game/postgame API branch (open perfect-info views; keeps non-chess records out of generic chess replay APIs) |
| `routes/dark-mini-xiangqi-rooms.ts` | DMX room-creation branch for `POST /api/rooms` (rated-flag/time-control gating via `game-spec-request-gate`) |
| `routes/dark-mini-xiangqi-games.ts` | DMX postgame/review + publication-JSON API branch; keeps non-chess finished games out of generic chess replay APIs |
| `routes/mini-xiangqi-rooms.ts` | Mini Xiangqi room-creation branch for `POST /api/rooms` (open-information 7x7 PvP, casual launch, time-control parsing). Factory-bound (`variant-tenant/rooms-route.ts`; casual-only, no launch flag) |
| `routes/mini-xiangqi-games.ts` | Mini Xiangqi postgame/review API branch; exposes finished open-information board history and timeline from persisted or live rooms |
| `routes/drop-mini-xiangqi-rooms.ts` | Drop Mini Xiangqi room-creation branch for `POST /api/rooms` (PvP/lobby only for now; rated/time-control gating via `game-spec-request-gate`). Factory-bound (`variant-tenant/rooms-route.ts`; account-gated rated) |
| `routes/drop-mini-xiangqi-games.ts` | Drop Mini Xiangqi postgame/review API branch; exposes the finished open-information board, reserve history, and move timeline |
| `routes/fortress-xiangqi-rooms.ts` | Fortress Xiangqi room-creation branch for `POST /api/rooms` (PvP + Fairy-Stockfish PvE; casual, rated-ready). Factory-bound (`variant-tenant/rooms-route.ts`; account-gated rated) |
| `routes/fortress-xiangqi-games.ts` | Fortress Xiangqi postgame/review API branch; finished open-information 7x8 board, reserve history, and move timeline |
| `routes/xiangqi-broadcasts.ts` | Xiangqi broadcast read APIs: tour detail, round boards, board replay payload, and canonical board export |
| `routes/puzzles.ts` | Mini Xiangqi puzzle API: list/detail endpoints plus attempt validation for Mini and Drop Mini Xiangqi puzzle lines |
| `routes/bots.ts` | Public bot directory/profile API (`/api/bots`, `/api/bots/:id`) filtered to playable enabled variants |
| `bot-profile-policy.ts` | Shared bot profile policy: public bot id parsing and playable-variant filtering for bot directory/profile surfaces |
| `account-session.ts` | Account auth: `currentAccountUser`, `ensureUserForEmail`, `hashSecret`, session cookies, email login |
| `presence.ts` | In-memory online-players tracker (touched by `currentAccountUser`, TTL-pruned) behind `/api/players/online` |
| `account-identity.ts` | Email normalization, handle generation, display name handling |
| `build-info.ts` | Build metadata surfaced through status responses |
| `feature-flags.ts` | Runtime on-switches for rated mode and hidden/prelaunch surfaces |
| `game-spec-request-gate.ts` | Request gate from incoming room specs to supported runtime families |
| `server-config.ts` | Runtime config parsing and room-region normalization |
| `server-types.ts` | Shared server types: `Client`, `Room`, `SeatTokenState`, `SeatAssignment`, `LobbyTicket` |
| `server-policy.ts` | Access control: `canObserveLiveRoom`, `eventReplayResponse`, `visibleEventsForLiveSnapshot`, `modeForProjection`, `isAdminDebugToken`, `isAllowedWebSocketOrigin`, `isClientRoute`, `PARKED_CLIENT_ROUTES` |
| `server-ws-messages.ts` | Client WebSocket message parser and known-message allowlist used by `server-ws-connection.ts` dispatch |
| `server-seat-session.ts` | Seat assignment/session helpers: seat-token hashing and verification, account/token credential gate, new/existing seat assignment, and duplicate seat displacement. |
| `server-live-engine-reservations.ts` | Live engine reservation helpers: PvE engine-seat detection, legacy engine ID normalization, engine-worker reservation create/release, and reservation logging. |
| `internal-engine-client.ts` | HTTP client/reservation adapter for the internal live engine service |
| `persistence-db.ts` | Postgres pool lifecycle: `init`, `probeDb`, `close`, `isInitialized`, `getPool` |
| `persistence-seat-tokens.ts` | Room seat token persistence, including token load/upsert/touch/replace/verify helpers |
| `persistence.ts` | Public persistence facade. Import existing persistence APIs from here unless changing query ownership. |
| `persistence-game-lifecycle.ts` | Room event loading/append, running-game lifecycle, stale-room cleanup, debug artifact persistence |
| `persistence-games.ts` | Completed-game persistence, game summaries/lists, watch/unlock queries, participant attribution, game-end persistence |
| `persistence-accounts.ts` | Account/profile/session/email-login queries and leaderboard/account-role helpers |
| `persistence-bots.ts` | Bot profile/rating/game persistence: public bot directory, bot profile pages, rating snapshots, and bot game records |
| `persistence-forum.ts` | Forum category/topic/post/report persistence: visible lists, search, topic detail, create topic, add reply, edit/move/moderate, report lifecycle, and recent-write counters for API rate limits |
| `persistence-feedback.ts` | Feedback persistence |
| `persistence-site-stats.ts` | Site statistics query |
| `persistence-xiangqi-broadcasts.ts` | Xiangqi broadcast persistence: tour/round/board upserts, legal replay validation import, sync logs, and read queries |
| `persistence-puzzles.ts` | Daily puzzle selection persistence (`daily_puzzle_selections`): deterministic day-based pick for the homepage slot plus a persisted override, over Mini/Drop Mini Xiangqi puzzle lines |
| `persistence-test-support.ts` | Shared Postgres test harness: migration, truncation reset, DB URL gating, and persistence test helpers |
| `test-database-url.ts` | Persistent-test database URL guard: prefers `TEST_DATABASE_URL`, refuses the local dev DB by default, and allows an explicit destructive-test override |
| `persistence-*.test.ts` | Postgres-backed persistence regressions split by domain: events, accounts, seat tokens, lifecycle, game end/lists, ratings, and debug artifacts |
| `payloads.ts` | `snapshotPayload` — builds WebSocket snapshot message; applies fog redaction and seat-scoped view logic |
| `test-builders.ts` | Shared server test builders for `GameProjection`, `PlayerView`, `SnapshotRoom`, `Room`, clients, and seat tokens |
| `rating-buckets.ts` | Variant × time-class → bucket-id mapping for per-bucket Elo |
| `glicko.ts` | Glicko-2 rating math (Glickman 2013) for the human PvP ladder; self-calibrating via rating deviation, so no offline calibration step |
| `rating-store.ts` | Rating persistence/store helpers |
| `first-party-bots.ts` | Static first-party bot profile registry mapping public bot ids to active engine ids and default variants |
| `bot-rating-import.ts` | Converts engine Elo reports into draft bot rating snapshot plans for first-party bot profiles |
| `bot-rating-snapshots.ts` | Bot rating snapshot list/promotion helpers and audit-row rendering |
| `bot-rating-promote.ts` | CLI for promoting draft bot rating snapshots to published bot ratings |
| `migrate.ts` | Schema migrations — run once on startup |
| `python-pool.ts` | Persistent Python worker pool for live engines (size=4 in prod) |
| `engine-service.ts` | Internal HTTP engine service and live engine reservation admission control |
| `engine-alert-email.ts` | Engine alert email rendering/sending helpers |
| `engine-move-guard.ts` | Shared engine-move boundary for variant PvE engines: bounded retry + kernel-validate loop, a complete replayable decision record, and fail-closed reporters (fallback counter + alert) so no engine can silently substitute an illegal or threat-blind move |
| `engine-protocol/build.ts` | Server-side redacted `EngineTurnRequest` builder |
| `engines/{registry,think-time,types}.ts` | Engine registry/type helpers for engine service code |
| `engine-registry.ts` | Maps engine client IDs to implementations: `loadEngine`, `playableLiveEngines`, `engineVersionDisplayName` |
| `live-engine.ts` | `chooseLiveEngineMove` — interfaces room state with an engine implementation |
| `engine-time-policy.ts` | Engine think-time budgets per time control / tier |
| `engine-runner.ts` | Worker/queue-side engine execution for async EvE games |
| `engine-experiments.ts` | Engine tournament experiment definitions and scheduling |
| `engine-tournament.ts` | Tournament bracket logic |
| `engine-elo-report.ts` | Engine Elo report rendering |
| `engine-tournament-report.ts` | Engine tournament report rendering |
| `engine-queue-status.ts` | CLI: engine queue status |
| `engine-tournament-status.ts` | CLI: engine tournament status |
| `enqueue-engine-games.ts` | CLI: enqueue engine games |
| `enqueue-engine-smoke.ts` | CLI: enqueue engine smoke |
| `enqueue-engine-tournament.ts` | CLI: enqueue engine tournament |
| `import-xiangqi-broadcast.ts` | CLI/helper for importing xiangqi broadcast fixture packs into Postgres, with optional `games/*.json` negative fixtures |
| `import-corpus.ts` | CLI: import FoW game corpus |
| `worker.ts` | Background worker entry point for async engine game execution |
| `feedback-notify.ts` | Email notification on feedback submission |
| `game-export.ts` | PGN/JSON export for `/api/games/:id/export.*` (Phase D, 2026-05-22) |
| `og-image.ts` | OG image rendering (default + per-game + per-article) |
| `obs.ts` | Structured-JSON logging helpers |
| `room-lifecycle-audit.ts` | Lifecycle audit/event helpers |
| `seat-auth.ts` | Seat-authority verification helpers shared by chess and non-chess room flows |
| `watch-channels.ts` | Public watch-channel definitions and lookup |
| `dark-chess-tenant.ts` | Dark chess `VariantTenant` (flagship rules + Model A visibility on the Layer-3 contract). UNREGISTERED for live rooms (legacy UUID rooms stay on `room-manager`); visibility DELEGATES to `payloads.ts` so Model A keeps one redaction point. Equivalence pinned by `dark-chess-tenant.test.ts` + `dark-chess-golden-wire.test.ts` |
| `dark-chess-golden-wire.test.ts` | Golden wire-parity suite pinning dark-chess tenant per-seat snapshot/event payloads vs the legacy live stack. Regenerate only for intentional wire changes (`MISTBOARD_GOLDEN_RECORD=1`) |
| `dark-chess-registration.ts` | Dark chess registry entry; fixes the `dchx_` correspondence room-id scheme. Correspondence (days-per-move) rooms ONLY, PvP-only, no rematch/lobby, gated by `MISTBOARD_CORRESPONDENCE_ENABLED`. Side-effect import in `variant-tenant/register-tenants.ts` |
| `crossroads-chess-registration.ts` | Crossroads Chess registry entry: live-room map, room-factory binding, hydration, rematch context (moved out of `index.ts` at the registry dispatch collapse); registers the type-erased dispatch closures |
| `dark-crossroads-chess-registration.ts` | Dark Crossroads Chess (6x8, hidden/dev-only) registry entry: live-room map, room-factory binding, hydration. No rematch/lobby/watch yet (lobby answers `dark_crossroads_chess_not_integrated`); deep-link PvP only, like the Dark Xiangqi launch |
| `dark-shogi-registration.ts` | Dark Shogi (9x9, hidden/dev-only) registry entry: live-room map, room-factory binding, hydration. No rematch/lobby/watch yet (lobby answers `dark_shogi_not_integrated`); deep-link PvP only |
| `dark-crazyhouse-registration.ts` | Dark Crazyhouse (chess+drops, hidden/dev-only) registry entry: live-room map, room-factory binding, hydration. No rematch/lobby/watch yet (lobby answers `dark_crazyhouse_not_integrated`); deep-link PvP only |
| `kriegspiel-registration.ts` | Kriegspiel registry entry: live-room map, room-factory binding, hydration, and watch channel metadata. No rematch/lobby yet (lobby answers `kriegspiel_not_integrated`); deep-link PvP only |
| `dark-mini-xiangqi-runtime.ts` | Dark Mini Xiangqi live-room type aliases over the generic `variant-tenant/` runtime (types-only — no legacy export names; ws/factory/engine/rematch/routes/registration/export/golden-wire call the generic `tenant*` functions directly) |
| `dark-mini-xiangqi-registration.ts` | DMX registry entry: live-room map, room-factory binding, hydration, rematch context; registers dispatch closures |
| `dark-mini-xiangqi-export.ts` | DMX JSON publication export (honest red/black, coordinate UCI moves; no PGN — xiangqi has no SAN standard) |
| `mini-xiangqi-tenant.ts` | Mini Xiangqi `VariantTenant`: open-information 7x7 mini xiangqi with public events, public board state, and checkmate/stalemate adjudication |
| `mini-xiangqi-registration.ts` | Mini Xiangqi registry entry: live-room map, room-factory binding, hydration, WebSocket runtime, HTTP create route, lobby route, and watch metadata |
| `drop-mini-xiangqi-tenant.ts` | Drop Mini Xiangqi `VariantTenant`: open-information 7x7 mini xiangqi with crazyhouse-style reserves, public events, public board state, and board/drop move parsing |
| `drop-mini-xiangqi-registration.ts` | Drop Mini Xiangqi registry entry: live-room map, room-factory binding, hydration, WebSocket runtime, HTTP create route, lobby route, and watch metadata |
| `fortress-xiangqi-tenant.ts` | Fortress Xiangqi `VariantTenant`: open-information 7x8 xiangqi with opposite-corner palaces, crazyhouse reserves, and the Treasure; public events + board state, board/drop move parsing, and a perpetual-check (`chasing`) upgrade wrapper over the kernel move log |
| `fortress-xiangqi-registration.ts` | Fortress Xiangqi registry entry: live-room map, room-factory binding, hydration, WebSocket runtime, HTTP create route, lobby route, and watch metadata |
| `dark-xiangqi-registration.ts` | Dark Xiangqi (9x10, hidden/dev-only) registry entry: live-room map, room-factory binding, hydration. No rematch/lobby (lobby answers `dark_xiangqi_not_integrated`) |
| `uci-engine-harness.ts` | Shared UCI subprocess harness for the in-process PvE move providers (FSF + PikaJieQi + the Misty Rust binaries): the concurrency `UciEnginePool`, the `runUciBestmove` spawn/parse/timeout/SIGKILL lifecycle, and the Fairy-Stockfish layer (`fairyStockfishPath`, `resolveFsfVariantIniPath`, `buildFairyStockfishCommands`, `fairyStockfishBestmove`). NOT the fog engine-worker path |
| `crossroads-chess-engine.ts` | Fairy-Stockfish move provider for perfect-info Crossroads Chess (loads `crossroads-chess.ini`, one FSF process/request via the shared `uci-engine-harness`); the open-mode opponent, NOT the fog engine-worker |
| `mini-xiangqi-engine.ts` | Fairy-Stockfish move provider for perfect-info Mini Xiangqi PvE: native `minixiangqi` UCI variant, calibrated tiers, driven through the shared `uci-engine-harness` (pool + spawn lifecycle) |
| `drop-mini-xiangqi-fsf-engine.ts` | Fairy-Stockfish move provider for perfect-info Drop Mini Xiangqi PvE: loads the custom `drop-mini-xiangqi.ini` variant via VariantPath, Skill+node tiers, driven through the shared `uci-engine-harness` |
| `fortress-xiangqi-fsf-engine.ts` | Fairy-Stockfish move provider for Fortress Xiangqi PvE: loads the custom `fortress-xiangqi.ini` variant via VariantPath with `chasingRule=axf`, Skill+node tiers, driven through the shared `uci-engine-harness` |
| `server-crossroads-chess-engine.ts` | Server-side FSF PvE loop for Crossroads Chess; injects engine moves through the same append+broadcast path as humans so clocks/persistence/reconnect/review stay event-sourced |
| `server-mini-xiangqi-engine.ts` | Server-side Mini Xiangqi PvE loop: schedules Fairy-Stockfish moves through the tenant append/broadcast path with clock-aware movetime caps |
| `server-drop-mini-xiangqi-engine.ts` | Server-side Drop Mini Xiangqi PvE loop: schedules Fairy-Stockfish moves (via `drop-mini-xiangqi-fsf-engine.ts`) through the tenant append/broadcast path, with drop-aware UCI translation and clock-aware movetime caps |
| `server-fortress-xiangqi-engine.ts` | Server-side Fortress Xiangqi PvE loop: schedules Fairy-Stockfish moves (via `fortress-xiangqi-fsf-engine.ts`) through the tenant append/broadcast path, with drop-aware UCI translation and clock-aware movetime caps |
| `server-crossroads-chess-live-room.ts` | Live Crossroads Chess client/room type leaf, shared by the ws handler + rematch module to avoid an import cycle |
| `server-crossroads-chess-rematch.ts` | Adapter over `variant-tenant/rematch.ts` for Crossroads Chess: bridges the pre-migration createRoom(timeControl) context to the generic createRoom(timeControl, rated) signature (`asTenantCrossroadsChessRematchContext`) |
| `server-crossroads-chess-room-factory.ts` | Thin adapter over `variant-tenant/room-factory.ts` for Crossroads Chess (running-game record on PvE only) |
| `server-ws-crossroads-chess.ts` | Thin adapter over `variant-tenant/ws.ts` for Crossroads Chess; binds the in-process FSF scheduler into post-connect/post-move hooks; roomMode/pveEngineId ride `snapshotExtras` (golden-pinned) |
| `server-dark-mini-xiangqi-engine.ts` | Server-side DMX PvE engine-move loop; builds the redacted request via `engine-protocol/build-mini-xiangqi.ts`, calls the internal-engine HTTP client, injects through `appendDarkMiniXiangqiEvent` |
| `server-dark-xiangqi-engine.ts` | Full Dark Xiangqi PvE engine-move loop; builds the 9x10 redacted request via `engine-protocol/build-xiangqi.ts`, calls the internal-engine HTTP client, validates/falls back to true legal moves, and injects through the tenant event writer. |
| `server-dark-mini-xiangqi-live-room.ts` | Live DMX client/room type leaf shared by the ws handler + rematch module (avoids import cycle) |
| `server-dark-mini-xiangqi-rematch.ts` | Adapter over `variant-tenant/rematch.ts` for DMX (mutual-confirm offers, swapped-color finalize, redirect replay) |
| `server-dark-mini-xiangqi-room-factory.ts` | Thin adapter over `variant-tenant/room-factory.ts` for DMX (injected cross-variant id-collision check) |
| `server-ws-dark-mini-xiangqi.ts` | Thin adapter over `variant-tenant/ws.ts` for DMX; binds the DMX PvE scheduler into post-connect/post-move hooks |
| `variant-tenant/tenant.ts` | The `VariantTenant` Layer-3 contract: rules = the type boundary, `TenantGameStateLike` the structural state slice; per-seat redaction is tenant policy |
| `variant-tenant/runtime.ts` | Generic event-sourced live-room runtime over a tenant: event model, projection replay, clock math, event-log validation, per-seat snapshot payload (wire-parity pinned per tenant by golden fixtures) |
| `variant-tenant/ws.ts` | Generic tenant WebSocket runtime: `createTenantWsRuntime(tenant)` binds writer/lifecycle/broadcast/connection+message handling into one per-tenant bundle; per-seat redaction via tenant hooks |
| `variant-tenant/events.ts` | Generic tenant event writer: persistence-first append serialized through `pendingWrites`, lifecycle re-arm, engine-reservation release on game end, terminal GameSummary build |
| `variant-tenant/lifecycle.ts` | Generic tenant lifecycle timers (pregame abort, active-clock expiry, disconnect forfeit); all speculative + `.unref()`'d; correspondence rooms arm NO in-memory timers |
| `variant-tenant/seat-session.ts` | Generic tenant seat assignment + seat-token lifecycle (mint/hash, reconnect by token-hash or account id, newer-connection displacement) |
| `variant-tenant/room-factory.ts` | Generic tenant live-room creation: id minting with cross-variant collision retry, optional PvE engine seating (durable in initial event log), persistence-first writes |
| `variant-tenant/rooms-route.ts` | Generic `POST /api/rooms` create-route factory (`createTenantRoomsRoute`): fail-closed game-spec + launch-flag gate, mode/rated/engine-id surface gate, PvE seat resolution, persistence/drain guards, 201 envelope. Backs 12 `routes/<variant>-rooms.ts` handlers (banqi, jieqi, jungle(-flip), kriegspiel, dark-shogi, dark-crazyhouse, dark-crossroads-chess, reveal-chess, fortress/mini/drop-mini xiangqi). NOT reservation tenants (dark-xiangqi/DMX), crossroads-chess, or correspondence. |
| `variant-tenant/rematch.ts` | Generic mutual-confirm rematch over tenant rooms: color-swapped new room, pre-issued seat tokens, `pendingRedirects` keyed by old-room seat |
| `variant-tenant/hydration.ts` | Generic get-or-load for tenant rooms: live-map first, else hydrate persisted event log (validated vs tenant schema) + re-attach seat tokens |
| `variant-tenant/registry.ts` | `VariantTenant` registry — variant-type-erased routing (kind/gameSpecId/roomIdPrefix/flag + bound closures); the dispatch extension point for `index.ts` sweeps, ws runtime resolver, `/api/rooms` create, `/api/lobby` matcher |
| `variant-tenant/register-tenants.ts` | The single side-effect import that populates the registry (imports each `*-registration.ts`). Adding a variant = adding its registration import here |
| `variant-tenant/deadline-sweeper.ts` | Interval sweeper for durable correspondence deadlines: lists due `room_deadlines` rows, routes each to its tenant's `sweepDueDeadline`, which re-derives the deadline from the hydrated room before acting |
| `correspondence-deadline-warning.ts` | Correspondence deadline-warning email: decides whether a game's warning lead is reached, sends via the shared Resend helper, marks the row to send once per deadline |
| `send-email.ts` | Shared Resend transactional-email sender — the single wire call to the email provider (auth codes, feedback, engine alerts, correspondence nudges). Never logs (API key must not leak); policy stays caller-owned |
| `persistence-room-deadlines.ts` | `room_deadlines` persistence: durable index for correspondence deadline enforcement (upsert per event, delete on terminal); the event log stays source of truth |
| `persistence-correspondence-seeks.ts` | `correspondence_seeks` persistence: the open async-seek board; per-user cap via `countOpenSeeksForUser` |
| `persistence-engine-jobs.ts` | Live-engine move work-queue (Postgres): enqueue+await on the server, `FOR UPDATE SKIP LOCKED` claim on engine-worker replicas with soft affinity. NOT yet wired (lands behind a flag) |
| `persistence-engine-seats.ts` | Centralized live-engine seat accounting (Postgres) across an elastic worker fleet; the multi-replica replacement for the in-memory reservation store. NOT yet wired (flag-gated later) |
| `accounts-count.ts` | CLI: count accounts (total + new in last 7/30d) |
| `accounts-list.ts` | CLI: list accounts (id/email/created_at) |
| `article-meta.ts` | Server-side article slug → page meta (title/description/kind) for share cards + canonical URL space; kept in sync with `articles-data.ts` via a web test |
| `auth-rate-limit.ts` | In-memory per-key sliding-window rate limiter for auth endpoints (persistence-free defense-in-depth); re-exports `clientIpForRateLimit` from `server-policy.ts` |
| `engine-paths.ts` | Single source of truth for resolving the private `mistboard-engine` repo paths from the public server (`MISTBOARD_ENGINE_DIR` env, else `../mistboard-engine` sibling) |
| `dev-decision-log-artifacts.ts` | Local-dev bridge that reshapes live-engine decision-log JSONL into review artifact summaries/payloads when persistence is disabled; gated by `FOW_DECISION_LOG_DIR` or the engine repo's `lab/decision_log/` |
| `engine-alert-email-cli.ts` | CLI: send/preview a synthetic engine alert email |
| `dev-engine-service.ts` | Dev-only entrypoint: run JUST the internal engine HTTP service locally (no Postgres, no worker loop) for live PvE |
| `finished-game-cache.ts` | `FinishedGameCache` — memoizes immutable derivations of FINISHED games (replay logs, postgame projections); LRU + TTL; never caches running games |
| `corpus-ingest.ts` | Shared JSONL event-log ingest helpers (replay + game-summary/attribution) used by `import-corpus.ts` and `import-bakeoff-run.ts`; DB-free and testable |
| `import-bakeoff-run.ts` | CLI: import a bakeoff run dir into Postgres with per-game engine attribution from shard metadata (platform-format artifacts only; engine internals never read) |
| `server-event-loop-lag.ts` | Server-side event-loop lag (mean since last read) surfaced as the "SERVER" value in the account connection footer / `/api/ping` |
| `engine-protocol/build-mini-xiangqi.ts` | DMX engine request builder — THE REDACTION BOUNDARY for the 7×7 variant (mini geometry/piece letters, `shrouded` color-only channel, red/black→white/black protocol mapping). Sibling of `engine-protocol/build.ts` |
| `engine-protocol/build-xiangqi.ts` | Full Dark Xiangqi engine request builder -- 9x10 redaction boundary, red/black to white/black protocol mapping, and legal-move/view transcript projection for `python-fdx-v1.0`. |
| `jieqi-tenant.ts` | Jieqi (揭棋, full-board xiangqi with hidden piece identities) `VariantTenant`: NOT a fog tenant — every occupied square is public, only piece IDENTITY is hidden. Guards it in two places: the per-game DEAL is a crypto-RNG server secret stripped by `clientEventFor` before any client sees the room-created event, and face-down pieces are redacted in the player view (capture-reveal is capturer-only). Sibling of `banqi-tenant.ts`/`reveal-chess-tenant.ts` |
| `jieqi-runtime.ts` | Jieqi live-room type aliases over the generic `variant-tenant/` runtime (types-only — no legacy export names; ws/factory/routes/registration call the generic `tenant*` functions directly) |
| `jieqi-registration.ts` | Jieqi registry entry (live-room map, room-factory binding, hydration); side-effect import in `variant-tenant/register-tenants.ts` |
| `jieqi-fen.ts` | Jieqi UCI FEN encoder — THE REDACTION BOUNDARY for the PikaJieQi engine; a dark piece's COLOUR is known and only its role is hidden (the key contrast with banqi, which hides ink too). Sibling of `banqi-fen.ts` |
| `jieqi-engine.ts` | PikaJieQi move provider for Jieqi PvE (Pikafish jieqi fork, Tier-B UCI subprocess via the shared `uci-engine-harness`, one process per request, NOT the fog engine-worker); fed a redacted FEN from `jieqi-fen.ts` |
| `server-jieqi-engine.ts` | Server-side PikaJieQi PvE loop; injects engine moves through the same append+broadcast path as humans so clocks/persistence/reconnect/review stay event-sourced |
| `server-jieqi-room-factory.ts` | Thin adapter over `variant-tenant/room-factory.ts` for jieqi (PvP + Tier-B engine seat; no running-game record) |
| `server-ws-jieqi.ts` | Jieqi WebSocket handler — thin adapter over `variant-tenant/ws.ts`; positions are public so no fog wiring; the PikaJieQi scheduler rides the post-connect/post-move hook |
| `banqi-tenant.ts` | Banqi (半棋, 8×4 Chinese Dark Chess) `VariantTenant`: symmetric-information — every occupied square is public (face-down or revealed) and a face-down tile carries NO ink/identity to either seat. The only hidden state is the DEAL: a crypto-RNG server secret stripped by `clientEventFor`; the masked board comes from `getBanqiPlayerView`. Seat = move-order (`first`/`second`); ink binds on the opening flip |
| `banqi-runtime.ts` | Banqi live-room type aliases over the generic `variant-tenant/` runtime (types-only). Tenant `C` = seat (`BanqiSeat`), not ink (`BanqiColor`) |
| `banqi-registration.ts` | Banqi registry entry (live-room map, room-factory binding, hydration). PvP + PvE; no rematch/lobby yet (lobby answers `banqi_not_integrated`). Side-effect import in `variant-tenant/register-tenants.ts` |
| `banqi-fen.ts` | Banqi UCI FEN encoder — THE REDACTION BOUNDARY for the MistyBanqi engine; a face-down tile encodes as `X` with NO colour (banqi hides ink too, unlike jieqi). Sibling of `jieqi-fen.ts` |
| `banqi-first-color.ts` | Recovers a finished banqi game's bound `firstColor` (ink) by replaying the event log, since results are stored by seat not ink; per-room cache for the polled watch feed |
| `banqi-engine.ts` | MistyBanqi move provider for Banqi PvE: our own `banqi-engine` Rust αβ+Star1+TT UCI subprocess (Tier-B via the shared `uci-engine-harness`, one process per request, NOT the fog engine-worker); fed a redacted current-position FEN from `banqi-fen.ts` |
| `server-banqi-engine.ts` | Server-side MistyBanqi PvE loop; injects engine moves through the shared append+broadcast path. Mirrors `server-jieqi-engine.ts` |
| `server-banqi-room-factory.ts` | Thin adapter over `variant-tenant/room-factory.ts` for banqi (PvP + Tier-B engine seat; no running-game record) |
| `server-ws-banqi.ts` | Banqi WebSocket handler — thin adapter over `variant-tenant/ws.ts` (positions public, so no fog wiring); the Tier-B MistyBanqi scheduler rides the post-connect/post-move hook |
| `reveal-chess-tenant.ts` | Reveal Chess (chess-jieqi, "hidden Fischer Random" — standard 8×8 chess with hidden piece identities) `VariantTenant`: NOT a fog tenant; identity is the only hidden axis. Per-game DEAL is a crypto-RNG server secret stripped by `clientEventFor`; face-down pieces redacted in the player view. FLAG-OFF in prod. Sibling of `jieqi-tenant.ts` |
| `reveal-chess-runtime.ts` | Reveal Chess live-room type aliases over the generic `variant-tenant/` runtime (types-only) |
| `reveal-chess-registration.ts` | Reveal Chess registry entry (live-room map, room-factory binding, hydration); side-effect import in `variant-tenant/register-tenants.ts` |
| `server-reveal-chess-room-factory.ts` | Thin adapter over `variant-tenant/room-factory.ts` for Reveal Chess (PvP; no PvE engine yet) |
| `server-ws-reveal-chess.ts` | Reveal Chess WebSocket handler — thin adapter over `variant-tenant/ws.ts` (positions public, identity hidden; no fog wiring) |
| `jungle-tenant.ts` | Jungle (斗兽棋, perfect-information 7×9 Dou Shou Qi) `VariantTenant`: NO hidden state — positions + moves public, wire events pass through, `viewForClient` is the open board. The simplest tenant (no redaction). PvP + in-process PvE |
| `jungle-runtime.ts` | Jungle live-room type aliases over the generic `variant-tenant/` runtime (types-only). `C` = colour/seat (red moves first, owns the red animals — seat == ink, no flip) |
| `jungle-registration.ts` | Jungle registry entry (live-room map, room-factory binding, hydration); PvP + PvE; side-effect import in `variant-tenant/register-tenants.ts` |
| `server-jungle-room-factory.ts` | Thin adapter over `variant-tenant/room-factory.ts` for Jungle (PvP + in-process engine seat; no running-game record) |
| `server-ws-jungle.ts` | Jungle WebSocket handler — thin adapter over `variant-tenant/ws.ts` (perfect-info, no fog); the in-process Misty Jungle scheduler rides the post-connect/post-move hook |
| `server-jungle-engine.ts` | In-process Misty Jungle PvE: depth-limited alpha-beta over the rules kernel (3 levels, no Python/FSF — Jungle is perfect-information); injects moves through the shared append+broadcast path. Mirrors `server-drop-mini-xiangqi-engine.ts` |
| `jungle-engine.ts` | MistyJungle move provider (the Rust engine) for Jungle PvE: drives our own `jungle-engine` UCI binary (via the shared `uci-engine-harness`) on a plain full-board FEN (`jungle-fen.ts`, no redaction — Jungle is perfect-information), one process per request. Behind the `misty-jungle-level-*` ids; replaces the in-process TS αβ (`server-jungle-engine.ts`) only when `MISTBOARD_JUNGLE_RUST_ENGINE` is on AND the binary is present. Strength = node budget; wins by fastest win-distance |
| `jungle-fen.ts` | FEN bridge between canonical Jungle state and the `jungle-engine` Rust binary. NO redaction (perfect-information): full board as `<board> <turn> <progressClock> <moveNumber>`, ranks HIGH→LOW, roles `R C D W P T L E` (P = leoPard) matching `JUNGLE_ROLE_LETTER`. Parity pinned by `jungle-fen.test.ts` |
| `jungle-flip-tenant.ts` | Flip Jungle (兽棋/翻翻棋, 4×4 flip animal chess) `VariantTenant`: symmetric hidden-identity like banqi — face-down tiles carry no ink/identity; the only hidden state is the DEAL (crypto-RNG secret stripped by `clientEventFor`); masked board from `getJungleFlipPlayerView`. Seat = move order, ink binds on the first flip. Equal-rank = 同归于尽 mutual destruction. Sibling of `banqi-tenant.ts` |
| `jungle-flip-runtime.ts` | Flip Jungle live-room type aliases over the generic `variant-tenant/` runtime (types-only). `C` = seat, not ink |
| `jungle-flip-registration.ts` | Flip Jungle registry entry (live-room map, room-factory binding, hydration); PvP + PvE (Tier-B MistyJungleFlip UCI engine); side-effect import in `variant-tenant/register-tenants.ts` |
| `server-jungle-flip-room-factory.ts` | Thin adapter over `variant-tenant/room-factory.ts` for Flip Jungle (PvP + Tier-B engine seat; the per-game deal is minted by the tenant's `createSetup`) |
| `server-ws-jungle-flip.ts` | Flip Jungle WebSocket handler — thin adapter over `variant-tenant/ws.ts` (symmetric info, no fog); the Tier-B MistyJungleFlip scheduler rides the post-connect/post-move hook |
| `jungle-flip-fen.ts` | Flip Jungle UCI FEN encoder — THE REDACTION BOUNDARY for the MistyJungleFlip engine; a face-down tile encodes as `X` with NO colour (hides ink too, like banqi), pool carries only public per-(ink,role) counts. Sibling of `banqi-fen.ts` with 4 files + the 8 animal ranks |
| `jungle-flip-engine.ts` | MistyJungleFlip move provider for Flip Jungle PvE: our own `jungle-flip-engine` Rust αβ+Star1+TT UCI subprocess (Tier-B via the shared `uci-engine-harness`, one process per request, NOT the fog engine-worker); fed a redacted current-position FEN from `jungle-flip-fen.ts`. One versioned bot |
| `server-jungle-flip-engine.ts` | Server-side MistyJungleFlip PvE loop; injects engine moves through the shared append+broadcast path, fails closed (resign) on a kernel-rejected move. Mirrors `server-banqi-engine.ts` |
| `routes/jieqi-rooms.ts` | POST `/api/rooms` jieqi branch (time-control gating, engine-id parsing); binds the tenant room factory. Factory-bound (`variant-tenant/rooms-route.ts`) |
| `routes/jieqi-games.ts` | Jieqi postgame/review API branch; keeps non-chess finished games out of generic chess replay APIs |
| `routes/banqi-rooms.ts` | POST `/api/rooms` banqi branch (time-control gating; `preferredColor` selects the move-order seat). Factory-bound (`variant-tenant/rooms-route.ts`) |
| `routes/banqi-games.ts` | Banqi postgame/review API branch (single public truth surface; keeps non-chess records out of generic chess replay APIs) |
| `routes/jungle-rooms.ts` | POST `/api/rooms` Jungle branch (PvP + PvE engine-seat assignment opposite the human; `jungleEnabled` flag). Factory-bound (`variant-tenant/rooms-route.ts`) |
| `routes/jungle-games.ts` | Jungle postgame/review API branch; exposes the finished perfect-information board history and move timeline |
| `routes/jungle-flip-rooms.ts` | POST `/api/rooms` Flip Jungle branch (PvP + PvE engine-seat assignment opposite the human; `jungleFlipEnabled` flag). Factory-bound (`variant-tenant/rooms-route.ts`) |
| `routes/jungle-flip-games.ts` | Flip Jungle postgame/review API branch; exposes the as-played masked replay plus revealed spoiler history for symmetric hidden-identity games |
| `routes/reveal-chess-rooms.ts` | POST `/api/rooms` Reveal Chess branch (`revealChessEnabled` flag). Factory-bound (`variant-tenant/rooms-route.ts`) |
| `routes/reveal-chess-games.ts` | Reveal Chess postgame/review API branch |
| `routes/correspondence-seeks.ts` | Correspondence open-seek board API (post/join/list days-per-move dark-chess seeks); account-gated, `correspondenceEnabled` flag; backed by `persistence-correspondence-seeks.ts` (per-user cap). Accept pre-seats both players via the live seat-assigned path |
| `engines/builtin/capture-seeker.ts` | Builtin capture-seeking engine: greedy piece-value capture heuristic (EvE smoke + calibration baseline) |
| `engines/builtin/random-legal.ts` | Builtin random-legal engine: deterministic random legal move baseline for EvE smoke + calibration |
| `scripts/*.ts` (under `apps/server/src/scripts/`) | One-off server-side generators (`generate-default-og`, `generate-bicolor-screenshot`, `mini-xiangqi-sim`). Excluded from the INDEX coverage gate (generator dir) |

## apps/server/integration/ — Two-client WebSocket integration tests

| File | Owns |
|------|------|
| `harness.ts` | `startTestServer({seatVacateGraceMs})`, `connectClient({url, room, seatToken})`, `TestClient` with `waitFor` / `expectMessage`, `waitUntil`, `sleep`, `uniqueRoomId` |
| `core-loop.test.ts` | 9 scenarios: resign+winner, rematch round-trip, redirect replay on reconnect, pregame grace (in/out), presence, seat-token reseat, one-sided offer, move broadcast |
| `drain.test.ts` | Drain endpoint + WS-broadcast tests |
| `loadtest-smoke.test.ts` | Builtin-engine load smoke |
| `persist-resign.test.ts` | Postgres-on resign-termination integration test |

Run with `MISTBOARD_ALLOW_IN_MEMORY_PERSISTENCE=true npm run test:integration --workspace @mistboard/server`. Narrow a run with `-- --test-name-pattern=<name>` or a file path such as `-- integration/drain.test.ts`; `apps/server/scripts/integration-tests.mjs` forwards test-runner flags before files so filters do not accidentally run the slow loadtest smoke. Persistence is intentionally disabled for the in-memory contract; `persist-resign` requires `TEST_DATABASE_URL`.

**Change move validation or game flow** → `room-manager.ts`
**Change room creation, hydration, abandon, or stale-room sweeps** → `server-room-lifecycle.ts`
**Change HTTP entry routing or static fallback** → `server-http.ts`
**Change WebSocket connection or message handling** → `server-ws-connection.ts` + `server-ws-messages.ts`
**Change server shutdown or test teardown** → `server-lifecycle.ts` + `index.ts` orchestration
**Change HTTP API routing** → relevant `routes/*.ts` module (dispatcher in `http-api.ts` rarely needs touching unless adding a new route module)
**Add a new HTTP route** → either add to an existing `routes/*.ts` module or create a new one with `tryHandle()` + register it in `http-api.ts`'s `routes` array (order matters for overlapping patterns)
**Change account/session/email auth** → `account-session.ts`
**Change seat token auth or seat assignment** → `server-seat-session.ts` + `seat-auth.ts`
**Change live engine seat reservation plumbing** → `server-live-engine-reservations.ts` + `internal-engine-client.ts`
**Change persistence pool lifecycle** → `persistence-db.ts`
**Change room seat token persistence** → `persistence-seat-tokens.ts`
**Change persistence queries** → focused `persistence-*.ts` module first, otherwise `persistence.ts`
**Change clock logic** → `clocks.ts` (game pkg) + `room-manager.ts` (`scheduleClockTimeout`, `expireActiveClock`)
**Change snapshot/fog payload** → `payloads.ts`
**Change access control** → `server-policy.ts`
**Add/rename a top-level client route** → `apps/web/src/main.ts` + `server-policy.ts` (`isClientRoute` parity test will fail otherwise)

## apps/web/src/ — Browser client (vanilla TypeScript, no framework)

| File | Owns |
|------|------|
| `main.ts` | Entry point — URL routing to page modules via dynamic import; mounts theme + nav + restart banner + analytics |
| `live.ts` | Live-game page bootstrap — wires `live-state`, `live-socket`, `live-render`, and `live-view` for `/room/:id` |
| `app-base.css` | Global site/board/fog tokens plus page-base primitives loaded before shared styles by both `main.ts` and `live.ts` |
| `board-fog.css` | Fog theme rendering rules, including Mistveil tile URL mapping and hidden-square background behavior |
| `styles.css` | Global sheet loaded on every page via `main.ts`: board rendering + piece sets + captures, the replay triptych (`.replay-pane`/`.replay-board`/`.replay-*-header`), landing CTA/games, and the variant-overridden chrome kept global for cascade order (`.move-*`, `.panel-section`, `.replay-controls`, `.replay-meta`). Live-room/postgame/watch-only chrome carved out to `game-shell.css` (T2) so non-game routes stop shipping it |
| `game-shell.css` | Live-room / postgame / replay / watch chrome carved out of `styles.css` (T2): side/meta/moves panels, clocks, game controls, room actions, draft picker, starts, action/info notices, confirm dialog, presence dots, debug shell. Kept out of the global entry sheet; imported from game leaf chunks + blocker-free hubs (`variant-tenant/room-chrome.ts`, `replay-board.ts`, `replay-moves-panel.ts`, `live.ts`, `replay.ts`, legacy postgame). Has no class any variant sheet overrides, so load order is safe |
| `live-state.ts` | Live-game module state (`liveState`, seat-token storage, WS base URL resolver) |
| `live-socket.ts` | Chess/DMX liveState shell socket — thin frame-application adapter over `variant-tenant/socket-client.ts` (which owns connect/reconnect/resync); projects state frames into `liveState`, the rematch declined-vs-cancelled cue, and per-variant sound dispatch |
| `variant-tenant/` | Generic tenant web runtime: `live-client.ts` (the live-room client CORE — state container, frame application, bootstrap sequence, renderAll skeleton, fog-safe/perfect-info replay-capture policies, two-column move list; per-variant board render/interaction/sounds ride config hooks + setup(ctx); Jungle is the reference tenant; `live-client.test.ts` pins it through a fake socket), `socket-client.ts` (tenant socket host — connection state machine, backoff reconnects, seat-token hand-off, seq-gap resync; the single connection state machine for every live surface — the self-contained tenant clients and, since the P2 web convergence, the chess/DMX `live-socket.ts` shell, which is now a thin frame-application adapter over it), `room-chrome.ts` (clocks/countdowns/action status/room actions over a `WebVariantTenant` + lazy state accessors), `replay-controller.ts` (index-based fog-safe replay scrubber; capture stays tenant-owned), `chrome-dom.ts` (element factories). DMX is the chrome reference tenant; Crossroads is the socket-client reference tenant. |
| `live-render.ts` | Live-game render orchestration: board and draft picker. Reads board helpers from `live-board.ts`, capture rows from `live-captures.ts`, clock rendering from `live-clocks.ts`, dev-view rendering from `live-dev-views.ts`, game controls from `live-game-controls.ts`, room actions from `live-room-actions.ts`, replay/move-list rendering from `live-move-list.ts`, replay state via accessors from `live-replay.ts`, and derived views from `live-view.ts`. Layout shell is in `live-layout.ts`; sound subsystem is in `live-sound.ts`. |
| `live-board.ts` | Live-game board adapter helpers: fog highlight classes, result classes, legal destination maps, castling aliases, and square file helpers |
| `live-captures.ts` | Live-game capture strip rows and chessground-styled captured-piece DOM helpers |
| `live-clocks.ts` | Live-game clock UI: pregame time-control display, player clock rows, active-clock flash state, and 100ms timer refresh |
| `live-dev-views.ts` | Live-game debug view cards: player/opponent/true mini-boards, fog masking, and dev capture panels |
| `live-game-controls.ts` | Live-game abort/resign controls, disconnect countdown labels, and confirmation dialog UI |
| `live-layout.ts` | Live-game static DOM shell and `LiveRefs` query wiring for `/room/:id` |
| `live-move-list.ts` | Live-game replay controls and move-list rendering: masked/revealed move rows, active ply tracking, and auto-scroll state |
| `live-room-actions.ts` | Live-game invite/review/rematch/play-again action row, debug-room link generation, and post-game action visibility |
| `live-status.ts` | Live-game status copy and tone decisions: action banners, board status, room mode label, and seat label |
| `live-view.ts` | Derived live-game views: current replay projection, fog-history view selection, capture tally, and dev-view reconstruction |
| `live-sound.ts` | SoundController + `maybePlaySnapshotSound` + per-move sound policy. Owns the audio context, volume tracking, win/lose/capture/castle tone generation. Wired by live-render's render flow + live.ts's snapshot handler |
| `live-replay.ts` | Replay-of-live navigation. Owns `replayIndex` + `fogViewHistory` + 4 fog tracking vars. Exports state accessors (`getReplayIndex`, `getFogViewHistory`, `isLive`, `currentReplayIndex`, `fogLivePos`, `snapshotToPly`), DOM labels (`replayMetaLabel`, `replayControlDisabled`), and the navigation entry points (`handleReplayButtonClick`, `handleReplayKeyboard`, `handleMoveListClick`, `captureFogView`, `resetReplayState`). `initReplay({onStateChange})` injects the render-trigger callback so the dep is one-way (live-render → live-replay) |
| `landing.ts` | Mounts for landing / game / contact. Owns homepage replay wiring, public game review shell, and contact route handoff. Shell, game-display, shared game metadata, homepage showcase data, announcement panel helpers, play/setup/lobby flows, and watch route ownership have moved out, so route modules no longer import from landing. Loads `landing-play.css`, `landing.css`, and `game-route.css` in cascade order |
| `landing.css` | Homepage route layout and replay embed styles loaded by `landing.ts` |
| `game-route.css` | Public game-review route styles loaded by `landing.ts`, including replay review layout, analysis panel sizing, and export links |
| `landing-announcements.ts` | Landing announcement panel/card renderer: announcement ordering, article thumbnail lookup, kind/date labels, and CTA labels. Loads `landing-announcements.css` |
| `landing-announcements.css` | Landing announcement panel/card styles loaded by `landing-announcements.ts` |
| `landing-forum-preview.ts` | Homepage forum preview widget: hydrates recent active forum topics into a shared `site-box` panel and links to `/forum`, topic routes, and latest posts. Loads `landing-forum-preview.css` |
| `landing-play.ts` | Homepage play panel, setup dialog, open-lobby request card, room creation, lobby queue polling, empty-lobby engine offer, and play deep-link handling |
| `landing-play.css` | Homepage play/setup/lobby base styles loaded before `landing.css`, so homepage responsive layout overrides stay in the route stylesheet |
| `puzzles.ts` | `/puzzles` route: Mini and Drop Mini Xiangqi puzzle list/detail UI, drag/click solving, attempt submission, solved-state storage, and auto-next controls |
| `home-puzzle-widget.ts` | Homepage daily-puzzle widget: renders the server-selected daily Mini/Drop Mini Xiangqi puzzle as a small interactive board on the landing page |
| `landing-showcase.ts` | Homepage replay showcase catalog and hero POV selection for the landing replay loop |
| `watch-route.ts` | `/watch` route mount: watch feed fetch/polling, replay mounting, status/empty state, channel links, and replay queue rendering. Loads `watch-route.css` |
| `watch-route.css` | `/watch` route styles, including watch replay sizing, status, channel links, empty state, queue, and responsive route layout |
| `site-shell.ts` | Shared site chrome: `buildNav`, `buildFooter`, `buildLoadingState`, `buildNotice`, `fetchCurrentUser`, and `GITHUB_URL`. Loads `site-shell.css` |
| `site-shell.css` | Shared site chrome styles for nav, mobile nav collapse, loading state, and footer; also loaded by live/learn routes that render site chrome directly |
| `game-display.ts` | Shared game display contracts and formatters: `FeaturedGame`, `GameParticipant`, `displayParticipantName`, participant lookup, source labels, and known engine display names |
| `game-meta.ts` | Shared `GameMeta` builder for replay surfaces, including participant rating deltas and public game review URL selection |
| `variants.ts` | Current web-visible variant/game-spec list and leaderboard API mapping |
| `feature-flags.ts` | Build-time gates for hidden/prelaunch client surfaces |
| `rated-flag.ts` | Client mirror of `/api/server-status` rated-mode switch |
| `public-assets.ts` | Public build asset filter used by `vite.config.ts` to keep local bakeoff and pixel-lab artifacts out of ordinary web builds |
| `account.ts` | `/account` + `/account/settings` mounts. Sign-in/registration form (email + magic code), signed-in account card, settings form (display name / handle / email), auth-tabs. Uses `site-shell.ts` for shared chrome/auth fetch and loads `account-profile.css` |
| `profile.ts` | `/@/:handle` + `/leaderboard` mounts. `mountProfile`, `mountLeaderboard`, `renderLeaderboardShellForPrerender` (build-time frame for dist/leaderboard.html), profile header/ratings/games builders, leaderboard panel + table. Uses `site-shell.ts` and `game-display.ts` for shared contracts and loads `account-profile.css` |
| `account-profile.css` | Account, profile, and leaderboard route styles loaded by `account.ts` and `profile.ts` |
| `user-card.ts` | Reusable hover user-card (`buildUserCard`, `attachUserCard`): compact profile summary (ratings grid + Follow/Message + games/joined) fed by `/api/users/:handle/profile`, shown as a shared singleton popover. Consumed by the friends-online widget + leaderboard online list. Loads `user-card.css` |
| `user-card.css` | Hover user-card styles (site design tokens; themes light/dark) |
| `friends-online.ts` | Global bottom-corner friends-online widget (`mountFriendsOnline`, lichess parity): collapsed pill → expandable list of online followed players, each row hovering into `user-card.ts`. Behind `friendsOnlineEnabled()`; polls `/api/relations/online-following` while visible. Loads `friends-online.css` |
| `friends-online.css` | Friends-online widget styles |
| `community-rail.ts` | Shared community sub-nav rail + column layout (`buildCommunityRail`, `buildCommunityLayout`) used by `/leaderboard` and `/bots`. Loads `community-rail.css` |
| `community-rail.css` | Community rail + `.community-layout` grid styles (desktop rail, mobile pill row) loaded by `community-rail.ts` |
| `pages-static.ts` | `/about` + `/source` + `/faq` + `/terms` + `/articles` (index + slug) + 404 mounts. Builders for about/source/faq/terms/notfound + shared text primitives (`aboutSubheading`/`aboutParagraph`/`aboutLink`/`aboutExternalLink`, `sourceBlock`/`textLine`/`linkLine`). Uses `site-shell.ts` for shared chrome and loads `pages-static.css` |
| `pages-static.css` | Static about/source page helper styles loaded by `pages-static.ts` |
| `forum.ts` | `/forum`, category, topic, post redirect, and admin report routes: category/topic/search views, write/preview composers, edit/quote/report controls, admin move/pin/lock/hide/report queue actions. Loads `forum.css` |
| `contact.ts` | `buildContact` — `/contact` form builder (anon vs signed-in lanes, honeypot, submit/error states). Mounted by `landing.ts` (mountContact is 15 lines, uses buildNav/Footer) and loads `contact.css` |
| `contact.css` | `/contact` form styles loaded by `contact.ts` |
| `confirm-dialog.ts` | Shared confirmation dialog primitive for irreversible/important user actions |
| `review.ts` | Game-review data plumbing for `/game/:id`: `loadGameForReview`, `fetchGameReview`, `fetchGameArtifacts`, `fetchTraceArtifacts`, belief/trace row converters, `enginePanelsForReview`. Owns the engine-artifact panel hydration |
| `replay.ts` | Replay viewer: `mountReplay` closure and replay state orchestration. Wall-clock loop timing helpers live in `replay-wall-clock.ts`; replay move-list panel UI lives in `replay-moves-panel.ts`; game metadata/header UI lives in `replay-meta.ts`; replay clock panel rendering lives in `replay-clocks.ts`; board/pane adapters live in `replay-board.ts`; engine review panel/toggle UI lives in `replay-engine-panels.ts`; annotation panel/form UI lives in `replay-annotations.ts`; per-move autoplay pacing math lives in `replay-playback.ts`; belief/annotation CSS lives in `replay-analysis.css`. |
| `replay-analysis.css` | Replay belief inspector and annotation panel styles loaded by `replay.ts` |
| `replay-annotations.ts` | Replay annotation helpers: `AnnotationConfig`, annotation panel shell, save/edit form state, picked-square input, sorted note list rendering, jump/edit/delete actions |
| `replay-board.ts` | Replay board/pane helpers: pane DOM shell, capture-strip rendering, chessground mount/update adapters, board click-to-square math, and king-capture reveal projection |
| `replay-clocks.ts` | Replay clock panel helpers: clock row creation, compact spacers, player-name labels, clock/thinking progress rendering, and replay display-time lookup |
| `replay-engine-panels.ts` | Replay analysis/engine panel helpers: analysis tool toggle bar, `EngineReviewPanels` type, engine review dock tabs/body, URL-selected panel state, and panel metadata labels |
| `replay-meta.ts` | Replay game metadata/header helpers: `GameMeta` type, header strip, metadata panel, share button, result/end/time labels |
| `replay-moves-panel.ts` | Replay side-panel move controls/list: first/prev/next/last buttons, algebraic move rows, active-ply jump handling, and active-row scrolling |
| `replay-playback.ts` | Pure per-move autoplay pacing math factored out of the `mountReplay` closure: `moveEventAtPly`, `clampPlay`, `thinkingDurationForPly`, and `delayForPly` (think-time → recorded-delta → compute-time → fallback precedence). No DOM/state; sibling of `replay-wall-clock.ts` |
| `replay-wall-clock.ts` | Pure replay timing helpers for compact clock orientation, wall-clock loop position, thinking elapsed clamping, and replay timing constants |
| `belief-panel.ts` | Engine belief/probability display panels for the replay lab |
| `learn.ts` | `/learn` tutorial route mount, board setup/update, route hash handling, state transitions, and move interaction logic. Loads `learn.css`, uses shared site shell, and reads curriculum data from `learn-content.ts` |
| `learn-home.ts` | `/learn` home/module card rendering plus module labels and chapter count helpers shared with the tutorial shell |
| `learn-panels.ts` | `/learn` tutorial menu, planned-module preview panel, chapter prompt panel, and endgame action panel rendering |
| `learn-content.ts` | `/learn` static curriculum data and data-shape types: module list, chapter list, tutorial steps, endgame lesson metadata |
| `learn.css` | `/learn` tutorial route styles loaded by `learn.ts` |
| `articles.ts` | Articles page renderer and article thumbnail board mounting. Loads `articles.css` for article index/page/widget styles |
| `articles.css` | Article index, article page, and article interactive widget styles loaded by `articles.ts` |
| `articles-data.ts` | Article content (large; content not code) |
| `article-i18n.ts` | Article localization strings and language helpers |
| `i18n/catalog.ts` | Shared client UI translation catalog and `t()` helper keyed by the current locale |
| `i18n/locale.ts` | Client locale metadata, path/storage/browser locale detection, and document/account locale preference helpers |
| `dark-xiangqi-postgame.ts` | Flagged Dark Xiangqi postgame/review route renderer; reuses `renderDarkXiangqiBoardSvg`. Loads `live-xiangqi.css` + `dark-xiangqi-postgame.css` |
| `dxq-postgame-shell.ts` | Shared postgame review shell + replay controls for the hidden triptych SVG variants; owns the left summary rail / board grid / moves rail scaffold while variant routes keep board-specific rendering |
| `postgame-keyboard.ts` | Shared postgame review keyboard navigation helper: left/right/home/end ply stepping plus flipped-board toggling, wired into hidden triptych review routes |
| `dark-xiangqi-room-actions.ts` | Flagged Dark Xiangqi room creation/action helpers |
| `account-nav.ts` | Top-nav account menu + sign-in state. Loads `account-nav.css` |
| `account-nav.css` | Top-nav account/auth slot styles loaded by `account-nav.ts` |
| `restart-banner.ts` | Boot-fetch + WS-driven drain banner. Loads `restart-banner.css` |
| `restart-banner.css` | Server restart countdown banner styles loaded by `restart-banner.ts` |
| `theme.ts` | Settings panel (board / fog / piece-set picker + volume slider, localStorage-backed). Loads `theme.css` for settings controls and dark-mode overrides |
| `theme.css` | Site appearance/settings control styles and dark-mode overrides loaded by `theme.ts` |
| `pixel-lab.ts` | `/pixel-lab` AI piece-art/fog lab (DEV) |
| `variant-marks.ts` | Variant mark/glyph definitions for current and candidate variants |
| `variant-marks-lab.ts` | DEV-only route for candidate variant marks |
| `live-room-bootstrap.ts` | Room-id to game-spec bootstrap helper for live routes |
| `xiangqi-spike.ts` | `/xiangqi-spike` FoW Xiangqi sandbox (DEV) |
| `xiangqi-demo.ts` | Flagged Dark Xiangqi reviewer/demo route |
| `xiangqi-bot.ts` | DEV-only bot for the xiangqi spike |
| `xiangqi-pieces.ts` | Xiangqi piece SVG refs |
| `web-utils.ts` | `escapeHtml`, `isColor`, `formatClock`, `oppositeColor`, file/rank helpers |
| `captures.ts` | Captured-piece list derivation |
| `nav-items.ts` | Nav item definitions (shared between top-nav and footer) |
| `announcements.ts` | Card list for /announcements + landing widget |
| `variant-public-surfaces.ts` | Single public-surface switchboard per `GameSpecId`: controls variant discoverability in rules rails/tiles, homepage article cards, homepage News, and `/news` without per-content visibility flags |
| `annotations.ts` | Annotation read/write for the research feedback workflow |
| `analytics.ts` | PostHog wrapper + time-class inference (client-side) |
| `site-box.ts` | Shared homepage/rail widget shell (lichess `lobby__box` grammar): header row with optional "More »" link over a content body. Loads `site-box.css` |
| `site-box.css` | Shared site-box widget styles (token-only) loaded by `site-box.ts` |
| `signed-in-state.ts` | Dependency-free signed-in state shared by `account-nav.ts` (authoritative) and read-only consumers (theme gear gating, contact form); localStorage first-paint hint, avoids an account-nav↔theme cycle |
| `connection-status.ts` | PING/SERVER latency footer for the account dropdown (lichess pattern); polls `GET /api/ping` only while the menu is open |
| `notification-nav.ts` | Reusable nav bell + count badge aggregating registered notification sources (correspondence "your move" is the first); owns registry/render/refresh, mounted by `account-nav.ts`. Loads `notification-nav.css` |
| `notification-nav.css` | Nav notification bell/badge/panel styles loaded by `notification-nav.ts` |
| `landing-activity.ts` | Homepage activity box: live presence (`/api/live-stats`) + durable totals (`/api/stats/public`) in the shared `site-box` shell; omitted entirely when both fetches fail |
| `news-page.ts` | `/news` route: full announcement history as a dated reverse-chronological feed; the landing News box "More" target. Loads `news-page.css` |
| `news-page.css` | `/news` dated-feed styles loaded by `news-page.ts` |
| `replay-skeleton.ts` | Neutral "Loading game" placeholder for watch/showcase replay slots while renderer kinds swap or mount asynchronously |
| `showcase-board.ts` | Homepage showcase single-board mount: dispatches between chessground replay and tenant watch renderers, owns compact chess replay options and game-end handoff |
| `showcase-sheet.ts` | Dev-only variant showcase sheet: renders one showcase board per channel (latest finished game) for quick cross-variant visual review |
| `showcase-clock.ts` | Homepage showcase timing helpers: reconstructs per-ply clock series and autoplay delays from tenant postgame move timestamps plus Fischer time controls |
| `showcase-compact-view.ts` | Shared compact-view picker for homepage showcase tenant renderers: chooses masked, truth, or stable per-room POV panes without being a redaction boundary |
| `showcase-cycler.ts` | Homepage showcase cycler: rolls through finished games across renderer kinds, reuses handles when possible, remounts across kinds, and shows the replay skeleton during swaps |
| `showcase-dispatch.ts` | Showcase renderer dispatch shared with watch routing: maps persisted/spec ids to tenant renderer kinds or the chessground fallback and picks the next pool index |
| `database.ts` | Unlisted admin game browser (`/database`): faceted completed-game query with win-rate/termination/length summary + review links; admin-gated by `/api/admin/games/query` (open in local dev), no nav entry. Loads `database.css` |
| `database.css` | `/database` admin game-browser styles loaded by `database.ts` |
| `engines.ts` | Unlisted admin engine tracker (`/engines`): roster of every engine version with EvE win/loss/draw records; admin-gated by `/api/admin/engines` (open in local dev), no nav entry. Loads `engines.css` |
| `engines.css` | `/engines` admin engine-tracker styles loaded by `engines.ts` |
| `engine-profile.ts` | Unlisted admin per-engine profile (`/engine/:id`): reuses `profile-ui.ts` + `account-profile.css` with a PvE/EvE records block; admin-gated by `/api/admin/engines/:id`, reached from `/engines`. Loads `engine-profile.css` |
| `engine-profile.css` | `/engine/:id` engine-records block styles (atop `account-profile.css`) loaded by `engine-profile.ts` |
| `profile-ui.ts` | Shared profile-surface primitives (`buildProfileHeaderShell`, `buildProfileGameRow`) used by the player profile (`/@handle`) and engine profile (`/engine/:id`) so the two render as siblings |
| `bots.ts` | Public bot directory and profile route (`/bots`, `/bot/:id`): profile shell, published bot rating, playable CTA, and recent bot game rows |
| `correspondence.ts` | `/correspondence` dashboard: lists the player's in-flight async games from `GET /api/correspondence/games` (your-move-first), with sign-in gate and unavailable-state notices. Loads `correspondence.css` |
| `correspondence.css` | `/correspondence` dashboard styles loaded by `correspondence.ts` |
| `rematch-controls.ts` | Shared post-game rematch control block for chess (white/black) and Dark Mini Xiangqi (red/black); reads the unified `liveState.rematch`, only per-game input is the two seat colors |
| `capture-render.ts` | Shared captured-piece row DOM builder (`captureRow`/`combinedCaptureRow`) using chessground-styled glyphs; sorts via `captures.ts` |
| `room-url.ts` | Leaf URL helper: `/room/:id` (or bare `/room` in dev) → room id; import-free so the tenant registry's dynamic-import closures can't form module cycles |
| `sound-sets.ts` | Sound-set registry mapping each `SoundKind` to its audio source: `mist` (synthesized default, zero assets) plus lichess AGPL file sets; partial sets fall back to synthesized tones |
| `sound-lab.ts` | DEV-only sound audition lab (`/sound-lab`): per-`SoundKind` board + a sample-game playthrough through the real `maybePlaySnapshotSound` pipeline |
| `live-crossroads-chess.ts` | Self-contained live room client for perfect-information Crossroads Chess (中西象棋); renders the server's open `PlayerView` directly (no fog), uses `variant-tenant/socket-client.ts` + `room-chrome.ts`, owns the open board/move-list/replay/rematch/sounds. Loads `live-crossroads-chess.css`. DELIBERATELY NOT on the live-client core: its clickable ply-jump move list + kernel-rebuilt full replay history (late joiners scrub the whole game) exceed the core's hooks; migrate only by extending the core, not by downgrading |
| `live-crossroads-chess.css` | Crossroads Chess live-route (6×8 board) layout styles loaded by `live-crossroads-chess.ts` |
| `live-dark-crossroads-chess.ts` | Self-contained live room client for hidden/dev-only Dark Crossroads Chess (6×8): the FOG sibling of `live-crossroads-chess.ts`. Reuses the (already fog-aware) crossroads board renderer but follows the Dark Xiangqi fog model — fog-safe replay CAPTURE (never reconstructs the opponent's hidden state), masked move list, bare wire (no rematch/roomMode). Behind `darkCrossroadsChessEnabled`. Loads `live-crossroads-chess.css` + `live-dark-crossroads-chess.css` |
| `live-dark-crossroads-chess.css` | Dark Crossroads Chess live-route masked move-list styles loaded by `live-dark-crossroads-chess.ts` (board/layout reuse `live-crossroads-chess.css`) |
| `dark-crossroads-chess-postgame.ts` | Flagged Dark Crossroads Chess postgame/review route renderer: the white/truth/red fog triptych with shared per-ply replay scrub (`renderCrossroadsChessBoardSvg`, `showFog` off only on the truth board). Reuses the shared `.dxq-postgame__*` scaffold + `dark-crossroads-chess-postgame.css` |
| `dark-crossroads-chess-postgame.css` | Dark Crossroads Chess review route-scoped theme + triptych layout override on the shared `dark-xiangqi-postgame.css` scaffold |
| `dark-crossroads-chess-room-actions.ts` | Dark Crossroads Chess play-again helper (`POST /api/rooms` for a fresh PvP room), used by the postgame review |
| `shogi-render.ts` | Live, fog-aware Dark Shogi (9×9) board SVG renderer: thin adapter over the shared `renderGridBoardSvg` cell-board core (9×9 descriptor, pentagonal koma that points toward the enemy, no shrouded silhouettes). Resolves the selected board theme (palette) + piece set per render from `shogi-appearance-storage` (or pinned options, used by the rules diagrams). Also exports the standalone hand-koma for the reserves strip + promotion preview + drag ghost |
| `shogi-piece-sets.ts` | Selectable shogi piece sets. TEXT sets (kanji / kanji-light / Latin) resolve via `shogiGlyph` (glyph + font + size). IMAGE sets (International, Colored = CC BY 4.0; Chess = CC BY-SA 3.0) map each piece to a bundled lishogi koma SVG under `public/piece-sets/<folder>/` via `shogiPieceCode` + `shogiImagePieceHref` (0XX sente / 1XX gote); `shogiPieceTilePreview` + `SHOGI_IMAGE_SET_CREDITS` drive the picker tile + CC attribution |
| `shogi-appearance-storage.ts` | localStorage-backed shogi board-theme + piece-set preferences (read/write/normalize), the shogi twin of `xiangqi-appearance-storage` |
| `shogi-replay.ts` | Shogi rules-article replay: one 9×9 board plus compact hand strips stepped through a western shogi move list via the real kernel, rendered on demand with the live shogi appearance system |
| `live-dark-shogi.ts` | Live room client on the generic `variant-tenant/live-client.ts` core for hidden/dev-only Dark Shogi (9×9): a FOG tenant on the socket-client + chrome stack with fog-safe replay CAPTURE, masked move list, bare wire. Net-new surface — koma board, reserve (hand) strips reusing the capture slots, DROP + PROMOTION interaction; hands are PRIVATE (own reserve only). Behind `darkShogiEnabled`. Loads `live-dark-shogi.css` |
| `live-dark-shogi.css` | Dark Shogi live-route styles loaded by `live-dark-shogi.ts`: 9×9 square board sizing, reserve (hand) strips, drop/promotion affordances, fog-masked move list |
| `live-dark-shogi-sound.ts` | Dark Shogi sound policy: a `drop` from hand + capture/king-capture board classification, fog-safe visible-piece-count opponent diff, reusing the shared `SoundController` |
| `crazyhouse-render.ts` | Live, fog-aware Dark Crazyhouse (8×8 chess + drops) board SVG renderer: thin adapter over the shared `renderGridBoardSvg` cell-board core (8×8 chess descriptor + cburnett glyphs, like Reveal Chess, plus the fog overlay). Exports the standalone hand-piece glyph for the reserves strip |
| `kriegspiel-render.ts` | Live board renderer for Kriegspiel (standard chess played blind): thin adapter over the shared `renderGridBoardSvg` cell-board core (8×8 chess descriptor + cburnett glyphs, borderless to match the dark-chess fog board, own-pieces-only with fog over every non-own square). Carries the threat-square layer for spatial check rendering + the promotion-piece glyph |
| `live-dark-crazyhouse.ts` | Live room client on the generic `variant-tenant/live-client.ts` core for hidden/dev-only Dark Crazyhouse (8×8 chess + drops): a FOG tenant on the socket-client + chrome stack with fog-safe replay CAPTURE, masked move list, bare wire. Reuses the chess board + chess fog; new surface — reserve (hand) strips, DROP + 4-way PROMOTION, and the PARACHUTE BOUNCE (`drop-rejected` probe). Hands PRIVATE. Behind `darkCrazyhouseEnabled`. Loads `live-dark-crazyhouse.css` |
| `live-dark-crazyhouse.css` | Dark Crazyhouse live-route styles loaded by `live-dark-crazyhouse.ts`: 8×8 chess board sizing, reserve (hand) strips, drop/promotion affordances, parachute-bounce banner, fog-masked move list |
| `live-dark-crazyhouse-sound.ts` | Dark Crazyhouse sound policy: a `drop` from hand + the chess board classifier (capture/castle/king-capture) reused via `soundForOwnMove`, fog-safe visible-piece-count opponent diff |
| `live-kriegspiel.ts` | Live room client on the generic `variant-tenant/live-client.ts` core for hidden/dev-only Kriegspiel: a hidden-info tenant on the socket-client + chrome stack with fog-safe replay CAPTURE. Net-new surface — own-pieces board, the UMPIRE ZONES (top = latest call + pulsing check banner, bottom = turn state + pawn-try count + the try-loop bounce), the two-column umpire-log move list, spatial check rendering (candidate squares), capture/check/bounce drama. Behind `kriegspielEnabled`. Loads `live-kriegspiel.css` |
| `dark-shogi-postgame.ts` | Flagged Dark Shogi postgame/review route renderer: the black/truth/white fog triptych with shared per-ply replay scrub + reserve (hand) strips (`renderShogiBoardSvg`, `showFog` off only on the truth board). Reuses the shared `.dxq-postgame__*` scaffold + `dark-shogi-postgame.css` |
| `dark-shogi-postgame.css` | Dark Shogi review route-scoped theme + triptych/reserve layout override on the shared `dark-xiangqi-postgame.css` scaffold |
| `dark-shogi-room-actions.ts` | Dark Shogi play-again helper (`POST /api/rooms` for a fresh PvP room), used by the postgame review |
| `dark-crazyhouse-postgame.ts` | Flagged Dark Crazyhouse postgame/review route renderer: the white/truth/black fog triptych with shared per-ply replay scrub + reserve (hand) strips (`renderCrazyhouseBoardSvg`, `showFog` off only on the truth board). Reuses the shared `.dxq-postgame__*` scaffold + `dark-crazyhouse-postgame.css` |
| `kriegspiel-postgame.ts` | Kriegspiel postgame/review route renderer: fetches the finished-game truth board from `/api/kriegspiel/games/:id` and renders the full revealed position (own-pieces fog lifts post-game). Reuses the shared postgame scaffold |
| `dark-crazyhouse-room-actions.ts` | Dark Crazyhouse play-again helper (`POST /api/rooms` for a fresh PvP room), used by the postgame review |
| `kriegspiel-room-actions.ts` | Kriegspiel play-again helper (`POST /api/rooms` for a fresh PvP room), used by the postgame review |
| `live-crossroads-chess-sound.ts` | Crossroads Chess sound policy: variant move/capture classification over its open `PlayerView`, reusing the shared `SoundController` |
| `crossroads-chess-play.ts` | `/crossroads-chess` perfect-information play page (no fog): hot-seat or vs Fairy-Stockfish (side + difficulty), bot moves from `POST /api/crossroads-chess/engine-move`. Loads `crossroads-chess-play.css` |
| `crossroads-chess-play.css` | `/crossroads-chess` play-page styles loaded by `crossroads-chess-play.ts` |
| `crossroads-chess-render.ts` | Live, fog-aware Crossroads Chess board SVG renderer: thin adapter over the shared `renderGridBoardSvg` cell-board core (6×8+river descriptor, disk/recolour glyphs, red-piece filter) |
| `jungle-art.ts` | Shared Jungle / Flip Jungle art recipe — single source of truth for the dobutsu framed-token + terrain look (`JUNGLE_ART` spec, `framedTokenSvg`, face-down disc, last-move ring, board/piece hrefs). Consumed by `jungle-render.ts`, `jungle-flip-render.ts`, and the variant markers; the blog widget is a downstream copy kept in sync via `check/publish:jungle-art` |
| `jungle-render.ts` | Jungle (斗兽棋) board SVG renderer: thin adapter over the shared `renderGridBoardSvg` cell-board core (7×9 descriptor) — draws the two river lakes + dens + traps as a furniture layer and the 8 animals as character discs. Concrete colours so it also renders standalone (rsvg/resvg). Animal-glyph art refined in a parallel session |
| `jungle-flip-render.ts` | Flip Jungle (兽棋/翻翻棋) board SVG renderer: thin adapter over `renderGridBoardSvg` (4×4 descriptor) — face-down tiles as neutral "back" discs (symmetric mask), revealed tiles as ink-coloured animal discs. Self-contained (own glyph table) so it doesn't couple to the in-flux `jungle-render.ts` |
| `crossroads-chess-postgame.ts` | Crossroads Chess postgame/review route renderer: per-seat + truth views from the postgame API, reuses replay panes/header/move-list; handles the legacy `dual-chess` spec alias. Loads `landing.css` + `game-route.css` |
| `crossroads-chess-replay.ts` | Crossroads Chess article replay: replays a UCI move list through the real kernel, renders each position on demand via the live renderer (sibling of `mini-xiangqi-replay.ts`) |
| `crossroads-chess-diagram.ts` | Static SVG diagrams for the Crossroads Chess rules article, drawn by `renderCrossroadsChessBoardSvg` so article positions are pixel-identical to the game |
| `crossroads-chess-sample-game.ts` | Crossroads Chess rules-article sample game data (a Fairy-Stockfish self-play game from the meerkat balance sweep), replayed by `crossroads-chess-replay.ts` |
| `watch-crossroads-chess-replay.ts` | Mistboard TV (`/watch`) renderer for Crossroads Chess: drives off the postgame API + SVG renderer (the generic chess replay path only understands chess `GameEvent` logs) |
| `live-mini-xiangqi-room.ts` | Dark Mini Xiangqi live-room logic riding the shared `live.ts` shell via tenant hooks (render/reconcile/reset/tick/keyboard); board interaction, analytics lifecycle, replay controller wiring. Behind `darkMiniXiangqiEnabled` |
| `live-mini-xiangqi-render.ts` | Bespoke SVG renderer for the 7×7 Dark Mini Xiangqi board: pieces on intersections, Fog of War as an inverse `<mask>` with square cutouts on visible intersections |
| `fortress-xiangqi-render.ts` | Bespoke SVG renderer for the 7×8 Fortress Xiangqi board: opposite-corner palaces, river band, pieces on intersections, and the Treasure glyph (Dobutsu-style disc where no piece-set art exists) |
| `live-mini-xiangqi-sound.ts` | Dark Mini Xiangqi sound policy: fog-aware per-event classification over the DMX `PlayerView`, reusing the shared `SoundController` |
| `dark-mini-xiangqi-postgame.ts` | Dark Mini Xiangqi postgame/review route renderer: red/black/truth views from the postgame API, reuses replay panes/header/move-list + DMX capture split. Behind `darkMiniXiangqiEnabled`. Loads `landing.css` + `game-route.css` |
| `mini-xiangqi-postgame.ts` | Mini Xiangqi postgame/review route renderer: single truth-board replay, result rail, move list, share/play-again actions, and postgame API loader |
| `mini-xiangqi-view.ts` | Mini Xiangqi shared view helpers: truth-view key and move-label formatting for postgame/watch surfaces |
| `mini-xiangqi-captures.ts` | Dark Mini Xiangqi captured-piece derivation (truth-view diff against the initial board) + pane capture-split rendering |
| `mini-xiangqi-replay.ts` | Mini Xiangqi article replay: one 7×7 board stepped through a move list via the real kernel, rendered on demand (sibling of `xiangqi-replay.ts`) |
| `drop-mini-xiangqi-view.ts` | Shared Drop Mini Xiangqi view helpers: open board projection, legal board/drop target derivation, move labels, and reserve strip rendering |
| `fortress-xiangqi-view.ts` | Shared Fortress Xiangqi view helpers: legal board/drop target derivation, move labels, and reserve strip rendering (reuses the drop-mini reserve styling) |
| `live-drop-mini-xiangqi.ts` | Drop Mini Xiangqi live room client on the generic `variant-tenant/live-client.ts` core: open 7x7 board, board moves, reserve drops, draggable hands, move list, and replay capture |
| `live-fortress-xiangqi.ts` | Fortress Xiangqi live room client on the generic `variant-tenant/live-client.ts` core: open 7x8 board, board moves, reserve drops, draggable hands, move list, and replay capture |
| `drop-mini-xiangqi-postgame.ts` | Drop Mini Xiangqi postgame/review route renderer: truth-board replay with reserve strips and per-ply history from the postgame API |
| `fortress-xiangqi-postgame.ts` | Fortress Xiangqi postgame/review route renderer: truth-board replay with reserve strips and per-ply history from the postgame API |
| `drop-mini-xiangqi-replay.ts` | Drop Mini Xiangqi rules-article replay: parses board/drop notation, replays through the real kernel, and renders the sample game with reserve strips |
| `fortress-xiangqi-replay.ts` | Fortress Xiangqi rules-article replay: parses board/drop notation (R/N/C/P/T/A/E), replays through the real kernel, and renders the sample game on the live board renderer with reserve strips |
| `fortress-xiangqi-rules-diagrams.ts` | Inline board diagrams for the Fortress Xiangqi rules article (start position, Treasure moves, defender drop zones), built on the live renderer with kernel-derived targets |
| `board-metrics.ts` | Canonical piece-to-cell proportion (`TOKEN_PIECE_RATIO`) shared by every disc/token board renderer, intersection- or cell-anchored |
| `mini-xiangqi-spike.ts` | `/mini-xiangqi-spike` FoW Mini Xiangqi sandbox (DEV): local play across red/black/god perspectives over the bespoke 7×7 renderer |
| `watch-mini-xiangqi-replay.ts` | Mistboard TV (`/watch`) renderer for Dark Mini Xiangqi: postgame payload + shared replay chrome + control bar/auto-play, rendering server-computed fog views (leak-safe) |
| `watch-mini-open-xiangqi-replay.ts` | Mistboard TV (`/watch`) renderer for open Mini Xiangqi: loads the Mini postgame payload and mounts the single truth-board tenant replay |
| `watch-drop-mini-xiangqi-replay.ts` | Mistboard TV (`/watch`) renderer for Drop Mini Xiangqi: open-information replay over the postgame API, with board orientation and reserve strips |
| `watch-fortress-xiangqi-replay.ts` | Mistboard TV (`/watch`) renderer for Fortress Xiangqi: single open-information `truth` pane over the postgame API, with board orientation and sided reserve strips |
| `watch-dark-xiangqi-replay.ts` | Mistboard TV (`/watch`) renderer for full Dark Xiangqi (9×10) — thin adapter over `watch-tenant-replay.ts` rendering the red/truth/black fog triptych (per-view fog mask) |
| `watch-fog-triptych-replay.ts` | Generic Mistboard TV (`/watch`) replay chrome for fog triptych variants: header, three panes, control bar, autoplay, ply navigation, result labels, and optional private/truth reserve strips |
| `watch-dark-crossroads-chess-replay.ts` | Mistboard TV (`/watch`) renderer for Dark Crossroads Chess: adapter over `watch-fog-triptych-replay.ts`, using the Dark Crossroads postgame payload and crossroads SVG renderer |
| `watch-dark-shogi-replay.ts` | Mistboard TV (`/watch`) renderer for Dark Shogi: adapter over `watch-fog-triptych-replay.ts`, using the Dark Shogi postgame payload, shogi SVG renderer, and private/truth hand strips |
| `watch-dark-crazyhouse-replay.ts` | Mistboard TV (`/watch`) renderer for Dark Crazyhouse: adapter over `watch-fog-triptych-replay.ts`, using the Dark Crazyhouse postgame payload, crazyhouse SVG renderer, and private/truth reserve strips |
| `watch-kriegspiel-replay.ts` | Mistboard TV (`/watch`) renderer for Kriegspiel: adapter over `watch-fog-triptych-replay.ts`, using the Kriegspiel postgame payload and own-pieces/truth board renderer |
| `live-dark-xiangqi.ts` | Live room client on the generic `variant-tenant/live-client.ts` core for hidden/dev-only Dark Xiangqi (9×10): the first fog tenant on the `socket-client` + `room-chrome` stack; owns the intersection-board fog SVG, click-to-move, fog-safe replay capture, masked move list, and `renderDarkXiangqiBoardSvg` (reused by the postgame). Behind `darkXiangqiEnabled`. Loads `live-xiangqi.css` |
| `live-dark-xiangqi-sound.ts` | Dark Xiangqi sound policy: fog-safe own-move classification (cannon-capture, general-capture) + visible-piece-count opponent diff over the redacted view, reusing the shared `SoundController` |
| `live-xiangqi.css` | Shared xiangqi live-route board sizing/aspect styles loaded by `live.ts`, `live-dark-xiangqi.ts`, and `dark-xiangqi-postgame.ts` |
| `dark-xiangqi-postgame.css` | Flagged Dark Xiangqi postgame route styles loaded by `dark-xiangqi-postgame.ts` |
| `xiangqi-fog.ts` | Shared Fog of War SVG region for every xiangqi board (Dark Mini 7×7, full 9×10, dev spike): one masked region with flat tint + optional drift/mistveil texture mapped to the global fog assets |
| `xiangqi-piece-sets.ts` | Selectable piece sets for the xiangqi family (all seven roles): traditional/simplified character scripts + western/symbol diagram sets; shared disc/ring, only the inner mark changes |
| `xiangqi-appearance-storage.ts` | localStorage-backed xiangqi board-theme + piece-set preferences (read/write/normalize), shared by the xiangqi renderers |
| `xiangqi-replay.ts` | Full xiangqi (9×10) article replay: one board stepped through a move list via the real kernel, rendered on demand (first used by the Xiangqi Rules article) |
| `shogi4-rules-diagrams.ts` | GENERATED inline SVG diagrams for the Shogi4 rules article (Oca tiles); regenerate via the shogi4 repo's `gen_rules_diagrams.py`, do not hand-edit |
| `shogi4-sample-game.ts` | GENERATED per-ply Shogi4 sample-game board frames (with hand trays) for the rules article; regenerate via the shogi4 repo's `gen_game_replay.py`, do not hand-edit |
| `chess-replay.ts` | Lightweight client-side chess game replay: one chessground board stepped through a UCI move list via the rules kernel, positions rendered on demand (chess analogue of `xiangqi-replay.ts`) |
| `article-prose.ts` | Translatable-prose extraction over the article model, shared by the translation-coverage test and the `i18n:coverage` reporter; excludes move-notation narratives and baked board labels |
| `variant-tenant/registry.ts` | Web-side `VariantTenant` registry (routing/config mirror of the server registry): per-tenant page routing, review-URL base, watch-replay mount, landing config so `main.ts`/`live-room-bootstrap`/`landing`/`game-meta`/`watch-route` dispatch without per-variant branches; entry-chunk safe. Chess is intentionally unregistered (a miss is the chess fallback) |
| `variant-tenant/live-shell.ts` | Static half of the registry: tenants that ride the shared `live.ts`/`live-render` shell (currently DMX) register render/reconcile/reset/tick/keyboard hooks here; statically imports the tenant live-room modules so it loads only in the live-room chunk |
| `variant-tenant/board-drag.ts` | Shared drag-to-move for the self-rendered SVG variant boards (extracted from DMX): pointer state machine, floating ghost, 4px tap threshold, click-suppression. Delegated to the board container ONCE at mount (survives `innerHTML` re-renders); the caller supplies `canDragFrom` / `ghostHtml` / `onDrop`. Click-to-move is preserved (a sub-threshold tap falls through). The `.board-drag-ghost` CSS lives in styles.css. |
| `variant-tenant/hand-drag.ts` | Shared pointer drag for reserve/hand pieces into variant board hit zones, used by drop variants with rendered hand strips |
| `variant-tenant/selection-click-away.ts` | Shared document-level click-away helper that clears selected board/hand pieces when the user clicks outside registered roots |
| `vite-env.d.ts` | Vite client type reference (`/// <reference types="vite/client" />`) |
| `live-jieqi.ts` | Live multiplayer room client for Jieqi (揭棋) — tenant client on the generic `variant-tenant/live-client.ts` core; identity-hidden xiangqi (board public, piece roles hidden until revealed). Renders the server `JieqiPlayerView`; no client-side hidden-info inference. Loads `live-xiangqi.css` |
| `live-jieqi-render.ts` | Jieqi board SVG renderer: xiangqi pieces on intersections, face-down pieces as backs, revealed roles glyphed; reuses the shared xiangqi piece-sets/appearance |
| `live-jieqi-interaction.ts` | Pure click-to-move decision for the jieqi board (web half of the interaction contract, kept out of the DOM client so it is unit-testable) |
| `live-jieqi-postgame.ts` | Jieqi postgame/review route renderer (truth view once finished); reuses replay panes/header/move-list |
| `live-jieqi-sound.ts` | Jieqi sound policy: a public flip on a move-reveal + fog-safe opponent classification (a private capture-reveal stays `captured`, never leaking the captured identity), reusing the shared `SoundController` |
| `jieqi-replay.ts` | Jieqi rules-article replay: replays a move list (+ the deal) through the real jieqi kernel, rendering each position on demand (sibling of `banqi-replay.ts`) |
| `jieqi-sample-game.ts` | Jieqi rules-article sample game data, replayed by `jieqi-replay.ts` |
| `watch-jieqi-replay.ts` | Mistboard TV (`/watch`) renderer for Jieqi — thin adapter over the shared `watch-tenant-replay.ts` |
| `live-jungle.ts` | Live multiplayer room client for Jungle (斗兽棋) — the REFERENCE tenant on `variant-tenant/live-client.ts` (core owns bootstrap/frames/render/replay/move list); this module keeps the wire view type, board render (`jungle-render.ts`), click/drag interaction, sounds, and from-to notation. Perfect-information, plain click-to-move; loads `live-xiangqi.css` |
| `live-jungle-postgame.ts` | Jungle postgame/review route renderer: single perfect-information truth board with replay panes, move list, share/play-again actions, and API loader |
| `live-jungle-flip.ts` | Live multiplayer room client for Flip Jungle (兽棋/翻翻棋) — tenant client on the generic `variant-tenant/live-client.ts` core; symmetric hidden-identity (no fog; deal hidden from both seats). Tap a face-down tile to flip, or select a revealed animal and tap a legal target; ink binds on the first flip. Renders via `jungle-flip-render.ts` |
| `live-jungle-flip-postgame.ts` | Flip Jungle postgame/review route renderer: one masked replay board plus Reveal toggle for the spoiler history; result labels translate move-order seat to bound ink |
| `live-banqi.ts` | Live multiplayer room client for Banqi (半棋) — tenant client on the generic `variant-tenant/live-client.ts` core; symmetric-information so NO fog (renders the masked `BanqiPlayerView` the server sends; the only hidden state is the deal, hidden from both seats equally). Modeled on the jieqi room. Owns `fillCapturedPool` reused by banqi postgame/watch |
| `live-banqi-render.ts` | Banqi board SVG renderer (8×4): xiangqi-style discs, face-down tiles as backs; reuses the shared xiangqi piece-sets/appearance |
| `live-banqi-interaction.ts` | Pure click-to-move decision for the banqi board (FLIP a face-down tile = one-click self-move; otherwise select-then-move). Unit-testable, no DOM |
| `live-banqi-postgame.ts` | Banqi postgame/review route renderer (single public truth surface; banqi is symmetric-information). Loads `live-xiangqi.css` + `dark-xiangqi-postgame.css` |
| `live-banqi-sound.ts` | Banqi sound policy: a flip on a face-down reveal (own move + the opponent's public flip), capture/cannon classification, reusing the shared `SoundController` (banqi is symmetric-information, so opponent flips are sounded precisely) |
| `live-drop-mini-xiangqi-sound.ts` | Drop Mini Xiangqi sound policy: perfect-information (no fog), so every move — including a drop-from-hand — is sounded precisely, reusing the shared `SoundController` |
| `live-jungle-sound.ts` | Jungle / Dou Shou Qi sound policy: perfect-information (no drops/flips/king), every move sounded precisely, reusing the shared `SoundController` |
| `live-jungle-flip-sound.ts` | Flip Jungle (兽棋 / 翻翻棋) sound policy: hidden identity not position, so a flip (face-down → revealed) is public and sounded precisely for both seats, reusing the shared `SoundController` |
| `jungle-rules-diagrams.ts` | Inline board diagrams for the Jungle + Flip Jungle rules articles, built on the live board renderers (`renderJungleBoardSvg` / `renderJungleFlipBoardSvg`) so each diagram matches the in-game furniture |
| `jungle-replay.ts` | Jungle (斗兽棋) rules-article replay: perfect-information (spec is just a move list, no deal), each position replayed through the real jungle kernel and drawn by `jungle-render.ts` on demand (sibling of `banqi-replay.ts`) |
| `jungle-sample-game.ts` | Jungle rules-article sample game data — a real Misty Jungle L3 (Red) vs L2 (Black) game (move list only; perfect-information), replayed by `jungle-replay.ts`; verified to replay to the recorded den win |
| `jungle-flip-replay.ts` | Flip Jungle (兽棋/翻翻棋) rules-article replay: spec carries the deal + move list, each position replayed through the real flip-jungle kernel and drawn from the as-played masked view; face-down tiles flip to their dealt animal on first turn (sibling of `banqi-replay.ts`) |
| `jungle-flip-sample-game.ts` | Flip Jungle rules-article sample game data — a real MistyJungleFlip self-play game (deal + move list) illustrating 同归于尽 mutual destruction, replayed by `jungle-flip-replay.ts`; verified to replay to the recorded elimination win |
| `banqi-replay.ts` | Banqi rules-article replay: replays the deal + move list through the real banqi kernel, rendering each position on demand; face-down tiles flip to their dealt piece on first turn (sibling of `jieqi-replay.ts`) |
| `banqi-sample-game.ts` | Banqi rules-article sample game data (a real MistyBanqi-vs-human game), replayed by `banqi-replay.ts` |
| `banqi-engine-game.ts` | "How MistyBanqi Plays" article sample game data (a real prod game where MistyBanqi draws a won position by repetition), replayed by `banqi-replay.ts` |
| `banqi-result-label.ts` | Banqi seat→bound-ink result labels (`seatInkLabel`/`banqiResultLabel`): translates the stored move-order seat to the ink that bound on the opening flip. Import-light so result-only surfaces (the watch queue) reuse it without board renderers |
| `jungle-flip-result-label.ts` | Flip Jungle seat→bound-ink result labels for postgame and watch surfaces; falls back to first/second before the opening flip binds ink |
| `watch-banqi-replay.ts` | Mistboard TV (`/watch`) renderer for Banqi — thin adapter over `watch-tenant-replay.ts` (single public truth surface, no fog) |
| `watch-jungle-replay.ts` | Mistboard TV (`/watch`) renderer for Jungle: thin adapter over `watch-tenant-replay.ts` with one perfect-information truth board |
| `watch-jungle-flip-replay.ts` | Mistboard TV (`/watch`) renderer for Flip Jungle: thin adapter over `watch-tenant-replay.ts` with masked replay plus Reveal/Hide spoiler control |
| `live-reveal-chess.ts` | Live multiplayer room client for Reveal Chess (chess-jieqi) — tenant client on the generic `variant-tenant/live-client.ts` core (`socket-client` + `room-chrome` stack; identity-hidden 8×8 chess (cburnett pieces). No fog: renders only the server `RevealChessPlayerView`, never infers a hidden identity. Loads `live-reveal-chess.css` |
| `live-reveal-chess-sound.ts` | Reveal Chess sound policy: a public `flip` on a move-reveal + fog-safe opponent classification (a private capture-reveal stays `captured`); the king is always face-up so king-capture is detectable. Reuses the shared `SoundController` |
| `reveal-chess-render.ts` | Reveal Chess board renderer: thin adapter over the shared `renderGridBoardSvg` cell-board core (8×8 descriptor, cburnett glyphs for revealed pieces, face-down disc token) |
| `reveal-chess-postgame.ts` | Reveal Chess postgame/review route renderer; reuses replay panes/header/move-list. Loads `landing.css` + `game-route.css` + `live-reveal-chess.css` |
| `watch-reveal-chess-replay.ts` | Mistboard TV (`/watch`) renderer for Reveal Chess — thin adapter over `watch-tenant-replay.ts` |
| `watch-tenant-replay.ts` | Generic Mistboard TV (`/watch`) renderer for the tenant SVG family (Jieqi, Banqi, DMX): shared "TV" chrome — header, board panes (single truth pane or per-color triptych), control bar + auto-play, ply nav, `ReplayHandle`. Each variant supplies a small `TenantWatchAdapter`; the per-variant module is then ~30 lines. Crossroads/dark-chess stay on the chessground path in `replay.ts` |
| `deepdive.ts` | DEV-only (`/deepdive`) Fog-of-War game deep-dive reader: reuses the production replay board + fog triptych + move rail and hangs a prose annotation panel off its `onPlyChange` hook (no `replay.ts` edits); synthesizes moves→`GameEvent[]` (the seed of the chess.com-PGN importer) |
| `engine-review.ts` | DEV-only (`/engine-review`) engine-output inspector: reuses the production replay board + fog view and hangs an engine-output panel off `onPlyChange` (per-ply eval + full move ranking with action-value + policy %); static fixture baked from the offline self-review spike |
| `variant-mini-boards.ts` | Homepage variant mini-board widgets (small static SVG boards shown per variant); follow board-appearance settings via the shared appearance events. Loads `variant-mini-boards.css` |
| `articles/diagrams.ts` | Article diagram + board constants and the helpers that build them (relocated verbatim from `articles-data.ts`); every declaration is exported so the per-article content modules + the `articles-data.ts` barrel import what they reference. Large (content, not logic) |
| `articles/reveal-chess-diagrams.ts` | Static board diagrams for the Reveal Chess rules article (reuse the production renderer fed by real kernel states so diagrams can't drift; brown palette baked for self-contained SVG) |
| `articles/content/*.ts` | Per-article content modules (one per rules article: banqi, jieqi, chess, dark-chess, xiangqi, kriegspiel, misty, ...); prose/data, not code. Built from `articles/diagrams.ts` constants, barrel-imported by `articles-data.ts`. Excluded from the INDEX coverage gate (content dir) |

## apps/server/migrations/ — Postgres schema migrations

45 files (`001_init.sql` through `045_allow_reveal_chess_rating_bucket.sql`). Runner: `migrate.ts` — Postgres advisory-lock + `_migrations` table. Add schema changes as new numbered migrations only.

**Change schema** → add a new `0NN_*.sql` (never modify a landed migration). Constraint rewrites: drop-then-readd in a new file (see `018_add_resignation_termination.sql`).

## scripts/ — repo-root tooling

| Group | Files |
|-------|-------|
| Build/start | `build.mjs`, `start.mjs`, `safe-deploy.mjs`, `release-prod.mjs` |
| Agent/dev loop | `agent-scan.mjs`, `ci-browser-smoke-plan.mjs`, `ci-checks.mjs`, `drift-check.mjs`, `gate-evidence.mjs`, `verify.mjs`, `worktree-new.mjs`, `worktree-prepare.mjs`, `mobile-loop.mjs`, `visual-check.mjs` |
| Engine artifacts | `archive-engine-artifact.mjs`, `engine-artifact-{audit,closeout}.mjs`, `capture-belief-artifacts.mjs`, `generate-fow-corpus.mjs` |
| Variant labs | `variant-lab/drop-mini-xiangqi-{fsf-play,hotseat,scenarios}.ts` plus `drop-mini-xiangqi-fsf.ini`; Drop Mini Xiangqi policy pressure tests, terminal hotseat, scenario audit, and optional `--html` FSF self-play replay export. `variant-lab/fortress-xiangqi-fsf-play.ts` FSF⟷kernel parity harness; `variant-lab/fortress-xiangqi-sample-game.ts` kernel-validated FSF self-play generator for the rules-article replay |
| Prod smoke | `prod-smoke-plan.mjs`, `wait-prod-revision.mjs`, `prod-lite-smoke.mjs`, `prod-smoke.mjs`, `prod-engine-smoke.mjs`, `prod-engine-playout.mjs`, `time-command.mjs` |
| AI asset gen | `pixel-gen.mjs`, `video-gen.mjs`, `loop-video.mjs`, `slice-fog.py` |
| Other | `key-transparency.py` |

## Conventions

- **TypeScript everywhere.** No `.mjs` in source; ops scripts in `scripts/` can be `.mjs`.
- **Pure-game in `packages/game`.** No browser or server imports allowed.
- **Server owns canonical state.** Clients render `PlayerView`, never canonical truth.
- **Fog redaction in `payloads.ts`.** Never send hidden pieces or opponent moves to the wrong client.
- **One source for time controls** → `packages/game/src/time-controls.ts`.
- **`.env` files are off-limits** to Claude — touching them leaks via auto-include. Use Node `--env-file` or provider dashboards.
- **Lesson trailers** on commits that teach a transferable rule (see `~/projects/CLAUDE.md`).
