import {
  addForumPost,
  countForumReplies,
  countIncomingChallenges,
  countNewFollowers,
  createCorrespondenceSeek,
  createForumTopic,
  createUser,
  followUser,
  listForumCategories,
  markNotificationsSeen,
} from './persistence.js';
import {
  assert,
  definePersistenceTests,
  pg,
  TEST_DATABASE_URL,
  test,
} from './persistence-test-support.js';

definePersistenceTests('notifications', () => {
  test('new-follower count is watermarked, and opening the bell clears it', async () => {
    const now = new Date('2026-08-01T00:00:00Z');
    await makeUser('notif_target', 'notiftarget', now);
    await makeUser('notif_fan_one', 'notiffanone', now);
    await makeUser('notif_fan_two', 'notiffantwo', now);

    // A brand-new account starts at zero rather than inheriting its history:
    // 121 backfills followers_seen_at to now(), so nothing pre-existing counts.
    assert.equal(await countNewFollowers('notif_target'), 0);

    assert.equal(
      (await followUser({ actorId: 'notif_fan_one', targetHandle: 'notiftarget' })).ok,
      true,
    );
    assert.equal(await countNewFollowers('notif_target'), 1);

    assert.equal(
      (await followUser({ actorId: 'notif_fan_two', targetHandle: 'notiftarget' })).ok,
      true,
    );
    assert.equal(await countNewFollowers('notif_target'), 2);

    // The follow is one-directional, so it never counts for the follower.
    assert.equal(await countNewFollowers('notif_fan_one'), 0);

    await markNotificationsSeen('notif_target', 'followers');
    assert.equal(await countNewFollowers('notif_target'), 0);

    // A follow arriving after the watermark counts again.
    await runSql(
      `UPDATE user_relations SET created_at = now() + interval '1 second'
       WHERE actor_id = $1 AND target_id = $2`,
      ['notif_fan_one', 'notif_target'],
    );
    assert.equal(await countNewFollowers('notif_target'), 1);
  });

  test('forum-reply count covers other people on your topics only', async () => {
    const now = new Date('2026-08-01T00:00:00Z');
    await makeUser('notif_author', 'notifauthor', now);
    await makeUser('notif_replier', 'notifreplier', now);
    const category = (await listForumCategories())[0];
    assert.ok(category, 'expected a seeded forum category');

    const created = await createForumTopic({
      id: 'notif_topic_cannon',
      postId: 'notif_post_cannon_open',
      categorySlug: category.slug,
      authorAccountId: 'notif_author',
      authorRole: 'player',
      title: 'A topic about cannon openings',
      slug: 'a-topic-about-cannon-openings',
      bodyText: 'Opening post.',
      // Real time, not the fixed fixture date: 121 backfills the watermark with
      // now(), so a post stamped in the past sits behind it and is correctly
      // already-seen. Only the account rows use the fixed date.
      now: new Date(),
    });
    assert.equal(created.ok, true);
    const topicId = 'notif_topic_cannon';

    // The author's own opening post is not a reply to themselves.
    assert.equal(await countForumReplies('notif_author'), 0);

    const reply = await addForumPost({
      id: 'notif_post_cannon_reply',
      topicId,
      authorAccountId: 'notif_replier',
      bodyText: 'Try the central cannon.',
      now: new Date(),
    });
    assert.equal(reply.ok, true);
    assert.equal(await countForumReplies('notif_author'), 1);

    // The author replying in their own thread must not notify themselves.
    assert.equal(
      (
        await addForumPost({
          id: 'notif_post_cannon_thanks',
          topicId,
          authorAccountId: 'notif_author',
          bodyText: 'Thanks.',
          now: new Date(),
        })
      ).ok,
      true,
    );
    assert.equal(await countForumReplies('notif_author'), 1);

    // Nobody else gets a badge for a topic they did not start.
    assert.equal(await countForumReplies('notif_replier'), 0);

    await markNotificationsSeen('notif_author', 'forum-replies');
    assert.equal(await countForumReplies('notif_author'), 0);
  });

  test('a hidden reply does not leave a badge the author can never clear', async () => {
    const now = new Date('2026-08-01T00:00:00Z');
    await makeUser('notif_hauthor', 'notifhauthor', now);
    await makeUser('notif_hspammer', 'notifhspammer', now);
    const category = (await listForumCategories())[0];
    assert.ok(category, 'expected a seeded forum category');

    const created = await createForumTopic({
      id: 'notif_topic_endgame',
      postId: 'notif_post_endgame_open',
      categorySlug: category.slug,
      authorAccountId: 'notif_hauthor',
      authorRole: 'player',
      title: 'Endgame practice partners wanted',
      slug: 'endgame-practice-partners-wanted',
      bodyText: 'Opening post.',
      now: new Date(),
    });
    assert.equal(created.ok, true);
    const topicId = 'notif_topic_endgame';

    const posted = await addForumPost({
      id: 'notif_post_endgame_spam',
      topicId,
      authorAccountId: 'notif_hspammer',
      bodyText: 'Buy my course.',
      now: new Date(),
    });
    assert.equal(posted.ok, true);
    assert.equal(await countForumReplies('notif_hauthor'), 1);

    await runSql(`UPDATE forum_posts SET hidden_at = now() WHERE id = $1`, [
      'notif_post_endgame_spam',
    ]);
    // Moderating the reply away must take the badge with it; otherwise the
    // author is left with a count pointing at a post that no longer renders.
    assert.equal(await countForumReplies('notif_hauthor'), 0);
  });

  test('incoming-challenge count is live state, not a watermarked feed', async () => {
    const now = new Date('2026-08-01T00:00:00Z');
    await makeUser('notif_challenged', 'notifchallenged', now);
    await makeUser('notif_challenger', 'notifchallenger', now);

    assert.equal(await countIncomingChallenges('notif_challenged'), 0);

    await createCorrespondenceSeek({
      id: 'notif_seek_live',
      creatorUserId: 'notif_challenger',
      gameSpecId: 'xiangqi',
      daysPerMove: 3,
      preferredColor: 'random',
      targetUserId: 'notif_challenged',
      visibility: 'private',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    assert.equal(await countIncomingChallenges('notif_challenged'), 1);

    // Nothing about opening the bell clears it: the challenge is still waiting
    // on an answer, so a watermark here would hide outstanding work.
    await markNotificationsSeen('notif_challenged', 'followers');
    await markNotificationsSeen('notif_challenged', 'forum-replies');
    assert.equal(await countIncomingChallenges('notif_challenged'), 1);

    // An expired challenge stops counting, matching listChallengesForUser.
    await runSql(
      `UPDATE correspondence_seeks SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      ['notif_seek_live'],
    );
    assert.equal(await countIncomingChallenges('notif_challenged'), 0);
  });
});

async function makeUser(id: string, handle: string, now: Date): Promise<void> {
  await createUser({
    id,
    email: `${handle}@example.com`,
    emailVerifiedAt: now,
    handle,
    displayName: handle,
    now,
  });
}

async function runSql(sql: string, params: unknown[] = []): Promise<void> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(sql, params);
  } finally {
    await client.end();
  }
}
