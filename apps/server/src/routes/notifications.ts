// GET  /api/notifications        every bell count in one round-trip
// POST /api/notifications/seen   advance a watermark ({ kind })
//
// The bell used to poll one endpoint per source, so each new notification kind
// cost every signed-in client another request on every refresh. This aggregates
// them: the client fetches once and each registered source reads its field out
// of the shared snapshot. Adding a source is now a field here plus a closure in
// notification-nav.ts, with no extra network cost.
//
// Counts are computed concurrently and each one degrades to 0 on failure rather
// than failing the whole payload — a bell that under-reports is a nuisance, a
// bell that 500s takes the nav down with it.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { currentAccountUser } from './../account-session.js';
import * as persistence from './../persistence.js';
import { readJsonBody, requireMethod, requirePersistence, writeJson } from './lib.js';

export type NotificationCounts = {
  inboxUnread: number;
  correspondenceYourMove: number;
  newFollowers: number;
  forumReplies: number;
  incomingChallenges: number;
};

async function countOrZero(work: Promise<number>): Promise<number> {
  try {
    return await work;
  } catch {
    return 0;
  }
}

export async function tryHandle(
  _ctx: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
): Promise<boolean> {
  if (pathname === '/api/notifications') {
    if (!requireMethod(request, response, 'GET')) return true;
    if (!requirePersistence(response)) return true;
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }

    const [inboxUnread, correspondenceYourMove, newFollowers, forumReplies, incomingChallenges] =
      await Promise.all([
        countOrZero(persistence.countUnreadDmThreads(user.id)),
        countOrZero(
          persistence
            .listCorrespondenceGamesForUser(user.id)
            .then((games) => games.reduce((count, game) => count + (game.isYourMove ? 1 : 0), 0)),
        ),
        countOrZero(persistence.countNewFollowers(user.id)),
        countOrZero(persistence.countForumReplies(user.id)),
        countOrZero(persistence.countIncomingChallenges(user.id)),
      ]);

    const counts: NotificationCounts = {
      inboxUnread,
      correspondenceYourMove,
      newFollowers,
      forumReplies,
      incomingChallenges,
    };
    writeJson(response, 200, counts);
    return true;
  }

  if (pathname === '/api/notifications/seen') {
    if (!requireMethod(request, response, 'POST')) return true;
    if (!requirePersistence(response)) return true;
    const user = await currentAccountUser(request);
    if (!user) {
      writeJson(response, 401, { error: 'not_signed_in' });
      return true;
    }
    const body = await readJsonBody(request);
    if (!persistence.isNotificationWatermarkKind(body.kind)) {
      writeJson(response, 400, { error: 'invalid_kind' });
      return true;
    }
    await persistence.markNotificationsSeen(user.id, body.kind);
    writeJson(response, 200, { ok: true });
    return true;
  }

  return false;
}
