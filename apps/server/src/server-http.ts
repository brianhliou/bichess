import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RoomTimeControl, VariantId } from '@mistboard/game';
import serveHandler from 'serve-handler';
import { type HttpApiContext, handleApiRequest } from './http-api.js';
import { serveArticleOgImage, serveGameOgImage } from './og-image.js';
import * as persistence from './persistence.js';
import type { DrainController } from './server-drain.js';
import { isClientRoute, isReviewShellRoute } from './server-policy.js';
import {
  ARTICLE_META,
  serveArticlePage,
  serveArticlesIndexPage,
  serveGamePage,
  serveNotFoundShell,
  servePrerenderedPage,
  serveRulesIndexPage,
  serveSitemap,
} from './server-static-pages.js';
import type { LobbyTicket, Room } from './server-types.js';

export type PersistenceHealthEntry = {
  at: number;
  roomId: string;
  eventType: string;
};

type ServerHttpHandlerOptions = {
  rooms: Map<string, Room>;
  lobbyTickets: Map<string, LobbyTicket>;
  lobbyQueue: LobbyTicket[];
  databaseRequired: boolean;
  persistenceErrors: PersistenceHealthEntry[];
  pveBuiltinEngineClientId: string;
  annotationsFile: string;
  liveClockInitialMs: number;
  liveClockIncrementMs: number;
  staticDir: string;
  publicHost: string;
  drainController: DrainController;
  createRoom(
    mode: 'pvp' | 'pve',
    variant: VariantId,
    engineId: string,
    hiddenDraft960?: boolean,
    timeControl?: RoomTimeControl,
    rated?: boolean,
    options?: {
      randomSeating?: boolean;
      engineColor?: 'white' | 'black';
      engineReservationId?: string;
      creatorPreference?: 'white' | 'black';
      region?: string;
    },
  ): Promise<Room>;
  reserveLiveEngineSeat(engineId: string, color: 'white' | 'black'): Promise<string | null>;
  releaseLiveEngineReservation(reservationId: string, reason: string): void;
  abandonRoom(
    roomId: string,
    seatToken: string,
  ): Promise<
    { ok: true } | { ok: false; error: 'not_found' | 'unauthorized' | 'already_terminal' }
  >;
  inMemoryGameSummary(roomId: string): persistence.RecentEveGameRecord | null;
};

export function createHttpRequestHandler(options: ServerHttpHandlerOptions) {
  return function handleHttpRequest(request: IncomingMessage, response: ServerResponse): void {
    const url = request.url ?? '/';
    const pathname = url.split('?', 1)[0] ?? '/';

    // The postgame review shell mounts an in-browser analysis engine that runs
    // WASM threads, which need SharedArrayBuffer and therefore cross-origin
    // isolation. Send COOP/COEP on exactly the review document routes (set here,
    // before the various index.html handlers below, which only writeHead a
    // content-type and so preserve these). credentialless keeps our same-origin
    // bundle/engine assets working without forcing CORP on every subresource,
    // and leaves the rest of the site (patron's Stripe redirect, etc.)
    // non-isolated. See docs-private/analysis-board-track.md.
    if (isReviewShellRoute(pathname)) {
      response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      response.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    }

    // The ceval engine runs Fairy-Stockfish as an emscripten pthread worker. A
    // dedicated worker only becomes cross-origin isolated (and can accept the
    // SharedArrayBuffer memory the main thread hands it) when its OWN script
    // response carries COEP; the document's credentialless header does not extend
    // to it, so the worker spawns un-isolated and pthreads die with an opaque
    // "pthread sent an error". Serve the vendored engine assets with their own
    // COEP + CORP so the worker isolates. (Vite sets these on every dev response,
    // which is why this only ever broke in prod.) setHeader survives the static
    // serve-handler's writeHead merge, same as the review-document headers above.
    if (pathname.startsWith('/engine/fairy-stockfish/')) {
      response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    }

    if (url === '/health') {
      void handleHealthRequest(options, response);
      return;
    }

    if (pathname === '/admin/drain' || pathname === '/admin/drain/cancel') {
      void options.drainController.handleRequest(request, response, pathname).catch((err) => {
        console.error(
          JSON.stringify({
            level: 'error',
            kind: 'drain_handler_failure',
            error: (err as Error).message,
            at: Date.now(),
          }),
        );
        if (!response.headersSent) {
          response.writeHead(500, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: 'internal_error' }));
        }
      });
      return;
    }

    if (url.startsWith('/api/')) {
      void handleApiRequest(buildApiContext(options), request, response).catch((err) => {
        console.error(
          JSON.stringify({
            level: 'error',
            kind: 'api_handler_failure',
            url,
            error: (err as Error).message,
            at: Date.now(),
          }),
        );
        if (!response.headersSent) {
          response.writeHead(500, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: 'internal_error' }));
        }
      });
      return;
    }

    const ogImageMatch = pathname.match(/^\/og\/game\/([^/]+)\.png$/);
    if (ogImageMatch && persistence.isInitialized()) {
      const roomId = decodeURIComponent(ogImageMatch[1]!);
      void serveGameOgImage(roomId, response).catch((err) => {
        console.warn('og image render failed', (err as Error).message);
        if (!response.headersSent) {
          response.writeHead(302, { location: '/og-image.png' });
          response.end();
        }
      });
      return;
    }

    const articleOgMatch = pathname.match(/^\/og\/article\/([^/]+)\.png$/);
    if (articleOgMatch) {
      const slug = decodeURIComponent(articleOgMatch[1]!);
      const meta = ARTICLE_META[slug];
      if (meta) {
        void serveArticleOgImage({
          slug,
          title: meta.title,
          kind: meta.kind,
          response,
          staticDir: options.staticDir,
        }).catch((err: Error) => {
          console.warn('article og render failed', err.message);
          if (!response.headersSent) {
            response.writeHead(302, { location: '/og-image.png' });
            response.end();
          }
        });
      } else {
        response.writeHead(302, { location: '/og-image.png' });
        response.end();
      }
      return;
    }

    if (pathname === '/robots.txt') {
      response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(
        `User-agent: *\nAllow: /\nDisallow: /database\nDisallow: /engines\nSitemap: ${options.publicHost}/sitemap.xml\n`,
      );
      return;
    }

    if (pathname === '/sitemap.xml') {
      void serveSitemap({
        response,
        publicHost: options.publicHost,
        staticDir: options.staticDir,
      }).catch(() => {
        response.writeHead(500);
        response.end();
      });
      return;
    }

    const gameRouteMatch = pathname.match(/^\/game\/([^/]+)$/);
    if (gameRouteMatch && persistence.isInitialized()) {
      const roomId = decodeURIComponent(gameRouteMatch[1]!);
      void serveGamePage({
        roomId,
        response,
        publicHost: options.publicHost,
        staticDir: options.staticDir,
      }).catch(() => {
        request.url = '/';
        void serveHandler(request, response, { public: options.staticDir });
      });
      return;
    }

    // The community-posts view is a reserved blog index path, so it must win
    // over the generic /blog/:slug article route below.
    const blogIndexMatch = pathname.match(/^(?:\/(zh-hans|zh-hant))?\/blog(?:\/(community))?\/?$/);
    if (blogIndexMatch) {
      void serveArticlesIndexPage({
        response,
        publicHost: options.publicHost,
        staticDir: options.staticDir,
        langPrefix: blogIndexMatch[1],
        view: blogIndexMatch[2] === 'community' ? 'community' : 'mistboard',
      }).catch(() => {
        request.url = '/';
        void serveHandler(request, response, { public: options.staticDir });
      });
      return;
    }

    const blogRouteMatch = pathname.match(/^(?:\/(zh-hans|zh-hant))?\/blog\/([^/]+)$/);
    if (blogRouteMatch) {
      const langPrefix = blogRouteMatch[1];
      const slug = decodeURIComponent(blogRouteMatch[2]!);
      void serveArticlePage({
        slug,
        base: 'blog',
        response,
        publicHost: options.publicHost,
        staticDir: options.staticDir,
        langPrefix,
      }).catch(() => {
        request.url = '/';
        void serveHandler(request, response, { public: options.staticDir });
      });
      return;
    }

    // Legacy /articles/<slug> (the blog surface was renamed to /blog): the
    // 'articles' base is never canonical, so serveArticlePage 301s every hit to
    // the slug's /blog (or /rules) home, preserving any language prefix.
    const legacyArticleRouteMatch = pathname.match(/^(?:\/(zh-hans|zh-hant))?\/articles\/([^/]+)$/);
    if (legacyArticleRouteMatch) {
      const langPrefix = legacyArticleRouteMatch[1];
      const slug = decodeURIComponent(legacyArticleRouteMatch[2]!);
      void serveArticlePage({
        slug,
        base: 'articles',
        response,
        publicHost: options.publicHost,
        staticDir: options.staticDir,
        langPrefix,
      }).catch(() => {
        request.url = '/';
        void serveHandler(request, response, { public: options.staticDir });
      });
      return;
    }

    // Rules docs are canonical under /rules/<slug>; same renderer as articles,
    // with serveArticlePage 301ing any base/slug mismatch to the canonical path.
    const rulesArticleRouteMatch = pathname.match(/^(?:\/(zh-hans|zh-hant))?\/rules\/([^/]+)$/);
    if (rulesArticleRouteMatch) {
      const langPrefix = rulesArticleRouteMatch[1];
      const slug = decodeURIComponent(rulesArticleRouteMatch[2]!);
      void serveArticlePage({
        slug,
        base: 'rules',
        response,
        publicHost: options.publicHost,
        staticDir: options.staticDir,
        langPrefix,
      }).catch(() => {
        request.url = '/';
        void serveHandler(request, response, { public: options.staticDir });
      });
      return;
    }

    // Legacy /articles index (renamed to /blog): permanent redirect, preserving
    // any language prefix.
    const legacyArticlesIndexMatch = pathname.match(/^(?:\/(zh-hans|zh-hant))?\/articles\/?$/);
    if (legacyArticlesIndexMatch) {
      const langPrefix = legacyArticlesIndexMatch[1];
      response.writeHead(301, { location: `${langPrefix ? `/${langPrefix}` : ''}/blog` });
      response.end();
      return;
    }

    const rulesIndexMatch = pathname.match(/^(?:\/(zh-hans|zh-hant))?\/rules\/?$/);
    if (rulesIndexMatch) {
      void serveRulesIndexPage({
        response,
        publicHost: options.publicHost,
        staticDir: options.staticDir,
        langPrefix: rulesIndexMatch[1],
      }).catch(() => {
        request.url = '/';
        void serveHandler(request, response, { public: options.staticDir });
      });
      return;
    }

    if (pathname === '/') {
      void servePrerenderedPage({
        response,
        staticDir: options.staticDir,
        file: 'home.html',
      }).catch(() => {
        // No prerendered home.html (e.g. an older build): fall back to the shell.
        void serveHandler(request, response, { public: options.staticDir });
      });
      return;
    }

    // Default-locale player page gets its prerendered frame; localized paths
    // stay on the client-rendered shell below.
    if (pathname === '/player') {
      void servePrerenderedPage({
        response,
        staticDir: options.staticDir,
        file: 'player.html',
      }).catch(() => {
        request.url = '/';
        void serveHandler(request, response, { public: options.staticDir });
      });
      return;
    }

    if (pathname === '/leaderboard') {
      response.writeHead(308, { location: '/player' });
      response.end();
      return;
    }

    if (isClientRoute(pathname)) {
      request.url = '/';
      void serveHandler(request, response, { public: options.staticDir });
      return;
    }

    // Unknown, non-asset page navigation (e.g. a mistyped or stale URL): serve
    // the SPA shell with a 404 so the client renders the branded not-found page
    // (nav + panel) instead of serve-handler's bare default 404. Requests for
    // missing *assets* (extensioned paths) fall through to serve-handler's real
    // asset 404 — handing back the HTML shell for a missing .js would break
    // caching and mask load failures.
    if (isPageNavigationRequest(request, pathname)) {
      void serveNotFoundShell({ response, staticDir: options.staticDir }).catch((err) => {
        console.warn('not-found shell render failed', (err as Error).message);
        if (!response.headersSent) {
          response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
          response.end('Not found');
        }
      });
      return;
    }

    void serveHandler(request, response, { public: options.staticDir });
  };
}

// A page navigation is an extensionless GET/HEAD whose Accept header asks for
// HTML (or is absent — direct address-bar hits and crawlers). Asset requests
// carry a file extension in the final path segment; those are excluded so they
// keep flowing to serve-handler and get a real 404 when absent.
export function isPageNavigationRequest(
  request: Pick<IncomingMessage, 'method' | 'headers'>,
  pathname: string,
): boolean {
  const method = request.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') return false;
  const lastSegment = pathname.split('/').pop() ?? '';
  if (lastSegment.includes('.')) return false;
  const accept = request.headers.accept ?? '';
  return accept === '' || accept.includes('text/html');
}

async function handleHealthRequest(
  options: Pick<ServerHttpHandlerOptions, 'databaseRequired' | 'persistenceErrors'>,
  response: ServerResponse,
): Promise<void> {
  const cutoff1m = Date.now() - 60_000;
  const recent = options.persistenceErrors.filter((entry) => entry.at > cutoff1m);
  const lastAt =
    options.persistenceErrors.length > 0
      ? options.persistenceErrors[options.persistenceErrors.length - 1]!.at
      : null;
  const dbReachable = options.databaseRequired ? await persistence.probeDb() : true;
  const ok = recent.length === 0 && dbReachable;
  response.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      ok,
      databaseRequired: options.databaseRequired,
      persistence: persistence.isInitialized() ? 'enabled' : 'disabled',
      persistenceErrors: { count1m: recent.length, lastAt },
    }),
  );
}

function buildApiContext(options: ServerHttpHandlerOptions): HttpApiContext {
  return {
    rooms: options.rooms,
    lobbyTickets: options.lobbyTickets,
    lobbyQueue: options.lobbyQueue,
    databaseRequired: options.databaseRequired,
    pveBuiltinEngineClientId: options.pveBuiltinEngineClientId,
    annotationsFile: options.annotationsFile,
    liveClockInitialMs: options.liveClockInitialMs,
    liveClockIncrementMs: options.liveClockIncrementMs,
    createRoom: options.createRoom,
    reserveLiveEngineSeat: options.reserveLiveEngineSeat,
    releaseLiveEngineReservation: options.releaseLiveEngineReservation,
    abandonRoom: options.abandonRoom,
    inMemoryGameSummary: options.inMemoryGameSummary,
    isDraining: options.drainController.isDraining,
    drainDeadlineMs: options.drainController.drainDeadlineMs,
    activeGameCount: options.drainController.activeGameCount,
  };
}
