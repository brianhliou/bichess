import './forum.css';
import { t } from './i18n/catalog.js';
import { prependTitleBadge } from './player-titles.js';
import { type AuthUser, buildNav, buildNotice, fetchCurrentUser } from './site-shell.js';
import { buildUiIcon } from './ui-icon.js';

type ForumCategory = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  topicWritePolicy: 'account' | 'admin';
  topicCount: number;
  postCount: number;
  latestPost: {
    post: {
      id: string;
    };
    topic: {
      id: string;
      slug: string;
      title: string;
      postCount: number;
    };
    author: ForumAuthor;
    createdAt: string;
  } | null;
};

type ForumAuthor = {
  handle: string;
  displayName: string;
  // Verified player title (088), null for everyone else. On the AUTHOR, never
  // to be confused with the topic's own title.
  title?: string | null;
  // Soft presence signal; only populated on post authors in the topic detail
  // payload. Undefined everywhere it is not computed (treated as offline).
  online?: boolean;
} | null;

type ForumTopicSummary = {
  id: string;
  slug: string;
  title: string;
  category: {
    slug: string;
    name: string;
  };
  author: ForumAuthor;
  latestPost: {
    post: {
      id: string;
    };
    author: ForumAuthor;
    createdAt: string;
  } | null;
  postCount: number;
  pinned: boolean;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
  lastPostAt: string;
};

type ForumPost = {
  id: string;
  author: ForumAuthor;
  bodyText: string;
  createdAt: string;
  updatedAt: string;
  hidden?: boolean;
  hiddenAt?: string | null;
};

type ForumTopicDetail = ForumTopicSummary & {
  posts: ForumPost[];
  // The signed-in reader's own watch state; null (or absent) when anonymous.
  viewer?: { watching: boolean } | null;
};

type ForumPostSearchResult = {
  post: {
    id: string;
    page: number;
    snippet: string;
  };
  topic: {
    id: string;
    slug: string;
    title: string;
    postCount: number;
    category: {
      slug: string;
      name: string;
    };
  };
  author: ForumAuthor;
  createdAt: string;
};

type ForumPostSearchPage = {
  posts: ForumPostSearchResult[];
  total: number;
};

type ForumReportStatus = 'open' | 'resolved' | 'dismissed';

type ForumReportStatusFilter = ForumReportStatus | 'all';

type ForumReport = {
  id: string;
  status: ForumReportStatus;
  targetType: 'topic' | 'post';
  reason: string;
  resolutionNote: string | null;
  reporter: ForumAuthor;
  resolver: ForumAuthor;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  topic: {
    id: string;
    slug: string;
    title: string;
    category: {
      slug: string;
      name: string;
    };
    hidden: boolean;
  };
  post: {
    id: string;
    page: number;
    snippet: string;
    author: ForumAuthor;
    createdAt: string;
    hidden: boolean;
  } | null;
};

const topicListPageSize = 25;
const postPageSize = 25;
const forumReportPageSize = 50;
const forumTopicTitleMaxLength = 120;
const forumPostBodyMaxLength = 5000;
const forumModerationReasonMaxLength = 240;

class ForumNotFound extends Error {}
class ForumForbidden extends Error {}

export async function mountForum(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'forum-route');

  const shell = document.createElement('main');
  shell.className = 'site-section forum-shell';
  root.append(buildNav(), shell);

  const body = document.createElement('div');
  body.className = 'forum-layout';
  body.append(statusPanel(t('forum.loading')));
  shell.append(body);

  const query = new URLSearchParams(window.location.search);
  const categoryFilter = categorySlugFromPath(window.location.pathname) ?? query.get('category');
  const searchQuery = searchQueryFromParam(query.get('q'));
  const topicPage = pageFromParam(query.get('page'));
  const topicOffset = (topicPage - 1) * topicListPageSize;
  let categories: ForumCategory[];
  let forumRows: ForumTopicSummary[] | ForumPostSearchPage;
  let user: AuthUser | null;
  try {
    [categories, forumRows, user] = await Promise.all([
      fetchForumCategories(),
      searchQuery
        ? searchForumPosts({
            query: searchQuery,
            limit: topicListPageSize + 1,
            offset: topicOffset,
          })
        : categoryFilter
          ? fetchForumTopics({
              categorySlug: categoryFilter,
              limit: topicListPageSize + 1,
              offset: topicOffset,
            })
          : Promise.resolve([]),
      fetchCurrentUser().catch(() => null),
    ]);
  } catch {
    body.replaceChildren(buildNotice(t('forum.unavailable'), t('forum.couldNotLoad')));
    return;
  }
  const searchPage = searchQuery ? (forumRows as ForumPostSearchPage) : null;
  const topics = searchQuery ? [] : (forumRows as ForumTopicSummary[]);
  const searchPosts = searchPage?.posts ?? [];
  const hasNextPage = searchQuery
    ? searchPosts.length > topicListPageSize
    : topics.length > topicListPageSize;
  const visibleTopics = topics.slice(0, topicListPageSize);
  const visibleSearchPosts = searchPosts.slice(0, topicListPageSize);

  const selectedCategory = searchQuery
    ? undefined
    : categories.find((category) => category.slug === categoryFilter);

  const panel = forumPanel();
  if (searchQuery) {
    panel.append(searchPanelHeader(searchQuery));
  } else if (selectedCategory) {
    const composer = canStartTopicInCategory(selectedCategory, user)
      ? newTopicForm(categories, user, selectedCategory.slug)
      : null;
    if (composer) {
      composer.classList.add('forum-topic-composer');
      composer.hidden = true;
    }
    panel.append(
      categoryPanelHeader(selectedCategory, user, composer),
      ...(composer ? [composer] : []),
    );
  } else {
    panel.append(forumHomeHeader(searchQuery, user), categoryIndex(categories));
  }
  const topicPageOptions = {
    categorySlug: searchQuery ? null : categoryFilter,
    searchQuery,
    page: topicPage,
    hasNext: hasNextPage,
    hasPrevious: topicPage > 1,
  };
  if (searchQuery) {
    const needsPager = topicPage > 1 || hasNextPage;
    if (needsPager) panel.append(topicPager(topicPageOptions));
    panel.append(
      postSearchResults(
        visibleSearchPosts,
        searchPage?.total ?? 0,
        topicPage > 1 ? t('forum.noPostsOnPage') : t('forum.noPostsMatched'),
      ),
    );
    if (needsPager) panel.append(topicPager(topicPageOptions));
  } else if (selectedCategory) {
    // Category pages auto-paginate on scroll when the browser supports it;
    // pager links remain as the fallback and as the way back to earlier pages.
    const autoPages = typeof IntersectionObserver === 'function';
    const needsPagerLinks = topicPage > 1 || hasNextPage;
    if (needsPagerLinks && (!autoPages || topicPage > 1)) {
      panel.append(topicPager(topicPageOptions));
    }
    const list = topicList(
      visibleTopics,
      topicPage > 1 ? 'No forum topics on this page.' : undefined,
    );
    panel.append(list);
    if (autoPages && hasNextPage) {
      panel.append(
        topicAutoPager({
          list,
          categorySlug: selectedCategory.slug,
          page: topicPage,
          renderedTopicIds: new Set(visibleTopics.map((topic) => topic.id)),
        }),
      );
    } else if (needsPagerLinks && !autoPages) {
      panel.append(topicPager(topicPageOptions));
    }
  }

  body.replaceChildren(panel);
}

export async function mountForumTopic(root: HTMLElement, topicId: string): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'forum-route');

  const shell = document.createElement('main');
  shell.className = 'site-section forum-shell';
  root.append(buildNav(), shell);

  const query = new URLSearchParams(window.location.search);
  const postPage = pageFromParam(query.get('page'));
  const postOffset = (postPage - 1) * postPageSize;
  let topic: ForumTopicDetail;
  let categories: ForumCategory[];
  let user: AuthUser | null;
  try {
    [topic, categories, user] = await Promise.all([
      fetchForumTopic(topicId, { limit: postPageSize + 1, offset: postOffset }),
      fetchForumCategories().catch(() => []),
      fetchCurrentUser().catch(() => null),
    ]);
  } catch (err) {
    if (err instanceof ForumNotFound) {
      document.title = t('forum.topicNotFoundTitle');
      shell.append(buildNotice(t('forum.topicNotFound'), t('forum.topicNotAvailable')));
      return;
    }
    shell.append(buildNotice(t('forum.unavailable'), t('forum.topicCouldNotLoad')));
    return;
  }

  document.title = `${topic.title} · Forum · Mistboard`;
  const hasNextPostPage = topic.posts.length > postPageSize;
  const visiblePosts = topic.posts.slice(0, postPageSize);

  const panel = forumPanel('forum-topic-panel');
  panel.append(topicHeader(topic, user));
  if (user?.accountRole === 'admin') panel.append(topicModerationBox(topic, categories));
  const needsPostPager = postPage > 1 || hasNextPostPage;
  const postPageOptions = {
    topic,
    page: postPage,
    hasNext: hasNextPostPage,
    hasPrevious: postPage > 1,
  };
  if (needsPostPager) panel.append(postPager(postPageOptions));
  panel.append(
    postList(
      topic,
      visiblePosts,
      user,
      postPage > 1 ? 'No forum posts on this page.' : undefined,
      postPage,
    ),
  );
  if (needsPostPager) panel.append(postPager(postPageOptions));
  if (topic.locked) panel.append(statusPanel(t('forum.topicLocked')));
  else panel.append(user ? replyForm(topic, user) : signInBox(t('forum.signInToReply')));

  shell.append(panel);
  // Read receipt for the bell: the watcher has now seen this page of replies.
  if (user && topic.viewer?.watching) markTopicSeen(topic.id);
}

export async function mountForumPostRedirect(root: HTMLElement, postId: string): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'forum-route');

  const shell = document.createElement('main');
  shell.className = 'site-section forum-shell';
  root.append(buildNav(), shell);
  shell.append(statusPanel(t('forum.openingPost')));

  try {
    const resp = await fetch(`/api/forum/posts/${encodeURIComponent(postId)}/redirect`, {
      headers: { accept: 'application/json' },
    });
    if (resp.status === 404) {
      shell.replaceChildren(buildNotice(t('forum.postNotFound'), t('forum.postNotAvailable')));
      return;
    }
    if (!resp.ok) throw new Error(`forum_post_redirect_failed_${resp.status}`);
    const data = (await resp.json()) as { href: string };
    window.location.replace(data.href);
  } catch {
    shell.replaceChildren(buildNotice(t('forum.unavailable'), t('forum.postCouldNotLoad')));
  }
}

export async function mountForumReports(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'forum-route');

  const shell = document.createElement('main');
  shell.className = 'site-section forum-shell';
  root.append(buildNav(), shell);

  const body = document.createElement('div');
  body.className = 'forum-layout';
  body.append(statusPanel(t('forum.loadingReports')));
  shell.append(body);

  const query = new URLSearchParams(window.location.search);
  const status = reportStatusFromParam(query.get('status'));
  const page = pageFromParam(query.get('page'));
  const offset = (page - 1) * forumReportPageSize;
  let reports: ForumReport[];
  try {
    reports = await fetchForumReports({
      status,
      limit: forumReportPageSize + 1,
      offset,
    });
  } catch (err) {
    body.replaceChildren(
      err instanceof ForumForbidden
        ? buildNotice(t('forum.adminAccessRequired'), t('forum.reportsAreModerators'))
        : buildNotice(t('forum.unavailable'), t('forum.reportQueueCouldNotLoad')),
    );
    return;
  }

  const visibleReports = reports.slice(0, forumReportPageSize);
  const hasNext = reports.length > forumReportPageSize;
  const panel = forumPanel('forum-reports-panel');
  panel.append(
    forumReportsHeader(),
    forumReportFilters(status),
    reportList(visibleReports, status),
  );
  if (page > 1 || hasNext) {
    panel.append(
      reportPager({
        status,
        page,
        hasPrevious: page > 1,
        hasNext,
      }),
    );
  }
  body.replaceChildren(panel);
}

export async function mountForumEtiquette(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  root.classList.add('landing-page', 'forum-route');
  document.title = t('forum.etiquettePageTitle');

  const shell = document.createElement('main');
  shell.className = 'site-section forum-shell';
  root.append(buildNav(), shell);

  const panel = forumPanel('forum-etiquette-panel');
  const header = document.createElement('header');
  header.className = 'forum-etiquette-header';
  const heading = document.createElement('h1');
  heading.className = 'forum-etiquette-title';
  heading.textContent = t('forum.etiquette');
  header.append(forumBackLink('/forum', 'Back to forum'), heading);

  const body = document.createElement('div');
  body.className = 'forum-etiquette-body';
  const intro = document.createElement('p');
  intro.className = 'forum-etiquette-lede';
  intro.textContent = t('forum.etiquetteLede');
  body.append(
    intro,
    etiquetteSection(t('forum.etiquetteTitleHeading'), [
      etiquettePara(t('forum.etiquetteTitleBody')),
      etiquetteExample('do', t('forum.etiquetteTitleDo')),
      etiquetteExample('dont', t('forum.etiquetteTitleDont')),
    ]),
    etiquetteSection(t('forum.etiquetteCategoryHeading'), [
      etiquettePara(t('forum.etiquetteCategoryBody')),
    ]),
    etiquetteSection(t('forum.etiquetteSpamHeading'), [
      etiquettePara(t('forum.etiquetteSpamBody')),
      etiquetteExample('do', t('forum.etiquetteSpamDo')),
      etiquetteExample('dont', t('forum.etiquetteSpamDont')),
      etiquetteExample('dont', t('forum.etiquetteSpamDont2')),
    ]),
    etiquetteSection(t('forum.etiquetteRespectHeading'), [
      etiquettePara(t('forum.etiquetteRespectBody')),
      etiquetteExample('do', t('forum.etiquetteRespectDo')),
      etiquetteExample('dont', t('forum.etiquetteRespectDont')),
    ]),
    etiquetteSection(t('forum.etiquetteCheatingHeading'), [
      etiquettePara([
        t('forum.etiquetteCheatingBefore'),
        etiquetteLink(t('forum.etiquetteContactLink'), '/contact'),
        t('forum.etiquetteCheatingAfter'),
      ]),
    ]),
    etiquetteSection(t('forum.etiquetteModerationHeading'), [
      etiquettePara([
        t('forum.etiquetteModerationBefore'),
        etiquetteLink(t('forum.etiquetteFaqLink'), '/faq'),
        t('forum.etiquetteModerationAfter'),
      ]),
    ]),
  );
  panel.append(header, body);
  shell.append(panel);
}

function etiquetteSection(title: string, nodes: HTMLElement[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'forum-etiquette-section';
  const heading = document.createElement('h2');
  heading.className = 'forum-etiquette-section-title';
  heading.textContent = title;
  section.append(heading, ...nodes);
  return section;
}

// Do/don't example line with a leading check or cross, mirroring lichess.
function etiquetteExample(kind: 'do' | 'dont', text: string): HTMLElement {
  const line = document.createElement('p');
  line.className = `forum-etiquette-example forum-etiquette-example-${kind}`;
  const mark = document.createElement('span');
  mark.className = 'forum-etiquette-example-mark';
  mark.textContent = kind === 'do' ? '✅' : '❌';
  mark.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('span');
  copy.textContent = text;
  line.append(mark, copy);
  return line;
}

function etiquettePara(content: string | Array<string | Node>): HTMLElement {
  const p = document.createElement('p');
  p.className = 'forum-etiquette-para';
  for (const part of Array.isArray(content) ? content : [content]) {
    p.append(typeof part === 'string' ? document.createTextNode(part) : part);
  }
  return p;
}

function etiquetteLink(label: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  return link;
}

function forumPanel(extraClassName = ''): HTMLElement {
  const panel = document.createElement('section');
  panel.className = ['forum-panel', extraClassName].filter(Boolean).join(' ');
  return panel;
}

function forumHomeHeader(searchQuery: string | null, user: AuthUser | null): HTMLElement {
  const header = document.createElement('header');
  header.className = 'forum-panel-header forum-panel-header-home';
  header.append(
    forumPanelTitle(t('forum.mistboardForum'), { icon: true }),
    forumHomeActions(searchQuery, user),
  );
  return header;
}

function forumHomeActions(searchQuery: string | null, user: AuthUser | null): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'forum-panel-actions';
  actions.append(forumSearchForm(searchQuery, { compact: true }));
  // The Discord invite sat here beside the search from 2026-08-27 and came out
  // on 2026-08-31, the last of its three surfaces: the room is not ready to be
  // promoted. The forum is the community until it is.
  if (user?.accountRole === 'admin') {
    const reports = document.createElement('a');
    reports.className = 'forum-panel-action forum-report-admin-link';
    reports.href = '/forum/reports';
    reports.textContent = t('forum.reports');
    actions.append(reports);
  }
  return actions;
}

function categoryPanelHeader(
  category: ForumCategory,
  user: AuthUser | null,
  composer: HTMLElement | null,
): HTMLElement {
  const header = document.createElement('header');
  header.className = 'forum-panel-header forum-header forum-panel-header-category';
  const titleRow = document.createElement('div');
  titleRow.className = 'forum-panel-title-row';
  titleRow.append(forumBackLink('/forum', 'Back to forum'), forumPanelTitle(category.name));
  header.append(titleRow, newTopicPanelAction(category, user, composer));
  return header;
}

function searchPanelHeader(query: string): HTMLElement {
  const header = document.createElement('header');
  header.className = 'forum-panel-header forum-panel-header-search';
  const title = forumPanelTitle(t('forum.searchResults'));
  const copy = document.createElement('p');
  copy.className = 'forum-panel-subtitle';
  copy.textContent = `"${query}"`;
  const titleStack = document.createElement('div');
  titleStack.className = 'forum-panel-title-stack';
  titleStack.append(title, copy);
  header.append(
    forumBackLink('/forum', 'Back to forum'),
    titleStack,
    forumSearchForm(query, { compact: true }),
  );
  return header;
}

function forumReportsHeader(): HTMLElement {
  const header = document.createElement('header');
  header.className = 'forum-panel-header forum-panel-header-reports';
  const titleRow = document.createElement('div');
  titleRow.className = 'forum-panel-title-row';
  titleRow.append(
    forumBackLink('/forum', t('forum.backToForum')),
    forumPanelTitle(t('forum.reportsTitle')),
  );
  header.append(titleRow);
  return header;
}

function forumPanelTitle(title: string, options: { icon?: boolean } = {}): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'forum-panel-title';
  if (options.icon) {
    wrap.append(forumPanelIcon());
  }
  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = title;
  wrap.append(heading);
  return wrap;
}

function forumPanelIcon(): SVGElement {
  return buildUiIcon('forum-topic', 'forum-panel-icon');
}

function forumBackLink(href: string, label: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'forum-back-link forum-panel-back';
  link.href = href;
  link.setAttribute('aria-label', label);
  link.append(forumBackChevron());
  return link;
}

// Rounded chevron, softer than a bare "<" glyph (round line caps/joins).
function forumBackChevron(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('forum-back-chevron');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M15 5 L8.5 12 L15 19');
  svg.append(path);
  return svg;
}

function newTopicPanelAction(
  category: ForumCategory,
  user: AuthUser | null,
  composer: HTMLElement | null,
): HTMLElement {
  if (!user) {
    const link = document.createElement('a');
    link.className = 'forum-panel-action';
    link.href = '/account?tab=login';
    link.textContent = t('forum.signInToPostLink');
    return link;
  }
  if (!composer) {
    const disabled = document.createElement('span');
    disabled.className = 'forum-panel-action forum-panel-action-disabled';
    disabled.textContent = `${category.name} is restricted`;
    return disabled;
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'forum-panel-action forum-panel-action-create';
  const label = document.createElement('span');
  label.textContent = t('forum.createNewTopic');
  button.append(buildUiIcon('create-topic', 'forum-create-topic-icon'), label);
  button.addEventListener('click', () => {
    composer.hidden = !composer.hidden;
    button.setAttribute('aria-expanded', String(!composer.hidden));
    if (!composer.hidden) {
      composer.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
    }
  });
  button.setAttribute('aria-expanded', 'false');
  return button;
}

function canStartTopicInCategory(category: ForumCategory, user: AuthUser | null): user is AuthUser {
  return Boolean(user && (category.topicWritePolicy !== 'admin' || user.accountRole === 'admin'));
}

function topicHeader(topic: ForumTopicDetail, user: AuthUser | null): HTMLElement {
  const header = document.createElement('header');
  header.className = 'forum-panel-header forum-header forum-panel-header-topic';
  const heading = document.createElement('h1');
  heading.className = 'site-section-heading';
  heading.textContent = topic.title;
  const titleRow = document.createElement('div');
  titleRow.className = 'forum-topic-title-row';
  titleRow.append(
    forumBackLink(categoryHref(topic.category), `Back to ${topic.category.name}`),
    heading,
  );
  if (user) titleRow.append(topicWatchButton(topic));
  if (canReportForumContent(topic.author, user)) titleRow.append(topicReportButton(topic));
  const meta = document.createElement('p');
  meta.className = 'forum-sub';
  meta.textContent = `${topic.category.name} · ${topic.postCount} ${topic.postCount === 1 ? 'post' : 'posts'} · last activity ${formatTimeAgo(topic.lastPostAt)}`;
  meta.title = formatDateTime(topic.lastPostAt);
  header.append(titleRow, meta);
  return header;
}

function categoryIndex(categories: ForumCategory[]): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'forum-category-index';
  const header = document.createElement('div');
  header.className = 'forum-category-index-row forum-category-index-header';
  header.append(
    indexCell('', 'forum-category-index-main'),
    indexCell(t('forum.topicsColumn'), 'forum-category-index-stat'),
    indexCell(t('forum.postsColumn'), 'forum-category-index-stat'),
    indexCell(t('forum.lastPostColumn'), 'forum-category-index-last'),
  );
  wrap.append(header);
  for (const category of categories) wrap.append(categoryIndexRow(category));
  return wrap;
}

function categoryIndexRow(category: ForumCategory): HTMLElement {
  const row = document.createElement('div');
  row.className = 'forum-category-index-row';

  const main = document.createElement('a');
  main.className = 'forum-category-index-main';
  main.href = categoryHref(category);
  const title = document.createElement('strong');
  title.textContent = category.name;
  const desc = document.createElement('span');
  desc.textContent = category.description;
  main.append(title, desc);

  row.append(
    main,
    indexCell(formatCount(category.topicCount), 'forum-category-index-stat'),
    indexCell(formatCount(category.postCount), 'forum-category-index-stat'),
    latestPostCell(category),
  );
  return row;
}

function latestPostCell(category: ForumCategory): HTMLElement {
  if (!category.latestPost) {
    const cell = document.createElement('span');
    cell.className = 'forum-category-index-last';
    cell.textContent = t('forum.noPostsYet');
    return cell;
  }
  const cell = document.createElement('span');
  cell.className = 'forum-category-index-last';
  const title = document.createElement('a');
  title.className = 'forum-category-latest-title';
  title.href = postHref(
    category.latestPost.topic,
    category.latestPost.post.id,
    pageForPostCount(category.latestPost.topic.postCount),
  );
  title.textContent = category.latestPost.topic.title;
  const meta = document.createElement('span');
  meta.className = 'forum-category-latest-meta';
  appendLatestPostMeta(meta, category.latestPost.author, category.latestPost.createdAt, {
    authorClassName: 'forum-category-latest-author',
  });
  cell.append(title, meta);
  return cell;
}

function indexCell(text: string, className: string): HTMLElement {
  const cell = document.createElement('span');
  cell.className = className;
  cell.textContent = text;
  return cell;
}

function topicList(
  topics: ForumTopicSummary[],
  emptyText = t('forum.noTopicsYet'),
  options: { showCategory?: boolean } = {},
): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'forum-topic-list';
  if (topics.length === 0) {
    wrap.className = 'forum-topic-list-empty';
    wrap.append(statusPanel(emptyText));
    return wrap;
  }
  wrap.append(topicListHeader());
  for (const topic of topics) wrap.append(topicRow(topic, { showCategory: options.showCategory }));
  return wrap;
}

function topicListHeader(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'forum-topic-row forum-topic-list-header';
  row.append(
    indexCell('', 'forum-topic-row-main'),
    indexCell(t('forum.repliesColumn'), 'forum-topic-row-replies'),
    indexCell(t('forum.lastPostColumn'), 'forum-topic-row-latest'),
  );
  return row;
}

function postSearchResults(
  posts: ForumPostSearchResult[],
  total: number,
  emptyText: string,
): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'forum-search-results';
  if (posts.length === 0) {
    wrap.classList.add('forum-search-results-empty');
    wrap.append(statusPanel(emptyText));
    return wrap;
  }
  const count = document.createElement('strong');
  count.className = 'forum-search-result-count';
  count.textContent = `${formatCount(total)} forum ${total === 1 ? 'post' : 'posts'}`;
  wrap.append(count);
  for (const post of posts) wrap.append(postSearchResultRow(post));
  return wrap;
}

function postSearchResultRow(result: ForumPostSearchResult): HTMLElement {
  const row = document.createElement('article');
  row.className = 'forum-search-row';
  const main = document.createElement('div');
  main.className = 'forum-search-main';
  const title = document.createElement('a');
  title.className = 'forum-search-title';
  title.href = postHref(result.topic, result.post.id, result.post.page);
  title.textContent = `${result.topic.category.name} - ${result.topic.title}`;
  const snippet = document.createElement('p');
  snippet.className = 'forum-search-snippet';
  snippet.textContent = result.post.snippet;
  main.append(title, snippet);

  const meta = document.createElement('div');
  meta.className = 'forum-search-meta';
  const time = document.createElement('a');
  time.href = postHref(result.topic, result.post.id, result.post.page);
  time.textContent = formatTimeAgo(result.createdAt);
  time.title = formatDateTime(result.createdAt);
  meta.append(time, document.createElement('br'));
  meta.append(
    document.createTextNode('by '),
    authorProfileLink(result.author, 'forum-search-author'),
  );

  row.append(main, meta);
  return row;
}

function topicPager(options: {
  categorySlug: string | null;
  searchQuery: string | null;
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
}): HTMLElement {
  return forumPager({
    ariaLabel: t('forum.topicPages'),
    page: options.page,
    hasPrevious: options.hasPrevious,
    hasNext: options.hasNext,
    hrefForPage: (page) =>
      forumHref({ categorySlug: options.categorySlug, searchQuery: options.searchQuery }, page),
  });
}

function topicAutoPager(options: {
  list: HTMLElement;
  categorySlug: string;
  page: number;
  renderedTopicIds: Set<string>;
}): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'forum-topic-autopager';
  const status = document.createElement('div');
  status.className = 'forum-topic-autopager-status';
  const spinner = document.createElement('span');
  spinner.className = 'site-loading-mark forum-autopager-spinner';
  spinner.setAttribute('role', 'status');
  spinner.setAttribute('aria-label', t('forum.loadingMoreTopics'));
  status.append(spinner);
  status.hidden = true;
  wrap.append(status);

  let nextPage = options.page + 1;
  let loading = false;
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadNextPage();
    },
    { rootMargin: '480px 0px' },
  );
  // Scroll fallback: guards against missed observer entries so the list keeps
  // loading even if the browser never re-fires for a sentinel that stayed in
  // view. Cheap because loadNextPage no-ops while a fetch is in flight.
  const onScroll = () => {
    if (wrap.getBoundingClientRect().top < window.innerHeight + 480) void loadNextPage();
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  const finish = (replacement?: HTMLElement) => {
    observer.disconnect();
    window.removeEventListener('scroll', onScroll);
    if (replacement) wrap.replaceWith(replacement);
    else wrap.remove();
  };
  const loadNextPage = async (): Promise<void> => {
    if (loading || !wrap.isConnected) return;
    loading = true;
    status.hidden = false;
    try {
      const rows = await fetchForumTopics({
        categorySlug: options.categorySlug,
        limit: topicListPageSize + 1,
        offset: (nextPage - 1) * topicListPageSize,
      });
      for (const topic of rows.slice(0, topicListPageSize)) {
        if (options.renderedTopicIds.has(topic.id)) continue;
        options.renderedTopicIds.add(topic.id);
        const row = topicRow(topic);
        row.classList.add('forum-topic-row-appended');
        options.list.append(row);
      }
      if (rows.length > topicListPageSize) {
        nextPage += 1;
        // Re-observing forces a fresh intersection entry, so a sentinel that
        // is still inside the viewport keeps loading without a scroll event.
        observer.unobserve(wrap);
        observer.observe(wrap);
      } else {
        finish();
      }
    } catch {
      // Fall back to pager links so navigation still works.
      finish(
        topicPager({
          categorySlug: options.categorySlug,
          searchQuery: null,
          page: nextPage - 1,
          hasPrevious: nextPage > 2,
          hasNext: true,
        }),
      );
    } finally {
      loading = false;
      status.hidden = true;
    }
  };
  observer.observe(wrap);
  return wrap;
}

function postPager(options: {
  topic: { id: string; slug: string };
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
}): HTMLElement {
  return forumPager({
    ariaLabel: t('forum.postPages'),
    page: options.page,
    hasPrevious: options.hasPrevious,
    hasNext: options.hasNext,
    hrefForPage: (page) => topicPageHref(options.topic, page),
  });
}

function forumPager(options: {
  ariaLabel: string;
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
  hrefForPage: (page: number) => string;
}): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'forum-pager';
  nav.setAttribute('aria-label', options.ariaLabel);
  if (options.page > 2) nav.append(pagerLink('1', options.hrefForPage(1)));
  if (options.page > 3) nav.append(pagerEllipsis());
  if (options.hasPrevious) {
    nav.append(pagerLink(String(options.page - 1), options.hrefForPage(options.page - 1)));
  }
  const current = document.createElement('span');
  current.className = 'forum-pager-current';
  current.setAttribute('aria-current', 'page');
  current.textContent = String(options.page);
  nav.append(current);
  if (options.hasNext)
    nav.append(pagerLink(String(options.page + 1), options.hrefForPage(options.page + 1)));
  return nav;
}

function pagerLink(text: string, href: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'forum-pager-link';
  link.href = href;
  link.textContent = text;
  return link;
}

function pagerEllipsis(): HTMLElement {
  const ellipsis = document.createElement('span');
  ellipsis.className = 'forum-pager-ellipsis';
  ellipsis.setAttribute('aria-hidden', 'true');
  ellipsis.textContent = '...';
  return ellipsis;
}

function topicRow(topic: ForumTopicSummary, options: { showCategory?: boolean } = {}): HTMLElement {
  const row = document.createElement('article');
  row.className = 'forum-topic-row';

  const main = document.createElement('div');
  main.className = 'forum-topic-row-main';
  const flags = document.createElement('div');
  flags.className = 'forum-topic-flags';
  if (options.showCategory) flags.append(pill(topic.category.name));
  if (topic.pinned) flags.append(pill(t('forum.pinned')));
  if (topic.locked) flags.append(pill(t('forum.locked')));

  const title = document.createElement('a');
  title.className = 'forum-topic-title';
  title.href = topicHref(topic);
  title.textContent = topic.title;
  const titleLine = document.createElement('div');
  titleLine.className = 'forum-topic-title-line';
  titleLine.append(title);
  const pageLinks = topicInlinePageLinks(topic);
  if (pageLinks) titleLine.append(pageLinks);

  if (flags.childElementCount > 0) main.append(flags);
  main.append(titleLine);

  const replies = document.createElement('span');
  replies.className = 'forum-topic-row-replies';
  replies.textContent = formatCount(replyCount(topic));

  const latestCell = document.createElement('span');
  latestCell.className = 'forum-topic-row-latest';
  if (topic.latestPost) {
    const latest = document.createElement('a');
    latest.className = 'forum-topic-latest-link';
    latest.href = postHref(topic, topic.latestPost.post.id, pageForPostCount(topic.postCount));
    latest.textContent = formatTimeAgo(topic.latestPost.createdAt);
    latest.title = formatDateTime(topic.latestPost.createdAt);
    const by = document.createElement('span');
    by.className = 'forum-topic-latest-by';
    by.append(
      document.createTextNode('by '),
      authorProfileLink(topic.latestPost.author, 'forum-topic-author'),
    );
    latestCell.append(latest, by);
  } else {
    latestCell.textContent = formatTimeAgo(topic.lastPostAt);
    latestCell.title = formatDateTime(topic.lastPostAt);
  }

  row.append(main, replies, latestCell);
  return row;
}

function topicInlinePageLinks(topic: ForumTopicSummary): HTMLElement | null {
  const pageCount = pageForPostCount(topic.postCount);
  if (pageCount <= 1) return null;
  const pages =
    pageCount <= 4
      ? Array.from({ length: pageCount - 1 }, (_, index) => index + 2)
      : [2, 0, pageCount];
  const nav = document.createElement('span');
  nav.className = 'forum-topic-page-links';
  for (const page of pages) {
    if (page === 0) {
      const ellipsis = document.createElement('span');
      ellipsis.className = 'forum-topic-page-ellipsis';
      ellipsis.setAttribute('aria-hidden', 'true');
      ellipsis.textContent = '...';
      nav.append(ellipsis);
      continue;
    }
    const link = document.createElement('a');
    link.className = 'forum-topic-page-link';
    link.href = topicPageHref(topic, page);
    link.setAttribute('aria-label', `${topic.title}, page ${page}`);
    link.textContent = String(page);
    nav.append(link);
  }
  return nav;
}

function replyCount(topic: ForumTopicSummary): number {
  return Math.max(0, topic.postCount - 1);
}

// Watch toggle: replies in a watched topic land in the nav bell. aria-pressed
// carries the state so the label stays a plain verb; the title says what
// watching does, since the bell is its only visible effect.
function topicWatchButton(topic: ForumTopicDetail): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'forum-topic-watch';
  let watching = topic.viewer?.watching === true;
  const render = () => {
    button.textContent = watching ? t('forum.watching') : t('forum.watch');
    button.title = watching ? t('forum.watchingHint') : t('forum.watchHint');
    button.setAttribute('aria-pressed', watching ? 'true' : 'false');
  };
  render();
  button.addEventListener('click', () => {
    button.disabled = true;
    void submitTopicWatch(topic.id, !watching)
      .then((next) => {
        watching = next;
        render();
      })
      .catch((err) => {
        window.alert(err instanceof Error ? err.message : t('forum.watchCouldNotChange'));
      })
      .finally(() => {
        button.disabled = false;
      });
  });
  return button;
}

function topicReportButton(topic: ForumTopicDetail): HTMLButtonElement {
  return forumReportButton({
    className: 'forum-topic-report',
    label: t('forum.report'),
    promptText: t('forum.reportTopicReason'),
    submit: (reason) => submitTopicReport(topic.id, reason),
  });
}

function postList(
  topic: ForumTopicDetail,
  posts: ForumPost[],
  user: AuthUser | null,
  emptyText = t('forum.noForumPostsYet'),
  page = 1,
): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'forum-post-list';
  if (posts.length === 0) {
    wrap.append(statusPanel(emptyText));
    return wrap;
  }
  for (const [index, post] of posts.entries()) {
    const postNumber = (page - 1) * postPageSize + index + 1;
    if (post.hidden) {
      wrap.append(hiddenPostTombstone(topic, post, page, postNumber));
      continue;
    }
    const article = document.createElement('article');
    article.className = 'forum-post';
    article.id = postDomId(post.id);
    const content = document.createElement('div');
    content.className = 'forum-post-content';
    const body = document.createElement('div');
    body.className = 'forum-post-body';
    renderPostBodyInto(body, post.bodyText);
    const edited = postEditedLabel(post);

    // Single header line like lichess: author chip, relative time, then
    // actions that stay invisible until the post is hovered or focused.
    const header = document.createElement('div');
    header.className = 'forum-post-header';
    const time = document.createElement('a');
    time.className = 'forum-post-time';
    time.href = postHref(topic, post.id, page);
    time.textContent = formatTimeAgo(post.createdAt);
    time.title = formatDateTime(post.createdAt);
    const actions = document.createElement('span');
    actions.className = 'forum-post-actions';
    if (user && !topic.locked) actions.append(postQuoteButton(post));
    if (canReportForumContent(post.author, user)) actions.append(postReportButton(post));
    header.append(postAuthorRail(post.author), time, edited);
    if (actions.childElementCount > 0) header.append(actions);
    header.append(postPermalink(topic, post, page, `#${postNumber}`));

    content.append(body);
    if (user?.accountRole === 'admin') content.append(postModerationBox(post));
    article.append(header, content);
    wrap.append(article);
  }
  return wrap;
}

function hiddenPostTombstone(
  topic: ForumTopicDetail,
  post: ForumPost,
  page: number,
  postNumber: number,
): HTMLElement {
  const article = document.createElement('article');
  article.className = 'forum-post forum-post-erased';
  article.id = postDomId(post.id);
  const content = document.createElement('div');
  content.className = 'forum-post-content';
  const meta = document.createElement('p');
  meta.className = 'forum-post-meta';
  meta.append(postPermalink(topic, post, page, `#${postNumber}`));
  if (post.hiddenAt) {
    meta.append(document.createTextNode(` · deleted ${formatDate(post.hiddenAt)}`));
  }
  const body = document.createElement('div');
  body.className = 'forum-post-body forum-post-tombstone';
  body.textContent = t('forum.commentDeleted');
  content.append(meta, body);
  article.append(content);
  return article;
}

function postAuthorRail(author: ForumAuthor): HTMLElement {
  const rail = document.createElement('aside');
  rail.className = 'forum-post-author';
  // Show a single identifier (the handle), not display-name + @handle together.
  if (author?.online) rail.append(onlineDot());
  rail.append(authorProfileLink(author, 'forum-post-author-name'));
  return rail;
}

function onlineDot(): HTMLElement {
  const dot = document.createElement('span');
  dot.className = 'forum-online-dot';
  dot.title = t('forum.onlineNow');
  dot.setAttribute('aria-label', t('forum.onlineNow'));
  dot.setAttribute('role', 'img');
  return dot;
}

function postPermalink(
  topic: { id: string; slug: string },
  post: ForumPost,
  page = 1,
  text = t('forum.link'),
): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'forum-post-permalink';
  link.href = postHref(topic, post.id, page);
  link.textContent = text;
  return link;
}

function postQuoteButton(post: ForumPost): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'forum-post-quote';
  button.textContent = t('forum.quote');
  button.setAttribute('aria-label', `Quote ${authorLabel(post.author)}`);
  button.addEventListener('click', () => {
    insertPostQuote(post);
  });
  return button;
}

function postReportButton(post: ForumPost): HTMLButtonElement {
  return forumReportButton({
    className: 'forum-post-report',
    label: t('forum.report'),
    promptText: t('forum.reportPostReason'),
    submit: (reason) => submitPostReport(post.id, reason),
  });
}

function postEditedLabel(post: ForumPost): HTMLElement {
  const label = document.createElement('span');
  label.className = 'forum-post-edited';
  updatePostEditedLabel(label, post);
  return label;
}

function updatePostEditedLabel(label: HTMLElement, post: ForumPost): void {
  const edited = post.updatedAt !== post.createdAt;
  label.hidden = !edited;
  label.textContent = edited ? `edited ${formatTimeAgo(post.updatedAt)}` : '';
  if (edited) label.title = formatDateTime(post.updatedAt);
}

function insertPostQuote(post: ForumPost): void {
  const textarea = document.querySelector<HTMLTextAreaElement>(
    '.forum-reply-form textarea[name="body"]',
  );
  if (!textarea) return;
  const quote = quoteText(post);
  const prefix = textarea.value.trim().length > 0 ? `${textarea.value.trimEnd()}\n\n` : '';
  const nextValue = `${prefix}${quote}`;
  const maxLength = textarea.maxLength > 0 ? textarea.maxLength : forumPostBodyMaxLength;
  textarea.value = nextValue.slice(0, maxLength);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  const form = textarea.closest('form');
  if (form) recordQuotedPost(form, post);
}

function quoteHeader(post: ForumPost): string {
  return `> ${authorLabel(post.author)} wrote:`;
}

function quoteText(post: ForumPost): string {
  const lines = post.bodyText.split(/\r?\n/).map((line) => `> ${line}`);
  return `${quoteHeader(post)}\n${lines.join('\n')}\n\n`;
}

// Quote links (124): one hidden input per quoted post, carrying the header
// line the quote inserted so submit can drop a link whose quote the writer
// deleted again. The quoted author is told "X quoted you" from these.
function recordQuotedPost(form: HTMLFormElement, post: ForumPost): void {
  const existing = Array.from(
    form.querySelectorAll<HTMLInputElement>('input[name="quotedPostIds"]'),
  );
  if (existing.some((input) => input.value === post.id)) return;
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'quotedPostIds';
  input.value = post.id;
  input.dataset.quoteHeader = quoteHeader(post);
  form.append(input);
}

function quotedPostIdsStillInBody(form: HTMLFormElement, body: string): string[] {
  return Array.from(form.querySelectorAll<HTMLInputElement>('input[name="quotedPostIds"]'))
    .filter((input) => {
      const header = input.dataset.quoteHeader ?? '';
      return header.length > 0 && body.includes(header);
    })
    .map((input) => input.value);
}

function clearQuotedPosts(form: HTMLFormElement): void {
  for (const input of form.querySelectorAll('input[name="quotedPostIds"]')) input.remove();
}

function renderPostBodyInto(body: HTMLElement, text: string): void {
  body.replaceChildren(...postBodyNodes(text));
}

function postBodyNodes(text: string): HTMLElement[] {
  const nodes: HTMLElement[] = [];
  let paragraphLines: string[] = [];
  let quoteLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const paragraph = document.createElement('p');
    paragraph.className = 'forum-post-paragraph';
    appendLinkedText(paragraph, paragraphLines.join('\n'));
    nodes.push(paragraph);
    paragraphLines = [];
  };
  const flushQuote = () => {
    if (quoteLines.length === 0) return;
    const quote = document.createElement('blockquote');
    quote.className = 'forum-post-quote-block';
    appendLinkedText(quote, quoteLines.join('\n'));
    nodes.push(quote);
    quoteLines = [];
  };

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('>')) {
      flushParagraph();
      quoteLines.push(line.replace(/^>\s?/, ''));
      continue;
    }
    flushQuote();
    if (line.trim().length === 0 && paragraphLines.length === 0) continue;
    paragraphLines.push(line);
  }

  flushQuote();
  flushParagraph();
  return nodes;
}

function appendLinkedText(parent: HTMLElement, text: string): void {
  const urlPattern = /\bhttps?:\/\/[^\s<>"']+/gi;
  let cursor = 0;
  for (const match of text.matchAll(urlPattern)) {
    const rawUrl = match[0];
    const start = match.index ?? 0;
    const { urlText, trailingText } = trimLinkedUrl(rawUrl);
    if (start > cursor) parent.append(document.createTextNode(text.slice(cursor, start)));
    const link = forumPostLink(urlText);
    parent.append(link ?? document.createTextNode(urlText));
    if (trailingText) parent.append(document.createTextNode(trailingText));
    cursor = start + rawUrl.length;
  }
  if (cursor < text.length) parent.append(document.createTextNode(text.slice(cursor)));
}

function trimLinkedUrl(rawUrl: string): { urlText: string; trailingText: string } {
  let urlText = rawUrl;
  let trailingText = '';
  while (/[),.;:!?]/.test(urlText.at(-1) ?? '')) {
    trailingText = `${urlText.at(-1)}${trailingText}`;
    urlText = urlText.slice(0, -1);
  }
  return { urlText, trailingText };
}

function forumPostLink(urlText: string): HTMLAnchorElement | null {
  try {
    const url = new URL(urlText);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const link = document.createElement('a');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'nofollow noopener noreferrer';
    link.textContent = urlText;
    return link;
  } catch {
    return null;
  }
}

function canReportForumContent(author: ForumAuthor, user: AuthUser | null): boolean {
  return Boolean(user && user.accountRole !== 'admin' && author?.handle !== user.handle);
}

function newTopicForm(
  categories: ForumCategory[],
  user: AuthUser,
  selectedCategorySlug: string | null = null,
): HTMLElement {
  const form = document.createElement('form');
  form.className = 'forum-form';
  const heading = document.createElement('h2');
  heading.textContent = t('forum.startATopic');
  const category = document.createElement('select');
  category.name = 'categorySlug';
  const availableCategories = categories.filter(
    (optionCategory) => optionCategory.topicWritePolicy !== 'admin' || user.accountRole === 'admin',
  );
  const defaultCategory =
    availableCategories.find((optionCategory) => optionCategory.slug === selectedCategorySlug) ??
    availableCategories[0] ??
    null;
  for (const optionCategory of categories) {
    const option = document.createElement('option');
    option.value = optionCategory.slug;
    const adminOnly = optionCategory.topicWritePolicy === 'admin';
    const disabled = adminOnly && user.accountRole !== 'admin';
    option.textContent =
      optionCategory.topicWritePolicy === 'admin'
        ? `${optionCategory.name} (admin only)`
        : optionCategory.name;
    option.disabled = disabled;
    option.selected = optionCategory.slug === defaultCategory?.slug;
    category.append(option);
  }
  if (defaultCategory) category.value = defaultCategory.slug;
  const title = document.createElement('input');
  title.name = 'title';
  title.maxLength = forumTopicTitleMaxLength;
  title.required = true;
  const bodyComposer = forumBodyComposer({
    ariaLabel: t('forum.postAriaLabel'),
    placeholder: t('forum.beNicePlaceholder'),
  });
  const error = errorLine();
  const submit = submitButton(t('forum.postTopic'), { check: true });
  const cancel = forumCancelLink(() => collapseTopicComposer(form));
  const footer = document.createElement('div');
  footer.className = 'forum-form-footer';
  footer.append(cancel, submit);
  form.append(
    forumImportantNotice(),
    heading,
    labeled(t('forum.categoryLabel'), category),
    labeled(t('forum.titleLabel'), title),
    fieldGroup(t('forum.postLabel'), bodyComposer.root),
    forumMarkdownNote(),
    error,
    footer,
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitTopic(form, submit, error);
  });
  return form;
}

// Collapse the toggled new-topic composer (the category page shows it behind a
// "Create a new topic" button) and restore focus to that toggle.
function collapseTopicComposer(form: HTMLFormElement): void {
  const composer = form.closest<HTMLElement>('.forum-topic-composer');
  if (!composer) return;
  composer.hidden = true;
  const toggle = composer
    .closest('.forum-panel')
    ?.querySelector<HTMLButtonElement>('.forum-panel-action-create');
  if (toggle) {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  }
}

// Lichess-style "Important" callout at the head of the composer: points people
// at the FAQ, the contact form, and the forum etiquette before they post.
function forumImportantNotice(): HTMLElement {
  const box = document.createElement('aside');
  box.className = 'forum-important-notice';
  const heading = document.createElement('strong');
  heading.className = 'forum-important-heading';
  heading.textContent = t('forum.important');
  const list = document.createElement('ul');
  list.className = 'forum-important-list';
  const items: Array<[string, string, string]> = [
    ['Your question may already have an answer in the ', 'FAQ', '/faq'],
    ['To report a player or bad behavior, use the ', 'contact page', '/contact'],
    ['Make sure to read the ', 'forum etiquette', '/forum/etiquette'],
  ];
  for (const [prefix, linkText, href] of items) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = href;
    link.textContent = linkText;
    item.append(document.createTextNode(prefix), link);
    list.append(item);
  }
  box.append(heading, list);
  return box;
}

function forumSearchForm(query: string | null, options: { compact?: boolean } = {}): HTMLElement {
  const form = document.createElement('form');
  form.className = 'forum-search-form';
  if (options.compact) form.classList.add('forum-search-form-compact');
  form.action = '/forum';
  form.method = 'get';
  const input = document.createElement('input');
  input.type = 'search';
  input.name = 'q';
  input.maxLength = 120;
  input.placeholder = t('forum.searchPlaceholder');
  input.autocomplete = 'off';
  input.value = query ?? '';
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = t('forum.search');
  form.append(input, submit);
  if (query) {
    const clear = document.createElement('a');
    clear.className = 'forum-search-clear';
    clear.href = '/forum';
    clear.textContent = t('forum.clear');
    form.append(clear);
  }
  return form;
}

function replyForm(topic: ForumTopicDetail, _user: AuthUser): HTMLElement {
  const form = document.createElement('form');
  form.className = 'forum-form forum-reply-form';
  const heading = document.createElement('h2');
  heading.textContent = t('forum.replyToTopic');
  const bodyComposer = forumBodyComposer({
    ariaLabel: t('forum.replyAriaLabel'),
    placeholder: t('forum.beNicePlaceholder'),
  });
  const error = errorLine();
  const submit = submitButton(t('forum.reply'), { check: true });
  // Cancel clears the draft and returns to the Write tab (the reply box is
  // always shown, so there is nothing to collapse — lichess clears the same way).
  const cancel = forumCancelLink(() => {
    resetBodyComposer(bodyComposer);
    clearQuotedPosts(form);
  });
  const footer = document.createElement('div');
  footer.className = 'forum-reply-footer';
  footer.append(cancel, error, submit);
  form.append(heading, bodyComposer.root, forumMarkdownNote(), footer);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitReply(topic, form, submit, error);
  });
  return form;
}

function forumCancelLink(onCancel: () => void): HTMLButtonElement {
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'forum-cancel-link';
  cancel.textContent = t('forum.cancel');
  cancel.addEventListener('click', onCancel);
  return cancel;
}

function resetBodyComposer(composer: { root: HTMLElement; textarea: HTMLTextAreaElement }): void {
  composer.textarea.value = '';
  // First composer tab is Write; clicking it also refocuses the textarea.
  composer.root.querySelector<HTMLButtonElement>('.forum-composer-tab')?.click();
}

function forumBodyComposer(options: {
  ariaLabel: string;
  placeholder?: string;
  initialValue?: string;
}): { root: HTMLElement; textarea: HTMLTextAreaElement } {
  const root = document.createElement('div');
  root.className = 'forum-body-composer';
  const tabs = document.createElement('div');
  tabs.className = 'forum-composer-tabs forum-reply-tabs';
  const writeTab = document.createElement('button');
  writeTab.type = 'button';
  writeTab.className =
    'forum-composer-tab forum-reply-tab forum-composer-tab-active forum-reply-tab-active';
  writeTab.textContent = t('forum.write');
  const previewTab = document.createElement('button');
  previewTab.type = 'button';
  previewTab.className = 'forum-composer-tab forum-reply-tab';
  previewTab.textContent = t('forum.preview');
  tabs.append(writeTab, previewTab);
  const body = document.createElement('textarea');
  body.name = 'body';
  body.maxLength = forumPostBodyMaxLength;
  body.placeholder = options.placeholder ?? '';
  body.required = true;
  body.value = options.initialValue ?? '';
  body.setAttribute('aria-label', options.ariaLabel);
  const preview = document.createElement('div');
  preview.className = 'forum-composer-preview forum-reply-preview forum-post-body';
  preview.hidden = true;
  const setActiveTab = (mode: 'write' | 'preview') => {
    const previewing = mode === 'preview';
    writeTab.classList.toggle('forum-composer-tab-active', !previewing);
    writeTab.classList.toggle('forum-reply-tab-active', !previewing);
    previewTab.classList.toggle('forum-composer-tab-active', previewing);
    previewTab.classList.toggle('forum-reply-tab-active', previewing);
    body.hidden = previewing;
    preview.hidden = !previewing;
  };
  const renderPreview = () => {
    if (body.value.trim().length > 0) {
      renderPostBodyInto(preview, body.value);
    } else {
      preview.replaceChildren(statusPanel(t('forum.nothingToPreview')));
    }
  };
  writeTab.addEventListener('click', () => {
    setActiveTab('write');
    body.focus();
  });
  previewTab.addEventListener('click', () => {
    renderPreview();
    setActiveTab('preview');
  });
  root.append(tabs, body, preview);
  return { root, textarea: body };
}

function forumMarkdownNote(): HTMLElement {
  const note = document.createElement('p');
  note.className = 'forum-form-note';
  const markdown = document.createElement('a');
  markdown.href = 'https://www.markdownguide.org/basic-syntax/';
  markdown.target = '_blank';
  markdown.rel = 'nofollow noopener noreferrer';
  markdown.textContent = t('forum.markdown');
  const formatting = document.createElement('span');
  formatting.append(markdown, document.createTextNode(' is available for formatting.'));
  const etiquette = document.createElement('a');
  etiquette.className = 'forum-form-note-etiquette';
  etiquette.href = '/forum/etiquette';
  etiquette.append(forumInfoIcon(), document.createTextNode('forum etiquette'));
  note.append(formatting, etiquette);
  return note;
}

function forumInfoIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('forum-info-icon');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '8');
  circle.setAttribute('cy', '8');
  circle.setAttribute('r', '7');
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  dot.setAttribute('d', 'M8 4.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm-1 3.4h2v4.6H7Z');
  svg.append(circle, dot);
  return svg;
}

async function submitTopic(
  form: HTMLFormElement,
  submit: HTMLButtonElement,
  error: HTMLElement,
): Promise<void> {
  submit.disabled = true;
  error.textContent = '';
  const data = new FormData(form);
  try {
    const resp = await fetch('/api/forum/topics', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        categorySlug: String(data.get('categorySlug') ?? ''),
        title: String(data.get('title') ?? ''),
        body: String(data.get('body') ?? ''),
      }),
    });
    if (!resp.ok) throw new Error(errorMessageForStatus(resp.status));
    const payload = (await resp.json()) as { topic: ForumTopicDetail };
    window.location.href = topicHref(payload.topic);
  } catch (err) {
    error.textContent = err instanceof Error ? err.message : t('forum.topicCouldNotBePosted');
  } finally {
    submit.disabled = false;
  }
}

async function submitReply(
  topic: ForumTopicDetail,
  form: HTMLFormElement,
  submit: HTMLButtonElement,
  error: HTMLElement,
): Promise<void> {
  submit.disabled = true;
  error.textContent = '';
  const data = new FormData(form);
  const bodyText = String(data.get('body') ?? '');
  try {
    const resp = await fetch(`/api/forum/topics/${encodeURIComponent(topic.id)}/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        body: bodyText,
        quotedPostIds: quotedPostIdsStillInBody(form, bodyText),
      }),
    });
    if (!resp.ok) throw new Error(errorMessageForStatus(resp.status));
    const payload = (await resp.json()) as { post: ForumPost };
    window.location.href = postHref(topic, payload.post.id, pageForPostCount(topic.postCount + 1));
    window.location.reload();
  } catch (err) {
    error.textContent = err instanceof Error ? err.message : t('forum.replyCouldNotBePosted');
  } finally {
    submit.disabled = false;
  }
}

function labeled(text: string, control: HTMLElement): HTMLElement {
  const label = document.createElement('label');
  const span = document.createElement('span');
  span.textContent = text;
  label.append(span, control);
  return label;
}

function fieldGroup(text: string, control: HTMLElement): HTMLElement {
  const group = document.createElement('div');
  group.className = 'forum-field-group';
  const label = document.createElement('span');
  label.className = 'forum-field-label';
  label.textContent = text;
  group.append(label, control);
  return group;
}

function errorLine(): HTMLElement {
  const error = document.createElement('p');
  error.className = 'forum-error';
  return error;
}

function submitButton(text: string, options: { check?: boolean } = {}): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'submit';
  if (options.check) {
    button.classList.add('forum-submit-check');
    button.append(forumCheckIcon());
  }
  const label = document.createElement('span');
  label.className = 'forum-submit-label';
  label.textContent = text;
  button.append(label);
  return button;
}

// White check mark shown on the primary submit buttons (lichess styles its
// Reply / Create the topic buttons with the same affirmative check).
function forumCheckIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('forum-check-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M5 12.5 L10 17.5 L19 6.5');
  svg.append(path);
  return svg;
}

function topicModerationBox(topic: ForumTopicDetail, categories: ForumCategory[]): HTMLElement {
  const box = document.createElement('section');
  box.className = 'forum-moderation-box';
  const head = document.createElement('div');
  head.className = 'forum-moderation-head';
  const heading = document.createElement('strong');
  heading.textContent = t('forum.moderation');
  const badge = document.createElement('span');
  badge.className = 'forum-moderation-badge';
  badge.textContent = t('forum.adminOnly');
  head.append(heading, badge);
  const actions = document.createElement('div');
  actions.className = 'forum-moderation-actions';
  actions.append(
    moderationButton(topic.pinned ? t('forum.unpin') : t('forum.pin'), () =>
      submitTopicModeration(topic.id, topic.pinned ? 'unpin' : 'pin'),
    ),
    moderationButton(topic.locked ? t('forum.unlock') : t('forum.lock'), () =>
      submitTopicModeration(topic.id, topic.locked ? 'unlock' : 'lock'),
    ),
    moderationButton(
      t('forum.hideTopic'),
      (reason) => submitTopicModeration(topic.id, 'hide', reason),
      {
        reasonPrompt: t('forum.hideTopicReason'),
      },
    ),
  );
  box.append(head, actions);
  const move = topicMoveForm(topic, categories);
  if (move) box.append(move);
  return box;
}

function topicMoveForm(topic: ForumTopicDetail, categories: ForumCategory[]): HTMLElement | null {
  const moveTargets = categories.filter((category) => category.slug !== topic.category.slug);
  if (moveTargets.length === 0) return null;
  const form = document.createElement('form');
  form.className = 'forum-topic-move-form';
  const select = document.createElement('select');
  select.name = 'categorySlug';
  for (const category of moveTargets) {
    const option = document.createElement('option');
    option.value = category.slug;
    option.textContent = category.name;
    select.append(option);
  }
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = t('forum.move');
  form.append(labeled(t('forum.moveTo'), select), submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit.disabled = true;
    void submitTopicMove(topic, select.value).catch(() => {
      submit.disabled = false;
    });
  });
  return form;
}

function postModerationBox(post: ForumPost): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'forum-moderation-actions forum-post-actions';
  actions.append(
    moderationButton(t('forum.hidePost'), (reason) => submitPostModeration(post.id, reason), {
      reasonPrompt: t('forum.hidePostReason'),
    }),
  );
  return actions;
}

function moderationButton(
  text: string,
  submit: (reason: string | null) => Promise<void>,
  options: { confirmAction?: boolean; reasonPrompt?: string } = {},
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'forum-moderation-button';
  button.textContent = text;
  button.addEventListener('click', () => {
    const reason = options.reasonPrompt ? promptModerationReason(options.reasonPrompt) : null;
    if (reason === false) return;
    if (options.confirmAction && !window.confirm(`${text}?`)) return;
    button.disabled = true;
    void submit(reason).catch(() => {
      button.disabled = false;
    });
  });
  return button;
}

function forumReportButton(options: {
  className: string;
  label: string;
  promptText: string;
  submit: (reason: string) => Promise<void>;
}): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = options.className;
  button.textContent = options.label;
  button.addEventListener('click', () => {
    const reason = promptReportReason(options.promptText);
    if (reason === false) return;
    button.disabled = true;
    void options
      .submit(reason)
      .then(() => {
        button.textContent = t('forum.reported');
      })
      .catch((err) => {
        button.disabled = false;
        window.alert(err instanceof Error ? err.message : t('forum.reportCouldNotBeSent'));
      });
  });
  return button;
}

function promptReportReason(promptText: string): string | false {
  const value = window.prompt(promptText, '');
  if (value === null) return false;
  const reason = value.trim().replace(/\s+/g, ' ');
  if (reason.length === 0) {
    window.alert(t('forum.reasonRequired'));
    return false;
  }
  if (reason.length > forumModerationReasonMaxLength) {
    window.alert(`Reason must be ${forumModerationReasonMaxLength} characters or less.`);
    return false;
  }
  return reason;
}

function promptModerationReason(promptText: string): string | null | false {
  const value = window.prompt(promptText, '');
  if (value === null) return false;
  return normalizePromptReason(value);
}

function normalizePromptReason(value: string): string | null | false {
  const reason = value.trim();
  if (reason.length > forumModerationReasonMaxLength) {
    window.alert(`Reason must be ${forumModerationReasonMaxLength} characters or less.`);
    return false;
  }
  return reason.length > 0 ? reason : null;
}

function forumReportFilters(activeStatus: ForumReportStatusFilter): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'forum-report-filters';
  nav.setAttribute('aria-label', t('forum.reportFilters'));
  for (const [status, label] of [
    ['open', 'Open'],
    ['resolved', 'Resolved'],
    ['dismissed', 'Dismissed'],
    ['all', 'All'],
  ] as const) {
    const link = document.createElement('a');
    link.className = 'forum-report-filter';
    link.href = forumReportsHref(status, 1);
    link.textContent = label;
    if (status === activeStatus) {
      link.classList.add('forum-report-filter-active');
      link.setAttribute('aria-current', 'page');
    }
    nav.append(link);
  }
  return nav;
}

function reportList(reports: ForumReport[], status: ForumReportStatusFilter): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'forum-report-list';
  if (reports.length === 0) {
    wrap.append(statusPanel(`No ${status === 'all' ? '' : `${status} `}forum reports.`));
    return wrap;
  }
  for (const report of reports) wrap.append(reportRow(report));
  return wrap;
}

function reportRow(report: ForumReport): HTMLElement {
  const row = document.createElement('article');
  row.className = 'forum-report-row';
  const main = document.createElement('div');
  main.className = 'forum-report-main';

  const target = document.createElement('a');
  target.className = 'forum-report-title';
  target.href = reportTargetHref(report);
  target.textContent = report.topic.title;
  const meta = document.createElement('p');
  meta.className = 'forum-report-meta';
  meta.append(
    document.createTextNode(
      report.targetType === 'post' ? t('forum.postReportIn') : t('forum.topicReportIn'),
    ),
    categoryLink(report.topic.category),
    document.createTextNode(` · ${report.status}`),
  );
  const targetHidden = reportTargetHidden(report);
  if (targetHidden) meta.append(document.createTextNode(' · target hidden'));

  const reason = document.createElement('p');
  reason.className = 'forum-report-reason';
  reason.textContent = report.reason;
  main.append(target, meta, reason);
  if (report.post?.snippet) {
    const snippet = document.createElement('blockquote');
    snippet.className = 'forum-report-snippet';
    snippet.textContent = report.post.snippet;
    main.append(snippet);
  }
  if (report.resolutionNote) {
    const note = document.createElement('p');
    note.className = 'forum-report-resolution';
    note.textContent = report.resolutionNote;
    main.append(note);
  }

  const side = document.createElement('div');
  side.className = 'forum-report-side';
  const reportedBy = document.createElement('p');
  reportedBy.append(
    document.createTextNode(t('forum.reportedBy')),
    authorProfileLink(report.reporter, 'forum-report-author'),
    document.createTextNode(` · ${formatDate(report.createdAt)}`),
  );
  side.append(reportedBy);
  if (report.post) {
    const postBy = document.createElement('p');
    postBy.append(
      document.createTextNode(t('forum.postBy')),
      authorProfileLink(report.post.author, 'forum-report-author'),
      document.createTextNode(` · ${formatDate(report.post.createdAt)}`),
    );
    side.append(postBy);
  }
  if (report.resolvedAt) {
    const resolved = document.createElement('p');
    resolved.append(
      document.createTextNode(`${report.status} by `),
      authorProfileLink(report.resolver, 'forum-report-author'),
      document.createTextNode(` · ${formatDate(report.resolvedAt)}`),
    );
    side.append(resolved);
  }

  const actions = document.createElement('div');
  actions.className = 'forum-report-actions';
  const view = document.createElement('a');
  view.className = 'forum-moderation-button forum-report-view';
  view.href = reportTargetHref(report);
  view.textContent = t('forum.view');
  actions.append(view);
  if (report.status === 'open') {
    if (!targetHidden) actions.append(reportTargetHideButton(report));
    actions.append(
      reportResolutionButton(report, 'resolved'),
      reportResolutionButton(report, 'dismissed'),
    );
  }
  side.append(actions);
  row.append(main, side);
  return row;
}

function categoryLink(category: { slug: string; name: string }): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'forum-report-category';
  link.href = categoryHref(category);
  link.textContent = category.name;
  return link;
}

function reportTargetHidden(report: ForumReport): boolean {
  return report.post?.hidden ?? report.topic.hidden;
}

function reportTargetHideButton(report: ForumReport): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'forum-moderation-button';
  button.textContent = report.post ? t('forum.hidePost') : t('forum.hideTopic');
  button.addEventListener('click', () => {
    const reason = window.prompt(
      report.post ? t('forum.hidePostReason') : t('forum.hideTopicReason'),
      report.reason,
    );
    if (reason === null) return;
    const normalizedReason = normalizePromptReason(reason);
    if (normalizedReason === false) return;
    const resolutionNote = report.post
      ? t('forum.hiddenReportedPost')
      : t('forum.hiddenReportedTopic');
    button.disabled = true;
    void submitReportTargetHide(report, normalizedReason, resolutionNote).catch(() => {
      button.disabled = false;
      window.alert(t('forum.contentCouldNotBeHidden'));
    });
  });
  return button;
}

function reportResolutionButton(report: ForumReport, status: ForumReportStatus): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'forum-moderation-button';
  button.textContent = status === 'resolved' ? t('forum.resolve') : t('forum.dismiss');
  button.addEventListener('click', () => {
    const note = promptModerationReason(t('forum.resolutionNote'));
    if (note === false) return;
    button.disabled = true;
    void submitReportResolution(report.id, status, note).catch(() => {
      button.disabled = false;
      window.alert(t('forum.reportCouldNotBeUpdated'));
    });
  });
  return button;
}

function signInBox(text: string): HTMLElement {
  const box = document.createElement('section');
  box.className = 'forum-auth-box';
  box.append(document.createTextNode(`${text} `));
  const link = document.createElement('a');
  link.href = '/account?tab=login';
  link.textContent = t('forum.signIn');
  box.append(link);
  return box;
}

function statusPanel(text: string): HTMLElement {
  const panel = document.createElement('p');
  panel.className = 'forum-auth-box';
  panel.textContent = text;
  return panel;
}

function pill(text: string): HTMLElement {
  const el = document.createElement('span');
  el.className = 'forum-pill';
  el.textContent = text;
  return el;
}

function topicHref(topic: { id: string; slug: string }): string {
  return `/forum/t/${encodeURIComponent(topic.id)}/${encodeURIComponent(topic.slug)}`;
}

function topicPageHref(topic: { id: string; slug: string }, page: number): string {
  const href = topicHref(topic);
  return page > 1 ? `${href}?page=${page}` : href;
}

function categoryHref(category: { slug: string }): string {
  return `/forum/${encodeURIComponent(category.slug)}`;
}

function forumHref(
  options: { categorySlug?: string | null; searchQuery?: string | null },
  page: number,
): string {
  const params = new URLSearchParams();
  if (options.searchQuery) params.set('q', options.searchQuery);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  if (options.categorySlug && !options.searchQuery) {
    return `${categoryHref({ slug: options.categorySlug })}${query ? `?${query}` : ''}`;
  }
  return `/forum${query ? `?${query}` : ''}`;
}

function postHref(topic: { id: string; slug: string }, postId: string, page = 1): string {
  return `${topicPageHref(topic, page)}#${postDomId(postId)}`;
}

function reportTargetHref(report: ForumReport): string {
  if (report.post) return postHref(report.topic, report.post.id, report.post.page);
  return topicHref(report.topic);
}

function forumReportsHref(status: ForumReportStatusFilter, page: number): string {
  const params = new URLSearchParams();
  if (status !== 'open') params.set('status', status);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return `/forum/reports${query ? `?${query}` : ''}`;
}

function postDomId(postId: string): string {
  return `post_${postId}`;
}

function pageForPostCount(postCount: number): number {
  return Math.max(1, Math.ceil(postCount / postPageSize));
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

function authorLabel(author: ForumAuthor): string {
  return author?.displayName ?? 'Deleted account';
}

function appendLatestPostMeta(
  parent: HTMLElement,
  author: ForumAuthor,
  createdAt: string,
  options: { authorClassName: string },
): void {
  const date = document.createElement('span');
  date.textContent = formatTimeAgo(createdAt);
  date.title = formatDateTime(createdAt);
  parent.append(
    document.createTextNode('by '),
    authorProfileLink(author, options.authorClassName),
    document.createTextNode(' · '),
    date,
  );
}

function authorProfileLink(author: ForumAuthor, className: string): HTMLElement {
  if (!author) {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = authorLabel(author);
    return span;
  }
  const link = document.createElement('a');
  link.className = className;
  link.href = `/@/${encodeURIComponent(author.handle)}`;
  prependTitleBadge(link, author.title);
  const name = document.createElement('span');
  name.className = 'forum-author-name';
  name.textContent = author.displayName;
  link.append(name);
  return link;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatTimeAgo(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return formatDate(iso);
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return timeAgoLabel(minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return timeAgoLabel(hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days < 30) return timeAgoLabel(days, 'day');
  if (days < 365) return timeAgoLabel(Math.floor(days / 30), 'month');
  return timeAgoLabel(Math.floor(days / 365), 'year');
}

function timeAgoLabel(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'} ago`;
}

function pageFromParam(value: string | null): number {
  const parsed = Number(value ?? '1');
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.trunc(parsed);
}

function searchQueryFromParam(value: string | null): string | null {
  const query = (value ?? '').trim().replace(/\s+/g, ' ');
  return query.length >= 2 && query.length <= 120 ? query : null;
}

function reportStatusFromParam(value: string | null): ForumReportStatusFilter {
  return value === 'resolved' || value === 'dismissed' || value === 'all' ? value : 'open';
}

function categorySlugFromPath(pathname: string): string | null {
  const match = pathname.replace(/\/+$/, '').match(/^\/forum\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

function errorMessageForStatus(status: number): string {
  if (status === 401) return t('forum.errSignInToPost');
  if (status === 403) return t('forum.errCategoryRestricted');
  if (status === 423) return t('forum.errTopicLocked');
  if (status === 429) return t('forum.errTooQuick');
  if (status >= 500) return t('forum.errUnavailable');
  return t('forum.errCheckFields');
}

function errorMessageForReportStatus(status: number): string {
  if (status === 401) return t('forum.errSignInToReport');
  if (status === 404) return t('forum.errContentNotAvailable');
  if (status === 409) return t('forum.errAlreadyReported');
  if (status >= 500) return t('forum.errUnavailable');
  return t('forum.reportCouldNotBeSent');
}

async function submitTopicWatch(topicId: string, watching: boolean): Promise<boolean> {
  const resp = await fetch(`/api/forum/topics/${encodeURIComponent(topicId)}/watch`, {
    method: watching ? 'PUT' : 'DELETE',
    headers: { accept: 'application/json' },
  });
  if (!resp.ok) throw new Error(errorMessageForStatus(resp.status));
  const data = (await resp.json()) as { watching: boolean };
  return data.watching === true;
}

// Fire-and-forget: the server no-ops for non-watchers, and a lost call only
// means the badge clears one visit later.
function markTopicSeen(topicId: string): void {
  void fetch(`/api/forum/topics/${encodeURIComponent(topicId)}/seen`, {
    method: 'POST',
    headers: { accept: 'application/json' },
  }).catch(() => null);
}

async function submitTopicReport(topicId: string, reason: string): Promise<void> {
  return submitForumReport(`/api/forum/topics/${encodeURIComponent(topicId)}/report`, reason);
}

async function submitPostReport(postId: string, reason: string): Promise<void> {
  return submitForumReport(`/api/forum/posts/${encodeURIComponent(postId)}/report`, reason);
}

async function submitForumReport(endpoint: string, reason: string): Promise<void> {
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!resp.ok) throw new Error(errorMessageForReportStatus(resp.status));
}

async function submitTopicModeration(
  topicId: string,
  action: 'pin' | 'unpin' | 'lock' | 'unlock' | 'hide',
  reason: string | null = null,
): Promise<void> {
  await submitTopicModerationRequest(topicId, action, reason);
  if (action === 'hide') window.location.href = '/forum';
  else window.location.reload();
}

async function submitTopicModerationRequest(
  topicId: string,
  action: 'pin' | 'unpin' | 'lock' | 'unlock' | 'hide',
  reason: string | null = null,
): Promise<void> {
  const body: { action: typeof action; reason?: string } = { action };
  if (reason) body.reason = reason;
  const resp = await fetch(`/api/forum/topics/${encodeURIComponent(topicId)}/moderation`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`topic_moderation_failed_${resp.status}`);
}

async function submitTopicMove(topic: ForumTopicDetail, categorySlug: string): Promise<void> {
  const resp = await fetch(`/api/forum/topics/${encodeURIComponent(topic.id)}/category`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ categorySlug }),
  });
  if (!resp.ok) throw new Error(`topic_move_failed_${resp.status}`);
  const payload = (await resp.json()) as { topic: ForumTopicDetail };
  window.location.href = topicHref(payload.topic);
}

async function submitPostModeration(postId: string, reason: string | null = null): Promise<void> {
  const payload = await submitPostModerationRequest(postId, reason);
  if (payload.topicHidden) window.location.href = '/forum';
  else window.location.reload();
}

async function submitPostModerationRequest(
  postId: string,
  reason: string | null = null,
): Promise<{ topicHidden?: boolean }> {
  const body: { action: 'hide'; reason?: string } = { action: 'hide' };
  if (reason) body.reason = reason;
  const resp = await fetch(`/api/forum/posts/${encodeURIComponent(postId)}/moderation`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`post_moderation_failed_${resp.status}`);
  return (await resp.json()) as { topicHidden?: boolean };
}

async function submitReportTargetHide(
  report: ForumReport,
  reason: string | null,
  resolutionNote: string,
): Promise<void> {
  if (report.post) await submitPostModerationRequest(report.post.id, reason);
  else await submitTopicModerationRequest(report.topic.id, 'hide', reason);
  await submitReportResolution(report.id, 'resolved', resolutionNote);
}

async function submitReportResolution(
  reportId: string,
  status: ForumReportStatus,
  resolutionNote: string | null,
): Promise<void> {
  const body: { status: ForumReportStatus; resolutionNote?: string } = { status };
  if (resolutionNote) body.resolutionNote = resolutionNote;
  const resp = await fetch(`/api/forum/reports/${encodeURIComponent(reportId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`report_resolution_failed_${resp.status}`);
  window.location.reload();
}

async function fetchForumCategories(): Promise<ForumCategory[]> {
  const resp = await fetch('/api/forum/categories', { headers: { accept: 'application/json' } });
  if (!resp.ok) throw new Error(`forum_categories_failed_${resp.status}`);
  const data = (await resp.json()) as { categories: ForumCategory[] };
  return data.categories;
}

async function fetchForumTopics(
  options: { categorySlug?: string | null; limit?: number; offset?: number } = {},
): Promise<ForumTopicSummary[]> {
  const params = new URLSearchParams();
  if (options.categorySlug) params.set('category', options.categorySlug);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  const resp = await fetch(`/api/forum/topics${params.size ? `?${params}` : ''}`, {
    headers: { accept: 'application/json' },
  });
  if (!resp.ok) throw new Error(`forum_topics_failed_${resp.status}`);
  const data = (await resp.json()) as { topics: ForumTopicSummary[] };
  return data.topics;
}

async function searchForumPosts(options: {
  query: string;
  limit?: number;
  offset?: number;
}): Promise<ForumPostSearchPage> {
  const params = new URLSearchParams();
  params.set('q', options.query);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  const resp = await fetch(`/api/forum/search?${params}`, {
    headers: { accept: 'application/json' },
  });
  if (!resp.ok) throw new Error(`forum_search_failed_${resp.status}`);
  const data = (await resp.json()) as ForumPostSearchPage;
  return data;
}

async function fetchForumTopic(
  topicId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<ForumTopicDetail> {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  const resp = await fetch(
    `/api/forum/topics/${encodeURIComponent(topicId)}${params.size ? `?${params}` : ''}`,
    {
      headers: { accept: 'application/json' },
    },
  );
  if (resp.status === 404) throw new ForumNotFound();
  if (!resp.ok) throw new Error(`forum_topic_failed_${resp.status}`);
  const data = (await resp.json()) as { topic: ForumTopicDetail };
  return data.topic;
}

function reportPager(options: {
  status: ForumReportStatusFilter;
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
}): HTMLElement {
  return forumPager({
    ariaLabel: t('forum.reportPages'),
    page: options.page,
    hasPrevious: options.hasPrevious,
    hasNext: options.hasNext,
    hrefForPage: (page) => forumReportsHref(options.status, page),
  });
}

async function fetchForumReports(options: {
  status: ForumReportStatusFilter;
  limit?: number;
  offset?: number;
}): Promise<ForumReport[]> {
  const params = new URLSearchParams();
  if (options.status !== 'open') params.set('status', options.status);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  const resp = await fetch(`/api/forum/reports${params.size ? `?${params}` : ''}`, {
    headers: { accept: 'application/json' },
  });
  if (resp.status === 401 || resp.status === 403) throw new ForumForbidden();
  if (!resp.ok) throw new Error(`forum_reports_failed_${resp.status}`);
  const data = (await resp.json()) as { reports: ForumReport[] };
  return data.reports;
}
