// Pikafish-jieqi FEN encoder — the redaction boundary for the jieqi UCI engine
// (the Pikafish `jieqi` / `jieqi_old` branch, our "PikaJieQi" binary). This is the
// jieqi analogue of engine-protocol/build*.ts: it takes canonical game state and
// produces exactly what the engine is allowed to observe.
//
// Pikafish-jieqi FEN grammar (reverse-engineered from official-pikafish/Pikafish
// src/position.cpp on the jieqi branches):
//
//   <board> <stm> <restPieces> <rule40> <fullmove>
//
// - board: 10 ranks top-to-bottom = Pikafish RANK_9..RANK_0 = platform rank 10..1
//   (platform rank 1 is red's back rank). Files a..i left-to-right within a rank;
//   empty runs collapse to a digit. A revealed piece is its role char (UPPER=red,
//   lower=black). A face-down ("dark") piece is 'X' (red) / 'x' (black) with NO
//   identity. Generals are never dark, so they are always 'K' / 'k'.
// - stm: 'w' (red to move) | 'b' (black to move). Pikafish WHITE == red.
// - restPieces: for WHITE then BLACK, each non-king type in Pikafish order
//   (ROOK, ADVISOR, CANNON, PAWN, KNIGHT, BISHOP), as "<char><count>" where count
//   is that side's pieces still face-down. This is the flip-distribution pool.
//
// Redaction argument (why building from canonical truth is leak-free):
//   The board only ever emits X/x for a dark piece, never its role, so no hidden
//   identity reaches the engine. restPieces is the multiset of remaining hidden
//   types — which for the OPPONENT is fully public information (start - revealed -
//   captured), so it leaks no opponent secret; we compute it from canonical truth
//   purely to keep the FEN internally consistent (its counts must sum to the
//   on-board dark-square count, which a public-only derivation cannot guarantee
//   once an own dark piece is captured). The only over-disclosure is that the
//   engine's OWN pool reflects the true types of its own captured-while-dark
//   pieces — self-information, never an opponent secret, strategically negligible,
//   and not expressible as a single FEN multiset otherwise. Documented as a known
//   minor rule-fidelity gap (the strict capturer-only-reveal rule).

import {
  type DealtFenParseOptions,
  isNonNegativeInteger,
  parsePoolField,
  sameMultiset,
  shuffleWithRng,
} from './dealt-fen.js';
import {
  type JieqiBoard,
  type JieqiCapture,
  type JieqiColor,
  type JieqiGameState,
  type JieqiMove,
  type JieqiPiece,
  type JieqiPieceRole,
  type JieqiSquare,
  jieqiHomeSquares,
} from './variants-jieqi.js';
import { coordOf, inPalace, squareOf } from './variants-xiangqi.js';

const RED_ROLE_CHAR: Record<JieqiPieceRole, string> = {
  chariot: 'R',
  advisor: 'A',
  cannon: 'C',
  soldier: 'P',
  horse: 'N',
  elephant: 'B',
  general: 'K',
};

// Pikafish restPieces order: the non-king types as ROOK, ADVISOR, CANNON, PAWN,
// KNIGHT, BISHOP — i.e. chariot, advisor, cannon, soldier, horse, elephant.
const POOL_ROLES: readonly JieqiPieceRole[] = [
  'chariot',
  'advisor',
  'cannon',
  'soldier',
  'horse',
  'elephant',
];

function pieceChar(piece: JieqiPiece): string {
  if (piece.faceDown) return piece.color === 'red' ? 'X' : 'x';
  const ch = RED_ROLE_CHAR[piece.role];
  return piece.color === 'red' ? ch : ch.toLowerCase();
}

function boardField(board: JieqiBoard): string {
  const rows: string[] = [];
  for (let rank = 10; rank >= 1; rank -= 1) {
    let row = '';
    let empty = 0;
    for (let file = 0; file <= 8; file += 1) {
      const piece = board[squareOf(file, rank)];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        row += String(empty);
        empty = 0;
      }
      row += pieceChar(piece);
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }
  return rows.join('/');
}

function restPiecesField(board: JieqiBoard): string {
  const counts = new Map<string, number>();
  for (const piece of Object.values(board)) {
    if (!piece?.faceDown) continue;
    const key = `${piece.color}:${piece.role}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let out = '';
  for (const color of ['red', 'black'] as const) {
    for (const role of POOL_ROLES) {
      const ch = color === 'red' ? RED_ROLE_CHAR[role] : RED_ROLE_CHAR[role].toLowerCase();
      out += `${ch}${counts.get(`${color}:${role}`) ?? 0}`;
    }
  }
  return out;
}

/** Encode canonical jieqi state as a redacted Pikafish-jieqi FEN for the engine. */
export function jieqiStateToPikafishFen(state: JieqiGameState): string {
  const turn = state.status.type === 'playing' ? state.status.turn : 'red';
  return [
    boardField(state.board),
    turn === 'red' ? 'w' : 'b',
    restPiecesField(state.board),
    state.noCaptureClock,
    state.moveNumber,
  ].join(' ');
}

/** Platform square (rank 1..10) -> Pikafish square (rank 0..9). */
export function jieqiSquareToPikafish(square: JieqiSquare): string {
  const { file, rank } = coordOf(square);
  return `${String.fromCharCode(97 + file)}${rank - 1}`;
}

/** Platform move -> Pikafish UCI string (e.g. {from:'a1',to:'a2'} -> "a0a1"). */
export function jieqiMoveToPikafishUci(move: JieqiMove): string {
  return `${jieqiSquareToPikafish(move.from)}${jieqiSquareToPikafish(move.to)}`;
}

const PIKAFISH_UCI = /^([a-i])([0-9])([a-i])([0-9])$/;

/** Pikafish bestmove (rank 0..9) -> platform move (rank 1..10). Null if unparseable. */
export function pikafishUciToJieqiMove(uci: string): JieqiMove | null {
  const m = PIKAFISH_UCI.exec(uci.trim());
  if (!m) return null;
  const toSquare = (f: string, r: string): JieqiSquare =>
    squareOf(f.charCodeAt(0) - 97, Number(r) + 1);
  return { from: toSquare(m[1], m[2]), to: toSquare(m[3], m[4]) };
}

// ── Dealt FEN (Pikafish FEN + hidden identities) ─────────────────────────────
// The reverse direction, for seeding an analysis board or an editor from a
// pasted position. The five public fields are the Pikafish FEN above; an
// optional sixth `hidden` field pins the deal: one role char per dark piece in
// BOARD ORDER (rank 10 first, files a..i), UPPER for a red (X) square and lower
// for a black (x) square, or `-` when nothing is dark. A public FEN samples each
// side's dark identities from that side's pool.

const ROLE_FOR_CHAR = new Map<string, JieqiPieceRole>(
  (Object.entries(RED_ROLE_CHAR) as [JieqiPieceRole, string][]).map(([role, ch]) => [ch, role]),
);

const JIEQI_PIECE_COUNTS: Record<JieqiPieceRole, number> = {
  chariot: 2,
  advisor: 2,
  cannon: 2,
  soldier: 5,
  horse: 2,
  elephant: 2,
  general: 1,
};

export type ParseJieqiFenResult =
  | { ok: true; state: JieqiGameState; sampled: boolean }
  | { ok: false; error: string };

function hiddenField(board: JieqiBoard): string {
  let out = '';
  for (let rank = 10; rank >= 1; rank -= 1) {
    for (let file = 0; file <= 8; file += 1) {
      const piece = board[squareOf(file, rank)];
      if (!piece?.faceDown) continue;
      const ch = RED_ROLE_CHAR[piece.role];
      out += piece.color === 'red' ? ch : ch.toLowerCase();
    }
  }
  return out === '' ? '-' : out;
}

/** Pikafish FEN + the sixth `hidden` field: the exact deal, reproducible on reload. */
export function jieqiStateToDealtFen(state: JieqiGameState): string {
  return `${jieqiStateToPikafishFen(state)} ${hiddenField(state.board)}`;
}

/** Parse a public (5-field) or dealt (6-field) jieqi FEN into canonical state. */
export function parseJieqiFen(
  fen: string,
  options: DealtFenParseOptions = {},
): ParseJieqiFenResult {
  const fields = fen.trim().split(/\s+/).filter(Boolean);
  if (fields.length === 0) return { ok: false, error: 'Empty FEN.' };
  if (fields.length !== 5 && fields.length !== 6) {
    return { ok: false, error: `Expected 5 or 6 FEN fields, got ${fields.length}.` };
  }
  const [placement, turnField, poolField, clockField, movenumField, hidden] = fields;

  // Placement.
  const rows = placement!.split('/');
  if (rows.length !== 10) {
    return { ok: false, error: `Expected 10 ranks in the placement, got ${rows.length}.` };
  }
  const home: Record<JieqiColor, Set<JieqiSquare>> = {
    red: new Set(jieqiHomeSquares('red')),
    black: new Set(jieqiHomeSquares('black')),
  };
  const board: JieqiBoard = {};
  const darkSquares: { square: JieqiSquare; color: JieqiColor }[] = [];
  const revealed = new Map<string, number>();
  const generals: Record<JieqiColor, number> = { red: 0, black: 0 };
  for (let i = 0; i < 10; i += 1) {
    const rank = 10 - i;
    let file = 0;
    for (const ch of rows[i]!) {
      if (ch >= '1' && ch <= '9') {
        file += Number(ch);
        continue;
      }
      if (file >= 9) return { ok: false, error: `Rank ${rank} runs past 9 files.` };
      const square = squareOf(file, rank);
      const color: JieqiColor = ch === ch.toUpperCase() ? 'red' : 'black';
      const atFile = file;
      file += 1;
      if (ch === 'X' || ch === 'x') {
        if (!home[color].has(square)) {
          return {
            ok: false,
            error: `A dark ${color} piece on ${square} is not on a ${color} home square.`,
          };
        }
        darkSquares.push({ square, color });
        continue;
      }
      const role = ROLE_FOR_CHAR.get(ch.toUpperCase());
      if (!role) return { ok: false, error: `Unknown piece "${ch}" on rank ${rank}.` };
      if (role === 'general') {
        generals[color] += 1;
        if (!inPalace(color, atFile, rank)) {
          return { ok: false, error: `The ${color} general on ${square} is outside its palace.` };
        }
      } else {
        revealed.set(`${color}:${role}`, (revealed.get(`${color}:${role}`) ?? 0) + 1);
      }
      board[square] = { color, role, faceDown: false };
    }
    if (file !== 9) {
      return { ok: false, error: `Rank ${rank} covers ${file} files, expected 9.` };
    }
  }
  for (const color of ['red', 'black'] as const) {
    if (generals[color] !== 1) {
      return {
        ok: false,
        error: `Expected exactly one ${color} general, found ${generals[color]}.`,
      };
    }
  }

  // Turn (Pikafish 'w' is red; the position-key 'r' is accepted too).
  let turn: JieqiColor;
  if (turnField === 'w' || turnField === 'r') turn = 'red';
  else if (turnField === 'b') turn = 'black';
  else return { ok: false, error: `Unknown side-to-move "${turnField}" (expected w or b).` };

  // Pool: each side's still-dark multiset.
  const poolChars = parsePoolField(poolField!, (ch) => {
    const role = ROLE_FOR_CHAR.get(ch.toUpperCase());
    return role !== undefined && role !== 'general';
  });
  if (!poolChars) return { ok: false, error: `Unreadable pool field "${poolField}".` };
  const pool = new Map<string, number>();
  const poolTotal: Record<JieqiColor, number> = { red: 0, black: 0 };
  for (const [ch, n] of poolChars) {
    const color: JieqiColor = ch === ch.toUpperCase() ? 'red' : 'black';
    const key = `${color}:${ROLE_FOR_CHAR.get(ch.toUpperCase())}`;
    pool.set(key, (pool.get(key) ?? 0) + n);
    poolTotal[color] += n;
  }
  for (const color of ['red', 'black'] as const) {
    const dark = darkSquares.filter((entry) => entry.color === color).length;
    if (poolTotal[color] !== dark) {
      return {
        ok: false,
        error: `The pool lists ${poolTotal[color]} hidden ${color} pieces but the board has ${dark} dark ${color} pieces.`,
      };
    }
  }

  // Clocks.
  if (!isNonNegativeInteger(clockField)) {
    return { ok: false, error: 'The clock field must be a non-negative integer.' };
  }
  if (!isNonNegativeInteger(movenumField)) {
    return { ok: false, error: 'The move-number field must be a non-negative integer.' };
  }

  // Conservation: board + pool never exceeds the set; the remainder was captured.
  const captures: JieqiCapture[] = [];
  const poolList: Record<JieqiColor, JieqiPieceRole[]> = { red: [], black: [] };
  for (const color of ['red', 'black'] as const) {
    for (const role of POOL_ROLES) {
      const key = `${color}:${role}`;
      const inPool = pool.get(key) ?? 0;
      const shown = (revealed.get(key) ?? 0) + inPool;
      const max = JIEQI_PIECE_COUNTS[role];
      if (shown > max) {
        return {
          ok: false,
          error: `Too many ${color} ${role}s: the set has ${max}, the board and pool show ${shown}.`,
        };
      }
      for (let k = 0; k < inPool; k += 1) poolList[color].push(role);
      for (let k = shown; k < max; k += 1) {
        captures.push({ owner: color, role, revealedAtCapture: true });
      }
    }
  }

  // Hidden identities: given (sixth field) or sampled per side from its pool.
  const identities = new Map<JieqiSquare, JieqiPieceRole>();
  let sampled: boolean;
  if (hidden === undefined) {
    const rng = options.rng ?? Math.random;
    for (const color of ['red', 'black'] as const) {
      const roles = shuffleWithRng(poolList[color], rng);
      const squares = darkSquares.filter((entry) => entry.color === color);
      for (let i = 0; i < squares.length; i += 1) identities.set(squares[i]!.square, roles[i]!);
    }
    sampled = true;
  } else {
    const chars = hidden === '-' ? [] : [...hidden];
    if (chars.length !== darkSquares.length) {
      return {
        ok: false,
        error: `The hidden field lists ${chars.length} identities but the board has ${darkSquares.length} dark pieces.`,
      };
    }
    const given: Record<JieqiColor, JieqiPieceRole[]> = { red: [], black: [] };
    for (let i = 0; i < chars.length; i += 1) {
      const ch = chars[i]!;
      const { square, color } = darkSquares[i]!;
      const role = ROLE_FOR_CHAR.get(ch.toUpperCase());
      if (!role || role === 'general') return { ok: false, error: `Unknown hidden piece "${ch}".` };
      const chColor: JieqiColor = ch === ch.toUpperCase() ? 'red' : 'black';
      if (chColor !== color) {
        return {
          ok: false,
          error: `Hidden identity "${ch}" on ${square} does not match the ${color} dark piece there.`,
        };
      }
      given[color].push(role);
      identities.set(square, role);
    }
    for (const color of ['red', 'black'] as const) {
      if (!sameMultiset(given[color], poolList[color])) {
        return {
          ok: false,
          error: `The hidden field does not match the ${color} pool: the same pieces must appear in both.`,
        };
      }
    }
    sampled = false;
  }
  for (const { square, color } of darkSquares) {
    board[square] = { color, role: identities.get(square)!, faceDown: true };
  }

  return {
    ok: true,
    sampled,
    state: {
      id: options.gameId ?? 'fen-import',
      board,
      status: { type: 'playing', turn },
      moveNumber: Number(movenumField),
      noCaptureClock: Number(clockField),
      captures,
    },
  };
}
