import './app-base.css';
import './board-fog.css';
import './styles.css';
import { initializeAccountNav } from './account-nav.js';
import { setPostHogInstance } from './analytics.js';
import type { ArticleLang } from './article-i18n.js';
import { correspondenceEnabled, friendsOnlineEnabled } from './feature-flags.js';
import { type I18nKey, t } from './i18n/catalog.js';
import { currentLocale, initializeLocaleFromCurrentUrl } from './i18n/locale.js';
import {
  correspondenceNotificationSource,
  inboxNotificationSource,
  registerNotificationSource,
} from './notification-nav.js';
import { setRatedModeEnabled } from './rated-flag.js';
import { mountRestartBanner, setRestartBanner } from './restart-banner.js';
import { initializeThemeSettings } from './theme.js';
import {
  type WebVariantTenant,
  webVariantTenantForRoomId,
  webVariantTenants,
} from './variant-tenant/registry.js';

initializeLocaleFromCurrentUrl();
initializeThemeSettings();
// Register notification sources before the nav mounts — account-nav mounts the
// bell once signed in, and a bell with no sources is a no-op. Correspondence
// rides its build flag; the inbox source is unconditional (its fetch 401s to a
// zero snapshot for anonymous visitors, and the bell only mounts signed-in).
if (correspondenceEnabled()) registerNotificationSource(correspondenceNotificationSource);
registerNotificationSource(inboxNotificationSource);
initializeAccountNav();
mountRestartBanner();
void fetch('/api/server-status')
  .then((r) => (r.ok ? r.json() : null))
  .then((data: { restartAt: number | null; ratedEnabled?: boolean } | null) => {
    if (data && typeof data.restartAt === 'number') setRestartBanner(data.restartAt);
    if (data) setRatedModeEnabled(data.ratedEnabled === true);
  })
  .catch(() => {
    /* banner stays hidden; WS broadcast still covers in-game users */
  });

const phKey = import.meta.env.VITE_POSTHOG_KEY;
const phHost = import.meta.env.VITE_POSTHOG_HOST;
if (phKey && phHost && import.meta.env.PROD) {
  void import('posthog-js').then(({ default: posthog }) => {
    posthog.init(phKey, {
      api_host: phHost,
      autocapture: false,
      capture_pageview: false,
      persistence: 'localStorage',
      disable_session_recording: true,
      respect_dnt: true,
      // Real-user load timing: web vitals (LCP/CLS/FCP/INP) so we can actually
      // see homepage load performance and catch regressions. network_timing is a
      // session-replay feature (disabled here), so leave it off — web_vitals is
      // independent of it.
      capture_performance: { web_vitals: true, network_timing: false },
      // Unhandled errors + promise rejections surface as $exception events
      // (Error Tracking), so a broken page reports itself instead of going dark.
      capture_exceptions: true,
    });
    posthog.capture('$pageview', { path: window.location.pathname });
    setPostHogInstance(posthog);
  });
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('missing #app');
const appRoot = app;

const params = new URLSearchParams(window.location.search);
const path = window.location.pathname.replace(/\/+$/, '') || '/';
const replaySample = params.get('replay');
const playDeepLink = params.get('play');
const wantsLive =
  import.meta.env.DEV &&
  !playDeepLink &&
  (params.has('room') || params.has('variant') || params.has('dev'));
const page = params.get('page');
const gameRoomId = gameRoomIdFromPath(path);
const tenantPostgame = tenantPostgameFromPath(path);
const liveRoomId = liveRoomIdFromPath(path);
const wantsAbout = path === '/about' || page === 'about';
const wantsSource = path === '/source' || page === 'source';
const wantsContact = path === '/contact' || page === 'contact';
const wantsPatron = path === '/patron' || page === 'patron';
const wantsFaq = path === '/faq' || page === 'faq';
const wantsTerms = path === '/terms' || page === 'terms';
const wantsPrivacy = path === '/privacy' || page === 'privacy';
const wantsAccount = path === '/account' || page === 'account';
const wantsAccountSettings =
  path === '/account/settings' ||
  path.startsWith('/account/settings/') ||
  page === 'account-settings';
// /inbox (thread list) and /inbox/:handle (open conversation). Signed-in-only
// surface; the page itself renders a sign-in prompt for anonymous visitors.
// /inbox/reports is the admin report queue and wins over the :handle pattern
// (same reserved-literal tradeoff as the API routes).
const wantsInboxReports = path === '/inbox/reports';
const inboxMatch = wantsInboxReports ? null : path.match(/^\/inbox(?:\/([^/]+))?$/);
const wantsInbox = inboxMatch !== null;
const inboxHandle = inboxMatch?.[1] ? decodeURIComponent(inboxMatch[1]) : null;
const wantsLearn = path === '/learn' || page === 'learn';
const wantsRulesIndex =
  path === '/rules' || path === '/zh-hans/rules' || path === '/zh-hant/rules' || page === 'rules';
const articleSlug = articleSlugFromPath(path);
const articleLang = articleLangFromPath(path);
const wantsArticlesIndex =
  path === '/articles' ||
  path === '/zh-hans/articles' ||
  path === '/zh-hant/articles' ||
  page === 'articles';
const wantsNews = path === '/feed' || path === '/news' || page === 'feed' || page === 'news';
const forumRedirectPostId = forumRedirectPostIdFromPath(path);
const forumTopicId = forumTopicIdFromPath(path);
const wantsForumReports = path === '/forum/reports';
// Reserved literal below the /forum/:category pattern (same tradeoff as
// /forum/reports): it must win over the category dispatch.
const wantsForumEtiquette = path === '/forum/etiquette';
const forumCategorySlug = forumCategorySlugFromPath(path);
const wantsForum =
  path === '/forum' ||
  (forumCategorySlug !== null && !wantsForumReports && !wantsForumEtiquette) ||
  page === 'forum';
const wantsLegacyPlay = path === '/play' || page === 'play';
const wantsWatch = path === '/watch' || page === 'watch';
const wantsXiangqiBroadcastIndex = path === '/broadcast/xiangqi';
const wantsXiangqiBroadcastOps = path === '/broadcast/xiangqi/ops';
const xiangqiBroadcastBoardId = xiangqiBroadcastBoardIdFromPath(path);
const xiangqiBroadcastRound = xiangqiBroadcastRoundFromPath(path);
const xiangqiBroadcastTourSlug = xiangqiBroadcastTourSlugFromPath(path);
const puzzleId = puzzleIdFromPath(path);
const wantsPuzzles = path === '/puzzles' || page === 'puzzles' || puzzleId !== null;
// Behind the correspondence build flag (soft launch). The nav bell + this
// dashboard share the gate; the route is invisible until the flag is on.
const wantsCorrespondence = correspondenceEnabled() && path === '/correspondence';
// The challenge landing page (/challenge/:id) rides the correspondence flag:
// challenges are correspondence seeks, so the surface is invisible until it is on.
const challengeId =
  correspondenceEnabled() && path.startsWith('/challenge/')
    ? decodeURIComponent(path.slice('/challenge/'.length))
    : null;
const wantsLeaderboard = path === '/player' || path === '/leaderboard' || page === 'leaderboard';
const wantsRatingStats = path === '/player/rating-stats';
// Unlisted admin game browser. No nav entry; the page itself is admin-gated by
// the /api/admin/games/query endpoint (open in local dev). Direct-URL only.
const wantsDatabase = path === '/database';
// Unlisted admin engine tracker. No nav entry; admin-gated by /api/admin/engines
// (open in local dev). Direct-URL only.
const wantsEngines = path === '/engines';
// Unlisted admin per-engine profile (/engine/:id). Same admin gate as /engines.
const engineProfileId = path.startsWith('/engine/')
  ? decodeURIComponent(path.slice('/engine/'.length))
  : null;
const wantsBots = path === '/bots';
const botProfileId = path.startsWith('/bot/')
  ? decodeURIComponent(path.slice('/bot/'.length))
  : null;
const profileHandle = profileHandleFromPath(path);
// Standalone analysis board fed by a pasted / ?moves= coordinate list (no room).
// No nav entry yet; direct-URL only, a shareable soft-launch primitive that lets
// a game be reviewed off its moves alone. Ships live. See xiangqi-analysis-page.ts.
const wantsXiangqiAnalysis = path === '/analysis/xiangqi';
// Hidden DEV-only spike: FoW Xiangqi Phase A. No nav entry, no landing link.
const wantsXiangqiSpike = import.meta.env.DEV && path === '/xiangqi-spike';
// Hidden DEV-only spike for the candidate 7x7 Dark Mini Xiangqi ruleset.
const wantsMiniXiangqiSpike = import.meta.env.DEV && path === '/mini-xiangqi-spike';
// Hidden DEV-only reviewer demo: no nav entry, direct-link only.
const wantsXiangqiDemo = import.meta.env.DEV && path === '/xiangqi-demo';
// Hidden DEV-only spike: pixel-art piece + fog style probes. No nav entry.
const wantsPixelLab = import.meta.env.DEV && path === '/pixel-lab';
// Hidden DEV-only identity lab for candidate variant marks. No nav entry.
const wantsVariantMarksLab = import.meta.env.DEV && path === '/variant-marks';
// Hidden DEV-only board lab for mapping Dobutsu animal art onto chess pieces.
const wantsDobutsuChessPreview = import.meta.env.DEV && path === '/dobutsu-chess-preview';
// Hidden DEV-only UI lab for generated Dobutsu web icon candidates. No nav entry.
const wantsDobutsuUiPreview = import.meta.env.DEV && path === '/dobutsu-ui-preview';
// Hidden DEV-only audition lab for sound sets. No nav entry.
const wantsSoundLab = import.meta.env.DEV && path === '/sound-lab';
// Hidden DEV-only variant sheet: every variant's opening in the showcase widget.
const wantsShowcaseSheet = import.meta.env.DEV && path === '/showcase-sheet';
// Hidden DEV-only Luzhanqi board preview. No nav entry while the live client is
// still under construction.
const wantsLuzhanqiPreview = import.meta.env.DEV && path === '/luzhanqi-preview';
// Hidden DEV-only postgame sheet: every native review page with a watch-feed sample.
const wantsPostgameSheet = import.meta.env.DEV && path === '/postgame-sheet';
// Hidden DEV-only Fog-of-War game deep-dive reader (replay triptych + prose
// annotation panel). No nav entry; pilot for the game-analysis article series.
const wantsDeepDive = import.meta.env.DEV && path === '/deepdive';
// Hidden DEV-only engine-output inspector (replay board + per-ply move ranking).
// No nav entry; spike for admin-gated engine self-review.
const wantsEngineReview = import.meta.env.DEV && path === '/engine-review';
// Tenants with a self-contained live client (Crossroads) are routed to it
// *before* the shared live-room shell so they never touch the fog-critical
// live.ts monolith; tenants riding the chess shell fall through to it.
const tenantLiveRoomCandidate = liveRoomId ?? (wantsLive ? params.get('room') : null);
const tenantLiveRoom = tenantLiveRoomCandidate
  ? webVariantTenantForRoomId(tenantLiveRoomCandidate)
  : null;
const wantsTenantLiveRoom =
  tenantLiveRoom?.loadLiveRoomClient !== undefined && tenantLiveRoom.enabled();

if (replaySample) {
  setTitle('Replay');
  // Honor &ply=N as a start cursor (mirrors the /game/:id review route). Lets a
  // deep-link drop straight onto a position of interest in a long replay.
  const replayPlyRaw = params.get('ply');
  const replayPly = replayPlyRaw ? Number.parseInt(replayPlyRaw, 10) : NaN;
  const replayOpts = Number.isFinite(replayPly) ? { initialPly: replayPly } : undefined;
  void mountOrReport(() =>
    import('./replay.js').then(({ mountReplay }) =>
      mountReplay(appRoot, replaySample, replayOpts).then(() => undefined),
    ),
  );
} else if (wantsTenantLiveRoom && tenantLiveRoom?.loadLiveRoomClient) {
  setTitle(tenantLiveRoom.pageTitle);
  const loadTenantLiveRoom = tenantLiveRoom.loadLiveRoomClient;
  void mountOrReport(() =>
    loadTenantLiveRoom().then((bootstrap) => {
      bootstrap();
    }),
  );
} else if (liveRoomId || wantsLive) {
  setTitle('Live');
  void mountOrReport(() =>
    import('./live.js').then(({ bootstrapLiveRoom }) => bootstrapLiveRoom()),
  );
} else if (tenantPostgame?.tenant.enabled()) {
  const { tenant, mount, roomId } = tenantPostgame;
  setTitle(tenant.pageTitle);
  void mountOrReport(() => mount(appRoot, roomId).then(() => undefined));
} else if (gameRoomId) {
  setTitle('Game');
  void mountOrReport(() =>
    import('./landing.js').then(({ mountGame }) => mountGame(appRoot, gameRoomId)),
  );
} else if (wantsLeaderboard) {
  setTitleKey('profile.leaderboard');
  void mountOrReport(() =>
    import('./profile.js').then(({ mountLeaderboard }) => mountLeaderboard(appRoot)),
  );
} else if (wantsRatingStats) {
  setTitleKey('profile.ratingStats');
  void mountOrReport(() =>
    import('./profile.js').then(({ mountRatingStats }) => mountRatingStats(appRoot)),
  );
} else if (wantsXiangqiAnalysis) {
  setTitle('Xiangqi analysis');
  void mountOrReport(() =>
    import('./xiangqi-analysis-page.js').then(({ mountXiangqiAnalysisPage }) => {
      mountXiangqiAnalysisPage(appRoot);
    }),
  );
} else if (wantsDatabase) {
  setTitle('Game database');
  void mountOrReport(() =>
    import('./database.js').then(({ mountDatabase }) => mountDatabase(appRoot)),
  );
} else if (wantsEngines) {
  setTitle('Engines');
  void mountOrReport(() =>
    import('./engines.js').then(({ mountEngines }) => mountEngines(appRoot)),
  );
} else if (engineProfileId) {
  setTitle('Engine');
  void mountOrReport(() =>
    import('./engine-profile.js').then(({ mountEngineProfile }) =>
      mountEngineProfile(appRoot, engineProfileId),
    ),
  );
} else if (wantsBots) {
  setTitleKey('profile.bots');
  void mountOrReport(() => import('./bots.js').then(({ mountBots }) => mountBots(appRoot)));
} else if (botProfileId) {
  setTitle('Bot');
  void mountOrReport(() =>
    import('./bots.js').then(({ mountBotProfile }) => mountBotProfile(appRoot, botProfileId)),
  );
} else if (profileHandle) {
  setTitle(`@${profileHandle}`);
  void mountOrReport(() =>
    import('./profile.js').then(({ mountProfile }) => mountProfile(appRoot, profileHandle)),
  );
} else if (wantsAccountSettings) {
  setTitleKey('account.settings');
  void mountOrReport(() =>
    import('./account.js').then(({ mountAccountSettings }) => mountAccountSettings(appRoot)),
  );
} else if (wantsAccount) {
  setTitleKey('account.account');
  void mountOrReport(() =>
    import('./account.js').then(({ mountAccount }) => mountAccount(appRoot)),
  );
} else if (wantsInboxReports) {
  setTitle('Message reports');
  void mountOrReport(() =>
    import('./inbox.js').then(({ mountInboxReports }) => mountInboxReports(appRoot)),
  );
} else if (wantsInbox) {
  setTitleKey('inbox.title');
  void mountOrReport(() =>
    import('./inbox.js').then(({ mountInbox }) => mountInbox(appRoot, inboxHandle)),
  );
} else if (wantsCorrespondence) {
  setTitle('Correspondence');
  void mountOrReport(() =>
    import('./correspondence.js').then(({ mountCorrespondence }) => mountCorrespondence(appRoot)),
  );
} else if (challengeId) {
  setTitle('Challenge');
  void mountOrReport(() =>
    import('./challenge-accept.js').then(({ mountChallengeAccept }) =>
      mountChallengeAccept(appRoot, challengeId),
    ),
  );
} else if (wantsWatch) {
  setTitleKey('nav.watch');
  void mountOrReport(() =>
    import('./watch-route.js').then(({ mountWatch }) => mountWatch(appRoot)),
  );
} else if (wantsXiangqiBroadcastIndex) {
  setTitle('Xiangqi broadcasts');
  void mountOrReport(() =>
    import('./xiangqi-broadcast.js').then(({ mountXiangqiBroadcastIndex }) =>
      mountXiangqiBroadcastIndex(appRoot),
    ),
  );
} else if (wantsXiangqiBroadcastOps) {
  setTitle('Xiangqi broadcast ops');
  void mountOrReport(() =>
    import('./xiangqi-broadcast-ops.js').then(({ mountXiangqiBroadcastOps }) =>
      mountXiangqiBroadcastOps(appRoot),
    ),
  );
} else if (xiangqiBroadcastBoardId) {
  setTitle('Xiangqi broadcast');
  void mountOrReport(() =>
    import('./xiangqi-broadcast.js').then(({ mountXiangqiBroadcastBoard }) =>
      mountXiangqiBroadcastBoard(appRoot, xiangqiBroadcastBoardId),
    ),
  );
} else if (xiangqiBroadcastRound) {
  setTitle('Xiangqi broadcast');
  void mountOrReport(() =>
    import('./xiangqi-broadcast.js').then(({ mountXiangqiBroadcastRound }) =>
      mountXiangqiBroadcastRound(
        appRoot,
        xiangqiBroadcastRound.tourSlug,
        xiangqiBroadcastRound.roundId,
      ),
    ),
  );
} else if (xiangqiBroadcastTourSlug) {
  setTitle('Xiangqi broadcast');
  void mountOrReport(() =>
    import('./xiangqi-broadcast.js').then(({ mountXiangqiBroadcastTour }) =>
      mountXiangqiBroadcastTour(appRoot, xiangqiBroadcastTourSlug),
    ),
  );
} else if (wantsPuzzles) {
  setTitleKey('nav.puzzles');
  void mountOrReport(() =>
    import('./puzzles.js').then(({ mountPuzzles }) => mountPuzzles(appRoot, puzzleId)),
  );
} else if (wantsXiangqiSpike) {
  setTitle('Xiangqi spike');
  void mountOrReport(() =>
    import('./xiangqi-spike.js').then(({ mountXiangqiSpike }) => mountXiangqiSpike(appRoot)),
  );
} else if (wantsMiniXiangqiSpike) {
  setTitle('Mini Xiangqi spike');
  void mountOrReport(() =>
    import('./mini-xiangqi-spike.js').then(({ mountMiniXiangqiSpike }) =>
      mountMiniXiangqiSpike(appRoot),
    ),
  );
} else if (wantsXiangqiDemo) {
  setTitle('Fog Elephant Chess demo');
  void mountOrReport(() =>
    import('./xiangqi-demo.js').then(({ mountXiangqiDemo }) => mountXiangqiDemo(appRoot)),
  );
} else if (wantsPixelLab) {
  setTitle('Pixel lab');
  void mountOrReport(() =>
    import('./pixel-lab.js').then(({ mountPixelLab }) => mountPixelLab(appRoot)),
  );
} else if (wantsVariantMarksLab) {
  setTitle('Variant marks');
  void mountOrReport(() =>
    import('./variant-marks-lab.js').then(({ mountVariantMarksLab }) =>
      mountVariantMarksLab(appRoot),
    ),
  );
} else if (wantsDobutsuChessPreview) {
  setTitle('Dobutsu chess preview');
  void mountOrReport(() =>
    import('./dobutsu-chess-preview.js').then(({ mountDobutsuChessPreview }) =>
      mountDobutsuChessPreview(appRoot),
    ),
  );
} else if (wantsDobutsuUiPreview) {
  setTitle('Dobutsu UI preview');
  void mountOrReport(() =>
    import('./dobutsu-ui-preview.js').then(({ mountDobutsuUiPreview }) =>
      mountDobutsuUiPreview(appRoot),
    ),
  );
} else if (wantsShowcaseSheet) {
  setTitle('Showcase sheet');
  void mountOrReport(() =>
    import('./showcase-sheet.js').then(({ mountShowcaseSheet }) => mountShowcaseSheet(appRoot)),
  );
} else if (wantsLuzhanqiPreview) {
  setTitle('Luzhanqi preview');
  void mountOrReport(() =>
    import('./luzhanqi-preview.js').then(({ mountLuzhanqiPreview }) =>
      mountLuzhanqiPreview(appRoot),
    ),
  );
} else if (wantsPostgameSheet) {
  setTitle('Postgame sheet');
  void mountOrReport(() =>
    import('./postgame-sheet.js').then(({ mountPostgameSheet }) => mountPostgameSheet(appRoot)),
  );
} else if (wantsSoundLab) {
  setTitle('Sound lab');
  void mountOrReport(() =>
    import('./sound-lab.js').then(({ mountSoundLab }) => mountSoundLab(appRoot)),
  );
} else if (wantsDeepDive) {
  setTitle('Deep-dive');
  void mountOrReport(() =>
    import('./deepdive.js').then(({ mountDeepDive }) => mountDeepDive(appRoot)),
  );
} else if (wantsEngineReview) {
  setTitle('Engine review');
  void mountOrReport(() =>
    import('./engine-review.js').then(({ mountEngineReview }) => mountEngineReview(appRoot)),
  );
} else if (wantsLegacyPlay) {
  window.history.replaceState(null, '', '/');
  void mountOrReport(() =>
    import('./landing.js').then(({ mountLanding }) => mountLanding(appRoot)),
  );
} else if (articleSlug) {
  setTitleKey('articles.heading');
  void mountOrReport(() =>
    import('./pages-static.js').then(({ mountArticle }) =>
      mountArticle(appRoot, articleSlug, articleLang),
    ),
  );
} else if (wantsNews) {
  setTitleKey('news.feedHeading');
  void mountOrReport(() => import('./pages-static.js').then(({ mountNews }) => mountNews(appRoot)));
} else if (forumRedirectPostId) {
  setTitle('Forum');
  void mountOrReport(() =>
    import('./forum.js').then(({ mountForumPostRedirect }) =>
      mountForumPostRedirect(appRoot, forumRedirectPostId),
    ),
  );
} else if (forumTopicId) {
  setTitle('Forum');
  void mountOrReport(() =>
    import('./forum.js').then(({ mountForumTopic }) => mountForumTopic(appRoot, forumTopicId)),
  );
} else if (wantsForumReports) {
  setTitle('Forum reports');
  void mountOrReport(() =>
    import('./forum.js').then(({ mountForumReports }) => mountForumReports(appRoot)),
  );
} else if (wantsForumEtiquette) {
  setTitle('Forum etiquette');
  void mountOrReport(() =>
    import('./forum.js').then(({ mountForumEtiquette }) => mountForumEtiquette(appRoot)),
  );
} else if (wantsForum) {
  setTitle('Forum');
  void mountOrReport(() => import('./forum.js').then(({ mountForum }) => mountForum(appRoot)));
} else if (wantsArticlesIndex) {
  setTitleKey('articles.heading');
  void mountOrReport(() =>
    import('./pages-static.js').then(({ mountArticlesIndex }) =>
      mountArticlesIndex(appRoot, articleLang),
    ),
  );
} else if (wantsRulesIndex) {
  setTitleKey('rules.heading');
  void mountOrReport(() =>
    import('./pages-static.js').then(({ mountRulesIndex }) =>
      mountRulesIndex(appRoot, articleLang),
    ),
  );
} else if (wantsLearn) {
  setTitleKey('nav.learn');
  void mountOrReport(() => import('./learn.js').then(({ mountLearn }) => mountLearn(appRoot)));
} else if (wantsAbout) {
  setTitleKey('footer.about');
  void mountOrReport(() =>
    import('./pages-static.js').then(({ mountAbout }) => mountAbout(appRoot)),
  );
} else if (wantsSource) {
  setTitleKey('footer.source');
  void mountOrReport(() =>
    import('./pages-static.js').then(({ mountSource }) => mountSource(appRoot)),
  );
} else if (wantsContact) {
  setTitleKey('contact.heading');
  void mountOrReport(() =>
    import('./pages-static.js').then(({ mountContact }) => mountContact(appRoot)),
  );
} else if (wantsPatron) {
  setTitleKey('patron.heading');
  void mountOrReport(() =>
    import('./pages-static.js').then(({ mountPatron }) => mountPatron(appRoot)),
  );
} else if (wantsFaq) {
  setTitleKey('faq.heading');
  void mountOrReport(() => import('./pages-static.js').then(({ mountFaq }) => mountFaq(appRoot)));
} else if (wantsTerms) {
  setTitleKey('footer.terms');
  void mountOrReport(() =>
    import('./pages-static.js').then(({ mountTerms }) => mountTerms(appRoot)),
  );
} else if (wantsPrivacy) {
  setTitleKey('footer.privacy');
  void mountOrReport(() =>
    import('./pages-static.js').then(({ mountPrivacy }) => mountPrivacy(appRoot)),
  );
} else if (path === '/') {
  void mountOrReport(() =>
    import('./landing.js').then(({ mountLanding }) => mountLanding(appRoot)),
  );
} else {
  setTitleKey('notFound.heading');
  void mountOrReport(() =>
    import('./pages-static.js').then(({ mountNotFound }) => mountNotFound(appRoot)),
  );
}

// Global friends-online widget (bottom-corner). Route-agnostic and self-gating
// (it no-ops for anonymous viewers), so it mounts once regardless of the page
// that rendered above. Lazy-imported so its bundle only loads when the flag is
// on.
if (friendsOnlineEnabled()) {
  void import('./friends-online.js').then(({ mountFriendsOnline }) => mountFriendsOnline());
}

function setTitle(page: string): void {
  document.title = `${page} · Mistboard`;
}

function setTitleKey(key: I18nKey): void {
  setTitle(t(key, {}, currentLocale()));
}

// Code-split routes fetch their chunk lazily, so a transient failure — most
// often the brief server-restart window during a deploy — rejects the dynamic
// import with a browser-specific "module load" error. Retry once with a full
// reload (which re-fetches index.html and the current chunk hashes) before
// surfacing the error screen. The sessionStorage flag caps it at one retry per
// tab session so a genuinely-missing asset can't loop; it clears on any
// successful mount so a later deploy gets its own retry budget.
const CHUNK_RELOAD_FLAG = 'mistboard.chunkReloadAttempted';

function isChunkLoadError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes('Failed to fetch dynamically imported module') || // Chromium
    message.includes('error loading dynamically imported module') || // Firefox
    message.includes('Importing a module script failed') // Safari
  );
}

function chunkReloadAlreadyAttempted(): boolean {
  try {
    return sessionStorage.getItem(CHUNK_RELOAD_FLAG) !== null;
  } catch {
    // Storage unavailable (private mode, etc.): treat as already tried so we
    // fall through to the error screen instead of risking a reload loop.
    return true;
  }
}

function setChunkReloadAttempted(value: boolean): void {
  try {
    if (value) sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
    else sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
  } catch {
    // No-op when storage is unavailable.
  }
}

async function mountOrReport(run: () => Promise<void>): Promise<void> {
  try {
    await run();
    setChunkReloadAttempted(false);
  } catch (err) {
    console.error(err);
    if (isChunkLoadError(err) && !chunkReloadAlreadyAttempted()) {
      setChunkReloadAttempted(true);
      location.reload();
      return;
    }
    appRoot.replaceChildren();
    appRoot.classList.add('landing-page');
    const shell = document.createElement('main');
    shell.className = 'site-section app-error-panel';
    const heading = document.createElement('h1');
    heading.className = 'site-section-heading';
    heading.textContent = 'Page failed to load';
    const detail = document.createElement('pre');
    detail.textContent = err instanceof Error ? (err.stack ?? err.message) : String(err);
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.className = 'landing-cta-primary';
    reload.textContent = 'Reload';
    reload.addEventListener('click', () => {
      setChunkReloadAttempted(false);
      location.reload();
    });
    shell.append(heading, detail, reload);
    appRoot.append(shell);
  }
}

function gameRoomIdFromPath(value: string): string | null {
  const match = value.match(/^\/game\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

// Variant-tenant postgame routes (<gameRouteBase>/:roomId) resolve through the
// web registry; a miss falls through to the chess routes. Tenants without a
// postgame surface (dark-chess correspondence) are skipped the same way.
function tenantPostgameFromPath(value: string): {
  tenant: WebVariantTenant;
  mount: NonNullable<WebVariantTenant['mountPostgame']>;
  roomId: string;
} | null {
  for (const tenant of webVariantTenants()) {
    if (!tenant.gameRouteBase || !tenant.mountPostgame) continue;
    const prefix = `${tenant.gameRouteBase}/`;
    if (!value.startsWith(prefix)) continue;
    const rest = value.slice(prefix.length);
    if (!rest || rest.includes('/')) continue;
    return { tenant, mount: tenant.mountPostgame.bind(tenant), roomId: decodeURIComponent(rest) };
  }
  return null;
}

function liveRoomIdFromPath(value: string): string | null {
  if (value === '/room') return 'dev-room';
  const match = value.match(/^\/room\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

function puzzleIdFromPath(value: string): string | null {
  const match = value.match(/^\/puzzles\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

function xiangqiBroadcastTourSlugFromPath(value: string): string | null {
  const match = value.match(/^\/broadcast\/xiangqi\/([^/]+)$/);
  if (!match || match[1] === 'board') return null;
  return decodeURIComponent(match[1]!);
}

function xiangqiBroadcastRoundFromPath(value: string): {
  tourSlug: string;
  roundId: string;
} | null {
  const match = value.match(/^\/broadcast\/xiangqi\/([^/]+)\/round\/([^/]+)$/);
  return match
    ? { tourSlug: decodeURIComponent(match[1]!), roundId: decodeURIComponent(match[2]!) }
    : null;
}

function xiangqiBroadcastBoardIdFromPath(value: string): string | null {
  const match = value.match(/^\/broadcast\/xiangqi\/board\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

function profileHandleFromPath(value: string): string | null {
  const match = value.match(/^\/@\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

function forumCategorySlugFromPath(value: string): string | null {
  const match = value.match(/^\/forum\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

function forumTopicIdFromPath(value: string): string | null {
  const match = value.match(/^\/forum\/t\/([^/]+)(?:\/[^/]+)?$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

function forumRedirectPostIdFromPath(value: string): string | null {
  const match = value.match(/^\/forum\/redirect\/post\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

// Article + rules-doc routes accept an optional language prefix:
// /zh-han[st]/{articles,rules}/<slug>. Rules docs and articles share the same
// renderer; only the URL base differs. The slug parser strips the lang prefix
// and matches either base (but NOT the bare /rules or /articles index, which
// have no slug segment); the lang parser reports the prefix.
function articleSlugFromPath(value: string): string | null {
  const match = value.replace(/^\/zh-han[st]/, '').match(/^\/(?:articles|rules)\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]!) : null;
}

function articleLangFromPath(value: string): ArticleLang | null {
  if (value === '/zh-hans/rules' || value.startsWith('/zh-hans/rules/')) return 'zh-Hans';
  if (value === '/zh-hant/rules' || value.startsWith('/zh-hant/rules/')) return 'zh-Hant';
  if (value === '/zh-hans/articles' || value.startsWith('/zh-hans/articles/')) return 'zh-Hans';
  if (value === '/zh-hant/articles' || value.startsWith('/zh-hant/articles/')) return 'zh-Hant';
  return null;
}
