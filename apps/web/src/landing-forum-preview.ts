import { t } from './i18n/catalog.js';
import { buildSiteBox } from './site-box.js';
import './landing-forum-preview.css';

type ForumAuthor = {
  handle: string;
  displayName: string;
} | null;

type ForumTopicSummary = {
  id: string;
  slug: string;
  title: string;
  category: {
    slug: string;
    name: string;
  };
  latestPost: {
    post: {
      id: string;
    };
    author: ForumAuthor;
    createdAt: string;
    /** Opening words of the post (server-side plain-text excerpt). */
    excerpt?: string;
  } | null;
  postCount: number;
  pinned: boolean;
  locked: boolean;
  lastPostAt: string;
};

const postPageSize = 25;
// More than the box can show. The box height is the daily puzzle board's
// (band-2 equal heights), so the row count is measured, not configured:
// fitRows() drops trailing rows that would clip mid-item.
const landingForumFetchLimit = 8;

export function buildLandingForumPreview(options: { hydrate?: boolean } = {}): HTMLElement {
  const { box, body } = buildSiteBox({
    title: t('homeForum.heading'),
    href: '/forum',
    className: 'landing-forum',
  });
  body.append(plainRow(t('homeForum.loading')));
  if (options.hydrate !== false) {
    void hydrateForumPreview(body);
  }
  return box;
}

async function hydrateForumPreview(body: HTMLElement): Promise<void> {
  try {
    const topics = await fetchActiveTopics();
    body.replaceChildren();
    if (topics.length === 0) {
      body.append(plainRow(t('homeForum.empty')));
      return;
    }
    const rows = topics.map(topicRow);
    fitRows(body, rows);
    if (typeof ResizeObserver !== 'undefined') {
      let fittedHeight = body.clientHeight;
      new ResizeObserver(() => {
        if (body.clientHeight === fittedHeight) return;
        fittedHeight = body.clientHeight;
        fitRows(body, rows);
      }).observe(body);
    }
  } catch {
    body.replaceChildren(plainRow(t('homeForum.unavailable')));
  }
}

function topicRow(topic: ForumTopicSummary): HTMLElement {
  const row = document.createElement('a');
  row.className = 'site-box-row landing-forum-topic';
  row.href = topicActivityHref(topic);
  if (topic.pinned) row.classList.add('is-pinned');
  if (topic.locked) row.classList.add('is-locked');

  const main = document.createElement('span');
  main.className = 'landing-forum-topic-main';
  main.append(span('landing-forum-topic-title', topic.title));
  const excerpt = topic.latestPost?.excerpt?.trim() ?? '';
  if (excerpt) main.append(span('landing-forum-topic-excerpt', excerpt));
  main.append(
    span(
      'landing-forum-topic-meta',
      `${topic.category.name} · ${latestAuthorLabel(topic.latestPost?.author ?? null)}`,
    ),
  );

  const createdAt = topic.latestPost?.createdAt ?? topic.lastPostAt;
  const activity = document.createElement('span');
  activity.className = 'landing-forum-topic-activity';
  activity.textContent = formatTimeAgo(createdAt);
  activity.title = formatDateTime(createdAt);

  const replies = Math.max(0, topic.postCount - 1);
  const count = span('landing-forum-topic-count', String(replies));
  count.title =
    replies === 1 ? t('homeForum.repliesOne') : t('homeForum.replies', { count: replies });

  row.append(main, activity, count);
  return row;
}

// Whole rows only: a row cut mid-excerpt reads as broken. Trimming leaves up
// to one row of slack under the last row; when that slack is small enough to
// spread (at most fillSlackPerRow per row) the rows grow to share it, so the
// last row lands on the box's bottom edge. A content-starved box (two topics
// in a board-height box) keeps its slack instead of puffing each row up.
// The body's height is fixed by the band (flex child of a fixed-height box),
// so neither trimming nor growth changes it. Unlaid-out documents (tests,
// prerender) report clientHeight 0 and keep every row.
const fillSlackPerRow = 28;
const fillClass = 'landing-forum-body--fill';

function fitRows(body: HTMLElement, rows: HTMLElement[]): void {
  body.classList.remove(fillClass);
  body.replaceChildren(...rows);
  const available = body.clientHeight;
  if (available <= 0) return;
  const top = body.getBoundingClientRect().top;
  let lastBottom = 0;
  while (body.childElementCount > 0) {
    const last = body.lastElementChild as HTMLElement;
    lastBottom = last.getBoundingClientRect().bottom - top;
    if (lastBottom <= available + 0.5 || body.childElementCount === 1) break;
    last.remove();
  }
  const slack = available - lastBottom;
  body.classList.toggle(fillClass, slack > 0 && slack <= body.childElementCount * fillSlackPerRow);
}

function span(className: string, text: string): HTMLElement {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}

function plainRow(text: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'site-box-row';
  const label = document.createElement('span');
  label.className = 'site-box-row-label';
  label.textContent = text;
  row.append(label);
  return row;
}

function topicActivityHref(topic: ForumTopicSummary): string {
  const topicHref = `/forum/t/${encodeURIComponent(topic.id)}/${encodeURIComponent(topic.slug)}`;
  if (!topic.latestPost) return topicHref;
  const page = pageForPostCount(topic.postCount);
  return `${topicHref}${page > 1 ? `?page=${page}` : ''}#post_${topic.latestPost.post.id}`;
}

function pageForPostCount(postCount: number): number {
  return Math.max(1, Math.ceil(postCount / postPageSize));
}

function latestAuthorLabel(author: ForumAuthor): string {
  return author?.displayName
    ? t('homeForum.by', { name: author.displayName })
    : t('homeForum.latestActivity');
}

function formatTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 1) return t('homeForum.timeNow');
  if (minutes < 60) return t('homeForum.timeMinutes', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('homeForum.timeHours', { count: hours });
  const days = Math.round(hours / 24);
  if (days < 30) return t('homeForum.timeDays', { count: days });
  return new Date(iso).toLocaleDateString();
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

async function fetchActiveTopics(): Promise<ForumTopicSummary[]> {
  const resp = await fetch(`/api/forum/topics?limit=${landingForumFetchLimit}`, {
    headers: { accept: 'application/json' },
  });
  if (!resp.ok) throw new Error(`forum_preview_failed_${resp.status}`);
  const data = (await resp.json()) as { topics: ForumTopicSummary[] };
  return data.topics;
}
