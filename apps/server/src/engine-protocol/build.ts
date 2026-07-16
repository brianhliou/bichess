/**
 * Builds an `EngineTurnRequest` from canonical room state.
 *
 * THIS IS THE SECURITY BOUNDARY. The only code path that produces an
 * engine request constructed from internal state. All engine calls must
 * route through here. The build function is the redaction barrier: it
 * takes the canonical truth (`GameState`, full `GameEvent[]`, raw seat
 * tokens, master seed) and emits only what the engine's perspective
 * player is legally entitled to know.
 *
 * Tests in `build.test.ts` assert the redaction invariants. They are the
 * gate that lets the engine live in a separate (private) repo while the
 * public Mistboard server stays auditable — see `engine-paths.ts` for
 * how the server resolves the private repo at runtime.
 *
 * What this file does NOT do:
 *  - Send the request anywhere. Caller routes to the engine adapter.
 *  - Apply the engine's response. Server validates `move ∈ legalMoves`
 *    separately.
 *  - Cache or memoize. Caller manages session state if useful.
 */

import { createHash } from 'node:crypto';
import {
  applyGameEvent,
  type Color,
  type EngineClock,
  type EngineObservation,
  type EngineObservationPush,
  type EngineSessionIdInputs,
  type EngineTurnRequest,
  type GameEvent,
  type GameState,
  initialGameProjection,
  type Move,
  type PieceLetter,
  type PieceRole,
  type Square,
  type SquareIndex,
  variantForId,
} from '@mistboard/game';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

/** Convert a Square name ('a1') to an index 0..63 (a1=0, h8=63). */
export function squareIndex(sq: Square): SquareIndex {
  const file = FILES.indexOf(sq[0] as (typeof FILES)[number]);
  const rank = Number(sq[1]) - 1;
  return rank * 8 + file;
}

const ROLE_TO_LETTER: Record<PieceRole, PieceLetter> = {
  king: 'K',
  queen: 'Q',
  rook: 'R',
  bishop: 'B',
  knight: 'N',
  pawn: 'P',
};

/**
 * Stable per-engine-per-game session id. Engines treat as opaque but use
 * it to key per-game state (e.g., a PEnumerator belief set across turns).
 */
export function buildSessionId(inputs: EngineSessionIdInputs): string {
  const h = createHash('sha256');
  h.update(inputs.gameId);
  h.update('|');
  h.update(inputs.engineId);
  h.update('|');
  h.update(inputs.color);
  return h.digest('hex').slice(0, 16);
}

/**
 * Per-turn deterministic seed for the engine's RNG.
 *
 * Derived from `(engineSecret, gameId, engineId, color, ply)`. Critically
 * NOT derived from the room's master seed — engines never see the master
 * seed, and a leaked engineSeed should not allow reconstructing it.
 *
 * `engineSecret` is supplied by the server's environment (or defaulted to
 * a stable constant in tests). In production it should be set once per
 * deployment so the same game produces the same engine play. Different
 * engineId values (e.g., different engine versions) produce different
 * seeds even at the same ply, which is desirable.
 *
 * Returns a non-negative 32-bit integer fitting `EngineTurnRequest.engineSeed`.
 */
export function deriveEngineSeed(args: {
  engineSecret: string;
  gameId: string;
  engineId: string;
  color: Color;
  ply: number;
}): number {
  const h = createHash('sha256');
  h.update('engineSeed/v1|');
  h.update(args.engineSecret);
  h.update('|');
  h.update(args.gameId);
  h.update('|');
  h.update(args.engineId);
  h.update('|');
  h.update(args.color);
  h.update('|');
  h.update(String(args.ply));
  const bytes = h.digest();
  // First 4 bytes → u32. Mask to non-negative 31-bit so it fits comfortably
  // as a JS number (safe-int range trivially honored).
  return ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 1;
}

/**
 * Per-side visible squares from canonical state. The protocol's
 * `visibility_mask` is a 64-bit bitmask of these.
 */
function visibilityMaskFor(state: GameState, color: Color): bigint {
  const variant = variantForId(state.variant);
  const view = variant.getPlayerView(state, color);
  let mask = 0n;
  for (const sq of view.visibleSquares) {
    mask |= 1n << BigInt(squareIndex(sq));
  }
  return mask;
}

function maskHex(mask: bigint): string {
  // 16 hex digits, zero-padded
  const hex = mask.toString(16).padStart(16, '0');
  return `0x${hex}`;
}

function visiblePiecesFor(
  state: GameState,
  color: Color,
): Array<[SquareIndex, { type: PieceLetter; color: Color }]> {
  const variant = variantForId(state.variant);
  const view = variant.getPlayerView(state, color);
  const out: Array<[SquareIndex, { type: PieceLetter; color: Color }]> = [];
  // PlayerView.board is already redacted (only contains visible squares).
  for (const [sq, piece] of Object.entries(view.board) as Array<
    [Square, { color: Color; role: PieceRole }]
  >) {
    if (!piece) continue;
    out.push([squareIndex(sq), { type: ROLE_TO_LETTER[piece.role], color: piece.color }]);
  }
  // Stable ordering by square index for diffability.
  out.sort((a, b) => a[0] - b[0]);
  return out;
}

/**
 * Compute what `color` observes from the transition `prevState → nextState`
 * driven by `move` (made by `prevState.status.turn`).
 *
 * If `move` is `null`, this is the initial observation (ply 0, no prior
 * state) — captures the starting position from the perspective player's POV.
 *
 * The redaction logic:
 *  - visibility_mask + visible_pieces come from the POST-move state
 *  - own_capture_square is set iff one of `color`'s own pieces was on
 *    a square in the PREV state but missing from the NEXT state
 *  - opp_capture_landing_square is set iff the move's `to` square is in
 *    the POST-move visibility mask AND an opp piece occupies it
 *  - game_over reflects the post-move terminal status
 */
export function buildObservationForPly(args: {
  prevState: GameState | null;
  nextState: GameState;
  move: Move | null;
  perspective: Color;
  ply: number;
}): EngineObservation {
  const { prevState, nextState, move, perspective, ply } = args;
  const mover = prevState?.status.type === 'playing' ? prevState.status.turn : null;
  const kind: EngineObservation['kind'] = !mover
    ? 'initial'
    : mover === perspective
      ? 'own_move'
      : 'opp_move';

  const visibility_mask = visibilityMaskFor(nextState, perspective);
  const visible_pieces = visiblePiecesFor(nextState, perspective);

  // own_capture_square: one of perspective's pieces vanished from board
  let own_capture_square: SquareIndex | null = null;
  if (prevState && move) {
    const prevOwnSquares = ownSquaresOf(prevState, perspective);
    const nextOwnSquares = new Set(ownSquaresOf(nextState, perspective));
    const vanished = prevOwnSquares.filter((sq) => !nextOwnSquares.has(sq));
    // Filter to vanished squares that are ALSO in the next visibility mask
    // (i.e., we can attribute the loss because we still see the square).
    // For own pieces moving themselves, the source square vanishes from own
    // squares — we exclude that via the move.from check.
    const realLoss = vanished.filter((sq) => sq !== move.from);
    if (realLoss.length === 1) {
      own_capture_square = squareIndex(realLoss[0]);
    }
  }

  // opp_capture_landing_square: post-move `to` square contains opp piece
  // AND is in the perspective's visibility mask.
  let opp_capture_landing_square: SquareIndex | null = null;
  if (move && mover && mover !== perspective) {
    const toIdx = squareIndex(move.to);
    const toBit = 1n << BigInt(toIdx);
    if ((visibility_mask & toBit) !== 0n) {
      const landed = nextState.board[move.to];
      if (landed && landed.color === mover) {
        opp_capture_landing_square = toIdx;
      }
    }
  }

  const game_over =
    nextState.status.type === 'finished'
      ? { winner: nextState.status.winner, reason: nextState.status.reason }
      : null;

  // own_move: present only when this was the engine's own move.
  // Required for cold-start transcript replay — the engine needs the
  // exact move to deterministically advance its P set via
  // PEnumerator.update_own_move(move).
  const own_move: Move | null = kind === 'own_move' ? move : null;

  return {
    ply,
    kind,
    own_move,
    visibility_mask: maskHex(visibility_mask),
    visible_pieces,
    own_capture_square,
    opp_capture_landing_square,
    game_over,
  };
}

function ownSquaresOf(state: GameState, color: Color): Square[] {
  return (Object.entries(state.board) as Array<[Square, { color: Color }]>)
    .filter(([, piece]) => piece?.color === color)
    .map(([sq]) => sq);
}

/**
 * Construct the full observation transcript by replaying events from
 * the initial projection. Used on cold-start.
 *
 * Note: this re-derives every observation from canonical state. The
 * canonical state is consumed but never exposed in the output.
 */
export function buildObservationTranscript(args: {
  variantId: GameState['variant'];
  roomId: string;
  events: GameEvent[];
  perspective: Color;
}): EngineObservation[] {
  const { variantId, roomId, events, perspective } = args;
  let projection = initialGameProjection(roomId, variantId);
  const transcript: EngineObservation[] = [
    buildObservationForPly({
      prevState: null,
      nextState: projection.state,
      move: null,
      perspective,
      ply: 0,
    }),
  ];

  let ply = 0;
  for (const ev of events) {
    const prevState = projection.state;
    projection = applyGameEvent(projection, ev);
    if (ev.type !== 'move-played') continue;
    ply += 1;
    transcript.push(
      buildObservationForPly({
        prevState,
        nextState: projection.state,
        move: ev.move,
        perspective,
        ply,
      }),
    );
  }
  return transcript;
}

/**
 * Construct the legal-move list for the engine at the current state.
 *
 * Delegates to the variant's `getPlayerView(state, color).legalMoves` —
 * which is already pseudo-legal from the perspective player's POV with
 * FoW visibility constraints baked in. This is the SAME list the engine
 * sees and the same list the server validates against.
 */
function legalMovesFor(state: GameState, color: Color): Move[] {
  const variant = variantForId(state.variant);
  return variant.getPlayerView(state, color).legalMoves;
}

/**
 * Engine's own clock state. Opp's clock is intentionally excluded.
 */
function clockFor(state: GameState, color: Color): EngineClock {
  const cs = state.clock;
  return {
    remaining_ms: cs ? cs.remainingMs[color] : null,
    increment_ms: cs ? cs.incrementMs : 0,
  };
}

/**
 * Main entry: produce an `EngineTurnRequest` for the engine seated as
 * `engineColor` in the given room. The engine MUST be the side to move
 * (caller validates).
 *
 * `cold` controls transcript vs delta:
 *   - `true`: include full `observationTranscript`. Use on first turn of
 *     a session, or when the engine signals no prior state.
 *   - `false`: include only `latestObservationDelta` since the engine's
 *     last turn. Caller is responsible for ensuring the engine has prior
 *     state from the same `sessionId`.
 */
export function buildEngineTurnRequest(args: {
  gameId: string;
  engineId: string;
  engineSecret: string;
  engineColor: Color;
  state: GameState;
  events: GameEvent[];
  ply: number;
  cold: boolean;
}): EngineTurnRequest {
  const { gameId, engineId, engineSecret, engineColor, state, events, ply, cold } = args;

  const sessionId = buildSessionId({ gameId, engineId, color: engineColor });
  const engineSeed = deriveEngineSeed({
    engineSecret,
    gameId,
    engineId,
    color: engineColor,
    ply,
  });

  const transcript = cold
    ? buildObservationTranscript({
        variantId: state.variant,
        roomId: gameId,
        events,
        perspective: engineColor,
      })
    : undefined;

  // For delta: build only the latest observation by replaying just to the
  // last move.
  let latestObservationDelta: EngineObservation | undefined;
  if (!cold) {
    const fullTranscript = buildObservationTranscript({
      variantId: state.variant,
      roomId: gameId,
      events,
      perspective: engineColor,
    });
    latestObservationDelta = fullTranscript[fullTranscript.length - 1];
  }

  return {
    protocolVersion: '1',
    gameId,
    engineId,
    sessionId,
    color: engineColor,
    ply,
    engineSeed,
    clock: clockFor(state, engineColor),
    legalMoves: legalMovesFor(state, engineColor),
    observationTranscript: transcript,
    latestObservationDelta,
  };
}

/**
 * Build the post-move observation PUSH for the engine that just moved, so it can
 * observe its own move (new vantage) immediately and think on the opponent's
 * clock. `prevState` is the state the engine moved FROM; `nextState` is AFTER
 * the move is applied. The observation is built through the same redaction path
 * as the turn transcript (`buildObservationForPly`), so no hidden truth leaks.
 */
export function buildEngineObservationPush(args: {
  gameId: string;
  engineId: string;
  engineColor: Color;
  prevState: GameState;
  nextState: GameState;
  move: Move;
  /** Ply count AFTER the move. */
  ply: number;
  gameSpecId?: string;
}): EngineObservationPush {
  const { gameId, engineId, engineColor, prevState, nextState, move, ply, gameSpecId } = args;
  const observation = buildObservationForPly({
    prevState,
    nextState,
    move,
    perspective: engineColor,
    ply,
  });
  return {
    protocolVersion: '1',
    gameId,
    engineId,
    ...(gameSpecId ? { gameSpecId } : {}),
    sessionId: buildSessionId({ gameId, engineId, color: engineColor }),
    color: engineColor,
    ply,
    observation,
  };
}
