import type { UserAccount } from './persistence.js';
import { createUser } from './persistence.js';
import {
  addChapter,
  createStudy,
  deleteChapter,
  deleteStudy,
  getStudyById,
  getStudyLikeState,
  listFavoriteStudies,
  listStudiesForOwner,
  listTopPublicStudies,
  renameChapter,
  setChapterGamebook,
  setStudyLike,
  updateChapterTree,
  updateStudyMeta,
} from './persistence-studies.js';
import { assert, definePersistenceTests, test } from './persistence-test-support.js';

definePersistenceTests('studies', () => {
  const now = new Date('2026-07-11T12:00:00.000Z');

  async function makeUser(suffix: string): Promise<UserAccount> {
    return createUser({
      id: `user_study_${suffix}`,
      email: `study-${suffix}@example.com`,
      emailVerifiedAt: now,
      handle: `study-${suffix}`,
      displayName: `Study ${suffix}`,
      now,
    });
  }

  const tree = { version: 1, root: { children: [{ uci: 'b3e3', children: [] }] } };

  async function makeStudy(ownerId: string, name = 'My study') {
    return createStudy({
      ownerId,
      name,
      description: 'notes',
      visibility: 'private',
      chapter: { name: 'Chapter 1', variant: 'xiangqi', orientation: 'red', root: tree },
    });
  }

  test('creates a study with a first chapter and reads it back', async () => {
    const user = await makeUser('create');
    const created = await makeStudy(user.id);
    assert.ok(created);
    assert.equal(created.name, 'My study');
    assert.equal(created.visibility, 'private');
    assert.equal(created.chapters.length, 1);
    const chapter = created.chapters[0]!;
    assert.equal(chapter.variant, 'xiangqi');
    assert.equal(chapter.version, 0);
    assert.equal(chapter.gamebook, false);
    assert.deepEqual(chapter.root, tree);

    const fetched = await getStudyById(created.id);
    assert.ok(fetched);
    assert.equal(fetched.chapters.length, 1);
    assert.deepEqual(fetched.chapters[0]!.root, tree);
  });

  test('saves a chapter tree, bumps the version, and enforces ownership', async () => {
    const owner = await makeUser('owner');
    const stranger = await makeUser('stranger');
    const study = await makeStudy(owner.id);
    assert.ok(study);
    const chapterId = study.chapters[0]!.id;
    const nextTree = { version: 1, root: { children: [{ uci: 'h3e3', children: [] }] } };

    const ok = await updateChapterTree(chapterId, owner.id, { root: nextTree });
    assert.ok(ok.ok);
    // deepEqual, not string compare: JSONB does not preserve object key order.
    assert.equal(ok.chapter.version, 1);
    assert.deepEqual(ok.chapter.root, nextTree);

    const forbidden = await updateChapterTree(chapterId, stranger.id, { root: nextTree });
    assert.equal(forbidden.ok, false);
    assert.ok(!forbidden.ok && forbidden.error === 'forbidden');
  });

  test('rejects a stale version with a conflict (optimistic concurrency)', async () => {
    const owner = await makeUser('conflict');
    const study = await makeStudy(owner.id);
    assert.ok(study);
    const chapterId = study.chapters[0]!.id;
    const t = { version: 1, root: { children: [] } };

    // Two writers both read version 0; the first wins, the second is stale.
    const first = await updateChapterTree(chapterId, owner.id, { root: t, baseVersion: 0 });
    assert.ok(first.ok);
    const stale = await updateChapterTree(chapterId, owner.id, { root: t, baseVersion: 0 });
    assert.equal(stale.ok, false);
    assert.ok(!stale.ok && stale.error === 'conflict');

    // Re-reading the current version lets the save through.
    const retry = await updateChapterTree(chapterId, owner.id, { root: t, baseVersion: 1 });
    assert.ok(retry.ok);
  });

  test('lists an owner studies with chapter counts and name previews', async () => {
    const owner = await makeUser('list');
    await makeStudy(owner.id, 'A');
    const multi = await makeStudy(owner.id, 'B');
    assert.ok(multi);
    await addChapter(multi.id, owner.id, {
      name: 'Chapter 2',
      variant: 'xiangqi',
      orientation: 'red',
      root: tree,
    });
    const studies = await listStudiesForOwner(owner.id);
    assert.equal(studies.length, 2);
    // Most-recently-updated first: 'B' got a second chapter after 'A' was created.
    const [first, second] = studies;
    assert.equal(first!.name, 'B');
    assert.equal(first!.chapterCount, 2);
    assert.deepEqual(first!.chapterNames, ['Chapter 1', 'Chapter 2']);
    assert.equal(second!.chapterCount, 1);
    assert.deepEqual(second!.chapterNames, ['Chapter 1']);
  });

  test('ranks public studies by likes and keeps like writes idempotent', async () => {
    const firstOwner = await makeUser('popular-first');
    const secondOwner = await makeUser('popular-second');
    const fanOne = await makeUser('fan-one');
    const fanTwo = await makeUser('fan-two');
    const first = await makeStudy(firstOwner.id, 'First public study');
    const second = await makeStudy(secondOwner.id, 'Second public study');
    assert.ok(first && second);
    await updateStudyMeta(first.id, firstOwner.id, { visibility: 'public' });
    await updateStudyMeta(second.id, secondOwner.id, { visibility: 'public' });

    assert.deepEqual(await setStudyLike(first.id, fanOne.id, true), {
      likeCount: 1,
      likedByViewer: true,
    });
    await setStudyLike(first.id, fanOne.id, true);
    await setStudyLike(first.id, fanTwo.id, true);
    await setStudyLike(second.id, fanOne.id, true);

    const ranked = await listTopPublicStudies(5);
    assert.deepEqual(
      ranked.map((study) => [study.name, study.likeCount]),
      [
        ['First public study', 2],
        ['Second public study', 1],
      ],
    );
    assert.deepEqual(await getStudyLikeState(first.id, fanTwo.id), {
      likeCount: 2,
      likedByViewer: true,
    });
    assert.deepEqual(await setStudyLike(first.id, fanTwo.id, false), {
      likeCount: 1,
      likedByViewer: false,
    });
  });

  test('does not list or accept likes on non-public studies', async () => {
    const owner = await makeUser('private-like-owner');
    const fan = await makeUser('private-like-fan');
    const study = await makeStudy(owner.id, 'Private study');
    assert.ok(study);
    assert.equal(await setStudyLike(study.id, fan.id, true), null);
    assert.equal(
      (await listTopPublicStudies()).some((entry) => entry.id === study.id),
      false,
    );
  });

  test('lists a user favorites (liked public studies) and filters by name', async () => {
    const owner = await makeUser('fav-owner');
    const fan = await makeUser('fav-fan');
    const cannon = await makeStudy(owner.id, 'Cannon Openings');
    const horse = await makeStudy(owner.id, 'Horse Tactics');
    const unliked = await makeStudy(owner.id, 'Cannon Endgames');
    assert.ok(cannon && horse && unliked);
    for (const study of [cannon, horse, unliked]) {
      await updateStudyMeta(study.id, owner.id, { visibility: 'public' });
    }
    // Fan likes two of the three public studies.
    await setStudyLike(cannon.id, fan.id, true);
    await setStudyLike(horse.id, fan.id, true);

    const favorites = await listFavoriteStudies(fan.id);
    assert.deepEqual(favorites.map((study) => study.name).sort(), [
      'Cannon Openings',
      'Horse Tactics',
    ]);
    assert.equal(favorites[0]!.ownerDisplayName, 'Study fav-owner');

    // Name search is a case-insensitive substring, scoped to the favorites.
    const matched = await listFavoriteStudies(fan.id, 30, 'cannon');
    assert.deepEqual(
      matched.map((study) => study.name),
      ['Cannon Openings'],
    );

    // The public index honors the same filter (and 'Cannon Endgames' is unliked
    // but still public, so it shows there).
    const publicCannon = await listTopPublicStudies(30, 'cannon');
    assert.deepEqual(publicCannon.map((study) => study.name).sort(), [
      'Cannon Endgames',
      'Cannon Openings',
    ]);
  });

  test('adds, renames, and deletes chapters (owner only, keeps at least one)', async () => {
    const owner = await makeUser('chapters');
    const stranger = await makeUser('chapters-stranger');
    const study = await makeStudy(owner.id);
    assert.ok(study);
    const studyId = study.id;

    const added = await addChapter(studyId, owner.id, {
      name: 'Chapter 2',
      variant: 'xiangqi',
      orientation: 'red',
      root: tree,
    });
    assert.ok(added.ok);
    assert.equal(added.chapter.name, 'Chapter 2');
    assert.equal(added.chapter.ordinal, 1);

    const bad = await addChapter(studyId, stranger.id, {
      name: 'x',
      variant: 'xiangqi',
      orientation: 'red',
      root: tree,
    });
    assert.ok(!bad.ok && bad.error === 'forbidden');

    let full = await getStudyById(studyId);
    assert.equal(full?.chapters.length, 2);

    const renamed = await renameChapter(added.chapter.id, owner.id, 'Renamed');
    assert.ok(renamed.ok && renamed.chapter.name === 'Renamed');

    const gb = await setChapterGamebook(added.chapter.id, owner.id, true);
    assert.ok(gb.ok && gb.chapter.gamebook === true);
    const gbBad = await setChapterGamebook(added.chapter.id, stranger.id, false);
    assert.ok(!gbBad.ok && gbBad.error === 'forbidden');

    assert.ok((await deleteChapter(added.chapter.id, owner.id)).ok);
    full = await getStudyById(studyId);
    assert.equal(full?.chapters.length, 1);

    // The last chapter cannot be deleted — a study always has at least one.
    const lastDel = await deleteChapter(full!.chapters[0]!.id, owner.id);
    assert.ok(!lastDel.ok && lastDel.error === 'last_chapter');
  });

  test('updates study meta (owner only) and cascades on delete', async () => {
    const owner = await makeUser('meta');
    const stranger = await makeUser('meta-stranger');
    const study = await makeStudy(owner.id);
    assert.ok(study);

    const bad = await updateStudyMeta(study.id, stranger.id, { visibility: 'public' });
    assert.ok(!bad.ok && bad.error === 'forbidden');

    const good = await updateStudyMeta(study.id, owner.id, {
      visibility: 'public',
      name: 'Renamed',
    });
    assert.ok(good.ok && good.study.visibility === 'public' && good.study.name === 'Renamed');

    assert.equal(await deleteStudy(study.id, stranger.id), false);
    assert.equal(await deleteStudy(study.id, owner.id), true);
    assert.equal(await getStudyById(study.id), null);
  });
});
