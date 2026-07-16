import './game-shell.css';

export type GameTableRefs = {
  actionSection: HTMLElement;
  actionStatus: HTMLDivElement;
  capturesBottom: HTMLDivElement;
  capturesTop: HTMLDivElement;
  clockBottom: HTMLDivElement;
  clockNote: HTMLParagraphElement;
  clockTop: HTMLDivElement;
  gameControls: HTMLDivElement;
  gameControlsSection: HTMLElement;
  moveList: HTMLOListElement;
  movesRoot: HTMLDivElement;
  playerBottom: HTMLDivElement;
  playerTop: HTMLDivElement;
  replayControls: NodeListOf<HTMLButtonElement>;
  replayControlsRoot: HTMLDivElement;
  replayMeta: HTMLParagraphElement;
  roomActions: HTMLDivElement;
};

export type GameTable = {
  el: HTMLElement;
  refs: GameTableRefs;
};

/**
 * The shared right-column game table used by live rooms and Mistboard TV.
 * Behavior stays route-owned, while the player rows, replay controls, move
 * region, actions, clocks, and captures keep one DOM contract and one CSS skin.
 */
export function createGameTable(): GameTable {
  const el = document.createElement('section');
  el.className = 'panel-section game-console';
  el.innerHTML = `
    <div data-captures-top class="captures-strip captures-strip-top rail-material" aria-label="Pieces captured by the top side"></div>
    <div data-clock-top class="clocks clock-slot"></div>
    <div class="round-table__box">
      <div data-player-top class="round-table__player round-table__player--top"></div>
      <div class="replay-console">
        <div data-replay-controls class="replay-controls">
          <button type="button" data-replay="first" title="First position" aria-label="First move">|&lt;</button>
          <button type="button" data-replay="prev" title="Previous event" aria-label="Previous move">&lt;</button>
          <button type="button" data-replay="next" title="Next event" aria-label="Next move">&gt;</button>
          <button type="button" data-replay="latest" title="Latest position" aria-label="Last move">&gt;|</button>
        </div>
        <div data-game-table-moves>
          <ol data-move-list class="move-list"></ol>
        </div>
        <p data-replay-meta class="replay-meta" hidden>Live</p>
      </div>
      <div data-action-section class="round-table__row" hidden>
        <div data-action-status class="action-status"></div>
      </div>
      <div class="round-table__row">
        <div data-room-actions class="room-actions"></div>
      </div>
      <div data-game-controls-section class="round-table__row" hidden>
        <div data-game-controls class="game-controls"></div>
      </div>
      <div data-player-bottom class="round-table__player round-table__player--bottom"></div>
    </div>
    <div data-clock-bottom class="clocks clock-slot"></div>
    <div data-captures class="captures-strip captures-strip-bottom rail-material" aria-label="Pieces captured by the bottom side"></div>
    <p data-clocks-note class="clocks-pregame-note" hidden></p>
  `;

  const refs = {
    actionSection: el.querySelector<HTMLElement>('[data-action-section]'),
    actionStatus: el.querySelector<HTMLDivElement>('[data-action-status]'),
    capturesBottom: el.querySelector<HTMLDivElement>('[data-captures]'),
    capturesTop: el.querySelector<HTMLDivElement>('[data-captures-top]'),
    clockBottom: el.querySelector<HTMLDivElement>('[data-clock-bottom]'),
    clockNote: el.querySelector<HTMLParagraphElement>('[data-clocks-note]'),
    clockTop: el.querySelector<HTMLDivElement>('[data-clock-top]'),
    gameControls: el.querySelector<HTMLDivElement>('[data-game-controls]'),
    gameControlsSection: el.querySelector<HTMLElement>('[data-game-controls-section]'),
    moveList: el.querySelector<HTMLOListElement>('[data-move-list]'),
    movesRoot: el.querySelector<HTMLDivElement>('[data-game-table-moves]'),
    playerBottom: el.querySelector<HTMLDivElement>('[data-player-bottom]'),
    playerTop: el.querySelector<HTMLDivElement>('[data-player-top]'),
    replayControls: el.querySelectorAll<HTMLButtonElement>('[data-replay]'),
    replayControlsRoot: el.querySelector<HTMLDivElement>('[data-replay-controls]'),
    replayMeta: el.querySelector<HTMLParagraphElement>('[data-replay-meta]'),
    roomActions: el.querySelector<HTMLDivElement>('[data-room-actions]'),
  };

  for (const [name, node] of Object.entries(refs)) {
    if (!node || ('length' in node && node.length === 0)) {
      throw new Error(`missing game table region: ${name}`);
    }
  }

  return { el, refs: refs as GameTableRefs };
}
