// Neutral "loading a game" placeholder shown while a replay renderer mounts (a
// watch channel switch, or a homepage showcase variant change that tears down one
// renderer kind and mounts another) so the board slot gives feedback instead of
// going blank. Kept as a leaf so the homepage showcase cycler can reuse it without
// pulling the whole /watch route into the landing bundle. Styled by watch-route.css
// on /watch and by landing.css on the homepage.
export function renderWatchReplaySkeleton(root: HTMLElement): void {
  const skeleton = document.createElement('div');
  skeleton.className = 'watch-replay-skeleton';
  skeleton.setAttribute('aria-hidden', 'true');
  const board = document.createElement('div');
  board.className = 'watch-replay-skeleton-board';
  const caption = document.createElement('div');
  caption.className = 'watch-replay-skeleton-caption';
  caption.textContent = 'Loading game';
  skeleton.append(board, caption);
  root.replaceChildren(skeleton);
}

export function renderWatchReplayFailure(root: HTMLElement): void {
  const failure = document.createElement('div');
  failure.className = 'watch-replay-skeleton watch-replay-failure';
  failure.setAttribute('role', 'status');
  const board = document.createElement('div');
  board.className = 'watch-replay-skeleton-board';
  const caption = document.createElement('div');
  caption.className = 'watch-replay-skeleton-caption';
  caption.textContent = 'Game viewer unavailable';
  failure.append(board, caption);
  root.replaceChildren(failure);
}
