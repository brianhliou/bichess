// Fog chess only: the castling-rights checkboxes and the en passant dropdown,
// after lichess.org/editor's "Castling" block. The board says where the pieces
// are; these two FEN fields say what the last moves left behind, so the editor
// carries them beside the board (EditorModel.chess) and the dark-chess spec
// writes them into fields 3 and 4.
//
// Both follow the board rather than the other way round: a right is offered
// only while its king and rook stand on their home squares, an en passant
// square only while a pawn of the side that just moved stands on its
// double-step rank with an empty origin and an empty landing square. Whatever
// the board can no longer honour is dropped on the next reconcile, so a FEN
// never claims a right the position cannot use.

import { type I18nKey, t } from '../i18n/catalog.js';
import type {
  CastlingRight,
  EditorBoard,
  EditorChessExtras,
  EditorColor,
  EditorModel,
  EditorTurn,
} from './editor-model.js';

/** FEN order. */
export const CASTLING_RIGHTS: readonly CastlingRight[] = ['K', 'Q', 'k', 'q'];

const CASTLING_HOME: Record<CastlingRight, { color: EditorColor; king: string; rook: string }> = {
  K: { color: 'white', king: 'e1', rook: 'h1' },
  Q: { color: 'white', king: 'e1', rook: 'a1' },
  k: { color: 'black', king: 'e8', rook: 'h8' },
  q: { color: 'black', king: 'e8', rook: 'a8' },
};

const CASTLING_LABEL_KEY: Record<CastlingRight, I18nKey> = {
  K: 'editor.castlingWhiteKingside',
  Q: 'editor.castlingWhiteQueenside',
  k: 'editor.castlingBlackKingside',
  q: 'editor.castlingBlackQueenside',
};

const FILES = 'abcdefgh';

export function noChessExtras(): EditorChessExtras {
  return { castling: { K: false, Q: false, k: false, q: false }, epSquare: null };
}

export function fullChessExtras(): EditorChessExtras {
  return { castling: { K: true, Q: true, k: true, q: true }, epSquare: null };
}

function hasPiece(board: EditorBoard, square: string, color: EditorColor, role: string): boolean {
  const piece = board.get(square);
  return piece !== undefined && !piece.faceDown && piece.color === color && piece.role === role;
}

/** Whether the board can still honour a right: king and rook on their home squares. */
export function castlingAvailable(board: EditorBoard, right: CastlingRight): boolean {
  const home = CASTLING_HOME[right];
  return (
    hasPiece(board, home.king, home.color, 'king') && hasPiece(board, home.rook, home.color, 'rook')
  );
}

/** The squares an en passant capture could land on, given the side to move: the
 *  side that just moved may have double-stepped a pawn, so for each of its pawns
 *  on its fourth rank with an empty origin and an empty square behind it, that
 *  square behind is a candidate. Lichess offers the same list. */
export function enPassantCandidates(board: EditorBoard, turn: EditorTurn): string[] {
  if (turn !== 'white' && turn !== 'black') return [];
  const mover: EditorColor = turn === 'white' ? 'black' : 'white';
  const pawnRank = mover === 'white' ? 4 : 5;
  const epRank = mover === 'white' ? 3 : 6;
  const originRank = mover === 'white' ? 2 : 7;
  const out: string[] = [];
  for (const file of FILES) {
    if (!hasPiece(board, `${file}${pawnRank}`, mover, 'pawn')) continue;
    if (board.has(`${file}${epRank}`) || board.has(`${file}${originRank}`)) continue;
    out.push(`${file}${epRank}`);
  }
  return out;
}

/** The extras as the FEN carries them: a right the board cannot honour and an
 *  en passant square that is not currently capturable are dropped. Pure. */
export function effectiveChessExtras(model: EditorModel): EditorChessExtras {
  const current = model.chess ?? noChessExtras();
  const castling = noChessExtras().castling;
  for (const right of CASTLING_RIGHTS) {
    castling[right] = current.castling[right] && castlingAvailable(model.board, right);
  }
  const epSquare =
    current.epSquare !== null &&
    enPassantCandidates(model.board, model.turn).includes(current.epSquare)
      ? current.epSquare
      : null;
  return { castling, epSquare };
}

/** Writes the effective extras back into the model, so the checkbox state follows
 *  the board: a king that leaves e1 takes K and Q with it for good. */
export function reconcileChessExtras(model: EditorModel): EditorChessExtras {
  model.chess = effectiveChessExtras(model);
  return model.chess;
}

/** FEN field 3: the held rights in KQkq order, or '-'. */
export function castlingField(extras: EditorChessExtras): string {
  const letters = CASTLING_RIGHTS.filter((right) => extras.castling[right]).join('');
  return letters || '-';
}

/** FEN fields 3 and 4 back into extras. Lenient: a malformed field reads as
 *  none (the board is what the editor is for; the variant parser is the
 *  authority on the rest). Shredder-style file letters are not read. */
export function parseChessExtras(
  castlingText: string | undefined,
  epText: string | undefined,
): EditorChessExtras {
  const extras = noChessExtras();
  if (castlingText && /^[KQkq]{1,4}$/.test(castlingText)) {
    for (const letter of castlingText) extras.castling[letter as CastlingRight] = true;
  }
  if (epText && /^[a-h][36]$/.test(epText)) extras.epSquare = epText;
  return extras;
}

// ── The card ────────────────────────────────────────────────────────────────

/** The right-rail card: four castling checkboxes and the en passant select.
 *  Reconciles the model first, so what it shows is what the FEN will say. The
 *  page re-renders it on every update; `onChange` asks for that update. */
export function renderChessExtrasCard(model: EditorModel, onChange: () => void): HTMLElement {
  const extras = reconcileChessExtras(model);

  const card = document.createElement('section');
  card.className = 'editor-card editor-chess';

  const title = document.createElement('h3');
  title.className = 'editor-card__title';
  title.textContent = t('editor.castling');

  const grid = document.createElement('div');
  grid.className = 'editor-castling';
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', t('editor.castling'));
  for (const right of CASTLING_RIGHTS) {
    const label = document.createElement('label');
    label.className = 'editor-check';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `editor-castling-${right}`;
    input.dataset.castling = right;
    input.disabled = !castlingAvailable(model.board, right);
    input.checked = extras.castling[right];
    input.addEventListener('change', () => {
      extras.castling[right] = input.checked;
      onChange();
    });
    label.append(input, document.createTextNode(t(CASTLING_LABEL_KEY[right])));
    grid.append(label);
  }

  const epRow = document.createElement('div');
  epRow.className = 'editor-chess__ep';
  const epLabel = document.createElement('label');
  epLabel.className = 'editor-chess__ep-label';
  epLabel.htmlFor = 'editor-ep-square';
  epLabel.textContent = t('editor.enPassant');
  const select = document.createElement('select');
  select.id = 'editor-ep-square';
  select.className = 'editor-select editor-ep';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = t('editor.enPassantNone');
  select.append(none);
  const candidates = enPassantCandidates(model.board, model.turn);
  for (const square of candidates) {
    const option = document.createElement('option');
    option.value = square;
    option.textContent = square;
    select.append(option);
  }
  select.value = extras.epSquare ?? '';
  select.disabled = candidates.length === 0;
  select.addEventListener('change', () => {
    extras.epSquare = select.value || null;
    onChange();
  });
  epRow.append(epLabel, select);

  card.append(title, grid, epRow);
  return card;
}
