// Shared guard for the study seeders.
//
// Every study seeder creates its study with a POST, so running one twice used to
// leave two identically named studies behind. That is not hypothetical: the QA
// database accumulated two "The Riverbank Cannon" (2026-08-23, two hours apart)
// and two "橘中秘 卷一" (2026-07-23, three minutes apart), and both rendered as
// duplicate rows in the homepage's Top studies list.
//
// So a seeder now looks before it creates. The default is to SKIP and print the
// existing id, because a study is user-visible content and silently replacing one
// would discard any chapter someone added by hand. `--replace` opts into deleting
// the existing study first, for the case where the corpus itself changed.

export type StudyLookup = {
  /** GET a path with the seeder's session attached. */
  get(path: string): Promise<Response>;
  /** DELETE a path with the seeder's session attached. */
  del(path: string): Promise<Response>;
};

export type ExistingStudy = { id: string; name: string };

/** What the caller should do next. `proceed` means nothing is in the way. */
export type SeedDecision =
  | { action: 'proceed' }
  | { action: 'skip'; existing: ExistingStudy }
  | { action: 'replaced'; existing: ExistingStudy };

/**
 * Look for a study the session's account already owns under `name`.
 *
 * Matching is on the exact name: `?q=` is a search, so it can return near
 * misses, and creating a second "…Vol. 1" because the query also matched
 * "…Vol. 2" is the bug this exists to prevent.
 */
export async function resolveExistingStudy(
  api: StudyLookup,
  name: string,
  options: { replace?: boolean } = {},
): Promise<SeedDecision> {
  const response = await api.get(`/api/studies/mine?q=${encodeURIComponent(name)}`);
  if (!response.ok) {
    // A lookup failure is not a reason to refuse to seed — an older server may
    // not have the route. Say so and let the caller create.
    console.warn(`  lookup for an existing "${name}" failed (${response.status}); creating anyway`);
    return { action: 'proceed' };
  }
  const body = (await response.json()) as { studies?: ExistingStudy[] };
  const existing = (body.studies ?? []).find((study) => study.name === name);
  if (!existing) return { action: 'proceed' };

  if (!options.replace) {
    console.log(`study "${name}" already exists as ${existing.id}; not creating a second copy.`);
    console.log('  pass --replace to delete it and seed fresh.');
    return { action: 'skip', existing };
  }

  // Deleting and recreating gives the study a NEW id. Anything that links to it
  // by id breaks — the Fortress rules article hardcodes /study/<id>, and so does
  // the Riverbank article. Replace the corpus this way only when you are ready to
  // update those links too; otherwise edit the existing study in place.
  console.warn(`  --replace will DELETE ${existing.id} and create a new study with a NEW id.`);
  console.warn('  any article or link pointing at the old id will 404 until updated.');
  const deleted = await api.del(`/api/studies/${existing.id}`);
  if (!deleted.ok) {
    throw new Error(`--replace: deleting study ${existing.id} failed: ${deleted.status}`);
  }
  console.log(`--replace: deleted existing study ${existing.id}`);
  return { action: 'replaced', existing };
}
