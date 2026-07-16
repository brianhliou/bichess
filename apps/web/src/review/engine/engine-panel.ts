// The review board's local-engine widget (fills mountReviewLayout's `enginePanel`
// slot). Owns a ceval handle, an on/off toggle, an advantage gauge, and up to
// MultiPV principal-variation lines. Position is pushed in via setPosition() from
// the postgame's ply navigation; scores are normalised to Red's POV so the gauge
// reads the same regardless of whose turn it is.
import {
  type CevalHandle,
  type CevalLine,
  type CevalUpdate,
  type CevalVariant,
  cevalEngineName,
  cevalSupported,
  createCeval,
} from './ceval.js';
import './engine-panel.css';
import type { EvalBar } from './eval-bar.js';
import { formatEval, winProbRed } from './eval-format.js';

export interface EnginePanel {
  el: HTMLElement;
  /** Push the current position. Without `initialFen` the moves replay from the
   *  standard start position; pass `initialFen` to analyse a mid-game base
   *  position (e.g. a puzzle) with `movesUci` applied on top. */
  setPosition(movesUci: string[], initialFen?: string): void;
  dispose(): void;
}

export interface EnginePanelOptions {
  variant: CevalVariant;
  multiPv?: number;
  maxDepth?: number;
  /** Prettify a PV move for display; defaults to the raw engine UCI. */
  formatPvMove?: (uci: string) => string;
  /** Optional on-board eval bar to drive in lockstep with the panel. */
  evalBar?: EvalBar;
  /** Fires with the latest MultiPV lines on every engine update, and with null
   *  whenever the output clears — toggle off, or a position change before new
   *  results arrive. Drives the on-board PV arrows. */
  onLines?: (lines: CevalLine[] | null) => void;
}

type Side = 'red' | 'black';

const DEBOUNCE_MS = 150;

export function createEnginePanel(opts: EnginePanelOptions): EnginePanel {
  const supported = cevalSupported(opts.variant);
  const engineName = cevalEngineName(opts.variant);
  // Mutable so the settings popover can retune them live.
  let multiPv = opts.multiPv ?? 3;
  let maxDepth = opts.maxDepth ?? 18;
  const formatMove = opts.formatPvMove ?? ((uci: string) => uci);

  const el = document.createElement('section');
  el.className = 'engine-panel';

  const head = document.createElement('div');
  head.className = 'engine-panel__head';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'engine-panel__toggle';
  toggle.setAttribute('aria-pressed', 'false');
  const gauge = document.createElement('div');
  gauge.className = 'engine-panel__gauge';
  const gaugeFill = document.createElement('div');
  gaugeFill.className = 'engine-panel__gauge-fill';
  gauge.append(gaugeFill);
  const evalLabel = document.createElement('strong');
  evalLabel.className = 'engine-panel__eval';
  evalLabel.textContent = '–';
  const gear = document.createElement('button');
  gear.type = 'button';
  gear.className = 'engine-panel__gear';
  gear.setAttribute('aria-label', 'Engine settings');
  gear.setAttribute('aria-expanded', 'false');
  gear.textContent = '⚙';
  head.append(toggle, gauge, evalLabel, gear);

  // Settings popover: number of lines (MultiPV) + search depth. Retuning re-runs
  // the current search if the engine is on.
  const settings = document.createElement('div');
  settings.className = 'engine-panel__settings';
  settings.hidden = true;
  settings.append(
    labeledSelect('Lines', ['1', '2', '3', '4', '5'], String(multiPv), (value) => {
      multiPv = Number(value);
      if (on) evaluateNow();
    }),
    labeledSelect('Depth', ['14', '18', '22', '26'], String(maxDepth), (value) => {
      maxDepth = Number(value);
      if (on) evaluateNow();
    }),
  );
  gear.addEventListener('click', () => {
    settings.hidden = !settings.hidden;
    gear.setAttribute('aria-expanded', settings.hidden ? 'false' : 'true');
  });

  const meta = document.createElement('div');
  meta.className = 'engine-panel__meta';

  const lines = document.createElement('ol');
  lines.className = 'engine-panel__lines';

  el.append(head, settings, meta, lines);

  let handle: CevalHandle | null = null;
  let on = false;
  let currentMoves: string[] = [];
  let currentFen: string | undefined;
  // Side to move at the base position: startpos is Red, but an initialFen (a
  // mid-game puzzle position) may hand the engine a Black-to-move base. Read it
  // from the FEN's turn token so the gauge normalises scores to the right POV.
  let currentBaseSide: Side = 'red';
  let debounceId: ReturnType<typeof setTimeout> | undefined;

  function sideToMove(moves: string[]): Side {
    const flipped = moves.length % 2 === 1;
    if (!flipped) return currentBaseSide;
    return currentBaseSide === 'red' ? 'black' : 'red';
  }

  function syncToggle(): void {
    toggle.textContent = on ? 'Engine on' : 'Engine';
    toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    toggle.classList.toggle('engine-panel__toggle--on', on);
    el.classList.toggle('engine-panel--on', on);
  }

  function setGauge(cp: number | null, mate: number | null): void {
    const prob = winProbRed(cp, mate);
    gaugeFill.style.width = `${(prob * 100).toFixed(1)}%`;
  }

  function clearOutput(): void {
    evalLabel.textContent = '–';
    meta.textContent = '';
    lines.replaceChildren();
    setGauge(null, null);
    opts.evalBar?.reset();
    opts.onLines?.(null);
  }

  function render(update: CevalUpdate, side: Side): void {
    const best = update.lines[0];
    if (best) {
      const { cp, mate } = redPov(best, side);
      evalLabel.textContent = formatEval(cp, mate);
      setGauge(cp, mate);
      opts.evalBar?.setEval(cp, mate);
    }
    meta.textContent = update.depth
      ? `${engineName} · depth ${update.depth}${update.nps ? ` · ${formatKnps(update.nps)}` : ''}`
      : `${engineName} · thinking…`;
    lines.replaceChildren(...update.lines.map((line) => renderLine(line, side, formatMove)));
    opts.onLines?.(update.lines);
  }

  function evaluateNow(): void {
    if (!on || !supported) return;
    const moves = currentMoves;
    const side = sideToMove(moves);
    meta.textContent = `${engineName} · loading…`;
    opts.evalBar?.setLoading();
    void handle!
      .evaluate({
        movesUci: moves,
        initialFen: currentFen,
        multiPv,
        maxDepth,
        onUpdate: (update) => render(update, side),
      })
      .catch((err: unknown) => {
        meta.textContent = `Engine error: ${(err as Error).message ?? 'failed'}`;
      });
  }

  function setPosition(movesUci: string[], initialFen?: string): void {
    currentMoves = movesUci;
    currentFen = initialFen;
    currentBaseSide = initialFen?.split(' ')[1] === 'b' ? 'black' : 'red';
    if (!on || !supported) return;
    // The panel keeps its last PV text until fresh results stream in, but
    // on-board arrows for a position we already left would be misleading —
    // clear them immediately and let the next update redraw.
    opts.onLines?.(null);
    clearTimeout(debounceId);
    debounceId = setTimeout(evaluateNow, DEBOUNCE_MS);
  }

  function turnOn(): void {
    if (!handle) handle = createCeval(opts.variant);
    on = true;
    syncToggle();
    opts.evalBar?.setIdle(false);
    meta.textContent = `${engineName} · loading…`;
    void handle
      .preload()
      .then(() => {
        if (on) evaluateNow();
      })
      .catch((err: unknown) => {
        meta.textContent = `Engine unavailable: ${(err as Error).message ?? 'failed'}`;
      });
  }

  function turnOff(): void {
    on = false;
    syncToggle();
    handle?.stop();
    clearOutput();
    opts.evalBar?.setIdle(true);
  }

  if (!supported) {
    toggle.disabled = true;
    toggle.textContent = 'Engine';
    meta.textContent = 'Local engine needs a cross-origin-isolated reload.';
  } else {
    toggle.addEventListener('click', () => (on ? turnOff() : turnOn()));
  }
  syncToggle();
  clearOutput();
  // The panel starts engine-off; the gauge reads inactive until turnOn.
  opts.evalBar?.setIdle(true);

  return {
    el,
    setPosition,
    dispose() {
      clearTimeout(debounceId);
      handle?.dispose();
    },
  };
}

function labeledSelect(
  label: string,
  options: string[],
  value: string,
  onChange: (value: string) => void,
): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'engine-panel__setting';
  const span = document.createElement('span');
  span.textContent = label;
  const select = document.createElement('select');
  for (const option of options) {
    const el = document.createElement('option');
    el.value = option;
    el.textContent = option;
    if (option === value) el.selected = true;
    select.append(el);
  }
  select.addEventListener('change', () => onChange(select.value));
  wrap.append(span, select);
  return wrap;
}

function renderLine(line: CevalLine, side: Side, formatMove: (uci: string) => string): HTMLElement {
  const li = document.createElement('li');
  li.className = 'engine-panel__line';
  const { cp, mate } = redPov(line, side);
  const score = document.createElement('span');
  score.className = `engine-panel__line-eval ${evalTone(cp, mate)}`;
  score.textContent = formatEval(cp, mate);
  const pv = document.createElement('span');
  pv.className = 'engine-panel__line-pv';
  pv.textContent = line.pvUci.slice(0, 8).map(formatMove).join(' ');
  li.append(score, pv);
  return li;
}

// Chip tone by who's ahead (Red POV), matching the on-board eval bar's palette:
// Red-ahead reads light, Black-ahead dark, near-even neutral.
function evalTone(cp: number | null, mate: number | null): string {
  const value = mate != null ? (mate > 0 ? 1 : -1) : (cp ?? 0) / 100;
  if (value > 0.15) return 'is-red';
  if (value < -0.15) return 'is-black';
  return 'is-even';
}

function redPov(line: CevalLine, side: Side): { cp: number | null; mate: number | null } {
  const sign = side === 'red' ? 1 : -1;
  return {
    cp: line.scoreCp == null ? null : line.scoreCp * sign,
    mate: line.mate == null ? null : line.mate * sign,
  };
}

function formatKnps(nps: number): string {
  return nps >= 1000 ? `${Math.round(nps / 1000)}k nps` : `${nps} nps`;
}
