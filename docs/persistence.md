# Persistence

How mistboard stores game state across server restarts.

Until M6 / Phase E, `apps/server` kept everything in `rooms: Map<string, Room>` in process memory. Restart = total loss. This doc describes the move to Postgres-backed persistence and the related transition to running `apps/server` in prod (replacing today's static-only deploy).

## Goals

In priority order:

1. **Replay URLs survive restart.** A finished game's URL keeps working across redeploys.
2. **Mid-game reconnect across restart.** A live game survives a server crash or redeploy as long as both clients reconnect.
3. **Phase E corpus capture.** Human-vs-bot games persist in a queryable form the engine work can consume offline.
4. **Cross-game queries.** Foundation for PL3 ladder (Elo, head-to-head, per-engine stats) without retrofitting the storage layer.

## Non-goals (v1)

- Multi-instance WS scale-out. Single Node process is the assumption.
- Multi-region replication. v1 assumes a single-region Postgres deployment.
- Real-time analytics / OLAP. Standard transactional Postgres only.
- User accounts or registered identities as a hard requirement. v1 stays
  account-optional and low-friction.

## Storage model

Two tables. Events are the source of truth; `games` is a derived aggregate updated on game-end.

### `events`

Append-only log. One row per `GameEvent`.

```sql
CREATE TABLE events (
  room_id    TEXT        NOT NULL,
  seq        INTEGER     NOT NULL,
  type       TEXT        NOT NULL,
  payload    JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, seq)
);

CREATE INDEX events_created_at_idx ON events (created_at);
```

- `payload` stores the full `GameEvent` object, including `type` (denormalized into the column for indexed type filtering).
- `seq` is per-room, starting at 0 with `room-created`.
- No FK to `games` — events stand alone, `games` is a projection convenience.

### `games`

Aggregate row written when a game terminates (king capture, clock expiry, etc.). One row per finished room.

A `games` row is written **if and only if a terminal event fires**. Pregame-only rooms (one player joined, never made a move) produce no `games` row — they remain orphan events in the `events` table, eligible for GC later. Mid-game disconnect doesn't need special handling: the server clock keeps running, the disconnected player times out, `clock-expired` fires, and the standard game-over path produces a normal `games` row with the opposing color winning.

EvE broadens this model without replacing it. PvP still writes `games` on completion, but engine-mined games may create a `games` row at start with `mode = 'eve'` and `status = 'running'`, then update it to `completed` or `aborted`. EvE-specific job, engine identity, and debug data lives in side tables keyed back to the canonical `games.room_id`.

```sql
CREATE TABLE games (
  room_id        TEXT        PRIMARY KEY,
  variant        TEXT        NOT NULL,
  result         TEXT        NOT NULL    CHECK (result IN ('white-wins', 'black-wins', 'draw')),
  termination    TEXT        NOT NULL    CHECK (termination IN ('king-captured', 'timeout', 'checkmate', 'draw')),
  ply_count      INTEGER     NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL,
  ended_at       TIMESTAMPTZ NOT NULL,
  white_client   TEXT,
  black_client   TEXT
);

CREATE INDEX games_ended_at_idx ON games (ended_at DESC);
CREATE INDEX games_variant_idx  ON games (variant);
```

Pre-PL3, this table is light. PL3 adds engine identity columns; PL3 leaderboards read from `games` joined with a future `ratings` table.

## API surface (apps/server)

```ts
// apps/server/src/persistence.ts

export async function loadRoom(roomId: string): Promise<GameEvent[] | null>;
export async function appendEvent(roomId: string, seq: number, event: GameEvent): Promise<void>;
export async function listActiveRoomIds(since: Date): Promise<string[]>;
export async function recordGameEnd(roomId: string, summary: GameSummary): Promise<void>;
```

Wire-up:

- `getOrCreateRoom(roomId)` first calls `loadRoom`. If non-null, rehydrate via `replayGameEvents` and skip the synthetic `room-created` event.
- `appendEvent` (existing in-memory function) gains an `await persistence.appendEvent(...)` before the broadcast. Synchronous insert per event — Postgres handles dozens-of-rooms × low-frequency moves trivially.
- On terminal game state in `appendEvent`'s post-projection check, call `recordGameEnd`.

Replay visibility:

- Persisted events are canonical truth and are private while a game is live.
- `GET /api/games/:roomId/events` must only return full events after replaying them produces a terminal game state.
- Live and pregame observers receive only WebSocket snapshots that are scoped to their seat. Spectators of live Fog of War games do not receive board truth or move events.
- Administrative debug views are a separate capability. They are not authorized by room id, query params, or client-side UI state.

## Runtime Shape

Production-like deployments run one Node service for HTTP and WebSocket traffic,
backed by Postgres. The exact provider, account setup, network topology, and
deployment runbook are operational details and do not belong in this public
architecture note.

- Connection pooling: `pg.Pool` with low max (5–10) is sufficient for v1; PgBouncer becomes a question only if WS instance count rises above 1 (which it shouldn't for this roadmap).

Env:

- `DATABASE_URL` — required in production-like runtimes.
- `DATABASE_URL` in dev — optional; if absent, `apps/server` falls back to in-memory rooms (current behavior, useful for quick local iteration without a DB running).
- `MISTBOARD_ALLOW_IN_MEMORY_PERSISTENCE=true` — explicit escape hatch for intentionally ephemeral production-like environments. Do not set this on the live service.
- `MISTBOARD_ADMIN_DEBUG_TOKEN` — optional bearer token for administrative truth/debug views in production-like runtimes. Prefer sending it in a WebSocket message or subprotocol, not in URLs.
- `MISTBOARD_ALLOWED_ORIGINS` — optional comma-separated WebSocket origin allowlist. If unset in production-like runtimes, the server allows only `https://$HOST`.
- `RESEND_API_KEY` — optional Resend API key for passwordless login email delivery. Required for real email login in production-like runtimes.
- `MISTBOARD_AUTH_EMAIL_FROM` — sender address for account login emails, for example `Mistboard <login@mistboard.com>`. `RESEND_FROM_EMAIL` is also accepted as a fallback.
- `MISTBOARD_ALERT_EMAIL_TO` — optional comma-separated operator inboxes for engine alert email. Falls back to `MISTBOARD_FEEDBACK_TO` when unset.
- `MISTBOARD_ALERT_EMAIL_FROM` — optional sender address for alert email. Falls back to the feedback/auth sender when unset.
- `MISTBOARD_ALERT_EMAIL_MIN_INTERVAL_MS` — optional per-severity throttle for engine alert email. Defaults to 10 minutes.
- `MISTBOARD_DEV_AUTH_CODES=true` — explicit escape hatch that lets production-like runtimes return local passwordless email login codes in API responses. Do not set this on the live service.
- `MISTBOARD_WS_MAX_PAYLOAD_BYTES`, `MISTBOARD_WS_MESSAGE_LIMIT`, `MISTBOARD_WS_MESSAGE_WINDOW_MS` — optional WebSocket abuse-control knobs.
- `MISTBOARD_SHUTDOWN_GRACE_MS` — optional graceful shutdown budget for closing sockets, pending writes, and the Postgres pool.

Local dev DB (Docker Postgres on `localhost:5435`):

```bash
npm run dev                # persistent by default: db:up + db:migrate + server/web pair
npm run dev:lab            # explicit parked/experimental variant profile
npm run db:seed:qa         # product fixtures: profiles + live variant games + watch + QA gap-fillers
npm run test:persistent
```

`npm run dev` runs `db:up`, then `db:migrate`, then the persistent pair. `db:up`
starts the shared `mistboard-postgres` container (creating it via `docker
compose` only when it does not already exist), so it works from a git worktree
without the "container name already in use" conflict, and fails loudly if Docker
is not running. `npm run dev:memory` is the no-Postgres path. The default
variant seeder follows `config/product-profile.json` and removes only retired
rows owned by its `variant-postgame-fixture` corpus. Use
`db:seed:variant-fixtures:lab` to load every committed variant fixture. The
individual seeders still run standalone: `db:seed:profiles`, `db:seed:watch`,
`db:seed:variant-fixtures`, `db:seed:qa-fixtures`.

Multiple sessions share one Postgres: set `MISTBOARD_DEV_PORT_BASE` (default
3000) to move a second worktree's pair to other ports (web = base, server =
base + 1; the web proxy and dev WebSocket URL follow via `MISTBOARD_DEV_API_URL`).
`strictPort` keeps an occupied port a loud failure, never an auto-increment.

The local Postgres URL is `postgres://mistboard:mistboard@localhost:5435/mistboard`.
Migrations run via a tiny in-repo script — no ORM, no migration framework. Raw
SQL files in `apps/server/migrations/` are applied in order.

Without a DB (`npm run dev:memory`), DB-backed pages are dark: `/watch`,
`/game/:id` review, profiles, and the public-games surfaces all show
empty/"unavailable" states. Two ways to exercise them:

- **Replay component only** (no DB): open `/?replay=<sample-name>`, where
  `<sample-name>` is any file under `apps/web/public/replay-samples/` (without
  the `.jsonl`). Mounts the exact replay widget — boards, controls, ply line —
  the watch and review pages embed. Fastest loop for replay-UI work.
- **Full page** (DB): `db:seed:watch` + `npm run dev`, then load `/watch`.

`npm run db:seed:profiles` adds deterministic local public profile fixtures.
The seed is idempotent and only replaces `seed-*` users and games:

- `/@/seed-rich` — account-attributed public games, PvE/PvP rows, multiple time controls, and rated buckets.
- `/@/seed-empty` — public account with no games.
- `/@/seed-long-names` — long display/opponent names and a test-role badge for overflow checks.

The seed command refuses non-local database URLs unless
`MISTBOARD_ALLOW_NONLOCAL_SEED=true` is set.

`npm run db:seed:watch` imports every committed `apps/web/public/replay-samples/*.jsonl`
as a completed `eve` game (corpus `local-watch-fixture`), so `/watch` shows real,
scrubable replays locally. It is a thin wrapper over `import-corpus` with
`--mode eve` (the default `imported` mode is excluded from the watch feed, which
filters `mode IN (pvp, pve, eve)`). Idempotent on `(room_id)`; safe to re-run.
Both seed commands hardcode the local Postgres URL.

`npm run db:seed:qa-fixtures` (folded into `db:seed:qa`) fills the local-only
gaps the other seeders miss, idempotently and without touching existing rows:

- **Admin account** — promotes `MISTBOARD_QA_ADMIN_EMAIL` (default
  `brianhliou@gmail.com`) to `account_role='admin'`, creating the user if
  absent. It matches on `lower(email)`, so a later dev login-code sign-in with
  that email lands on the same account (dev sign-in returns the code as
  `devCode` in the API response — no email is sent locally).
- **Inbox / DM** — a few `dm_threads` + `dm_messages` between the admin and seed
  users, including one 30+ message thread (internal scroll) and unread threads
  (inbox badge).
- **Xiangqi ladder** — `user_ratings` rows for the `xiangqi`/`blitz` bucket so
  `/api/leaderboard?variant=xiangqi` is non-empty locally.

Correspondence "your-turn" games are deliberately not seeded: a dashboard entry
needs both a `room_deadlines` row and a hydratable dark-chess event log +
running-game row, and there is no committed non-terminal fixture to replay, so a
static seed would be a hollow `/room` link. Create one against the running dev
server instead.

Minimal account auth is passwordless email:

- `POST /api/auth/email/start` with `{ "email": "you@example.com" }`
- `POST /api/auth/email/confirm` with `{ "loginId": "...", "code": "..." }`
- `GET /api/auth/me`
- `POST /api/auth/logout`

If `RESEND_API_KEY` and `MISTBOARD_AUTH_EMAIL_FROM` are configured, `start` sends
the code through Resend. In local/dev, `start` also returns `devCode` in the
JSON response so the flow can be tested without email delivery. Confirming
creates or reuses a durable `users` row and sets an HttpOnly `mistboard_session`
cookie backed by `account_sessions`. This account session authorizes
account-owned actions only; live room moves still require room-scoped seat
authority.

## Apps/server In Production-Like Runtimes

`npm start` runs `node apps/server/dist/index.js`, which serves both:

- Static `apps/web/dist/*` over HTTP from the same `$PORT`.
- WebSocket upgrades on the same port.

The build pipeline must produce `apps/web/dist` before `apps/server` starts.

## Public Rollout Checks

For public verification, the important checks are provider-neutral:

1. Migrations apply before the server accepts traffic.
2. `/health` reports unhealthy if persistence is required but unavailable.
3. A completed game remains replayable after a restart.
4. A live room rehydrates from events after a restart.
5. Live Fog of War replay APIs still reject full event access until terminal state.

## Write ordering: persist-then-apply

```ts
async function appendEvent(room, event) {
  const seq = room.events.length;
  await persistence.appendEvent(room.id, seq, event);  // throws on failure
  room.events.push(event);
  room.projection = replayGameEvents(room.events);
  scheduleClockTimeout(room);
}
```

Postgres write goes first. If it fails, in-memory state never changes; the move (or seat assignment, or clock tick) effectively did not happen. The caller decides how to surface the failure to clients. State drift between memory and DB is impossible by construction — they either both have the event or neither does.

The cost is ~5–20ms of Postgres roundtrip per event. At chess pacing this is invisible. If write back-pressure ever shows up under bot traffic, batching is the answer (see "Future: batched writes" below).

## Crash semantics

- **Per-event durable.** `appendEvent` awaits the Postgres insert before the broadcast. A crash mid-write either commits the row or doesn't — no partial state.
- **Hydration is deterministic.** `replayGameEvents(events)` is pure; rehydrating produces the same `GameProjection` regardless of when the crash happened.
- **Clock state.** `clock-expired` is itself an event — if the server crashes mid-tick, on rehydration the next `scheduleClockTimeout` will detect already-expired clocks and emit the event then. No clock drift across restarts beyond the redeploy window itself, which is acceptable for v1 (testers reconnect, see expected state).

## Failure handling

The dangerous failure mode is silent: Postgres degrades, writes start failing, and games keep playing in memory while users believe their moves are persisted. Every defense is built around making that scenario impossible.

**Persist-then-apply ordering** is the structural defense (above). The rest is observability and surfacing.

- **Loud structured logs.** On every persistence failure, emit a single-line JSON log to stdout:
  ```
  console.error(JSON.stringify({
    level: 'error',
    kind: 'persistence_failure',
    roomId, seq, eventType: event.type,
    error: err.message,
    at: Date.now(),
  }));
  ```
  Deployment logs should capture stdout. Alerting can hook on `kind: persistence_failure`.

- **Don't swallow.** Errors propagate up to the WS message handler, which:
  1. Skips the broadcast (in-memory state was never updated, so there's nothing consistent to broadcast).
  2. Sends `{ type: 'error', reason: 'persistence_failure' }` to the originating client.
  3. The client surfaces a toast or "reconnecting" indicator and may retry the move.

- **Health endpoint surfaces recent failures.**
  ```
  GET /health
  → 200 { ok: true, databaseRequired: true, persistence: "enabled", persistenceErrors: { count1m: 0, lastAt: null } }
  → 503 { ok: false, databaseRequired: true, persistence: "disabled", persistenceErrors: { count1m: 0, lastAt: null } }
  → 503 { ok: false, databaseRequired: true, persistence: "enabled", persistenceErrors: { count1m: 4, lastAt: 1714... } }
  ```
  Production monitoring can alert on 503s; this gives operational visibility without requiring a metrics stack.

- **No silent retries in v1.** Retry logic adds complexity ahead of evidence. We'd rather see real failure modes first and design retries around what actually breaks.

The combination — persist-then-apply + loud logs + non-200 health on recent failures — means a degrading Postgres can't go unnoticed. Either every move starts visibly failing for clients, or operators see the 503 / log spike, or both.

## Future: batched writes

Synchronous per-event inserts are fine through PL2. The pressure point will likely be PL3 ladder traffic with multiple bots playing concurrently — Postgres write throughput per connection becomes the ceiling, not Postgres itself.

When that arrives, the change is to a per-room write queue with a debounce (e.g., 50ms) that flushes a batch insert. Crash semantics shift slightly: a crash within the debounce window can lose up to N events. The mitigation is to flush synchronously at game-end (`king-capture`, `clock-expired`) and at any event the WS handler doesn't explicitly mark as batchable. Mid-game move events are batchable; terminal events aren't.

Not building this yet, but the persist-then-apply API surface is forward-compatible: `persistence.appendEvent` becomes "enqueue and resolve when flushed" rather than "insert and resolve."

## Migration & data model evolution

- New `GameEvent` variants: payload-only changes, no DDL.
- Renaming or restructuring an existing event: keep the old shape readable. The `replayGameEvents` reducer is the single chokepoint that needs to handle both.
- Backfill: if a payload format changes, write a one-shot script that reads + rewrites JSONB rows. Don't add migration framework ceremony for this.

## Cold archival (PL2+, not now)

Once the corpus pipeline matures, finished games dump to R2/S3 as NDJSON nightly:

```
SELECT payload FROM events
WHERE room_id IN (SELECT room_id FROM games WHERE ended_at::date = $1)
ORDER BY room_id, seq
```

Lab corpus consumers continue to read NDJSON. Live server doesn't depend on the archive.

## Open questions

- **Pregame-abandoned rooms.** A room created but never moved past `room-created` clutters `events`. Lean: GC rows older than 7 days where `seq` never exceeded a threshold. Cron, not v1.
- **Spectator semantics across restart.** Spectator state is connection-only, not persisted. After restart, spectators reconnect and see live state via fresh `PlayerView` snapshots. No data persistence concern.
- **Schema versioning.** Skipped intentionally. Two tables, JSONB payload — versioning happens at the application layer when reading payloads.
