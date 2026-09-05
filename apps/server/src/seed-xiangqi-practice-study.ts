/**
 * Seed the basic-endgame corpus as a PRACTICE study: one chapter per verdict,
 * rooted at the corpus position, with a goal and no solution line.
 *
 * The difference from seed-xiangqi-endgame-study.ts is the whole point of the
 * surface. That seeder writes the engine's winning line into the chapter as a
 * mainline you can click through. This one writes no moves at all — the chapter
 * is a position plus "Checkmate" or "Hold the draw", and the engine plays the
 * defence when a learner opens it. Nothing here has to be authored per exercise,
 * which is why 32 exercises cost one run instead of 32 sittings.
 *
 * Goal choice follows the verdict, and it is NOT symmetrical:
 *   win  -> `mate`. A book win is already winning at move one, so "reach +600"
 *           would be satisfied before the learner touched a piece. The exercise
 *           is to CONVERT, and only a delivered mate proves that.
 *   draw -> `draw`. Unbounded: holding level is the exercise, and it ends when
 *           the learner stops or the evaluation leaves the band.
 *
 * Seeds FIVE studies, one per piece family, each slugged so the /practice
 * catalogue can point at it across re-seeds and renames.
 *
 * Local dev (server on 3001), signing itself in with the dev auth code:
 *   npx tsx apps/server/src/seed-xiangqi-practice-study.ts --email you@example.com
 *
 * Production, with a session you already established in your own browser:
 *   MISTBOARD_SESSION_COOKIE='mistboard_session=...' \
 *     npx tsx apps/server/src/seed-xiangqi-practice-study.ts \
 *       --base https://mistboard.com --visibility public
 *
 * Copy that cookie out of your own devtools and run this yourself. It is a live
 * credential: read from the environment, never logged, and it must not be pasted
 * anywhere it would be recorded. The account must be an ADMIN, because setting a
 * curated slug is an admin write.
 *
 * `--dry-run` needs no credentials and prints the split.
 */
import {
  type EndgameCategory,
  type EndgameEntry,
  endgameEntryFen,
  XIANGQI_ENDGAME_CORPUS,
} from '@mistboard/game';

const DEFAULT_BASE = 'http://127.0.0.1:3001';

/**
 * One study PER PIECE FAMILY rather than one study of 32 chapters.
 *
 * The corpus already carries the split in its `category` field, so this costs a
 * groupBy and nothing else -- and it is what makes the /practice index read as a
 * shelf rather than a single link. lichess divides the same way ("Pawn Endgames",
 * "Rook Endgames"), for the same reason: a card is a sitting, and 32 exercises is
 * not a sitting.
 *
 * `slug` is the catalogue's handle on the study (migration 132). It never changes,
 * which is the point: re-seeding mints new study ids and renaming changes names,
 * and either would silently empty a section of the index.
 */
const SETS: {
  slug: string;
  categories: EndgameCategory[];
  name: string;
  description: string;
}[] = [
  {
    slug: 'endgames-soldier',
    categories: ['soldier'],
    name: 'Soldier endgames',
    description:
      'What a lone soldier can finish and what it cannot. A soldier never moves backwards, which is why some of these are wins and some are not.',
  },
  {
    slug: 'endgames-chariot',
    categories: ['chariot'],
    name: 'Chariot endgames',
    description:
      'The chariot is the one piece that wins on its own. These are the positions where technique still decides it.',
  },
  {
    slug: 'endgames-horse',
    categories: ['horse'],
    name: 'Horse endgames',
    description:
      'The horse is slow and its leg can be blocked. Converting with one is a question of timing.',
  },
  {
    slug: 'endgames-cannon',
    categories: ['cannon', 'horse-and-cannon'],
    name: 'Cannon endgames',
    description:
      "A cannon needs something to fire over, so a bare board is the defender's friend. Includes the horse-and-cannon pairings.",
  },
  {
    slug: 'endgames-insufficient',
    categories: ['insufficient'],
    name: 'Not enough to win',
    description:
      'Material that cannot force mate however it is arranged. Hold the draw; the point is knowing these are draws.',
  },
];

type Visibility = 'public' | 'unlisted' | 'private';

/** The goal text for an entry, in the grammar parsePracticeGoal accepts. */
export function practiceGoalFor(entry: EndgameEntry): string {
  return entry.verdict === 'win' ? 'mate' : 'draw';
}

/**
 * The row label in the chapter rail.
 *
 * Deliberately NOT "<attacker> beats <defender>". That phrasing did two things
 * wrong at once: it put the ANSWER in the title of an exercise whose whole
 * question is whether the position wins, and it made every row long enough to be
 * truncated in the rail. lichess's rows read "Exploit the pin #3" -- short enough
 * to be read at a glance, and silent about the result.
 *
 * The matchup alone is the useful label; the verdict is the goal, and the goal is
 * stated under the board once the exercise is open.
 */
export function practiceChapterName(entry: EndgameEntry): string {
  return `${entry.attacker} vs ${entry.defender}`;
}

export function practiceChapterBody(entry: EndgameEntry): Record<string, unknown> {
  return {
    name: practiceChapterName(entry),
    variant: 'xiangqi',
    // The learner plays the side with something to prove, NOT whoever happens to
    // move first. In this corpus the attacker is always Red, so:
    //   win  -> Red, and the exercise is to convert it
    //   draw -> BLACK, and the exercise is to hold it
    // Orienting to `entry.turn` (Red on 31 of 32 entries) handed the learner the
    // attacking side of a drawn endgame and told them to hold the draw -- a side
    // that cannot lose being asked not to lose. An exercise that opens on the
    // other side's move is fine; the runner plays that reply before handing over.
    orientation: entry.verdict === 'win' ? 'red' : 'black',
    root: {
      version: 1,
      rootFen: endgameEntryFen(entry),
      // Deliberately childless: a practice chapter carries no solution, and a
      // mainline here would be dead weight the player never reads.
      root: {
        annotations: {
          comments: [{ text: entry.note ?? practiceChapterName(entry) }],
        },
        children: [],
      },
    },
  };
}

class Session {
  private cookie = '';
  constructor(private readonly base: string) {}

  async post(path: string, body: unknown): Promise<Response> {
    const response = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body: JSON.stringify(body),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0] ?? this.cookie;
    return response;
  }

  /** Adopt a session established elsewhere (a real browser login), for prod.
   *  Read from the environment and never logged: it is a live credential. */
  useCookie(cookie: string): void {
    this.cookie = cookie;
  }

  async put(path: string, body: unknown): Promise<Response> {
    return fetch(`${this.base}${path}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  async patch(path: string, body: unknown): Promise<Response> {
    return fetch(`${this.base}${path}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  async signIn(email: string): Promise<void> {
    const start = await this.post('/api/auth/email/start', { email });
    if (!start.ok) throw new Error(`auth start failed: ${start.status} ${await start.text()}`);
    const started = (await start.json()) as { loginId?: string; devCode?: string };
    if (!started.loginId || !started.devCode) {
      throw new Error(
        'auth start did not return a dev code. This seeder only works against a dev server.',
      );
    }
    const confirm = await this.post('/api/auth/email/confirm', {
      loginId: started.loginId,
      code: started.devCode,
    });
    if (!confirm.ok) {
      throw new Error(`auth confirm failed: ${confirm.status} ${await confirm.text()}`);
    }
  }
}

function parseArgs(): {
  email: string | null;
  cookie: string | null;
  base: string;
  visibility: Visibility;
  dryRun: boolean;
} {
  const argv = process.argv.slice(2);
  const read = (flag: string): string | null => {
    const at = argv.indexOf(flag);
    return at === -1 ? null : (argv[at + 1] ?? null);
  };
  const visibility = (read('--visibility') ?? 'public') as Visibility;
  return {
    email: read('--email'),
    // Never a flag: a credential passed on the command line lands in shell
    // history and in any process listing.
    cookie: process.env.MISTBOARD_SESSION_COOKIE ?? null,
    base: read('--base') ?? DEFAULT_BASE,
    visibility,
    dryRun: argv.includes('--dry-run'),
  };
}

async function main(): Promise<void> {
  const args = parseArgs();

  const setsWithEntries = SETS.map((set) => ({
    ...set,
    entries: XIANGQI_ENDGAME_CORPUS.filter((entry) => set.categories.includes(entry.category)),
  }));

  // Every corpus entry must land in exactly one set. A category added to the
  // corpus and not to SETS would otherwise vanish from the index silently, which
  // is the failure a curated shelf hides best and suffers most.
  const placed = new Set(setsWithEntries.flatMap((set) => set.entries.map((e) => e.id)));
  const orphans = XIANGQI_ENDGAME_CORPUS.filter((entry) => !placed.has(entry.id));
  if (orphans.length > 0) {
    throw new Error(
      `these corpus entries belong to no set (add their category to SETS): ${orphans
        .map((entry) => `${entry.id} [${entry.category}]`)
        .join(', ')}`,
    );
  }

  if (args.dryRun) {
    for (const set of setsWithEntries) {
      console.log(`${set.slug.padEnd(24)} ${String(set.entries.length).padStart(2)} exercises`);
      for (const entry of set.entries) {
        console.log(`    ${entry.id.padEnd(38)} ${practiceGoalFor(entry)}`);
      }
    }
    console.log(`\n${setsWithEntries.length} studies, ${placed.size} exercises (dry run)`);
    return;
  }

  const session = new Session(args.base);
  if (args.cookie) session.useCookie(args.cookie);
  else if (args.email) await session.signIn(args.email);
  else throw new Error('pass --email (dev) or set MISTBOARD_SESSION_COOKIE (prod), or --dry-run');

  for (const set of setsWithEntries) {
    const first = set.entries[0];
    if (!first) throw new Error(`set ${set.slug} has no entries`);

    const created = await session.post('/api/studies', {
      name: set.name,
      description: set.description,
      visibility: args.visibility,
      chapter: practiceChapterBody(first),
    });
    if (!created.ok) {
      throw new Error(`create ${set.slug} failed: ${created.status} ${await created.text()}`);
    }
    // `chapters` is a SIBLING of `study` in the create response, not nested.
    const { study, chapters } = (await created.json()) as {
      study: { id: string };
      chapters: { id: string }[];
    };

    const slugged = await session.put(`/api/admin/studies/${study.id}/slug`, { slug: set.slug });
    if (!slugged.ok) {
      throw new Error(
        `slug ${set.slug} failed: ${slugged.status} ${await slugged.text()} ` +
          '(the account must be an admin; the slug is what /practice points at)',
      );
    }

    const firstChapterId = chapters[0]?.id;
    if (!firstChapterId) throw new Error(`created ${set.slug} has no chapter`);
    await flagPractice(session, study.id, firstChapterId, first);

    for (const entry of set.entries.slice(1)) {
      const response = await session.post(
        `/api/studies/${study.id}/chapters`,
        practiceChapterBody(entry),
      );
      if (!response.ok) {
        throw new Error(
          `add chapter ${entry.id} failed: ${response.status} ${await response.text()}`,
        );
      }
      const { chapter } = (await response.json()) as { chapter: { id: string } };
      await flagPractice(session, study.id, chapter.id, entry);
    }

    console.log(`${set.slug}: ${study.id} (${set.entries.length} exercises)`);
  }

  console.log(`\n${setsWithEntries.length} practice studies seeded. /practice will list them.`);
}

/** Practice mode is a separate PATCH: the flag and its goal validate together. */
async function flagPractice(
  session: Session,
  studyId: string,
  chapterId: string,
  entry: EndgameEntry,
): Promise<void> {
  const response = await session.patch(`/api/studies/${studyId}/chapters/${chapterId}`, {
    practice: true,
    practiceGoal: practiceGoalFor(entry),
  });
  if (!response.ok) {
    throw new Error(
      `practice flag failed for ${entry.id}: ${response.status} ${await response.text()}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
