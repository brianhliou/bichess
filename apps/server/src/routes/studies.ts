// Study CRUD API (schema in migration 092; persistence in persistence-studies.ts).
// S2/S3 of the study track: single-author studies, owner-only writes, visibility-
// gated reads. No real-time collaboration — a chapter save carries the chapter
// `version` and loses to a concurrent writer with a 409 rather than clobbering.
//
//   POST   /api/studies                       create (auth) — study + first chapter
//   GET    /api/studies/mine                  list the signed-in owner's studies
//   GET    /api/studies/:id                   read (public/unlisted: anyone; private: owner)
//   PATCH  /api/studies/:id                   update name/description/visibility (owner)
//   DELETE /api/studies/:id                   delete (owner)
//   POST   /api/studies/:id/chapters          add a chapter (owner)
//   PATCH  /api/studies/:id/chapters/:cid     save tree (version-guarded) OR rename (owner)
//   DELETE /api/studies/:id/chapters/:cid     delete a chapter (owner; refuses the last)

import type { IncomingMessage, ServerResponse } from 'node:http';
import { currentAccountUser } from './../account-session.js';
import * as persistence from './../persistence.js';
import { readJsonBody, requireMethod, requirePersistence, writeJson } from './lib.js';

// Fail-closed allowlist of variants a study may hold. The tree spine is
// variant-generic, but each variant needs a client adapter to render/replay; only
// the ones wired get in. Extend as S5 lands other perfect-info variants.
const STUDY_VARIANTS = new Set(['xiangqi']);

const ID = '[A-Za-z0-9]+';
const STUDY_PATH = new RegExp(`^/api/studies/(${ID})$`);
const CHAPTERS_PATH = new RegExp(`^/api/studies/(${ID})/chapters$`);
const CHAPTER_PATH = new RegExp(`^/api/studies/(${ID})/chapters/(${ID})$`);
const LIKE_PATH = new RegExp(`^/api/studies/(${ID})/like$`);

function isSerializedTree(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const tree = value as { version?: unknown; root?: unknown };
  if (tree.version !== 1) return false;
  const root = tree.root as { children?: unknown } | null;
  return !!root && typeof root === 'object' && Array.isArray(root.children);
}

function studyView(study: persistence.StudyRecord, isOwner: boolean) {
  return {
    id: study.id,
    name: study.name,
    description: study.description,
    visibility: study.visibility,
    isOwner,
    createdAt: study.createdAt.toISOString(),
    updatedAt: study.updatedAt.toISOString(),
  };
}

// Public listing card view (All studies / Favorites): owner + likes on top of the
// base study view, so cards can show "♥ N · author · date".
function publicStudyView(study: persistence.PublicStudySummary) {
  return {
    ...studyView(study, false),
    chapterCount: study.chapterCount,
    chapterNames: study.chapterNames,
    owner: { handle: study.ownerHandle, displayName: study.ownerDisplayName },
    likeCount: study.likeCount,
  };
}

function parseLimit(params: URLSearchParams, fallback: number): number {
  const value = Number(params.get('limit'));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function chapterView(chapter: persistence.StudyChapterRecord) {
  return {
    id: chapter.id,
    name: chapter.name,
    variant: chapter.variant,
    orientation: chapter.orientation,
    root: chapter.root,
    denorm: chapter.denorm,
    version: chapter.version,
    gamebook: chapter.gamebook,
  };
}

export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname !== '/api/studies' && !pathname.startsWith('/api/studies/')) return false;

  // ── Public collection ──
  if (pathname === '/api/studies/public') {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    // ?limit lets the /study "All studies" browse ask for more than the homepage
    // widget's default 5. ?q filters by study name. listTopPublicStudies clamps.
    const params = new URL(request.url ?? '', 'http://localhost').searchParams;
    const studies = await persistence.listTopPublicStudies(
      parseLimit(params, 5),
      params.get('q') ?? undefined,
    );
    writeJson(response, 200, { studies: studies.map(publicStudyView) });
    return true;
  }

  // ── Favorites: public studies the signed-in user has liked ──
  if (pathname === '/api/studies/favorites') {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    const params = new URL(request.url ?? '', 'http://localhost').searchParams;
    const studies = await persistence.listFavoriteStudies(
      user.id,
      parseLimit(params, 30),
      params.get('q') ?? undefined,
    );
    writeJson(response, 200, { studies: studies.map(publicStudyView) });
    return true;
  }

  // ── Collection: create + list-mine ──
  if (pathname === '/api/studies' || pathname === '/api/studies/mine') {
    if (!requirePersistence(response)) return true;
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    if (pathname === '/api/studies/mine') {
      if (!requireMethod(request, response, 'GET')) return true;
      const q = new URL(request.url ?? '', 'http://localhost').searchParams.get('q') ?? undefined;
      const studies = await persistence.listStudiesForOwner(user.id, q);
      writeJson(response, 200, {
        studies: studies.map((s) => ({
          ...studyView(s, true),
          chapterCount: s.chapterCount,
          chapterNames: s.chapterNames,
        })),
      });
      return true;
    }
    if (!requireMethod(request, response, 'POST')) return true;
    return createStudy(request, response, user.id);
  }

  // ── Like a public study ──
  const likeMatch = LIKE_PATH.exec(pathname);
  if (likeMatch) {
    if (!requireMethod(request, response, 'PUT')) return true;
    if (!requirePersistence(response)) return true;
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    const body = await readJsonBody(request);
    if (typeof body.liked !== 'boolean') {
      writeJson(response, 400, { error: 'invalid_liked' });
      return true;
    }
    const state = await persistence.setStudyLike(likeMatch[1]!, user.id, body.liked);
    writeJson(response, state ? 200 : 404, state ?? { error: 'not_found' });
    return true;
  }

  // ── Add a chapter ──
  const chaptersMatch = CHAPTERS_PATH.exec(pathname);
  if (chaptersMatch) {
    if (!requireMethod(request, response, 'POST')) return true;
    if (!requirePersistence(response)) return true;
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    return addChapter(request, response, chaptersMatch[1]!, user.id);
  }

  // ── Chapter: tree save / rename / delete ──
  const chapterMatch = CHAPTER_PATH.exec(pathname);
  if (chapterMatch) {
    if (!requirePersistence(response)) return true;
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    const chapterId = chapterMatch[2]!;
    if (request.method === 'PATCH') return patchChapter(request, response, chapterId, user.id);
    if (request.method === 'DELETE') return removeChapter(response, chapterId, user.id);
    writeJson(response, 405, { error: 'method_not_allowed' });
    return true;
  }

  // ── Single study: read / meta update / delete ──
  const studyMatch = STUDY_PATH.exec(pathname);
  if (studyMatch) {
    const id = studyMatch[1]!;
    if (request.method === 'GET') return readStudy(request, response, id);
    if (request.method === 'PATCH') return updateMeta(request, response, id);
    if (request.method === 'DELETE') return deleteStudy(request, response, id);
    writeJson(response, 405, { error: 'method_not_allowed' });
    return true;
  }

  writeJson(response, 404, { error: 'not_found' });
  return true;
}

async function createStudy(
  request: IncomingMessage,
  response: ServerResponse,
  ownerId: string,
): Promise<boolean> {
  const body = await readJsonBody(request);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    writeJson(response, 400, { error: 'invalid_name' });
    return true;
  }
  const chapter = body.chapter as Record<string, unknown> | undefined;
  if (!chapter) {
    writeJson(response, 400, { error: 'missing_chapter' });
    return true;
  }
  const variant = typeof chapter.variant === 'string' ? chapter.variant : '';
  if (!STUDY_VARIANTS.has(variant)) {
    writeJson(response, 400, { error: 'unsupported_variant' });
    return true;
  }
  if (!isSerializedTree(chapter.root)) {
    writeJson(response, 400, { error: 'invalid_tree' });
    return true;
  }
  const visibility = body.visibility;
  if (visibility !== undefined && !persistence.isStudyVisibility(visibility)) {
    writeJson(response, 400, { error: 'invalid_visibility' });
    return true;
  }
  const chapterName =
    typeof chapter.name === 'string' && chapter.name.trim() ? chapter.name.trim() : 'Chapter 1';
  const orientation = chapter.orientation === 'black' ? 'black' : 'red';
  const created = await persistence.createStudy({
    ownerId,
    name,
    description: typeof body.description === 'string' ? body.description : '',
    visibility: persistence.isStudyVisibility(visibility) ? visibility : 'private',
    chapter: {
      name: chapterName,
      variant,
      orientation,
      root: chapter.root,
      denorm: chapter.denorm ?? {},
    },
  });
  if (!created) {
    writeJson(response, 503, { error: 'persistence_disabled' });
    return true;
  }
  writeJson(response, 201, {
    study: studyView(created, true),
    chapters: created.chapters.map(chapterView),
  });
  return true;
}

async function readStudy(
  request: IncomingMessage,
  response: ServerResponse,
  id: string,
): Promise<boolean> {
  if (!requirePersistence(response)) return true;
  const study = await persistence.getStudyById(id);
  const user = await currentAccountUser(request);
  const isOwner = !!user && !!study && study.ownerId === user.id;
  // Private studies are invisible to everyone but the owner (same 404-on-miss shape
  // so existence isn't leaked). Unlisted + public are readable by anyone with the id.
  if (!study || (study.visibility === 'private' && !isOwner)) {
    writeJson(response, 404, { error: 'not_found' });
    return true;
  }
  const likeState = await persistence.getStudyLikeState(id, user?.id);
  writeJson(response, 200, {
    study: { ...studyView(study, isOwner), ...likeState },
    chapters: study.chapters.map(chapterView),
  });
  return true;
}

async function addChapter(
  request: IncomingMessage,
  response: ServerResponse,
  studyId: string,
  ownerId: string,
): Promise<boolean> {
  const body = await readJsonBody(request);
  const variant = typeof body.variant === 'string' ? body.variant : '';
  if (!STUDY_VARIANTS.has(variant)) {
    writeJson(response, 400, { error: 'unsupported_variant' });
    return true;
  }
  if (!isSerializedTree(body.root)) {
    writeJson(response, 400, { error: 'invalid_tree' });
    return true;
  }
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'New chapter';
  const orientation = body.orientation === 'black' ? 'black' : 'red';
  const result = await persistence.addChapter(studyId, ownerId, {
    name,
    variant,
    orientation,
    root: body.root,
    denorm: body.denorm ?? {},
  });
  if (!result.ok) {
    writeJson(response, result.error === 'forbidden' ? 403 : 404, { error: result.error });
    return true;
  }
  writeJson(response, 201, { chapter: chapterView(result.chapter) });
  return true;
}

// PATCH a chapter: a `root` body saves the tree (version-guarded); a `name`-only
// body renames it.
async function patchChapter(
  request: IncomingMessage,
  response: ServerResponse,
  chapterId: string,
  ownerId: string,
): Promise<boolean> {
  const body = await readJsonBody(request);
  if ('root' in body) {
    if (!isSerializedTree(body.root)) {
      writeJson(response, 400, { error: 'invalid_tree' });
      return true;
    }
    const baseVersion = typeof body.baseVersion === 'number' ? body.baseVersion : undefined;
    const result = await persistence.updateChapterTree(chapterId, ownerId, {
      root: body.root,
      denorm: body.denorm,
      baseVersion,
    });
    if (!result.ok) {
      const status = result.error === 'forbidden' ? 403 : result.error === 'conflict' ? 409 : 404;
      writeJson(response, status, { error: result.error });
      return true;
    }
    writeJson(response, 200, { chapter: chapterView(result.chapter) });
    return true;
  }
  if (typeof body.gamebook === 'boolean') {
    const result = await persistence.setChapterGamebook(chapterId, ownerId, body.gamebook);
    if (!result.ok) {
      writeJson(response, result.error === 'forbidden' ? 403 : 404, { error: result.error });
      return true;
    }
    writeJson(response, 200, { chapter: chapterView(result.chapter) });
    return true;
  }
  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (!name) {
      writeJson(response, 400, { error: 'invalid_name' });
      return true;
    }
    const result = await persistence.renameChapter(chapterId, ownerId, name);
    if (!result.ok) {
      writeJson(response, result.error === 'forbidden' ? 403 : 404, { error: result.error });
      return true;
    }
    writeJson(response, 200, { chapter: chapterView(result.chapter) });
    return true;
  }
  writeJson(response, 400, { error: 'nothing_to_update' });
  return true;
}

async function removeChapter(
  response: ServerResponse,
  chapterId: string,
  ownerId: string,
): Promise<boolean> {
  const result = await persistence.deleteChapter(chapterId, ownerId);
  if (!result.ok) {
    const status = result.error === 'forbidden' ? 403 : result.error === 'last_chapter' ? 409 : 404;
    writeJson(response, status, { error: result.error });
    return true;
  }
  writeJson(response, 200, { ok: true });
  return true;
}

async function updateMeta(
  request: IncomingMessage,
  response: ServerResponse,
  id: string,
): Promise<boolean> {
  if (!requirePersistence(response)) return true;
  const user = await currentAccountUser(request);
  if (!user) {
    writeJson(response, 401, { error: 'not_signed_in' });
    return true;
  }
  const body = await readJsonBody(request);
  if (body.visibility !== undefined && !persistence.isStudyVisibility(body.visibility)) {
    writeJson(response, 400, { error: 'invalid_visibility' });
    return true;
  }
  const name = typeof body.name === 'string' ? body.name.trim() : undefined;
  if (name !== undefined && !name) {
    writeJson(response, 400, { error: 'invalid_name' });
    return true;
  }
  const result = await persistence.updateStudyMeta(id, user.id, {
    name,
    description: typeof body.description === 'string' ? body.description : undefined,
    visibility: persistence.isStudyVisibility(body.visibility) ? body.visibility : undefined,
  });
  if (!result.ok) {
    writeJson(response, result.error === 'forbidden' ? 403 : 404, { error: result.error });
    return true;
  }
  writeJson(response, 200, { study: studyView(result.study, true) });
  return true;
}

async function deleteStudy(
  request: IncomingMessage,
  response: ServerResponse,
  id: string,
): Promise<boolean> {
  if (!requirePersistence(response)) return true;
  const user = await currentAccountUser(request);
  if (!user) {
    writeJson(response, 401, { error: 'not_signed_in' });
    return true;
  }
  const deleted = await persistence.deleteStudy(id, user.id);
  writeJson(response, deleted ? 200 : 404, deleted ? { ok: true } : { error: 'not_found' });
  return true;
}
