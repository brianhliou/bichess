/**
 * Seed the basic-endgame corpus as a PRACTICE study: one chapter per verdict,
 * rooted at the corpus position, with a goal and no solution line.
 *
 * The difference from seed-xiangqi-endgame-study.ts is the whole point of the
 * surface. That seeder writes the engine's winning line into the chapter as a
 * mainline you can click through. This one writes no moves at all — the chapter
 * is a position plus "Checkmate" or "Hold the draw", and the engine plays the
 * defence when a learner opens it. Nothing here has to be authored per exercise,
 * which is why 31 chapters cost one run instead of 31 sittings.
 *
 * Goal choice follows the verdict, and it is NOT symmetrical:
 *   win  -> `mate`. A book win is already winning at move one, so "reach +600"
 *           would be satisfied before the learner touched a piece. The exercise
 *           is to CONVERT, and only a delivered mate proves that.
 *   draw -> `draw`. Unbounded: holding level is the exercise, and it ends when
 *           the learner stops or the evaluation leaves the band.
 *
 * Usage (local dev, server on 3001):
 *   npx tsx apps/server/src/seed-xiangqi-practice-study.ts --email you@example.com
 *   [--base http://127.0.0.1:3001] [--visibility public|unlisted|private] [--dry-run]
 *
 * Dev-only: it relies on the dev auth code the local server returns from
 * /api/auth/email/start, and will not try to read a real inbox.
 */
import { type EndgameEntry, endgameEntryFen, XIANGQI_ENDGAME_CORPUS } from '@mistboard/game';

const DEFAULT_BASE = 'http://127.0.0.1:3001';

const STUDY_NAME = 'Xiangqi basic endgames: play them out';
const STUDY_DESCRIPTION =
  'The book endgames, as exercises rather than as claims. Each chapter gives you a ' +
  'position and a goal; the engine defends and tells you when you have let it slip. ' +
  'A win here means converting to mate, not reaching a comfortable evaluation.';

type Visibility = 'public' | 'unlisted' | 'private';

/** The goal text for an entry, in the grammar parsePracticeGoal accepts. */
export function practiceGoalFor(entry: EndgameEntry): string {
  return entry.verdict === 'win' ? 'mate' : 'draw';
}

/** One-line brief shown above the board, so the learner knows the material. */
export function practiceChapterName(entry: EndgameEntry): string {
  return entry.verdict === 'win'
    ? `${entry.attacker} beats ${entry.defender}`
    : `${entry.attacker} does not beat ${entry.defender}`;
}

export function practiceChapterBody(entry: EndgameEntry): Record<string, unknown> {
  return {
    name: practiceChapterName(entry),
    variant: 'xiangqi',
    // The learner always plays the side the position is set up for; for this
    // corpus that is the attacker on a win and the defender on a draw.
    orientation: entry.turn,
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
    base: read('--base') ?? DEFAULT_BASE,
    visibility,
    dryRun: argv.includes('--dry-run'),
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const entries = [...XIANGQI_ENDGAME_CORPUS];

  if (args.dryRun) {
    for (const entry of entries) {
      console.log(`${entry.id.padEnd(34)} ${practiceGoalFor(entry).padEnd(5)} ${entry.turn}`);
    }
    console.log(`\n${entries.length} chapters (dry run, nothing written)`);
    return;
  }

  if (!args.email) throw new Error('--email is required (or pass --dry-run)');

  const session = new Session(args.base);
  await session.signIn(args.email);

  const first = entries[0];
  if (!first) throw new Error('the endgame corpus is empty');

  const created = await session.post('/api/studies', {
    name: STUDY_NAME,
    description: STUDY_DESCRIPTION,
    visibility: args.visibility,
    chapter: practiceChapterBody(first),
  });
  if (!created.ok) {
    throw new Error(`create study failed: ${created.status} ${await created.text()}`);
  }
  // The create response returns `chapters` as a SIBLING of `study`, not nested
  // inside it (routes/studies.ts writes `{ study, chapters }`).
  const { study, chapters } = (await created.json()) as {
    study: { id: string };
    chapters: { id: string }[];
  };

  // Practice mode is a separate PATCH rather than a create field: the flag and
  // its goal are validated together server-side, and doing it here keeps the
  // create path identical to every other chapter.
  const flag = async (chapterId: string, entry: EndgameEntry): Promise<void> => {
    const response = await session.patch(`/api/studies/${study.id}/chapters/${chapterId}`, {
      practice: true,
      practiceGoal: practiceGoalFor(entry),
    });
    if (!response.ok) {
      throw new Error(
        `practice flag failed for ${entry.id}: ${response.status} ${await response.text()}`,
      );
    }
  };

  const firstChapterId = chapters[0]?.id;
  if (!firstChapterId) throw new Error('created study has no chapter');
  await flag(firstChapterId, first);
  console.log(`study ${study.id}: ${first.id}`);

  for (const entry of entries.slice(1)) {
    const response = await session.post(
      `/api/studies/${study.id}/chapters`,
      practiceChapterBody(entry),
    );
    if (!response.ok) {
      throw new Error(
        `add chapter failed for ${entry.id}: ${response.status} ${await response.text()}`,
      );
    }
    const { chapter } = (await response.json()) as { chapter: { id: string } };
    await flag(chapter.id, entry);
    console.log(`  + ${entry.id} (${practiceGoalFor(entry)})`);
  }

  console.log(
    `\n${entries.length} practice chapters at ${args.base.replace(':3001', ':3000')}/study/${study.id}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
