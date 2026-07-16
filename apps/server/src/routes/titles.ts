// Title verification pipeline (lichess verify-title equivalent).
//
//   POST /api/titles/verify                       (auth)  submit {title, evidence}
//   GET  /api/titles/my-request                   (auth)  current title + latest request
//   GET  /api/admin/titles/requests?status=...    (admin) pending queue / decided history
//   POST /api/admin/titles/requests/:id/approve   (admin) grant: sets users.title
//   POST /api/admin/titles/requests/:id/reject    (admin) refuse: user may resubmit
//
// Titles are never self-asserted: users.title is written only on the approve
// path here (one transaction with the request decision). The vocabulary is
// closed (persistence-titles.ts); unknown titles and unknown status filters
// reject fail-closed. The web surfaces live at /verify-title (player form) and
// /titles (unlisted admin queue).

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { currentAccountUser } from './../account-session.js';
import {
  createTitleVerificationRequest,
  decideTitleVerificationRequest,
  isRequestableTitle,
  latestTitleVerificationRequestForUser,
  listTitleVerificationRequests,
  type PlayerTitle,
  type TitleVerificationRequest,
  type TitleVerificationRequestWithUser,
} from './../persistence-titles.js';
import {
  readJsonBody,
  requireAdminSession,
  requireMethod,
  requirePersistence,
  writeJson,
} from './lib.js';

// Evidence is free text (federation profile links, real name, rating claims).
// Bounded well under readJsonBody's 16 KiB body cap so the limit error is ours,
// not a generic body-too-large throw.
export const TITLE_EVIDENCE_MAX = 4000;

// Persistence surface the handlers use, injectable so the request lifecycle is
// unit-testable without Postgres (same pattern as routes/xiangqi-broadcasts.ts).
export type TitlesApiPersistence = {
  createTitleVerificationRequest: typeof createTitleVerificationRequest;
  latestTitleVerificationRequestForUser: typeof latestTitleVerificationRequestForUser;
  listTitleVerificationRequests: typeof listTitleVerificationRequests;
  decideTitleVerificationRequest: typeof decideTitleVerificationRequest;
};

const defaultPersistence: TitlesApiPersistence = {
  createTitleVerificationRequest,
  latestTitleVerificationRequestForUser,
  listTitleVerificationRequests,
  decideTitleVerificationRequest,
};

type ApiResult = { status: number; payload: Record<string, unknown> };

// ── player: submit ──────────────────────────────────────────────────────────
export async function submitTitleVerificationForApi(
  user: { id: string; title: PlayerTitle | null },
  body: Record<string, unknown>,
  deps: TitlesApiPersistence = defaultPersistence,
  now: Date = new Date(),
): Promise<ApiResult> {
  const title = body.title;
  // Scoped to xiangqi titles for now; chess-title requests reject fail-closed.
  if (!isRequestableTitle(title)) return { status: 400, payload: { error: 'invalid_title' } };
  const evidence = typeof body.evidence === 'string' ? body.evidence.trim() : '';
  if (evidence.length === 0) return { status: 400, payload: { error: 'evidence_required' } };
  if (evidence.length > TITLE_EVIDENCE_MAX) {
    return { status: 400, payload: { error: 'evidence_too_long' } };
  }
  // Re-claiming the title you already hold is a no-op request; asking for a
  // DIFFERENT title (e.g. xim → xgm after a promotion) is allowed.
  if (user.title === title) return { status: 409, payload: { error: 'already_titled' } };

  const result = await deps.createTitleVerificationRequest({
    id: `titlereq_${randomUUID()}`,
    userId: user.id,
    title,
    evidence,
    now,
  });
  if (!result.ok) return { status: 409, payload: { error: result.error } };
  return { status: 200, payload: { request: serializeRequest(result.request) } };
}

// ── player: status ──────────────────────────────────────────────────────────
export async function myTitleRequestForApi(
  user: { id: string; title: PlayerTitle | null },
  deps: TitlesApiPersistence = defaultPersistence,
): Promise<ApiResult> {
  const latest = await deps.latestTitleVerificationRequestForUser(user.id);
  return {
    status: 200,
    payload: { title: user.title, request: latest ? serializeRequest(latest) : null },
  };
}

// ── admin: list ─────────────────────────────────────────────────────────────
export async function adminListTitleRequestsForApi(
  statusParam: string | null,
  deps: TitlesApiPersistence = defaultPersistence,
): Promise<ApiResult> {
  const view = statusParam === null || statusParam === 'pending' ? 'pending' : statusParam;
  if (view !== 'pending' && view !== 'decided') {
    return { status: 400, payload: { error: 'invalid_status' } };
  }
  const requests = await deps.listTitleVerificationRequests(view);
  return { status: 200, payload: { requests: requests.map(serializeRequestWithUser) } };
}

// ── admin: decide ───────────────────────────────────────────────────────────
export async function adminDecideTitleRequestForApi(
  id: string,
  decision: 'approved' | 'rejected',
  decidedBy: string | null,
  deps: TitlesApiPersistence = defaultPersistence,
  now: Date = new Date(),
): Promise<ApiResult> {
  const request = await deps.decideTitleVerificationRequest({ id, decision, decidedBy, now });
  // Unknown id and already-decided collapse to one answer on purpose: the admin
  // queue is the only caller and both mean "nothing pending here anymore".
  if (!request) return { status: 404, payload: { error: 'request_not_pending' } };
  return { status: 200, payload: { request: serializeRequest(request) } };
}

// ── dispatch ────────────────────────────────────────────────────────────────
export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  parsedUrl: URL,
): Promise<boolean> {
  if (pathname === '/api/titles/verify') {
    if (!requireMethod(request, response, 'POST')) return true;
    if (!requirePersistence(response)) return true;
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    const body = await readJsonBody(request);
    const result = await submitTitleVerificationForApi({ id: user.id, title: user.title }, body);
    writeJson(response, result.status, result.payload);
    return true;
  }

  if (pathname === '/api/titles/my-request') {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    const result = await myTitleRequestForApi({ id: user.id, title: user.title });
    writeJson(response, result.status, result.payload);
    return true;
  }

  if (pathname === '/api/admin/titles/requests') {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!(await requireAdminSession(request, response))) return true;
    if (!requirePersistence(response)) return true;
    const result = await adminListTitleRequestsForApi(parsedUrl.searchParams.get('status'));
    writeJson(response, result.status, result.payload);
    return true;
  }

  const decideMatch = pathname.match(/^\/api\/admin\/titles\/requests\/([^/]+)\/(approve|reject)$/);
  if (decideMatch) {
    if (!requireMethod(request, response, 'POST')) return true;
    if (!(await requireAdminSession(request, response))) return true;
    if (!requirePersistence(response)) return true;
    // decided_by is the reviewing admin when a session exists; in local dev the
    // admin gate is open without a session, so it may be null there.
    const admin = await currentAccountUser(request);
    const result = await adminDecideTitleRequestForApi(
      decodeURIComponent(decideMatch[1]!),
      decideMatch[2] === 'approve' ? 'approved' : 'rejected',
      admin?.id ?? null,
    );
    writeJson(response, result.status, result.payload);
    return true;
  }

  return false;
}

// ── serialization ───────────────────────────────────────────────────────────
function serializeRequest(request: TitleVerificationRequest): Record<string, unknown> {
  return {
    id: request.id,
    title: request.title,
    evidence: request.evidence,
    status: request.status,
    decidedAt: request.decidedAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
  };
}

function serializeRequestWithUser(
  request: TitleVerificationRequestWithUser,
): Record<string, unknown> {
  return {
    ...serializeRequest(request),
    handle: request.handle,
    displayName: request.displayName,
    currentTitle: request.currentTitle,
  };
}
