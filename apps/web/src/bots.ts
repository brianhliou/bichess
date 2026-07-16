import { maybeGameSpecForId } from '@mistboard/game';
import './account-profile.css';
import './bots.css';
import { buildCommunityLayout } from './community-rail.js';
import type { FeaturedGame } from './game-display.js';
import { buildProfileGameRow, buildProfileHeaderShell } from './profile-ui.js';
import { buildNav, buildNotice } from './site-shell.js';

type BotPlay = {
  mode: 'pve';
  gameSpecId: string;
  engineId: string;
  timeControl: {
    initialMs: number;
    incrementMs: number;
  };
  preferredColor: BotPreferredColor;
};

type BotPreferredColor = 'random' | 'white' | 'black' | 'red';

type BotPlayChoice = {
  preferredColor: BotPreferredColor;
};

type BotColorChoice = {
  value: BotPreferredColor;
  label: string;
};

type BotRecord = {
  games: number;
  wins: number;
  losses: number;
  draws: number;
};

type BotRatingSnapshot = {
  gameSpecId: string;
  timeClass: 'bullet' | 'blitz' | 'rapid';
  rating: number;
  ratingDeviation: number | null;
  games: number;
  source: 'manual' | 'eve-anchor' | 'import';
  sourceRef: string | null;
  createdAt: string;
  provisional: boolean;
};

type BotProfile = {
  id: string;
  displayName: string;
  bio: string;
  ownerType: 'system' | 'user';
  ownerUserId: string | null;
  activeEngineId: string;
  defaultGameSpecId: string;
  supportedGameSpecIds: string[];
  play: BotPlay;
  gamesTotal: number;
  record: BotRecord;
  rating: BotRatingSnapshot | null;
  ratings?: BotRatingSnapshot[];
  games?: FeaturedGame[];
};

class BotNotFound extends Error {}

const GAME_SPEC_LABELS: Record<string, string> = {
  'dark-chess': 'Fog Chess',
  'dark-mini-xiangqi': 'Dark Mini Xiangqi',
  jieqi: 'Reveal Xiangqi',
  banqi: 'Flip Xiangqi',
  'crossroads-chess': 'Crossroads Chess',
};

const HIDDEN_BOT_GAME_SPEC_IDS = new Set(['dark-draft960']);

export async function mountBots(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'bots-route');

  const shell = document.createElement('main');
  shell.className = 'site-section community-shell bots-shell';

  const header = document.createElement('section');
  header.className = 'bots-directory-header';

  const eyebrow = document.createElement('span');
  eyebrow.className = 'account-eyebrow';
  eyebrow.textContent = 'Play';

  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = 'Bots';

  const sub = document.createElement('p');
  sub.className = 'bots-sub';
  sub.textContent = 'Public engine opponents with published profiles and direct play.';

  header.append(eyebrow, heading, sub);

  const body = document.createElement('section');
  body.className = 'bots-directory';
  body.append(statusLine('Loading bots...'));

  const content = document.createElement('div');
  content.className = 'bots-main';
  content.append(header, body);

  shell.append(buildCommunityLayout('/bots', content));
  root.append(buildNav(), shell);

  let bots: BotProfile[];
  try {
    bots = await fetchBots();
  } catch {
    body.replaceChildren(buildNotice('Bots unavailable', 'The bot directory could not load.'));
    return;
  }

  if (bots.length === 0) {
    body.replaceChildren(statusLine('No bots available.'));
    return;
  }

  body.replaceChildren(...buildBotDirectorySections(bots));
}

export async function mountBotProfile(root: HTMLElement, botId: string): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'profile-route', 'bots-route');

  const shell = document.createElement('main');
  shell.className = 'profile-shell bot-profile-shell';
  root.append(buildNav(), shell);

  let bot: BotProfile;
  try {
    bot = await fetchBotProfile(botId);
  } catch (err) {
    if (err instanceof BotNotFound) {
      document.title = 'Bot not found · Mistboard';
      shell.append(buildNotice('Bot not found', 'This bot profile is not public.'));
      return;
    }
    shell.append(buildNotice('Bots unavailable', 'This bot profile could not load.'));
    return;
  }

  document.title = `${bot.displayName} · Bot · Mistboard`;

  const main = document.createElement('div');
  main.className = 'bot-profile-main';
  main.append(buildBotHeader(bot), buildBotPlayPanel(bot), buildRecentGames(bot));

  const sidebar = document.createElement('aside');
  sidebar.className = 'bot-profile-sidebar';
  sidebar.append(buildBotRatingPanel(bot));
  if (bot.bio.trim().length > 0) sidebar.append(buildBotAbout(bot));
  sidebar.append(buildBotVariantsPanel(bot));

  const body = document.createElement('div');
  body.className = 'bot-profile-body';
  body.append(sidebar, main);

  shell.append(body);
}

async function fetchBots(): Promise<BotProfile[]> {
  const resp = await fetch('/api/bots', { headers: { accept: 'application/json' } });
  if (!resp.ok) throw new Error(`bots_failed_${resp.status}`);
  const data = (await resp.json()) as { bots: BotProfile[] };
  return data.bots;
}

async function fetchBotProfile(botId: string): Promise<BotProfile> {
  const resp = await fetch(`/api/bots/${encodeURIComponent(botId)}`, {
    headers: { accept: 'application/json' },
  });
  if (resp.status === 404) throw new BotNotFound();
  if (!resp.ok) throw new Error(`bot_profile_failed_${resp.status}`);
  const data = (await resp.json()) as { bot: BotProfile };
  return data.bot;
}

function buildBotDirectorySections(bots: BotProfile[]): HTMLElement[] {
  const groups: Array<{ title: string; bots: BotProfile[] }> = [
    { title: 'Featured bots', bots: bots.filter((bot) => bot.ownerType === 'system') },
    { title: 'Community bots', bots: bots.filter((bot) => bot.ownerType === 'user') },
  ];
  return groups.filter((group) => group.bots.length > 0).map(buildBotDirectorySection);
}

function buildBotDirectorySection(group: { title: string; bots: BotProfile[] }): HTMLElement {
  const section = document.createElement('section');
  section.className = 'bot-directory-section';

  const header = document.createElement('div');
  header.className = 'bot-directory-section-header';

  const title = document.createElement('h2');
  title.textContent = group.title;

  const count = document.createElement('span');
  count.className = 'bot-directory-count';
  count.textContent = `${group.bots.length} ${group.bots.length === 1 ? 'bot' : 'bots'}`;

  header.append(title, count);

  const list = document.createElement('div');
  list.className = 'bot-directory-list';
  list.append(...group.bots.map(buildBotCard));

  section.append(header, list);
  return section;
}

function buildBotCard(bot: BotProfile): HTMLElement {
  const card = document.createElement('article');
  card.className = 'bot-card';

  const header = document.createElement('div');
  header.className = 'bot-card-header';

  const identity = document.createElement('div');
  identity.className = 'bot-card-identity';

  const badge = document.createElement('span');
  badge.className = 'bot-badge';
  badge.textContent = 'BOT';

  const title = document.createElement('a');
  title.className = 'bot-card-title';
  title.href = `/bot/${encodeURIComponent(bot.id)}`;
  title.textContent = bot.displayName;
  identity.append(badge, title);

  header.append(identity, buildBotCardRating(bot));

  const details = document.createElement('div');
  details.className = 'bot-card-details';
  details.append(
    detailChip(defaultGameSpecLabel(bot)),
    detailChip(timeControlLabel(bot.play.timeControl)),
    detailChip(recordLabel(bot.record), 'bot-record-chip'),
    detailChip(gameCountLabel(bot.gamesTotal), 'bot-games-chip'),
  );

  const ratingStrip = buildBotRatingStrip(bot, 4);

  const bio = document.createElement('p');
  bio.className = 'bot-card-bio';
  bio.textContent = bot.bio.trim() || 'Public Mistboard bot profile.';

  const variants = document.createElement('div');
  variants.className = 'bot-variant-list';
  for (const gameSpecId of supportedGameSpecIds(bot)) {
    variants.append(detailChip(gameSpecLabel(gameSpecId), 'bot-variant-chip'));
  }

  const actions = document.createElement('div');
  actions.className = 'bot-card-actions';
  actions.append(buildPlayButton(bot));

  const profile = document.createElement('a');
  profile.className = 'bot-profile-link';
  profile.href = title.href;
  profile.textContent = 'Profile';
  actions.append(profile);

  card.append(header, details);
  if (ratingStrip) card.append(ratingStrip);
  card.append(bio, variants, actions);
  return card;
}

function buildBotCardRating(bot: BotProfile): HTMLElement {
  const rating = document.createElement('div');
  rating.className = 'bot-card-rating';

  const value = document.createElement('span');
  value.className = 'bot-card-rating-value';
  const ratingSnapshot = primaryRating(bot);
  value.textContent = ratingSnapshot ? ratingLabel(ratingSnapshot) : '—';

  const label = document.createElement('span');
  label.className = 'bot-card-rating-label';
  label.textContent = ratingSnapshot
    ? `${timeClassLabel(ratingSnapshot.timeClass)} rating`
    : 'Unrated';

  rating.append(value, label);
  return rating;
}

function buildBotHeader(bot: BotProfile): HTMLElement {
  const games = document.createElement('span');
  games.className = 'profile-game-count';
  games.textContent = gameCountLabel(bot.gamesTotal);

  const badge = document.createElement('span');
  badge.className = 'profile-role-badge profile-role-bot';
  badge.textContent = 'BOT';

  const owner = document.createElement('span');
  owner.className = 'profile-role-badge profile-role-owner';
  owner.textContent = bot.ownerType === 'system' ? 'First-party' : 'Community';

  return buildProfileHeaderShell({
    eyebrow: 'Bot profile',
    title: bot.displayName,
    metaParts: [games, badge, owner],
    stats: buildBotStats(bot),
  });
}

function buildBotStats(bot: BotProfile): HTMLElement {
  const stats = document.createElement('div');
  stats.className = 'profile-stats bot-stats';
  const cells = [statCell(gameSpecLabel(bot.defaultGameSpecId), 'Default')];
  const ratingSnapshot = primaryRating(bot);
  if (ratingSnapshot) cells.push(statCell(ratingLabel(ratingSnapshot), 'Rating'));
  cells.push(
    statCell(recordLabel(bot.record), 'Record'),
    statCell(timeControlLabel(bot.play.timeControl), 'Play clock'),
    statCell(String(supportedGameSpecIds(bot).length), 'Variants'),
    statCell(bot.activeEngineId, 'Engine'),
  );
  stats.append(...cells);
  return stats;
}

function statCell(value: string, label: string): HTMLElement {
  const stat = document.createElement('div');
  stat.className = 'profile-stat';

  const valueEl = document.createElement('span');
  valueEl.className = 'profile-stat-value';
  valueEl.textContent = value;

  const labelEl = document.createElement('span');
  labelEl.className = 'profile-stat-label';
  labelEl.textContent = label;

  stat.append(valueEl, labelEl);
  return stat;
}

function buildBotPlayPanel(bot: BotProfile): HTMLElement {
  const section = document.createElement('section');
  section.className = 'bot-profile-play';

  const heading = document.createElement('h2');
  heading.textContent = 'Play';

  const meta = document.createElement('p');
  meta.textContent = `${gameSpecLabel(bot.play.gameSpecId)} · ${timeControlLabel(
    bot.play.timeControl,
  )} · choose side`;

  section.append(heading, meta, buildPlayButton(bot));
  return section;
}

function buildBotRatingPanel(bot: BotProfile): HTMLElement {
  const section = document.createElement('section');
  section.className = 'bot-profile-rating';

  const heading = document.createElement('h2');
  heading.textContent = 'Rating';
  section.append(heading);

  const ratings = botRatings(bot);
  if (ratings.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No published rating yet.';
    section.append(empty);
    return section;
  }

  section.append(buildBotRatingGrid(ratings));
  return section;
}

function buildBotAbout(bot: BotProfile): HTMLElement {
  const section = document.createElement('section');
  section.className = 'bot-profile-about';

  const heading = document.createElement('h2');
  heading.textContent = 'About';

  const body = document.createElement('p');
  body.textContent = bot.bio;

  section.append(heading, body);
  return section;
}

function buildBotVariantsPanel(bot: BotProfile): HTMLElement {
  const section = document.createElement('section');
  section.className = 'bot-profile-variants';

  const heading = document.createElement('h2');
  heading.textContent = 'Variants';

  const list = document.createElement('div');
  list.className = 'bot-profile-variant-list';
  for (const gameSpecId of supportedGameSpecIds(bot)) {
    list.append(detailChip(gameSpecLabel(gameSpecId), 'bot-variant-chip'));
  }

  section.append(heading, list);
  return section;
}

function buildRecentGames(bot: BotProfile): HTMLElement {
  const section = document.createElement('section');
  section.className = 'profile-games';

  const heading = document.createElement('h2');
  heading.textContent = 'Recent games';
  section.append(heading);

  const games = bot.games ?? [];
  if (games.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'landing-games-empty';
    empty.textContent = 'No completed games yet.';
    section.append(empty);
    return section;
  }

  const list = document.createElement('ol');
  list.className = 'profile-game-list';
  for (const game of games) list.append(buildProfileGameRow(game));
  section.append(list);
  return section;
}

function buildPlayButton(bot: BotProfile): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'landing-setup-start bot-play-button';
  button.textContent = 'Play';
  button.addEventListener('click', () => {
    openBotPlayDialog(bot);
  });
  return button;
}

function openBotPlayDialog(bot: BotProfile): void {
  document.querySelector<HTMLElement>('[data-bot-play-dialog]')?.remove();

  const choices = botColorChoices(bot);
  let preferredColor = choices.some((choice) => choice.value === bot.play.preferredColor)
    ? bot.play.preferredColor
    : 'random';

  const backdrop = document.createElement('div');
  backdrop.className = 'bot-play-dialog-backdrop';
  backdrop.dataset.botPlayDialog = '';

  const dialog = document.createElement('section');
  dialog.className = 'bot-play-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'bot-play-dialog-title');
  dialog.tabIndex = -1;

  const header = document.createElement('div');
  header.className = 'bot-play-dialog-header';

  const heading = document.createElement('h2');
  heading.id = 'bot-play-dialog-title';
  heading.textContent = `Play ${bot.displayName}`;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'bot-play-dialog-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = 'x';

  header.append(heading, close);

  const meta = document.createElement('p');
  meta.className = 'bot-play-dialog-meta';
  meta.textContent = `${gameSpecLabel(bot.play.gameSpecId)} · ${timeControlLabel(
    bot.play.timeControl,
  )}`;

  const choiceGroup = document.createElement('div');
  choiceGroup.className = 'bot-play-choice-group';

  const choiceLabel = document.createElement('span');
  choiceLabel.className = 'bot-play-choice-label';
  choiceLabel.textContent = bot.play.gameSpecId === 'banqi' ? 'Move order' : 'Side';

  const options = document.createElement('div');
  options.className = 'bot-play-choice-options';

  const choiceButtons: HTMLButtonElement[] = [];
  const selectChoice = (value: BotPreferredColor): void => {
    preferredColor = value;
    for (const button of choiceButtons) {
      const selected = button.dataset.choice === value;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    }
  };

  for (const choice of choices) {
    const choiceButton = document.createElement('button');
    choiceButton.type = 'button';
    choiceButton.className = 'bot-play-choice';
    choiceButton.dataset.choice = choice.value;
    choiceButton.textContent = choice.label;
    choiceButton.setAttribute('aria-pressed', choice.value === preferredColor ? 'true' : 'false');
    choiceButton.addEventListener('click', () => selectChoice(choice.value));
    choiceButtons.push(choiceButton);
    options.append(choiceButton);
  }

  choiceGroup.append(choiceLabel, options);

  const error = document.createElement('p');
  error.className = 'bot-play-dialog-error';
  error.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'bot-play-dialog-actions';

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'bot-play-dialog-cancel';
  cancel.textContent = 'Cancel';

  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'landing-setup-start bot-play-dialog-start';
  start.textContent = 'Start game';

  actions.append(cancel, start);
  dialog.append(header, meta, choiceGroup, error, actions);
  backdrop.append(dialog);

  function closeDialog(): void {
    document.removeEventListener('keydown', handleKeydown);
    backdrop.remove();
  }
  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') closeDialog();
  }

  close.addEventListener('click', closeDialog);
  cancel.addEventListener('click', closeDialog);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeDialog();
  });
  start.addEventListener('click', () => {
    void startBotGame(bot, start, { preferredColor }, error);
  });

  document.addEventListener('keydown', handleKeydown);
  document.body.append(backdrop);
  selectChoice(preferredColor);
  dialog.focus();
}

async function startBotGame(
  bot: BotProfile,
  button: HTMLButtonElement,
  choice: BotPlayChoice,
  error?: HTMLElement,
): Promise<void> {
  button.disabled = true;
  button.classList.remove('bot-play-button-error');
  if (error) error.hidden = true;
  button.textContent = 'Starting...';
  try {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(roomRequestForBot(bot, choice)),
    });
    if (!response.ok) throw new Error(`room_create_failed_${response.status}`);
    const data = (await response.json()) as { url?: string };
    if (!data.url) throw new Error('room_create_missing_url');
    window.location.href = data.url;
  } catch {
    button.disabled = false;
    button.classList.add('bot-play-button-error');
    button.textContent = 'Try again';
    if (error) {
      error.textContent = 'Could not start this game.';
      error.hidden = false;
    }
  }
}

function roomRequestForBot(bot: BotProfile, choice: BotPlayChoice): Record<string, unknown> {
  return {
    mode: bot.play.mode,
    botId: bot.id,
    preferredColor: choice.preferredColor,
    rated: false,
  };
}

function botColorChoices(bot: BotProfile): BotColorChoice[] {
  if (bot.play.gameSpecId === 'banqi') {
    return [
      { value: 'random', label: 'Random' },
      { value: 'red', label: 'First' },
      { value: 'black', label: 'Second' },
    ];
  }

  if (bot.play.gameSpecId === 'crossroads-chess') {
    return [
      { value: 'random', label: 'Random' },
      { value: 'white', label: 'White' },
      { value: 'red', label: 'Red' },
    ];
  }

  if (usesRedBlackSeats(bot.play.gameSpecId)) {
    return [
      { value: 'random', label: 'Random' },
      { value: 'red', label: 'Red' },
      { value: 'black', label: 'Black' },
    ];
  }

  return [
    { value: 'random', label: 'Random' },
    { value: 'white', label: 'White' },
    { value: 'black', label: 'Black' },
  ];
}

function usesRedBlackSeats(gameSpecId: string): boolean {
  return [
    'dark-mini-xiangqi',
    'dark-xiangqi',
    'drop-mini-xiangqi',
    'jieqi',
    'mini-xiangqi',
  ].includes(gameSpecId);
}

function detailChip(label: string, extraClass?: string): HTMLElement {
  const chip = document.createElement('span');
  chip.className = extraClass ? `bot-chip ${extraClass}` : 'bot-chip';
  chip.textContent = label;
  return chip;
}

function statusLine(text: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'bots-status';
  p.textContent = text;
  return p;
}

function buildBotRatingStrip(bot: BotProfile, limit: number): HTMLElement | null {
  const ratings = botRatings(bot);
  if (ratings.length === 0) return null;

  const strip = document.createElement('div');
  strip.className = 'bot-rating-strip';
  for (const rating of ratings.slice(0, limit)) {
    strip.append(buildBotRatingChip(rating));
  }
  if (ratings.length > limit) {
    strip.append(detailChip(`+${ratings.length - limit} more`, 'bot-rating-more-chip'));
  }
  return strip;
}

function buildBotRatingChip(rating: BotRatingSnapshot): HTMLElement {
  const chip = document.createElement('span');
  chip.className = 'bot-rating-chip';

  const value = document.createElement('span');
  value.className = 'bot-rating-chip-value';
  value.textContent = ratingLabel(rating);

  const label = document.createElement('span');
  label.className = 'bot-rating-chip-label';
  label.textContent = `${gameSpecLabel(rating.gameSpecId)} ${timeClassLabel(rating.timeClass)}`;

  chip.append(value, label);
  return chip;
}

function buildBotRatingGrid(ratings: readonly BotRatingSnapshot[]): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'bot-rating-grid';

  for (const rating of ratings) {
    const cell = document.createElement('div');
    cell.className = 'bot-rating-cell';

    const value = document.createElement('span');
    value.className = 'bot-rating-cell-value';
    value.textContent = ratingLabel(rating);

    const label = document.createElement('span');
    label.className = 'bot-rating-cell-label';
    label.textContent = `${gameSpecLabel(rating.gameSpecId)} · ${timeClassLabel(rating.timeClass)}`;

    const games = document.createElement('span');
    games.className = 'bot-rating-cell-games';
    games.textContent = `${rating.games} rated ${rating.games === 1 ? 'game' : 'games'}`;

    cell.append(value, label, games);
    grid.append(cell);
  }
  return grid;
}

function supportedGameSpecIds(bot: BotProfile): string[] {
  const gameSpecIds =
    bot.supportedGameSpecIds.length > 0 ? bot.supportedGameSpecIds : [bot.defaultGameSpecId];
  return gameSpecIds.filter((gameSpecId) => !HIDDEN_BOT_GAME_SPEC_IDS.has(gameSpecId));
}

function botRatings(bot: BotProfile): BotRatingSnapshot[] {
  const ratings =
    bot.ratings && bot.ratings.length > 0 ? bot.ratings : bot.rating ? [bot.rating] : [];
  return ratings.filter((rating) => !HIDDEN_BOT_GAME_SPEC_IDS.has(rating.gameSpecId));
}

function primaryRating(bot: BotProfile): BotRatingSnapshot | null {
  const ratings = botRatings(bot);
  return (
    ratings.find(
      (rating) => rating.gameSpecId === bot.defaultGameSpecId && rating.timeClass === 'blitz',
    ) ??
    bot.rating ??
    ratings[0] ??
    null
  );
}

function defaultGameSpecLabel(bot: BotProfile): string {
  return gameSpecLabel(bot.defaultGameSpecId);
}

function gameSpecLabel(gameSpecId: string): string {
  return GAME_SPEC_LABELS[gameSpecId] ?? maybeGameSpecForId(gameSpecId)?.publicName ?? gameSpecId;
}

function timeControlLabel(timeControl: BotPlay['timeControl']): string {
  const initialMinutes = timeControl.initialMs / 60_000;
  const incrementSeconds = timeControl.incrementMs / 1_000;
  if (Number.isInteger(initialMinutes) && Number.isInteger(incrementSeconds)) {
    return `${initialMinutes}+${incrementSeconds}`;
  }
  return `${Math.round(timeControl.initialMs / 1_000)}s + ${Math.round(
    timeControl.incrementMs / 1_000,
  )}s`;
}

function gameCountLabel(games: number): string {
  return `${new Intl.NumberFormat().format(games)} ${games === 1 ? 'game' : 'games'}`;
}

function recordLabel(record: BotRecord): string {
  return `${record.wins}-${record.losses}-${record.draws}`;
}

function ratingLabel(rating: BotRatingSnapshot): string {
  return `${new Intl.NumberFormat().format(rating.rating)}${rating.provisional ? '?' : ''}`;
}

function timeClassLabel(timeClass: BotRatingSnapshot['timeClass']): string {
  return timeClass[0].toUpperCase() + timeClass.slice(1);
}
