// oEmbed provider for study chapters.
//
//   GET /api/oembed?url=https://mistboard.com/study/:studyId/:chapterId
//   GET /api/oembed?url=https://mistboard.com/embed/study/:studyId/:chapterId
//
// oEmbed is the reason this is a contract rather than a URL someone reverse
// engineers: a consumer that already speaks it (WordPress, Ghost, Discourse,
// Notion) turns a pasted study link into the embed without knowing anything
// about us. Both the reader-facing permalink and the embed path are accepted,
// because the link a person actually copies is the former.
//
// Read-only, unauthenticated, and it answers only for studies the anonymous
// public can already read: the visibility check is the same one the study API
// applies, so this endpoint can never widen access to a private study.

import type { IncomingMessage, ServerResponse } from 'node:http';
import * as persistence from './../persistence.js';
import { requirePersistence, writeJson } from './lib.js';

const OEMBED_PATH = '/api/oembed';

/** Both the permalink a reader copies and the embed path itself. */
const STUDY_URL = /\/(?:embed\/)?study\/([A-Za-z0-9_-]{1,64})\/([A-Za-z0-9_-]{1,64})\/?$/;

const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 560;
const MIN_WIDTH = 320;
const MAX_WIDTH = 1200;

function clampWidth(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)));
}

export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  parsedUrl: URL,
): Promise<boolean> {
  if (pathname !== OEMBED_PATH) return false;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    writeJson(response, 405, { error: 'method_not_allowed' });
    return true;
  }

  const target = parsedUrl.searchParams.get('url');
  if (!target) {
    writeJson(response, 400, { error: 'url_required' });
    return true;
  }
  const format = parsedUrl.searchParams.get('format');
  if (format && format !== 'json') {
    // The spec says 501 for a format the provider does not implement.
    writeJson(response, 501, { error: 'unsupported_format' });
    return true;
  }

  const match = STUDY_URL.exec(target);
  if (!match) {
    writeJson(response, 404, { error: 'not_embeddable' });
    return true;
  }
  const [, studyId, chapterId] = match as unknown as [string, string, string];

  // Shape checks first: a URL we cannot embed is answerable without touching
  // the database, and answering it with a 503 when the store is down would be
  // wrong about why.
  if (!requirePersistence(response)) return true;

  const study = await persistence.getStudyById(studyId);
  // This request is always anonymous, so the owner branch of the study read
  // cannot apply: private is a 404 here exactly as it is there, with the same
  // shape, so the endpoint cannot be used to probe for private studies.
  if (!study || study.visibility === 'private') {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  const chapter = study.chapters.find((c) => c.id === chapterId);
  if (!chapter) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }

  const origin = `https://${request.headers.host ?? 'mistboard.com'}`;
  const width = clampWidth(parsedUrl.searchParams.get('maxwidth'));
  const height = Math.round(width * (DEFAULT_HEIGHT / DEFAULT_WIDTH));
  const src = `${origin}/embed/study/${encodeURIComponent(studyId)}/${encodeURIComponent(chapterId)}`;
  const title = `${chapter.name ?? 'Study'} · ${study.name ?? 'Mistboard'}`;

  writeJson(response, 200, {
    type: 'rich',
    version: '1.0',
    provider_name: 'Mistboard',
    provider_url: origin,
    title,
    width,
    height,
    // `loading=lazy` because an embed is usually below the fold on the host
    // page, and a board that mounts on scroll costs that page nothing up front.
    html:
      `<iframe src="${src}" width="${width}" height="${height}" frameborder="0" ` +
      `loading="lazy" title="${escapeAttribute(title)}" ` +
      `style="max-width:100%;border:0"></iframe>`,
  });
  return true;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
