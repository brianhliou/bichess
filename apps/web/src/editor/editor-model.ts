// The board editor's variant-neutral position model plus the one placement
// (de)serializer every variant's FEN grammar shares.
//
// Every Mistboard FEN dialect writes its placement the same way: ranks from the
// top rank down to rank 1 separated by '/', files left to right, an empty run as
// a digit, uppercase for the first colour and lowercase for the second. The
// dialects differ only in the letter table, the board size, and whether (and
// how) a face-down piece is written. That is what PlacementGrammar captures, so
// the routine is written once and each EditorSpec just supplies its table.

export type EditorColor = 'red' | 'black' | 'white';

/** Side to move. '-' is banqi / jungle-flip's untouched opening, before the
 *  first flip binds an ink to a seat. */
export type EditorTurn = EditorColor | '-';

export type EditorPiece =
  | { faceDown: false; color: EditorColor; role: string }
  // A face-down piece has no identity in the editor (the pool is dealt, not
  // placed). Its ink is known for jieqi and hidden (null) for banqi / jungle-flip.
  | { faceDown: true; color: EditorColor | null };

export type EditorBoard = Map<string, EditorPiece>;

/** A standard-chess castling right, spelled as the FEN letter. */
export type CastlingRight = 'K' | 'Q' | 'k' | 'q';

/** The two chess FEN fields the board alone cannot tell: castling rights and the
 *  en passant square. Read by the dark-chess spec only (editor-chess.ts). */
export interface EditorChessExtras {
  castling: Record<CastlingRight, boolean>;
  epSquare: string | null;
}

export interface EditorModel {
  board: EditorBoard;
  turn: EditorTurn;
  /** Board shown from the second colour's side. */
  flipped: boolean;
  /** Dealt variants only: pieces taken off the board and out of the pool,
   *  keyed `${color}:${role}`. Ignored elsewhere. */
  captured: Map<string, number>;
  /** Chess only: castling rights + en passant. Absent (and ignored) elsewhere. */
  chess?: EditorChessExtras;
}

export function emptyModel(turn: EditorTurn): EditorModel {
  return { board: new Map(), turn, flipped: false, captured: new Map() };
}

export function cloneModel(model: EditorModel): EditorModel {
  return {
    board: new Map(model.board),
    turn: model.turn,
    flipped: model.flipped,
    captured: new Map(model.captured),
    ...(model.chess
      ? { chess: { castling: { ...model.chess.castling }, epSquare: model.chess.epSquare } }
      : {}),
  };
}

export function capturedKey(color: EditorColor, role: string): string {
  return `${color}:${role}`;
}

export function samePiece(a: EditorPiece, b: EditorPiece): boolean {
  if (a.faceDown || b.faceDown) return a.faceDown === b.faceDown && a.color === b.color;
  return a.color === b.color && a.role === b.role;
}

// ── Placement grammar ───────────────────────────────────────────────────────

export interface PlacementGrammar {
  files: number;
  ranks: number;
  /** role -> the UPPERCASE letter (the `upper` colour's spelling). */
  roleChar: Readonly<Record<string, string>>;
  /** The colour written in uppercase and the one written in lowercase. */
  upper: EditorColor;
  lower: EditorColor;
  /** How a face-down piece is written: 'X' with no ink (banqi, jungle-flip), or
   *  X / x carrying the ink (jieqi). Absent for perfect-information variants. */
  faceDown?: 'colourless' | 'coloured';
  /** Square name for a 0-based file and 1-based rank. */
  square: (file: number, rank: number) => string;
}

export function allSquares(grammar: PlacementGrammar): string[] {
  const out: string[] = [];
  for (let rank = 1; rank <= grammar.ranks; rank += 1) {
    for (let file = 0; file < grammar.files; file += 1) out.push(grammar.square(file, rank));
  }
  return out;
}

function pieceChar(piece: EditorPiece, grammar: PlacementGrammar): string {
  if (piece.faceDown) {
    // A colourless grammar never carries the ink; a coloured one always does.
    if (grammar.faceDown === 'coloured') return piece.color === grammar.lower ? 'x' : 'X';
    return 'X';
  }
  const letter = grammar.roleChar[piece.role] ?? '?';
  return piece.color === grammar.lower ? letter.toLowerCase() : letter.toUpperCase();
}

export function writePlacement(board: EditorBoard, grammar: PlacementGrammar): string {
  const rows: string[] = [];
  for (let rank = grammar.ranks; rank >= 1; rank -= 1) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < grammar.files; file += 1) {
      const piece = board.get(grammar.square(file, rank));
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        row += String(empty);
        empty = 0;
      }
      row += pieceChar(piece, grammar);
    }
    if (empty > 0) row += String(empty);
    rows.push(row);
  }
  return rows.join('/');
}

/** Reads a placement field back into a board. Lenient on purpose: this seeds the
 *  editor, and the variant's own parser (normalizeStartFen) is the authority on
 *  legality. Null only when the text is not a placement of this shape at all. */
export function readPlacement(text: string, grammar: PlacementGrammar): EditorBoard | null {
  const rows = text.split('/');
  if (rows.length !== grammar.ranks) return null;
  const lowerToRole = new Map<string, string>();
  for (const [role, letter] of Object.entries(grammar.roleChar)) {
    lowerToRole.set(letter.toLowerCase(), role);
  }
  const board: EditorBoard = new Map();
  for (let i = 0; i < grammar.ranks; i += 1) {
    const rank = grammar.ranks - i;
    let file = 0;
    for (const ch of rows[i] ?? '') {
      if (ch >= '0' && ch <= '9') {
        file += Number(ch);
        continue;
      }
      if (file >= grammar.files) return null;
      const upper = ch === ch.toUpperCase();
      if (grammar.faceDown && ch.toLowerCase() === 'x' && !lowerToRole.has('x')) {
        board.set(grammar.square(file, rank), {
          faceDown: true,
          color: grammar.faceDown === 'coloured' ? (upper ? grammar.upper : grammar.lower) : null,
        });
        file += 1;
        continue;
      }
      const role = lowerToRole.get(ch.toLowerCase());
      if (!role) return null;
      board.set(grammar.square(file, rank), {
        faceDown: false,
        color: upper ? grammar.upper : grammar.lower,
        role,
      });
      file += 1;
    }
    if (file !== grammar.files) return null;
  }
  return board;
}
