// oEmbed provider for study chapters and finished games.
//
//   GET /api/oembed?url=https://mistboard.com/study/:studyId/:chapterId
//   GET /api/oembed?url=https://mistboard.com/embed/study/:studyId/:chapterId
//   GET /api/oembed?url=https://mistboard.com/game/:roomId
//   GET /api/oembed?url=https://mistboard.com/<variant>/game/:roomId
//   GET /api/oembed?url=https://mistboard.com/embed/game/:roomId
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
import {
  clampEmbedWidth,
  embedGamePath,
  embedHeightForWidth,
  embedStudyPath,
  OEMBED_ENDPOINT,
} from '@mistboard/game';
import * as persistence from './../persistence.js';
import { postgamePlayers, requirePersistence, writeJson } from './lib.js';

const OEMBED_PATH = OEMBED_ENDPOINT;

/** Both the permalink a reader copies and the embed path itself. */
const STUDY_URL = /\/(?:embed\/)?study\/([A-Za-z0-9_-]{1,64})\/([A-Za-z0-9_-]{1,64})\/?$/;
/** The review permalink (`/game/:id`, or a tenant's `/<variant>/game/:id`) and
 *  the embed path. The variant segment is not trusted: the game's own record
 *  says what it is. */
const GAME_URL = /\/(?:embed\/game|game|[a-z0-9-]{1,40}\/game)\/([A-Za-z0-9_-]{1,64})\/?$/;

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

  const studyMatch = STUDY_URL.exec(target);
  const gameMatch = studyMatch ? null : GAME_URL.exec(target);
  if (!studyMatch && !gameMatch) {
    writeJson(response, 404, { error: 'not_embeddable' });
    return true;
  }

  // Shape checks first: a URL we cannot embed is answerable without touching
  // the database, and answering it with a 503 when the store is down would be
  // wrong about why.
  if (!requirePersistence(response)) return true;

  const origin = `https://${request.headers.host ?? 'mistboard.com'}`;
  const width = clampEmbedWidth(parsedUrl.searchParams.get('maxwidth'));
  const height = embedHeightForWidth(width);

  if (gameMatch) {
    const roomId = gameMatch[1] as string;
    // Finished games only: the summary read answers nothing for a game still
    // in progress, so an embed can never be minted for a live fog game.
    const game = await persistence.getGameSummary(roomId);
    if (!game) {
      writeJson(response, 404, { error: 'not_found' });
      return true;
    }
    // The same seat roster the review page shows: a seat its owner made
    // private reads as Anonymous here too, so a title cannot name them.
    const players = postgamePlayers(game.participants ?? [], {
      whiteName: game.whiteName,
      blackName: game.blackName,
    });
    // Seats are 'white'/'black' tokens whatever the variant's colours; the
    // first mover is whichever seat is not black.
    const first = players.find((p) => p.color !== 'black')?.name ?? game.whiteName ?? 'Anonymous';
    const second = players.find((p) => p.color === 'black')?.name ?? game.blackName ?? 'Anonymous';
    const title = `${first} vs ${second} · ${game.result} · Mistboard`;
    respondWithFrame(response, {
      origin,
      path: embedGamePath(encodeURIComponent(roomId)),
      title,
      width,
      height,
    });
    return true;
  }

  const [, studyId, chapterId] = studyMatch as unknown as [string, string, string];
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

  respondWithFrame(response, {
    origin,
    path: embedStudyPath(encodeURIComponent(studyId), encodeURIComponent(chapterId)),
    title: `${chapter.name ?? 'Study'} · ${study.name ?? 'Mistboard'}`,
    width,
    height,
  });
  return true;
}

function respondWithFrame(
  response: ServerResponse,
  frame: { origin: string; path: string; title: string; width: number; height: number },
): void {
  const src = `${frame.origin}${frame.path}`;
  writeJson(response, 200, {
    type: 'rich',
    version: '1.0',
    provider_name: 'Mistboard',
    provider_url: frame.origin,
    title: frame.title,
    width: frame.width,
    height: frame.height,
    // `loading=lazy` because an embed is usually below the fold on the host
    // page, and a board that mounts on scroll costs that page nothing up front.
    html:
      `<iframe src="${src}" width="${frame.width}" height="${frame.height}" frameborder="0" ` +
      `loading="lazy" title="${escapeAttribute(frame.title)}" ` +
      `style="max-width:100%;border:0"></iframe>`,
  });
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
