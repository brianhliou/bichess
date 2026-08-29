// /learn/coordinates -- drill where a point is, and what the notation calls a
// file. The reasoning for the two targets is in notation-drill.ts; this file is
// DOM, timing and scoring only.
//
// PARKED. Built, tested, and deliberately not public: no nav entry, no sitemap,
// no SPA meta, and the server drops the path from isClientRoute so a prod hit
// gets the branded 404. Reachable in dev (coordinateTrainerEnabled) so it
// cannot rot unnoticed. The open questions -- notation coverage (the site
// offers four, this drills two) and whether a drill surface earns anything at
// current traffic -- are tracked in #327. Read it before unparking.
//
// The route and the nav say "coordinates" because that is the headline drill
// and the word a chess player arrives looking for; the modules keep their
// notation-* names because they also house the WXF file-number drill, which is
// not a coordinate system at all.
//
// Laid out after lichess's coordinate trainer, which was read as a rendered
// page rather than guessed at: a score card and the whole control stack on the
// left, board in the middle with the prompt drawn LARGE over it, and an
// explanation card plus the start button on the right. Controls are segmented
// pills, not radio lists. During a run the controls and the explanation give
// way to the run's own state, and the board never resizes.
//
// The page is sized to the viewport and never scrolls.
//
// Board labels are OFF by default and that is load-bearing: the board edge
// prints exactly what both drills ask for. The toggle stays available as
// training wheels, disabled mid-run so it cannot be used to game a score.

import '../live-xiangqi.css';
import './notation-trainer.css';

import {
  createInitialXiangqiBoard,
  type StandardXiangqiPlayerView,
  type XiangqiColor,
  type XiangqiSquare,
} from '@mistboard/game';
import { buildNav } from '../site-shell.js';
import { type XiangqiBoardMarker, xiangqiBoardSvg } from '../xiangqi-board.js';
import { notationCopy as copy } from './notation-copy.js';
import {
  consumeSquareInput,
  DRILL_DURATION_MS,
  type DrillDirection,
  type DrillPrompt,
  type DrillSideSetting,
  type DrillTarget,
  type DrillTimeControl,
  fileNumberOf,
  fileNumeral,
  fileNumeralChoices,
  isCorrectClick,
  isCorrectFileNumber,
  isCorrectSquareName,
  nextPrompt,
  promptSquares,
  SQUARE_FILES,
  SQUARE_RANKS,
} from './notation-drill.js';
import { bestScore, loadNotationBests, saveNotationScore } from './notation-storage.js';

/** Long enough to register as a rejection, short enough not to cost a streak.
 *  Matches the wrong-answer flash on lichess's trainer. */
const WRONG_FLASH_MS = 450;
const TICK_MS = 50;

export function mountNotationTrainer(root: HTMLElement): void {
  root.classList.add('landing-page', 'notation-page');
  const nav = buildNav();
  root.replaceChildren(nav);

  // ── State ────────────────────────────────────────────────────────────────
  let target: DrillTarget = 'point';
  let direction: DrillDirection = 'find';
  let sideSetting: DrillSideSetting = 'both';
  let timeControl: DrillTimeControl = 'thirtySeconds';
  let perspective: XiangqiColor = 'red';
  let showCoords = false;
  let showPieces = true;

  let playing = false;
  let score = 0;
  // Two prompts are live at once so the reader can see what is coming and never
  // waits on a repaint between answers. lichess does the same.
  let current: DrillPrompt | null = null;
  let upcoming: DrillPrompt | null = null;
  let typed = '';
  let wrong = false;
  let finished = false;
  let wrongTimer: number | undefined;
  let tickTimer: number | undefined;
  let endsAt = 0;
  let bests = loadNotationBests();

  const STARTING_BOARD = createInitialXiangqiBoard();

  const view: StandardXiangqiPlayerView = {
    id: 'notation-trainer',
    perspective: 'red',
    board: STARTING_BOARD,
    legalMoves: [],
    status: { type: 'playing', turn: 'red' },
    moveNumber: 1,
  };

  const rerender = (): void => render();

  // ── Small builders ───────────────────────────────────────────────────────
  function card(modifier: string): HTMLElement {
    const el = document.createElement('div');
    el.className = `notation-card notation-card--${modifier}`;
    return el;
  }

  function readoutCard(title: string): { block: HTMLElement; value: HTMLElement } {
    const block = card('readout');
    const caption = document.createElement('span');
    caption.className = 'notation-card__title';
    caption.textContent = title;
    const value = document.createElement('span');
    value.className = 'notation-readout';
    block.append(caption, value);
    return { block, value };
  }

  /** A segmented pill: the whole control is one row of buttons and the active
   *  one is filled. Replaces a radio list, which is what lichess uses and what
   *  reads as a setting you flick rather than a form you fill in. */
  function segmented<T extends string>(
    legend: string,
    options: { value: T; label: string }[],
    read: () => T,
    write: (value: T) => void,
  ): { group: HTMLElement; sync: () => void } {
    const group = document.createElement('div');
    group.className = 'notation-field';
    const caption = document.createElement('span');
    caption.className = 'notation-field__label';
    caption.textContent = legend;
    const row = document.createElement('div');
    row.className = 'notation-segmented';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', legend);
    const buttons: { el: HTMLButtonElement; value: T }[] = [];
    for (const option of options) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'notation-segment';
      button.textContent = option.label;
      button.addEventListener('click', () => {
        if (playing) return;
        write(option.value);
        rerender();
      });
      row.append(button);
      buttons.push({ el: button, value: option.value });
    }
    group.append(caption, row);
    const sync = (): void => {
      const active = read();
      for (const button of buttons) {
        const on = button.value === active;
        button.el.classList.toggle('is-active', on);
        button.el.setAttribute('aria-pressed', on ? 'true' : 'false');
        button.el.disabled = playing;
      }
    };
    return { group, sync };
  }

  function toggle(
    label: string,
    read: () => boolean,
    write: (value: boolean) => void,
  ): { row: HTMLElement; sync: () => void } {
    const row = document.createElement('label');
    row.className = 'notation-toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'notation-toggle__input';
    input.addEventListener('change', () => {
      write(input.checked);
      rerender();
    });
    const track = document.createElement('span');
    track.className = 'notation-toggle__track';
    track.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'notation-toggle__label';
    text.textContent = label;
    row.append(input, track, text);
    const sync = (): void => {
      input.checked = read();
      input.disabled = playing;
      row.classList.toggle('is-disabled', playing);
    };
    return { row, sync };
  }

  // ── Left column ──────────────────────────────────────────────────────────
  const side = document.createElement('aside');
  side.className = 'notation-side';

  const scoreCard = readoutCard(copy('notation.score'));
  const timeCard = readoutCard(copy('notation.time'));

  const statusCard = card('status');
  const bestRow = document.createElement('p');
  bestRow.className = 'notation-status__line';
  const contextRow = document.createElement('p');
  contextRow.className = 'notation-status__line';
  statusCard.append(contextRow, bestRow);

  const controls = document.createElement('div');
  controls.className = 'notation-controls';

  const stopButton = document.createElement('button');
  stopButton.type = 'button';
  stopButton.className = 'notation-quit';
  stopButton.textContent = copy('notation.stop');
  stopButton.addEventListener('click', () => stop());

  side.append(scoreCard.block, timeCard.block, statusCard, controls, stopButton);

  // ── Middle column ────────────────────────────────────────────────────────
  const main = document.createElement('div');
  main.className = 'notation-main';

  const boardWrap = document.createElement('div');
  boardWrap.className = 'notation-board';
  const boardHost = document.createElement('div');
  boardHost.className = 'notation-board__svg';
  // The prompt rides over the board, large, rather than sitting in a panel, so
  // the eye never leaves the thing being answered. Never intercepts a click.
  const coordOverlay = document.createElement('div');
  coordOverlay.className = 'notation-coord';
  const coordCurrent = document.createElement('span');
  coordCurrent.className = 'notation-coord__current';
  const coordNext = document.createElement('span');
  coordNext.className = 'notation-coord__next';
  coordOverlay.append(coordCurrent, coordNext);
  boardWrap.append(boardHost, coordOverlay);

  const progress = document.createElement('div');
  progress.className = 'notation-progress';
  const progressBar = document.createElement('span');
  progress.append(progressBar);

  const ask = document.createElement('p');
  ask.className = 'notation-ask';

  const answers = document.createElement('div');
  answers.className = 'notation-answers';

  main.append(boardWrap, progress, ask, answers);

  // ── Right column ─────────────────────────────────────────────────────────
  const table = document.createElement('div');
  table.className = 'notation-table';

  const explain = card('explain');
  const heading = document.createElement('h1');
  heading.className = 'notation-explain__heading';
  heading.textContent = copy('notation.heading');
  const lede = document.createElement('p');
  lede.textContent = copy('notation.lede');
  const why = document.createElement('ul');
  why.className = 'notation-why';
  for (const key of [
    'notation.why.analysis',
    'notation.why.talk',
    'notation.why.record',
  ] as const) {
    const item = document.createElement('li');
    item.textContent = copy(key);
    why.append(item);
  }
  const modeHeading = document.createElement('h2');
  modeHeading.className = 'notation-explain__mode';
  const modeDetail = document.createElement('p');
  const timeNote = document.createElement('p');
  explain.append(heading, lede, why, modeHeading, modeDetail, timeNote);

  const startButton = document.createElement('button');
  startButton.type = 'button';
  startButton.className = 'notation-start';
  startButton.textContent = copy('notation.start');
  startButton.addEventListener('click', () => start());

  table.append(explain, startButton);

  const shell = document.createElement('main');
  shell.className = 'notation-shell';
  shell.append(side, main, table);
  root.append(shell);

  // The page is sized to the viewport minus the nav, and the nav's height is
  // measured rather than assumed. puzzles.css hardcodes 53px for the same job
  // and this nav is 61px, which is exactly the kind of drift that turns a
  // no-scroll page into an 8px scrollbar.
  function syncNavHeight(): void {
    const height = Math.round(nav.getBoundingClientRect().height);
    if (height > 0) shell.style.setProperty('--notation-nav-height', `${height}px`);
  }
  syncNavHeight();
  requestAnimationFrame(syncNavHeight);
  window.addEventListener('resize', syncNavHeight);

  // ── Rendering ────────────────────────────────────────────────────────────
  function markers(): XiangqiBoardMarker[] {
    if (direction !== 'name' || !playing || !current) return [];
    return promptSquares(current).map((square) => ({
      square,
      kind: 'circle' as const,
      className: wrong ? 'notation-marker notation-marker--wrong' : 'notation-marker',
    }));
  }

  function renderBoard(): void {
    // An empty board is the purer coordinate drill; the starting position gives
    // landmarks ("the cannon starts on file 2"), which is why it is the default.
    view.board = showPieces ? STARTING_BOARD : {};
    boardHost.innerHTML = xiangqiBoardSvg(view, perspective, {
      // Only the 'find' direction takes board input; without the click layer
      // there are no hit rects to catch a stray tap while naming.
      interactive: direction === 'find' && playing,
      selectedSquare: null,
      draggingFrom: null,
      coordinates: showCoords,
      // Pinned to the drill, not to the reader's move-notation preference: the
      // training wheels have to show the system being asked for, or they teach
      // the opposite one.
      coordinateStyle: target === 'point' ? 'coordinate' : 'chinese-simplified',
      markers: markers(),
    });
    syncBoardRatio();
  }

  /** The board's width is derived from the height budget, so it needs the
   *  board's true aspect ratio. There are four of them: the intersection and
   *  cell layouts have different viewBoxes (552x612 vs 540x612), and turning
   *  the edge labels on adds a gutter to both dimensions, moving the ratio
   *  again. Reading it off the rendered SVG covers every combination and
   *  cannot drift when a layout is added, which a hardcoded pair would. */
  function syncBoardRatio(): void {
    const box = boardHost
      .querySelector('svg')
      ?.getAttribute('viewBox')
      ?.trim()
      .split(/[\s,]+/)
      .map(Number);
    if (box?.length !== 4) return;
    const width = box[2] ?? 0;
    const height = box[3] ?? 0;
    if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) return;
    shell.style.setProperty('--notation-board-ratio', String(width / height));
  }

  function sideLabel(side: XiangqiColor): string {
    return copy(side === 'red' ? 'notation.side.red' : 'notation.side.black');
  }

  /** The short string that IS the prompt, for the on-board overlay. */
  function promptLabel(prompt: DrillPrompt): string {
    return prompt.kind === 'point'
      ? prompt.square
      : `${sideLabel(prompt.side)} ${fileNumeral(fileNumberOf(prompt.fileIndex, prompt.side), prompt.side)}`;
  }

  function renderOverlay(): void {
    coordOverlay.classList.toggle('is-wrong', wrong);
    // The overlay carries the prompt only when the reader has to FIND it. When
    // naming, the board's own ring is the prompt and a label would answer it.
    const show = playing && direction === 'find' && current !== null;
    coordOverlay.hidden = !show;
    coordCurrent.textContent = show && current ? promptLabel(current) : '';
    coordNext.textContent = show && upcoming ? promptLabel(upcoming) : '';
  }

  function renderAsk(): void {
    if (!playing || !current || direction !== 'name') {
      ask.textContent = '';
      ask.hidden = true;
      return;
    }
    ask.hidden = false;
    ask.textContent =
      current.kind === 'point'
        ? copy('notation.namePointPrompt')
        : copy('notation.nameFilePrompt', { side: sideLabel(current.side) });
  }

  function answerButton(label: string, onPick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'notation-answer';
    button.textContent = label;
    button.addEventListener('click', onPick);
    return button;
  }

  function renderAnswers(): void {
    answers.replaceChildren();
    answers.className = 'notation-answers';
    if (direction !== 'name' || !playing || !current) return;

    if (current.kind === 'file') {
      answers.classList.add('notation-answers--files');
      for (const choice of fileNumeralChoices(current.side)) {
        const button = answerButton(choice.label, () => answerFileNumber(choice.value));
        button.setAttribute('aria-label', String(choice.value));
        answers.append(button);
      }
      return;
    }

    // Point naming: a typed buffer with the same two rows available as taps, so
    // the drill works on a phone and on a keyboard without two code paths.
    answers.classList.add('notation-answers--square');
    const echo = document.createElement('div');
    echo.className = 'notation-typed';
    echo.textContent = typed || copy('notation.typeHint');
    echo.classList.toggle('is-placeholder', !typed);
    answers.append(echo);

    const fileRow = document.createElement('div');
    fileRow.className = 'notation-keys notation-keys--files';
    for (const file of SQUARE_FILES) fileRow.append(answerButton(file, () => pressKey(file)));

    const rankRow = document.createElement('div');
    rankRow.className = 'notation-keys notation-keys--ranks';
    for (const rank of SQUARE_RANKS) {
      // '10' arrives as two keystrokes, exactly as it would from a keyboard.
      rankRow.append(
        answerButton(rank, () => {
          for (const char of rank) pressKey(char);
        }),
      );
    }
    answers.append(fileRow, rankRow);
  }

  function renderReadouts(): void {
    scoreCard.value.textContent = String(score);
    scoreCard.value.classList.toggle('is-wrong', wrong);
    if (timeControl === 'untimed') {
      timeCard.value.textContent = '∞';
    } else {
      const left = playing ? Math.max(0, endsAt - Date.now()) : DRILL_DURATION_MS;
      timeCard.value.textContent = String(Math.ceil(left / 1000));
    }

    const best = bestScore(bests, target, direction, sideSetting);
    bestRow.textContent = best > 0 ? `${copy('notation.best')} ${best}` : '';
    bestRow.hidden = best === 0;
    // During a run the settings are gone, so the two facts a reader may need
    // reminding of live here instead: which way the board faces, and (for the
    // file drill) whose numbering is being asked for.
    const context =
      target === 'file' && sideSetting !== 'both'
        ? copy('notation.playingAs', { side: sideLabel(sideSetting) })
        : copy('notation.playingBoard', { side: sideLabel(perspective) });
    contextRow.textContent =
      finished && !playing ? copy('notation.finalScore', { score }) : context;
    contextRow.classList.toggle('is-result', finished && !playing);
    statusCard.hidden = best === 0 && !playing && !finished;
  }

  function renderProgress(): void {
    progress.classList.toggle('is-untimed', timeControl === 'untimed');
    progress.classList.toggle('is-wrong', wrong);
    if (timeControl === 'untimed') {
      progressBar.style.width = '100%';
      return;
    }
    const left = playing ? Math.max(0, endsAt - Date.now()) : DRILL_DURATION_MS;
    progressBar.style.width = `${(left / DRILL_DURATION_MS) * 100}%`;
  }

  function directionHintText(): string {
    if (target === 'point') {
      return copy(
        direction === 'find' ? 'notation.direction.pointFind' : 'notation.direction.pointName',
      );
    }
    return copy(
      direction === 'find' ? 'notation.direction.fileFind' : 'notation.direction.fileName',
    );
  }

  const syncs: (() => void)[] = [];

  function renderControls(): void {
    for (const sync of syncs) sync();
    table.hidden = playing;
    controls.hidden = playing;
    stopButton.hidden = !playing;
    // The keypad only exists while naming, so the board reclaims that space
    // when finding. Direction is locked during a run, so this never moves the
    // board mid-drill.
    shell.classList.toggle('is-naming', direction === 'name');
    shell.classList.toggle('is-playing', playing);

    modeHeading.textContent = copy(
      direction === 'find' ? 'notation.direction.find' : 'notation.direction.name',
    );
    modeDetail.textContent = directionHintText();
    timeNote.textContent = copy(
      timeControl === 'thirtySeconds' ? 'notation.timedNote' : 'notation.untimedNote',
    );
  }

  function render(): void {
    renderBoard();
    renderOverlay();
    renderAsk();
    renderAnswers();
    renderReadouts();
    renderProgress();
    renderControls();
  }

  // ── Drill ────────────────────────────────────────────────────────────────
  function advance(): void {
    current = upcoming;
    upcoming = nextPrompt(upcoming, target, sideSetting);
    typed = '';
  }

  function handleCorrect(): void {
    score += 1;
    wrong = false;
    window.clearTimeout(wrongTimer);
    advance();
    render();
  }

  function handleWrong(): void {
    window.clearTimeout(wrongTimer);
    wrong = true;
    typed = '';
    render();
    wrongTimer = window.setTimeout(() => {
      wrong = false;
      render();
    }, WRONG_FLASH_MS);
  }

  function answerClick(square: XiangqiSquare): void {
    if (!playing || !current || direction !== 'find') return;
    if (isCorrectClick(current, square)) handleCorrect();
    else handleWrong();
  }

  function answerFileNumber(value: number): void {
    if (!playing || !current) return;
    if (isCorrectFileNumber(current, value)) handleCorrect();
    else handleWrong();
  }

  function pressKey(key: string): void {
    if (!playing || current?.kind !== 'point' || direction !== 'name') return;
    const next = consumeSquareInput(typed, key);
    typed = next.buffer;
    if (next.submit === null) {
      render();
      return;
    }
    if (isCorrectSquareName(current, next.submit)) handleCorrect();
    else handleWrong();
  }

  function stop(): void {
    if (!playing) return;
    playing = false;
    window.clearInterval(tickTimer);
    window.clearTimeout(wrongTimer);
    wrong = false;
    typed = '';
    finished = true;
    // Only a timed run produces a comparable number, so only a timed run may
    // move the best.
    if (timeControl === 'thirtySeconds') {
      bests = saveNotationScore(target, direction, sideSetting, score);
    }
    current = null;
    upcoming = null;
    render();
  }

  function start(): void {
    if (playing) return;
    playing = true;
    score = 0;
    finished = false;
    wrong = false;
    current = null;
    upcoming = null;
    // Twice, to fill both the current slot and the preview.
    advance();
    advance();
    if (timeControl === 'thirtySeconds') {
      endsAt = Date.now() + DRILL_DURATION_MS;
      tickTimer = window.setInterval(() => {
        if (Date.now() >= endsAt) stop();
        else {
          renderProgress();
          renderReadouts();
        }
      }, TICK_MS);
    }
    render();
  }

  // One delegated listener on the persistent host: the SVG inside is replaced
  // on every render, so per-rect listeners would not survive a repaint.
  boardHost.addEventListener('click', (event) => {
    const hit = (event.target as Element | null)?.closest('[data-square]') as HTMLElement | null;
    const square = hit?.dataset.square;
    if (square) answerClick(square as XiangqiSquare);
  });

  document.addEventListener('keydown', (event) => {
    if (!playing || direction !== 'name' || current?.kind !== 'point') return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key.length === 1 || event.key === 'Enter' || event.key === 'Backspace') {
      event.preventDefault();
      pressKey(event.key);
    }
  });

  // ── Controls ─────────────────────────────────────────────────────────────
  const targetField = segmented<DrillTarget>(
    copy('notation.target'),
    [
      { value: 'point', label: copy('notation.target.point') },
      { value: 'file', label: copy('notation.target.file') },
    ],
    () => target,
    (value) => {
      target = value;
    },
  );
  const directionField = segmented<DrillDirection>(
    copy('notation.direction'),
    [
      { value: 'find', label: copy('notation.direction.find') },
      { value: 'name', label: copy('notation.direction.name') },
    ],
    () => direction,
    (value) => {
      direction = value;
    },
  );
  const sideField = segmented<DrillSideSetting>(
    copy('notation.side'),
    [
      { value: 'red', label: copy('notation.side.red') },
      { value: 'black', label: copy('notation.side.black') },
      { value: 'both', label: copy('notation.side.both') },
    ],
    () => sideSetting,
    (value) => {
      sideSetting = value;
    },
  );
  const timeField = segmented<DrillTimeControl>(
    copy('notation.time'),
    [
      { value: 'thirtySeconds', label: copy('notation.time.thirtySeconds') },
      { value: 'untimed', label: copy('notation.time.untimed') },
    ],
    () => timeControl,
    (value) => {
      timeControl = value;
    },
  );
  const perspectiveField = segmented<XiangqiColor>(
    copy('notation.perspective'),
    [
      { value: 'red', label: copy('notation.perspective.red') },
      { value: 'black', label: copy('notation.perspective.black') },
    ],
    () => perspective,
    (value) => {
      perspective = value;
    },
  );
  const labelsToggle = toggle(
    copy('notation.showCoordinates'),
    () => showCoords,
    (value) => {
      showCoords = value;
    },
  );
  const piecesToggle = toggle(
    copy('notation.showPieces'),
    () => showPieces,
    (value) => {
      showPieces = value;
    },
  );

  const targetHint = document.createElement('p');
  targetHint.className = 'notation-hint';
  const sideHint = document.createElement('p');
  sideHint.className = 'notation-hint';
  sideHint.textContent = copy('notation.side.bothHint');
  const boardHint = document.createElement('p');
  boardHint.className = 'notation-hint';
  boardHint.textContent = copy('notation.perspectiveHint');
  const displayHint = document.createElement('p');
  displayHint.className = 'notation-hint';
  displayHint.textContent = copy('notation.displayHint');

  controls.append(
    targetField.group,
    targetHint,
    directionField.group,
    sideField.group,
    sideHint,
    timeField.group,
    perspectiveField.group,
    boardHint,
    labelsToggle.row,
    piecesToggle.row,
    displayHint,
  );

  syncs.push(
    targetField.sync,
    directionField.sync,
    sideField.sync,
    timeField.sync,
    perspectiveField.sync,
    labelsToggle.sync,
    piecesToggle.sync,
    () => {
      targetHint.textContent = copy(
        target === 'point' ? 'notation.target.pointHint' : 'notation.target.fileHint',
      );
      // Points are absolute, so there is no side to count from.
      const pointDrill = target === 'point';
      sideField.group.hidden = pointDrill;
      sideHint.hidden = pointDrill || sideSetting !== 'both';
    },
  );

  render();
}
