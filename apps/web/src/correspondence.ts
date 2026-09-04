import './correspondence.css';
import { CORRESPONDENCE_ELIGIBLE_SPEC_IDS, DAYS_PER_MOVE_OPTIONS } from '@mistboard/game';
import { firstMoverColorName, secondMoverColorName, variantDisplayLabel } from './game-display.js';
import { t } from './i18n/catalog.js';
import { buildLoadingState, buildNav, buildNotice } from './site-shell.js';
import { formatDayClock } from './web-utils.js';

// One in-flight correspondence game, as served by GET /api/correspondence/games
// (your-move-first). Mirrors the route's response shape.
type CorrespondenceGame = {
  roomId: string;
  url: string;
  gameSpecId: string;
  mySeat: string;
  isYourMove: boolean;
  opponentName: string | null;
  dueAt: string;
};

type CorrespondenceGamesResponse = {
  games: CorrespondenceGame[];
  yourMoveCount: number;
};

// One open seek, as served by GET /api/correspondence/seeks. A standing
// invitation anyone (but its creator) can accept to start a game.
type CorrespondenceSeek = {
  id: string;
  gameSpecId: string;
  daysPerMove: number;
  // Move order, not color (server migration 106): the seek board is variant-neutral.
  preferredColor: 'first' | 'second' | 'random';
  creatorName: string | null;
  createdAt: string;
  isMine: boolean;
};

type CorrespondenceSeeksResponse = { seeks: CorrespondenceSeek[] };

export async function mountCorrespondence(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'correspondence-page');
  root.append(buildNav(), buildLoadingState(t('correspondence.loadingGames')));

  const resp = await fetch('/api/correspondence/games').catch(() => null);
  if (resp?.status === 401) {
    root.replaceChildren(buildNav(), buildSignInPrompt());
    return;
  }
  if (!resp?.ok) {
    root.replaceChildren(
      buildNav(),
      buildNotice(t('correspondence.gamesUnavailable'), t('correspondence.gamesUnavailableBody')),
    );
    return;
  }
  const data = (await resp.json()) as CorrespondenceGamesResponse;
  const section = buildCorrespondenceSection(data);
  // One job per surface (2026-09-04): BROWSING other players' open seeks belongs
  // to the homepage lobby's Correspondence tab, which already renders that feed.
  // This page is "my correspondence" — my games, and my own outstanding
  // challenges, which is the half of the board that carries a Cancel button and
  // has nowhere else to live.
  const seekBoard = document.createElement('section');
  seekBoard.className = 'correspondence-group correspondence-seekboard';
  section.append(seekBoard);
  section.append(buildBrowseOpenGamesLink());
  // The other way to start one — a specific opponent — lives on the home page.
  section.append(buildFriendLink());
  root.replaceChildren(buildNav(), section);
  void renderSeekBoard(seekBoard);
}

function buildSignInPrompt(): HTMLElement {
  const notice = buildNotice(t('correspondence.signInTitle'), t('correspondence.signInBody'));
  const link = document.createElement('a');
  link.className = 'correspondence-cta';
  link.href = '/account?tab=login';
  link.textContent = t('correspondence.signIn');
  notice.append(link);
  return notice;
}

function buildCorrespondenceSection(data: CorrespondenceGamesResponse): HTMLElement {
  const section = document.createElement('main');
  section.className = 'correspondence-shell';

  const header = document.createElement('header');
  header.className = 'correspondence-header';
  const title = document.createElement('h1');
  title.textContent = t('correspondence.heading');
  const sub = document.createElement('p');
  sub.className = 'correspondence-subtitle';
  sub.textContent = correspondenceStatus(data);
  header.append(title, sub);
  section.append(header);

  // Your games — rendered only when there are any. With none, the open-seek
  // board below carries the page.
  const byDeadline = (a: CorrespondenceGame, b: CorrespondenceGame): number =>
    Date.parse(a.dueAt) - Date.parse(b.dueAt);
  const yourMove = data.games.filter((game) => game.isYourMove).sort(byDeadline);
  const waiting = data.games.filter((game) => !game.isYourMove).sort(byDeadline);
  if (yourMove.length > 0) section.append(buildGameGroup(t('correspondence.yourMove'), yourMove));
  if (waiting.length > 0)
    section.append(buildGameGroup(t('correspondence.waitingOnOpponent'), waiting));
  return section;
}

function correspondenceStatus(data: CorrespondenceGamesResponse): string {
  if (data.games.length === 0) return t('correspondence.noGamesInProgress');
  if (data.yourMoveCount > 0) {
    return data.yourMoveCount === 1
      ? t('correspondence.oneGameNeedsYourMove', { count: data.yourMoveCount })
      : t('correspondence.gamesNeedYourMove', { count: data.yourMoveCount });
  }
  return t('correspondence.noGamesWaiting');
}

// Browsing lives on the homepage lobby's Correspondence tab; this page links
// there rather than growing a second copy of that feed.
function buildBrowseOpenGamesLink(): HTMLElement {
  const note = document.createElement('p');
  note.className = 'correspondence-friend-link';
  note.append(document.createTextNode(t('correspondence.wantAnyOpponent')));
  const link = document.createElement('a');
  link.href = '/';
  link.textContent = t('correspondence.browseOpenGames');
  note.append(link);
  return note;
}

function buildFriendLink(): HTMLElement {
  const note = document.createElement('p');
  note.className = 'correspondence-friend-link';
  note.append(document.createTextNode(t('correspondence.wantSpecificOpponent')));
  const link = document.createElement('a');
  link.href = '/';
  link.textContent = t('correspondence.challengeFriend');
  note.append(link);
  return note;
}

function buildGameGroup(label: string, games: CorrespondenceGame[]): HTMLElement {
  const group = document.createElement('section');
  group.className = 'correspondence-group';
  const heading = document.createElement('h2');
  heading.className = 'correspondence-group-heading';
  heading.textContent = t('correspondence.groupHeading', { label, count: games.length });
  const list = document.createElement('ol');
  list.className = 'correspondence-list';
  for (const game of games) list.append(buildGameRow(game));
  group.append(heading, list);
  return group;
}

function buildGameRow(game: CorrespondenceGame): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'correspondence-item';

  const row = document.createElement('a');
  row.className = 'correspondence-row';
  row.href = game.url;
  if (game.isYourMove) row.classList.add('is-your-move');

  const opponent = document.createElement('span');
  opponent.className = 'correspondence-opponent';
  opponent.textContent = t('correspondence.vsOpponent', {
    name: game.opponentName ?? t('correspondence.opponentFallback'),
  });

  const turn = document.createElement('span');
  turn.className = 'correspondence-turn';
  turn.textContent = game.isYourMove ? t('correspondence.yourMove') : t('correspondence.theirMove');

  const deadline = document.createElement('span');
  deadline.className = 'correspondence-deadline';
  deadline.textContent = deadlineLabel(game.dueAt);

  row.append(opponent, turn, deadline);
  item.append(row);
  return item;
}

// Time left until the per-move deadline, reusing the day-scale clock formatter
// (the same "3d 4h" / "5h 12m" the room clock shows). Past-due rooms are a
// transient state — the sweeper flags them within its interval — so clamp to 0.
function deadlineLabel(dueAt: string): string {
  const remainingMs = Date.parse(dueAt) - Date.now();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return t('correspondence.dueNow');
  return t('correspondence.timeLeft', { time: formatDayClock(remainingMs) });
}

// The open-seek board: fetch + render in place. Re-invoked (not a full reload)
// after a post / join / cancel so the list stays current.
async function renderSeekBoard(container: HTMLElement): Promise<void> {
  const headerRow = document.createElement('div');
  headerRow.className = 'correspondence-seek-header';
  const heading = document.createElement('h2');
  heading.className = 'correspondence-group-heading';
  heading.textContent = t('correspondence.yourOpenChallenges');
  headerRow.append(heading);

  const resp = await fetch('/api/correspondence/seeks').catch(() => null);
  if (resp?.status === 404) {
    // The server's own kill-switch (MISTBOARD_CORRESPONDENCE_ENABLED) answers
    // here. That is a state, not a failure: say the format is coming rather
    // than showing a broken-looking notice, and offer no post form that would
    // 404 on submit.
    const body = (await resp.json().catch(() => null)) as { error?: string } | null;
    if (body?.error === 'correspondence_disabled') {
      const soon = document.createElement('p');
      soon.className = 'correspondence-seek-empty';
      soon.textContent = t('lobby.corrComingSoon');
      container.replaceChildren(headerRow, soon);
      return;
    }
  }
  if (!resp?.ok) {
    container.replaceChildren(
      headerRow,
      buildNotice(
        t('correspondence.openGamesUnavailable'),
        t('correspondence.openGamesUnavailableBody'),
      ),
    );
    return;
  }
  const { seeks: allSeeks } = (await resp.json()) as CorrespondenceSeeksResponse;
  // Everyone else's open seeks are the lobby tab's job; keep only the rows this
  // page can act on (isMine rows render a Cancel button, the rest a Join).
  //
  // NOTE this can only ever show PUBLIC posts: listOpenCorrespondenceSeeks is
  // `visibility = 'public' AND target_user_id IS NULL`, so private link
  // challenges (what "Create a link to share" and the post-game invite mint) are
  // structurally absent. There is no endpoint for a player's outgoing private
  // challenges — /seeks/incoming covers only directed ones aimed AT you — so a
  // sent link currently has no record anywhere and cannot be cancelled. Hence
  // "Your posted games" rather than "Your open challenges".
  const seeks = allSeeks.filter((seek) => seek.isMine);
  const refresh = (): void => {
    void renderSeekBoard(container);
  };

  // "Post a game" is a secondary trigger that reveals the form, so the only
  // green primary in this section is the form's Create button.
  const form = buildPostSeekForm(refresh);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'correspondence-seek-toggle';
  toggle.textContent = t('correspondence.postAGame');
  toggle.addEventListener('click', () => {
    form.hidden = !form.hidden;
    toggle.classList.toggle('is-open', !form.hidden);
    if (!form.hidden) form.querySelector('select')?.focus();
  });
  headerRow.append(toggle);

  const children: Node[] = [headerRow, form];
  if (seeks.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'correspondence-seek-empty';
    empty.textContent = t('correspondence.noOpenChallenges');
    children.push(empty);
  } else {
    const list = document.createElement('ol');
    list.className = 'correspondence-list correspondence-seek-list';
    for (const seek of seeks) list.append(buildSeekRow(seek, refresh));
    children.push(list);
  }
  container.replaceChildren(...children);
}

// The post form, hidden until "Post a game" reveals it. On success the whole
// board re-renders so the new seek shows up immediately.
function buildPostSeekForm(onPosted: () => void): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'correspondence-post-form';
  form.hidden = true;

  // Variant picker over the correspondence-eligible specs; hidden when only one qualifies.
  const variant = document.createElement('select');
  variant.className = 'correspondence-post-field';
  variant.setAttribute('aria-label', t('correspondence.variantLabel'));
  for (const specId of CORRESPONDENCE_ELIGIBLE_SPEC_IDS) {
    const opt = document.createElement('option');
    opt.value = specId;
    opt.textContent = variantDisplayLabel(specId);
    variant.append(opt);
  }
  variant.value = CORRESPONDENCE_ELIGIBLE_SPEC_IDS[0] ?? '';
  variant.hidden = CORRESPONDENCE_ELIGIBLE_SPEC_IDS.length < 2;

  const days = document.createElement('select');
  days.className = 'correspondence-post-field';
  days.setAttribute('aria-label', t('correspondence.daysPerMoveLabel'));
  for (const option of DAYS_PER_MOVE_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = String(option);
    opt.textContent =
      option === 1
        ? t('correspondence.oneDayPerMoveOption')
        : t('correspondence.daysPerMoveOption', { count: option });
    days.append(opt);
  }
  days.value = String(DAYS_PER_MOVE_OPTIONS[1] ?? DAYS_PER_MOVE_OPTIONS[0]);

  // Side stored as move order; labels reflect the picked variant's colors.
  const color = document.createElement('select');
  color.className = 'correspondence-post-field';
  color.setAttribute('aria-label', t('correspondence.yourColorLabel'));
  for (const value of ['random', 'first', 'second'] as const) {
    const opt = document.createElement('option');
    opt.value = value;
    color.append(opt);
  }
  const relabelColors = (): void => {
    const specId = variant.value;
    color.options[0]!.textContent = t('correspondence.randomColor');
    color.options[1]!.textContent = t('correspondence.playColor', {
      color: firstMoverColorName(specId),
    });
    color.options[2]!.textContent = t('correspondence.playColor', {
      color: secondMoverColorName(specId),
    });
  };
  relabelColors();
  variant.addEventListener('change', relabelColors);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'correspondence-cta';
  submit.textContent = t('correspondence.create');

  const error = document.createElement('p');
  error.className = 'correspondence-post-error';
  error.hidden = true;

  // Alongside posting to the public board, mint a private "play me" link and
  // land on its challenge page (where the share link + copy button live).
  const linkBtn = document.createElement('button');
  linkBtn.type = 'button';
  linkBtn.className = 'correspondence-cta';
  linkBtn.textContent = t('correspondence.createLinkToShare');
  linkBtn.addEventListener('click', () => {
    linkBtn.disabled = true;
    error.hidden = true;
    void fetch('/api/correspondence/seeks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        gameSpecId: variant.value,
        daysPerMove: Number(days.value),
        preferredColor: color.value,
        visibility: 'private',
      }),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as {
          challengeUrl?: string;
          error?: string;
          limit?: number;
        } | null;
        if (res.ok && body?.challengeUrl) {
          location.href = body.challengeUrl;
          return;
        }
        error.textContent =
          body?.error === 'seek_limit_reached'
            ? t('correspondence.seekLimitReached', { limit: body.limit ?? 6 })
            : t('correspondence.couldNotCreateLink');
        error.hidden = false;
        linkBtn.disabled = false;
      })
      .catch(() => {
        error.textContent = t('correspondence.couldNotCreateLink');
        error.hidden = false;
        linkBtn.disabled = false;
      });
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit.disabled = true;
    error.hidden = true;
    void fetch('/api/correspondence/seeks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        gameSpecId: variant.value,
        daysPerMove: Number(days.value),
        preferredColor: color.value,
      }),
    })
      .then(async (res) => {
        if (res.ok) {
          onPosted();
          return;
        }
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          limit?: number;
        } | null;
        error.textContent =
          body?.error === 'seek_limit_reached'
            ? t('correspondence.seekLimitReached', { limit: body.limit ?? 6 })
            : t('correspondence.couldNotPostGame');
        error.hidden = false;
        submit.disabled = false;
      })
      .catch(() => {
        error.textContent = t('correspondence.couldNotPostGame');
        error.hidden = false;
        submit.disabled = false;
      });
  });

  form.append(variant, days, color, submit, linkBtn, error);
  return form;
}

function buildSeekRow(seek: CorrespondenceSeek, onChange: () => void): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'correspondence-item correspondence-seek-item';

  const row = document.createElement('div');
  row.className = 'correspondence-row';

  const who = document.createElement('span');
  who.className = 'correspondence-opponent';
  who.textContent = seek.isMine
    ? t('correspondence.you')
    : (seek.creatorName ?? t('correspondence.playerFallback'));

  const detail = document.createElement('span');
  detail.className = 'correspondence-turn';
  // Lead with the variant now that the board is cross-variant, then side + cadence.
  detail.textContent = t('correspondence.seekDetail', {
    variant: variantDisplayLabel(seek.gameSpecId),
    color: seekColorLabel(seek.gameSpecId, seek.preferredColor),
    cadence:
      seek.daysPerMove === 1
        ? t('correspondence.oneDayPerMove')
        : t('correspondence.daysPerMove', { count: seek.daysPerMove }),
  });

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'correspondence-cta correspondence-seek-action';
  if (seek.isMine) {
    button.textContent = t('correspondence.cancel');
    button.classList.add('is-cancel');
    button.addEventListener('click', () => {
      button.disabled = true;
      void fetch(`/api/correspondence/seeks/${encodeURIComponent(seek.id)}`, { method: 'DELETE' })
        .then(() => onChange())
        .catch(() => {
          button.disabled = false;
        });
    });
  } else {
    button.textContent = t('correspondence.join');
    button.addEventListener('click', () => {
      button.disabled = true;
      void fetch(`/api/correspondence/seeks/${encodeURIComponent(seek.id)}/accept`, {
        method: 'POST',
      })
        .then(async (res) => {
          if (res.ok) {
            const body = (await res.json().catch(() => null)) as { url?: string } | null;
            if (body?.url) {
              window.location.href = body.url;
              return;
            }
          }
          // 409 seek_taken (someone beat us) or an error: refresh the board so
          // the now-gone seek drops off.
          onChange();
        })
        .catch(() => {
          button.disabled = false;
        });
    });
  }

  row.append(who, detail, button);
  item.append(row);
  return item;
}

function seekColorLabel(gameSpecId: string, color: CorrespondenceSeek['preferredColor']): string {
  if (color === 'first')
    return t('correspondence.playsColor', { color: firstMoverColorName(gameSpecId) });
  if (color === 'second')
    return t('correspondence.playsColor', { color: secondMoverColorName(gameSpecId) });
  return t('correspondence.eitherColor');
}
