import {
  DROP_MINI_XIANGQI_DROP_ROLES,
  type DropMiniXiangqiDropRole,
  type DropMiniXiangqiMove,
  type DropMiniXiangqiPlayerView,
  isDropMiniXiangqiDropMove,
  type MiniXiangqiColor,
  type MiniXiangqiMove,
  type MiniXiangqiPlayerView,
  type MiniXiangqiSquare,
  miniXiangqiSquareOf,
} from '@mistboard/game';
import { readStoredXiangqiPieceSet } from './xiangqi-appearance-storage.js';
import { drawsVeteranSoldier } from './xiangqi-crossed-soldier.js';
import { renderXiangqiPieceGlyphed } from './xiangqi-piece-sets.js';

export type DropMiniXiangqiViewKey = 'truth';

export function dropMiniXiangqiBoardView(
  view: DropMiniXiangqiPlayerView,
  legalMoves: readonly MiniXiangqiMove[] = [],
): MiniXiangqiPlayerView {
  return {
    id: view.id,
    perspective: view.perspective,
    board: Object.fromEntries(
      Object.entries(view.board).map(([square, piece]) => [square, { piece, shrouded: false }]),
    ) as MiniXiangqiPlayerView['board'],
    visibleSquares: allMiniXiangqiSquares(),
    legalMoves: [...legalMoves],
    status: view.status,
    moveNumber: view.moveNumber,
    lastMove:
      view.lastMove && !isDropMiniXiangqiDropMove(view.lastMove) ? view.lastMove : undefined,
  };
}

export function dropMiniXiangqiBoardMoves(
  view: DropMiniXiangqiPlayerView,
  from?: MiniXiangqiSquare | null,
): MiniXiangqiMove[] {
  return view.legalMoves.filter(
    (move): move is MiniXiangqiMove =>
      !isDropMiniXiangqiDropMove(move) &&
      (from === undefined || from === null || move.from === from),
  );
}

export function dropMiniXiangqiDropTargets(
  view: DropMiniXiangqiPlayerView,
  role: DropMiniXiangqiDropRole | null,
): MiniXiangqiSquare[] {
  if (!role) return [];
  return view.legalMoves
    .filter((move) => isDropMiniXiangqiDropMove(move) && move.drop === role)
    .map((move) => move.to);
}

export function dropMiniXiangqiTargetMoves(
  targets: readonly MiniXiangqiSquare[],
): MiniXiangqiMove[] {
  return targets.map((to) => ({ from: to, to }));
}

export function dropMiniXiangqiMoveLabel(move: DropMiniXiangqiMove): string {
  if (isDropMiniXiangqiDropMove(move)) return `${dropRoleLetter(move.drop)}@${move.to}`;
  return `${move.from}-${move.to}`;
}

export function fillDropMiniXiangqiReserve(
  host: HTMLElement,
  view: DropMiniXiangqiPlayerView,
  owner: MiniXiangqiColor,
  options: {
    interactive?: boolean;
    selectedRole?: DropMiniXiangqiDropRole | null;
    onSelect?(role: DropMiniXiangqiDropRole): void;
  } = {},
): void {
  host.classList.add('drop-mini-reserve-strip');
  host
    .closest<HTMLElement>('.board-shell, .replay-pane')
    ?.classList.add('drop-mini-reserve-container');
  host.replaceChildren();
  const entries = DROP_MINI_XIANGQI_DROP_ROLES.map((role) => ({
    role,
    count: view.hands[owner][role] ?? 0,
    cooldown: view.cooldownHands[owner][role] ?? 0,
  })).filter((entry) => entry.count > 0 || entry.cooldown > 0);
  host.classList.toggle('has-captures', entries.length > 0);
  if (entries.length === 0) return;

  const pieceSet = readStoredXiangqiPieceSet();
  const row = document.createElement('div');
  row.className = 'drop-mini-reserve-row';
  for (const entry of entries) {
    const disabled = entry.count <= 0;
    const tile = options.interactive
      ? document.createElement('button')
      : document.createElement('span');
    tile.className = [
      'drop-mini-reserve-piece',
      entry.count > 1 ? 'has-count' : '',
      entry.cooldown > 0 ? 'drop-mini-reserve-piece--cooldown' : '',
      options.selectedRole === entry.role ? 'selected' : '',
    ]
      .filter(Boolean)
      .join(' ');
    if (tile instanceof HTMLButtonElement) {
      tile.type = 'button';
      tile.disabled = disabled;
      tile.dataset.drop = entry.role;
      tile.setAttribute(
        'aria-grabbed',
        options.selectedRole === entry.role && !disabled ? 'true' : 'false',
      );
      tile.addEventListener('click', () => options.onSelect?.(entry.role));
    }
    tile.setAttribute(
      'aria-label',
      `${owner} ${entry.role}${entry.count > 0 ? ` x${entry.count}` : ''}${
        entry.cooldown > 0 ? `, ${entry.cooldown} cooling down` : ''
      }`,
    );
    tile.innerHTML = renderXiangqiPieceGlyphed({ color: owner, role: entry.role }, pieceSet, {
      ariaLabel: `${owner} ${entry.role}`,
      // Veteran soldiers draw promoted everywhere, reserve tiles included.
      crossed: drawsVeteranSoldier(entry),
    });
    if (entry.count > 1) tile.append(countBadge(entry.count));
    if (entry.cooldown > 0) tile.append(cooldownBadge(entry.cooldown));
    row.append(tile);
  }
  host.append(row);
}

function countBadge(count: number): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'captures-count-badge';
  badge.textContent = String(count);
  return badge;
}

function cooldownBadge(count: number): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'captures-count-badge drop-mini-cooldown-badge';
  badge.textContent = String(count);
  return badge;
}

function dropRoleLetter(role: DropMiniXiangqiDropRole): string {
  switch (role) {
    case 'chariot':
      return 'R';
    case 'horse':
      return 'H';
    case 'cannon':
      return 'C';
    case 'soldier':
      return 'S';
  }
}

function allMiniXiangqiSquares(): MiniXiangqiSquare[] {
  const squares: MiniXiangqiSquare[] = [];
  for (let rank = 1; rank <= 7; rank += 1) {
    for (let file = 0; file < 7; file += 1) squares.push(miniXiangqiSquareOf(file, rank));
  }
  return squares;
}
