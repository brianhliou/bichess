/**
 * The trainer's two-column move list: [setup?, ...solution] rows with the
 * active (scrubbed-to) ply highlighted. Move notation dispatches through the
 * variant adapter's moveLabel.
 */

import {
  oppositePuzzleColor,
  type PuzzleColor,
  type PuzzleMove,
  type PuzzleSession,
} from './adapter.js';
import { puzzleBoardAdapter } from './registry.js';

export function moveListPanel(session: PuzzleSession): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'puzzle-moves';
  const list = document.createElement('ol');
  list.className = 'puzzle-move-list';
  const rows = puzzleMoveRows(session);
  for (const row of rows) {
    list.append(row);
  }
  panel.append(list);
  return panel;
}

// The opponent's move that set up the puzzle (the mined blunder), if the initial
// state carries one. Prepended to the move list so it reads like a game and the
// opening position (viewPly 0) highlights the move that created the puzzle.
function puzzleSetupMove(session: PuzzleSession): PuzzleMove | null {
  return session.puzzle.initial.lastMove ?? null;
}

type PuzzleMoveCell = { move: PuzzleMove; active: boolean };

function puzzleMoveRows(session: PuzzleSession): HTMLElement[] {
  const solverColor = session.puzzle.sideToMove ?? 'red';
  const setup = puzzleSetupMove(session);

  // Combined list: [setup?, ...solution]. The setup was played by the opponent,
  // so the whole sequence alternates starting from the opponent's color when a
  // setup exists, and from the solver's color otherwise.
  const combined: { move: PuzzleMove; solutionIndex: number | null }[] = [];
  if (setup) combined.push({ move: setup, solutionIndex: null });
  for (const [index, move] of session.playedMoves.entries()) {
    combined.push({ move, solutionIndex: index });
  }
  if (combined.length === 0) return [puzzleMoveContextRow(session)];

  const firstColor: PuzzleColor = setup ? oppositePuzzleColor(solverColor) : solverColor;
  // viewPly 0 = the setup/opening position (setup cell active); otherwise the
  // just-played solution ply is viewPly-1.
  const activeSolutionIndex = session.viewPly - 1;

  const rows = new Map<number, { black?: PuzzleMoveCell; red?: PuzzleMoveCell }>();
  for (const [combinedIndex, entry] of combined.entries()) {
    const color = moveColorAt(firstColor, combinedIndex);
    const number = puzzleMoveRowNumber(firstColor, combinedIndex);
    const row = rows.get(number) ?? {};
    row[color] = {
      move: entry.move,
      active:
        entry.solutionIndex === null
          ? session.viewPly === 0
          : entry.solutionIndex === activeSolutionIndex,
    };
    rows.set(number, row);
  }

  return Array.from(rows.entries()).map(([number, row]) =>
    puzzleMoveRow(number, row, firstColor, session),
  );
}

function puzzleMoveContextRow(session: PuzzleSession): HTMLElement {
  const firstColor = session.puzzle.sideToMove ?? 'red';
  const row = document.createElement('li');
  row.className = 'puzzle-move-item puzzle-move-context';
  const number = puzzleMoveCell('puzzle-move-number', '1');
  const red = puzzleMoveCell('puzzle-move-red', firstColor === 'black' ? '...' : '');
  const black = puzzleMoveCell('puzzle-move-black', firstColor === 'red' ? '...' : '');
  row.append(number, red, black);
  return row;
}

function puzzleMoveRow(
  number: number,
  rowMoves: { black?: PuzzleMoveCell; red?: PuzzleMoveCell },
  firstColor: PuzzleColor,
  session: PuzzleSession,
): HTMLElement {
  const moveLabel = puzzleBoardAdapter(session.puzzle.variant).moveLabel;
  const row = document.createElement('li');
  row.className = 'puzzle-move-item';
  const numberCell = puzzleMoveCell('puzzle-move-number', String(number));
  // When the list leads with black (black-first solve, or a red-solve whose
  // setup move was black's), row 1 has no red move; show the "…" lead marker
  // (matching puzzleMoveContextRow) so the opening move reads as the reply.
  const blackLeads = firstColor === 'black';
  const redCell = puzzleMoveCell(
    'puzzle-move-red',
    rowMoves.red ? moveLabel(rowMoves.red.move) : number === 1 && blackLeads ? '...' : '',
  );
  if (rowMoves.red?.active) redCell.classList.add('puzzle-move-cell--active');
  const blackCell = puzzleMoveCell(
    'puzzle-move-black',
    rowMoves.black ? moveLabel(rowMoves.black.move) : '',
  );
  if (rowMoves.black?.active) blackCell.classList.add('puzzle-move-cell--active');
  row.append(numberCell, redCell, blackCell);
  return row;
}

function puzzleMoveCell(className: string, text: string): HTMLSpanElement {
  const cell = document.createElement('span');
  cell.className = className;
  cell.textContent = text;
  return cell;
}

function moveColorAt(firstColor: PuzzleColor, plyIndex: number): PuzzleColor {
  return plyIndex % 2 === 0 ? firstColor : oppositePuzzleColor(firstColor);
}

// Full-move number for a solution ply. Red always occupies the left column, so
// when BLACK moves first its opening move sits alone in row 1 (red cell blank),
// pushing red down one — otherwise black's move and red's reply would share a
// row and, printed red-cell-first, read in reversed order (e.g. "1. d2-d6 h7-h3"
// when black actually played h7-h3 first). Red-first is the ordinary chess case.
export function puzzleMoveRowNumber(firstColor: PuzzleColor, plyIndex: number): number {
  const leadOffset = firstColor === 'black' ? 1 : 0;
  return Math.floor((plyIndex + leadOffset) / 2) + 1;
}
