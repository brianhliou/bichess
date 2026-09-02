// GET /api/openapi.json — the public API described (see ../openapi.ts).
//
// Built per request from the host header so `servers` names the origin the
// caller actually used; the document is small and the build is pure.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildOpenApiDocument } from '../openapi.js';
import { requireMethod, writeJson } from './lib.js';

export const OPENAPI_PATH = '/api/openapi.json';

export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname !== OPENAPI_PATH) return false;
  if (!requireMethod(request, response, 'GET')) return true;
  const host = request.headers.host ?? 'mistboard.com';
  const origin = `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`;
  writeJson(response, 200, buildOpenApiDocument(origin), {
    'cache-control': 'public, max-age=300',
  });
  return true;
}
