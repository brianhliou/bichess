import './spectator-chat.css';

type ChatLine = { id: string; handle: string | null; text: string; createdAt: string };
type ChatState = {
  lines: ChatLine[];
  canPost: boolean;
  canReport: boolean;
  viewerHandle: string | null;
  timeoutUntil?: string;
};

const POLL_MS = 7000;
const LIVE_POLL_MS = 2000;
const VISIBLE_LINES = 80;
const TOKEN_PATTERN = /(@[a-z0-9_-]+|(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?)/gi;
const QUICK_CHAT_MESSAGES = ['GG', 'WP', 'TY', 'GTG', 'BYE'] as const;

type GameChatOptions = {
  ariaLabel: string;
  live: boolean;
  pollMs: number;
  title: string;
};

export function buildSpectatorChat(roomId: string): HTMLElement {
  return buildGameChat(roomId, {
    ariaLabel: 'Spectator chat',
    live: false,
    pollMs: POLL_MS,
    title: 'Spectator room',
  });
}

export function buildLiveRoomChat(roomId: string): HTMLElement {
  return buildGameChat(roomId, {
    ariaLabel: 'Game chat',
    live: true,
    pollMs: LIVE_POLL_MS,
    title: 'Chat room',
  });
}

function buildGameChat(roomId: string, options: GameChatOptions): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'review-spectator-chat';
  if (options.live) panel.classList.add('review-spectator-chat--live');
  panel.setAttribute('aria-label', options.ariaLabel);

  const header = document.createElement('div');
  header.className = 'review-spectator-chat__tabs';
  const tab = document.createElement('div');
  tab.className = 'review-spectator-chat__tab review-spectator-chat__tab--active';
  tab.textContent = options.title;
  header.append(tab);

  const feed = document.createElement('div');
  feed.className = 'review-spectator-chat__feed';

  const footer = document.createElement('div');
  footer.className = 'review-spectator-chat__footer';
  renderStatus(footer, 'Loading chat...');

  panel.append(header, feed, footer);

  const known = new Set<string>();
  void hydrateGameChat(roomId, feed, footer, known, options);
  if (import.meta.env.MODE !== 'test') startPolling(roomId, panel, feed, known, options.pollMs);

  return panel;
}

export function gameChatApiUrl(roomId: string): string {
  return `/api/chat/game/${encodeURIComponent(roomId)}`;
}

async function hydrateGameChat(
  roomId: string,
  feed: HTMLElement,
  footer: HTMLElement,
  known: Set<string>,
  options: GameChatOptions,
): Promise<void> {
  const state = await fetchGameChat(roomId);
  if (!state || !Array.isArray(state.lines)) {
    renderStatus(footer, 'Game chat is unavailable.');
    return;
  }
  feed.replaceChildren();
  known.clear();
  appendLines(feed, state.lines.slice(-VISIBLE_LINES), known, state, roomId);
  renderFooter(footer, state, roomId, feed, known, options);
}

function startPolling(
  roomId: string,
  panel: HTMLElement,
  feed: HTMLElement,
  known: Set<string>,
  pollMs: number,
): void {
  const timer = window.setInterval(async () => {
    if (!panel.isConnected) {
      window.clearInterval(timer);
      return;
    }
    if (document.visibilityState !== 'visible') return;
    const state = await fetchGameChat(roomId);
    if (!state) return;
    const incoming = state.lines.filter((line) => !known.has(line.id)).slice(-VISIBLE_LINES);
    appendLines(feed, incoming, known, state, roomId);
  }, pollMs);
}

function renderFooter(
  footer: HTMLElement,
  state: ChatState,
  roomId: string,
  feed: HTMLElement,
  known: Set<string>,
  options: GameChatOptions,
): void {
  footer.replaceChildren();
  if (state.canPost) {
    footer.append(buildComposer(roomId, feed, known, state, options.live));
    return;
  }
  if (state.timeoutUntil) {
    renderStatus(footer, 'You are temporarily timed out from chat.');
    return;
  }
  const signIn = document.createElement('a');
  signIn.className = 'review-spectator-chat__signin';
  signIn.href = '/account?tab=login';
  signIn.textContent = 'Sign in to chat';
  footer.append(signIn);
}

function buildComposer(
  roomId: string,
  feed: HTMLElement,
  known: Set<string>,
  state: ChatState,
  includeQuickChat: boolean,
): HTMLElement {
  const form = document.createElement('form');
  form.className = 'review-spectator-chat__composer';

  const input = document.createElement('input');
  input.className = 'review-spectator-chat__input';
  input.type = 'text';
  input.maxLength = 140;
  input.placeholder = 'Please be nice in the chat!';

  const status = document.createElement('span');
  status.className = 'review-spectator-chat__status';
  status.hidden = true;

  const sendMessage = async (text: string): Promise<boolean> => {
    if (!text) return false;
    setComposerDisabled(form, true);
    status.hidden = true;
    try {
      const line = await postGameChatLine(roomId, text);
      input.value = '';
      appendLines(feed, [line], known, state, roomId);
      return true;
    } catch (error) {
      status.textContent = postErrorCopy(error instanceof ChatPostError ? error.code : undefined);
      status.hidden = false;
      return false;
    } finally {
      setComposerDisabled(form, false);
    }
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    await sendMessage(text);
    input.focus();
  });

  form.append(input, status);
  if (includeQuickChat) form.append(buildQuickChat(sendMessage));
  return form;
}

function buildQuickChat(sendMessage: (text: string) => Promise<boolean>): HTMLElement {
  const quickChat = document.createElement('div');
  quickChat.className = 'review-spectator-chat__quick';
  quickChat.setAttribute('aria-label', 'Quick chat');
  for (const message of QUICK_CHAT_MESSAGES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'review-spectator-chat__quick-button';
    button.textContent = message;
    button.addEventListener('click', () => void sendMessage(message));
    quickChat.append(button);
  }
  return quickChat;
}

function setComposerDisabled(form: HTMLFormElement, disabled: boolean): void {
  for (const control of form.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
    'input, button',
  )) {
    control.disabled = disabled;
  }
}

function appendLines(
  feed: HTMLElement,
  lines: ChatLine[],
  known: Set<string>,
  state: Pick<ChatState, 'canReport' | 'viewerHandle'>,
  roomId: string,
): void {
  if (lines.length === 0) return;
  const wasAtBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 24;
  for (const line of lines) {
    if (known.has(line.id)) continue;
    known.add(line.id);
    const row = document.createElement('div');
    row.className = 'review-spectator-chat__line';
    const who = document.createElement('a');
    who.className = 'review-spectator-chat__handle';
    who.href = line.handle ? `/@/${encodeURIComponent(line.handle)}` : '#';
    who.textContent = line.handle ?? 'deleted';
    const text = document.createElement('span');
    text.className = 'review-spectator-chat__text';
    appendChatText(text, line.text);
    row.append(who, text);
    if (canReportLine(state, line)) row.append(buildReportControl(roomId, line));
    feed.append(row);
  }
  if (wasAtBottom) feed.scrollTop = feed.scrollHeight;
}

function canReportLine(
  state: Pick<ChatState, 'canReport' | 'viewerHandle'>,
  line: ChatLine,
): boolean {
  return !!state.canReport && !!line.handle && line.handle !== state.viewerHandle;
}

function buildReportControl(roomId: string, line: ChatLine): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'review-spectator-chat__report';
  button.title = 'Report message';
  button.textContent = '!';
  button.addEventListener('click', async () => {
    button.disabled = true;
    const resp = await fetch(`${gameChatApiUrl(roomId)}/report`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lineId: line.id, reason: 'Chat message report' }),
    }).catch(() => null);
    if (resp?.ok || resp?.status === 409) {
      button.textContent = 'reported';
      button.title = 'Reported';
      button.classList.add('is-reported');
      return;
    }
    button.disabled = false;
    button.title = 'Report failed';
  });
  return button;
}

function renderStatus(container: HTMLElement, text: string): void {
  container.replaceChildren();
  const status = document.createElement('p');
  status.className = 'review-spectator-chat__empty';
  status.textContent = text;
  container.append(status);
}

function appendChatText(container: HTMLElement, text: string): void {
  let cursor = 0;
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? cursor;
    if (index > cursor) container.append(document.createTextNode(text.slice(cursor, index)));
    const token = document.createElement('span');
    token.className = 'review-spectator-chat__token';
    token.textContent = match[0];
    container.append(token);
    cursor = index + match[0].length;
  }
  if (cursor < text.length) container.append(document.createTextNode(text.slice(cursor)));
}

async function fetchGameChat(roomId: string): Promise<ChatState | null> {
  try {
    const response = await fetch(gameChatApiUrl(roomId));
    if (!response.ok) return null;
    return (await response.json()) as ChatState;
  } catch {
    return null;
  }
}

class ChatPostError extends Error {
  constructor(readonly code: string | undefined) {
    super(code ?? 'chat_post_failed');
  }
}

async function postGameChatLine(roomId: string, text: string): Promise<ChatLine> {
  const response = await fetch(gameChatApiUrl(roomId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ChatPostError(data.error);
  }
  const data = (await response.json()) as { line: ChatLine };
  return data.line;
}

function postErrorCopy(error: string | undefined): string {
  if (error === 'rate_limited' || error === 'repeated_message') return 'Please slow down.';
  if (error === 'links_not_allowed') return 'Links are not available for this account yet.';
  if (error === 'timed_out') return 'You are temporarily timed out from chat.';
  return 'Could not send that message.';
}
