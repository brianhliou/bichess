import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachBoardResizeGrip, restoreBoardScale } from './board-resize.js';

describe('board resize grip', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    document.body.replaceChildren();
    document.documentElement.classList.remove('board-resizing');
    document.documentElement.style.removeProperty('--uni-board-scale');
    localStorage.clear();
  });

  afterEach(() => {
    window.dispatchEvent(new Event('blur'));
    document.body.replaceChildren();
    document.documentElement.classList.remove('board-resizing');
    document.documentElement.style.removeProperty('--uni-board-scale');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('clears the global drag state when pointer capture is lost', () => {
    const { grip, pointerCapture } = setupGrip();

    grip.dispatchEvent(pointerEvent('pointerdown', 7, 100));
    expect(document.documentElement.classList.contains('board-resizing')).toBe(true);

    pointerCapture.lose();

    expect(document.documentElement.classList.contains('board-resizing')).toBe(false);
    grip.dispatchEvent(pointerEvent('pointermove', 7, 0));
    expect(document.documentElement.style.getPropertyValue('--uni-board-scale')).toBe('');
  });

  it('releases pointer capture and clears the global drag state when the window blurs', () => {
    const { grip, pointerCapture } = setupGrip();

    grip.dispatchEvent(pointerEvent('pointerdown', 11, 100));
    window.dispatchEvent(new Event('blur'));

    expect(pointerCapture.release).toHaveBeenCalledWith(11);
    expect(document.documentElement.classList.contains('board-resizing')).toBe(false);
  });

  it('does not dispatch resize events while dragging repeatedly beyond maximum scale', () => {
    const { grip } = setupGrip();
    const onResize = vi.fn();
    window.addEventListener('resize', onResize);

    grip.dispatchEvent(pointerEvent('pointerdown', 13, 100));
    grip.dispatchEvent(pointerEvent('pointermove', 13, 600));
    grip.dispatchEvent(pointerEvent('pointermove', 13, 800));
    grip.dispatchEvent(pointerEvent('pointermove', 13, 1_000));

    expect(onResize).not.toHaveBeenCalled();
    expect(document.documentElement.style.getPropertyValue('--uni-board-scale')).toBe('');

    window.removeEventListener('resize', onResize);
  });

  it('still applies an in-range drag and cleans up on a normal pointer release', () => {
    const { grip, pointerCapture } = setupGrip();
    const onResize = vi.fn();
    window.addEventListener('resize', onResize);

    grip.dispatchEvent(pointerEvent('pointerdown', 17, 100));
    grip.dispatchEvent(pointerEvent('pointermove', 17, 20));

    expect(document.documentElement.style.getPropertyValue('--uni-board-scale')).toBe('0.800');
    expect(onResize).toHaveBeenCalledOnce();

    grip.dispatchEvent(pointerEvent('pointerup', 17, 20));

    expect(pointerCapture.release).toHaveBeenCalledWith(17);
    expect(document.documentElement.classList.contains('board-resizing')).toBe(false);

    window.removeEventListener('resize', onResize);
  });
});

// An embed is sized by the page that frames it. The grip fights the iframe
// dimensions the embedder chose, and the persisted scale is a number the
// visitor set on Mistboard proper: restoring it renders the board at up to half
// size inside a frame the embedder sized for a full one. Two embed routes reach
// this module, /embed/puzzle and /embed/analysis, and both did all of the above
// in production before this guard.
describe('inside an embed', () => {
  const realPath = window.location.pathname;

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    document.body.replaceChildren();
    document.documentElement.style.removeProperty('--uni-board-scale');
  });

  afterEach(() => {
    window.history.replaceState({}, '', realPath);
    document.body.replaceChildren();
    document.documentElement.style.removeProperty('--uni-board-scale');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  for (const path of ['/embed/puzzle', '/embed/puzzle/xq-mined-abc-1', '/embed/analysis/xiangqi']) {
    it(`mounts no grip on ${path}`, () => {
      window.history.replaceState({}, '', path);
      const host = document.createElement('div');
      document.body.append(host);
      const grip = attachBoardResizeGrip(host, document.createElement('div'));

      expect(host.querySelector('.board-resize-grip')).toBeNull();
      // Returned regardless, because review-layout.ts repositions what it gets
      // back and must not have to care.
      expect(grip.className).toBe('board-resize-grip');
    });
  }

  it('ignores a scale the viewer persisted on the site itself', () => {
    localStorage.setItem('mistboard-board-scale', '0.500');
    window.history.replaceState({}, '', '/embed/puzzle');

    restoreBoardScale();

    expect(document.documentElement.style.getPropertyValue('--uni-board-scale')).toBe('');
  });

  it('still restores it on the site', () => {
    localStorage.setItem('mistboard-board-scale', '0.500');
    window.history.replaceState({}, '', '/puzzles');

    restoreBoardScale();

    expect(document.documentElement.style.getPropertyValue('--uni-board-scale')).toBe('0.500');
  });
});

function setupGrip(): {
  grip: HTMLElement;
  pointerCapture: {
    release: ReturnType<typeof vi.fn>;
    lose(): void;
  };
} {
  const host = document.createElement('div');
  const board = document.createElement('div');
  host.append(board);
  document.body.append(host);
  vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({
    bottom: 400,
    height: 400,
    left: 0,
    right: 400,
    top: 0,
    width: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const grip = attachBoardResizeGrip(host, board);
  let capturedPointerId: number | null = null;
  const release = vi.fn((pointerId: number) => {
    if (capturedPointerId !== pointerId) return;
    capturedPointerId = null;
    grip.dispatchEvent(pointerEvent('lostpointercapture', pointerId, 0));
  });
  Object.defineProperties(grip, {
    setPointerCapture: {
      configurable: true,
      value: vi.fn((pointerId: number) => {
        capturedPointerId = pointerId;
      }),
    },
    hasPointerCapture: {
      configurable: true,
      value: vi.fn((pointerId: number) => capturedPointerId === pointerId),
    },
    releasePointerCapture: {
      configurable: true,
      value: release,
    },
  });

  return {
    grip,
    pointerCapture: {
      release,
      lose: () => {
        const pointerId = capturedPointerId;
        if (pointerId === null) return;
        capturedPointerId = null;
        grip.dispatchEvent(pointerEvent('lostpointercapture', pointerId, 0));
      },
    },
  };
}

function pointerEvent(type: string, pointerId: number, clientX: number): PointerEvent {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event as PointerEvent;
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}
