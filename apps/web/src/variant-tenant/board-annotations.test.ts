import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  annotationOwner,
  drawnBoardOverlays,
  installBoardAnnotations,
} from './board-annotations.js';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function mountBoard(squares: readonly string[]): {
  board: HTMLElement;
  cells: Map<string, HTMLElement>;
} {
  const board = document.createElement('div');
  const cells = new Map<string, HTMLElement>();
  for (const name of squares) {
    const cell = document.createElement('div');
    cell.dataset.square = name;
    board.append(cell);
    cells.set(name, cell);
  }
  document.body.append(board);
  return { board, cells };
}

/** Drive one right-button gesture. `to` null = a tap (circle); otherwise the
 *  pointer is released over that square, which installBoardDraw resolves through
 *  document.elementFromPoint. */
function rightDraw(
  cells: Map<string, HTMLElement>,
  from: string,
  to: string | null,
  modifier = false,
): void {
  vi.spyOn(document, 'elementFromPoint').mockReturnValue(
    to ? (cells.get(to) as Element) : (cells.get(from) as Element),
  );
  cells.get(from)?.dispatchEvent(
    new MouseEvent('pointerdown', {
      bubbles: true,
      button: 2,
      cancelable: true,
      shiftKey: modifier,
    }),
  );
  document.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 2 }));
}

describe('installBoardAnnotations', () => {
  const setup = (gameId: () => string | null = () => 'game-1') => {
    const { board, cells } = mountBoard(['a1', 'a2', 'e4']);
    const repaint = vi.fn();
    const annotations = installBoardAnnotations({ board, repaint, gameId });
    return { board, cells, repaint, annotations };
  };

  it('draws an arrow between two squares and a circle on a tap', () => {
    const { cells, annotations, repaint } = setup();
    rightDraw(cells, 'a1', 'a2');
    rightDraw(cells, 'e4', null);
    expect(annotations.shapes()).toEqual([
      { kind: 'arrow', brush: 'green', orig: 'a1', dest: 'a2' },
      { kind: 'circle', brush: 'green', orig: 'e4' },
    ]);
    expect(repaint).toHaveBeenCalledTimes(2);
  });

  it('erases a shape when the same one is drawn again', () => {
    const { cells, annotations } = setup();
    rightDraw(cells, 'a1', 'a2');
    rightDraw(cells, 'a1', 'a2');
    expect(annotations.shapes()).toEqual([]);
  });

  it('uses the second brush when a modifier is held, which is a distinct shape', () => {
    const { cells, annotations } = setup();
    rightDraw(cells, 'a1', 'a2');
    rightDraw(cells, 'a1', 'a2', true);
    expect(annotations.shapes()).toEqual([
      { kind: 'arrow', brush: 'green', orig: 'a1', dest: 'a2' },
      { kind: 'arrow', brush: 'red', orig: 'a1', dest: 'a2' },
    ]);
  });

  it('erases everything on a left-button press, the way the chess board does', () => {
    const { board, cells, annotations, repaint } = setup();
    rightDraw(cells, 'a1', 'a2');
    repaint.mockClear();
    board.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(annotations.shapes()).toEqual([]);
    expect(repaint).toHaveBeenCalledTimes(1);
  });

  it('does not repaint on a left-button press when there is nothing to erase', () => {
    const { board, repaint } = setup();
    board.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    expect(repaint).not.toHaveBeenCalled();
  });

  it('survives repeated renders inside one game', () => {
    const { cells, annotations } = setup();
    rightDraw(cells, 'a1', 'a2');
    annotations.shapes();
    annotations.shapes();
    expect(annotations.shapes()).toHaveLength(1);
  });

  it('drops them when the owning game changes', () => {
    let owner: string | null = 'game-1';
    const { cells, annotations } = setup(() => owner);
    rightDraw(cells, 'a1', 'a2');
    expect(annotations.shapes()).toHaveLength(1);
    owner = null; // the game finished
    expect(annotations.shapes()).toEqual([]);
    owner = 'game-2'; // a rematch started
    expect(annotations.shapes()).toEqual([]);
  });
});

describe('annotationOwner', () => {
  it('names the game while it is being played and nothing once it is not', () => {
    expect(annotationOwner({ id: 'g1', status: { type: 'playing' } })).toBe('g1');
    expect(annotationOwner({ id: 'g1', status: { type: 'finished' } })).toBeNull();
    expect(annotationOwner(null)).toBeNull();
  });
});

describe('drawnBoardOverlays', () => {
  it('splits shapes into arrows and circle markers with their brush classes', () => {
    expect(
      drawnBoardOverlays([
        { kind: 'arrow', brush: 'green', orig: 'a1', dest: 'a2' },
        { kind: 'circle', brush: 'red', orig: 'e4' },
      ]),
    ).toEqual({
      arrows: [{ from: 'a1', to: 'a2', className: 'xq-arrow--draw xq-shape--green' }],
      markers: [{ square: 'e4', kind: 'circle', className: 'xq-shape--red' }],
    });
  });

  it('renders an arrow with no destination as a circle rather than dropping it', () => {
    const { arrows, markers } = drawnBoardOverlays([{ kind: 'arrow', brush: 'green', orig: 'a1' }]);
    expect(arrows).toEqual([]);
    expect(markers).toHaveLength(1);
  });
});
