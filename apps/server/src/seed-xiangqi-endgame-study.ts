/**
 * Seed the basic-endgame corpus into a Mistboard study: one chapter per verdict,
 * each rooted at the corpus position with the engine's winning line as the
 * mainline and the verdict written into the root comment.
 *
 * A study is the right home for this material because endgames want a board you
 * can push pieces on. The reference page states that three soldiers beat the
 * full defence; the study lets you try to prove it and fail.
 *
 * The principal variation is REPLAYED through the real kernel before it is
 * written, and truncated at the first move that does not typecheck as legal, so
 * a chapter can never carry a line the board would reject on load.
 *
 * Usage (local dev, server on 3001):
 *   npx tsx apps/server/src/verify-xiangqi-endgames.ts --json /tmp/verify.json
 *   npx tsx apps/server/src/seed-xiangqi-endgame-study.ts \
 *     --json /tmp/verify.json --email you@example.com [--base http://127.0.0.1:3001] \
 *     [--visibility public|unlisted|private] [--dry-run]
 *
 * Against a REAL server there is no dev code to read, so `--email` cannot work
 * and this script will not try to reach an inbox. Supply an already-established
 * session instead and it skips sign-in entirely:
 *
 *   MISTBOARD_SESSION_COOKIE='mistboard_session=...' \
 *     npx tsx apps/server/src/seed-xiangqi-endgame-study.ts \
 *       --json /tmp/verify.json --base https://mistboard.com --visibility public
 *
 * Copy that cookie out of your own browser's devtools and run this yourself.
 * The value is a live credential: it is read from the environment, never
 * logged, and must not be pasted anywhere it would be recorded.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  applyStandardXiangqiMove,
  type EndgameEntry,
  endgameEntryFen,
  endgameEntryState,
  isStandardXiangqiLegalMove,
  XIANGQI_ENDGAME_CORPUS,
  type XiangqiGameState,
  type XiangqiMove,
} from '@mistboard/game';
import { resolveExistingStudy } from './seed-study-idempotency.js';
import {
  ENDGAME_STUDY_I18N,
  ENDGAME_STUDY_LANGS,
  localizedChapterName,
  localizedRootComment,
} from './xiangqi-endgame-study-i18n.js';

type VerifyRow = {
  id: string;
  cp: number | null;
  mate: number | null;
  depth: number;
  pv: string[];
  read: string;
  agrees: boolean;
  expected: boolean;
  unresolved: boolean;
};

type SerializedNode = {
  uci?: string;
  // `i18n` rides on the comment itself inside the tree, which is where
  // study-i18n.ts reads per-node comment translations from.
  annotations?: { comments?: { text: string; i18n?: Record<string, string> }[] };
  children: SerializedNode[];
};

/** Per-locale overrides for a study or chapter, in the shape migration 115 stores. */
type I18nOverlay = Record<string, { name?: string; description?: string }>;

// Long enough to carry a mate in 15 to its end; past that a study chapter stops
// being readable and the reader should be moving pieces themselves.
const MAX_PV_PLIES = 40;

function parseArgs(): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg?.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

/** Replay the engine's line through the kernel, keeping only the legal prefix. */
function legalPrefix(entry: EndgameEntry, pv: readonly string[]): XiangqiMove[] {
  let state: XiangqiGameState = endgameEntryState(entry);
  const kept: XiangqiMove[] = [];
  for (const uci of pv.slice(0, MAX_PV_PLIES)) {
    if (state.status.type !== 'playing') break;
    const match = /^([a-i](?:10|[1-9]))([a-i](?:10|[1-9]))$/.exec(uci);
    if (!match) break;
    const move = { from: match[1], to: match[2] } as XiangqiMove;
    if (!isStandardXiangqiLegalMove(state, move)) break;
    state = applyStandardXiangqiMove(state, move);
    kept.push(move);
  }
  return kept;
}

function scoreText(row: VerifyRow | undefined): string {
  if (!row) return 'not checked';
  if (row.mate != null && row.mate !== 0) {
    return row.mate > 0 ? `mate in ${row.mate}` : `mated in ${-row.mate}`;
  }
  if (row.cp == null) return 'no score';
  return `${row.cp > 0 ? '+' : ''}${(row.cp / 100).toFixed(1)}`;
}

/** The teaching text a reader lands on when the chapter opens. */
function rootComment(entry: EndgameEntry, row: VerifyRow | undefined, plies: number): string {
  const verdict = entry.verdict === 'win' ? 'Red wins.' : 'Draw.';
  const parts = [`${entry.attacker} versus ${entry.defender}. ${verdict}`];
  if (entry.note) parts.push(entry.note);
  if (entry.engineDispute) {
    parts.push(`Engine disputes this verdict. ${entry.engineDispute}`);
  }
  if (row) {
    parts.push(
      `Pikafish at depth ${row.depth}: ${scoreText(row)}.` +
        (plies > 0 ? ` The mainline below is its line, ${plies} plies deep.` : ''),
    );
  }
  parts.push(
    entry.provenance === 'diagram'
      ? 'Position as diagrammed by the source.'
      : 'Position built to represent the class, not taken from a source diagram.',
  );
  return parts.join('\n\n');
}

function chapterName(entry: EndgameEntry): string {
  const name = `${entry.attacker} vs ${entry.defender}`;
  return name.length > 80 ? `${name.slice(0, 77)}...` : name;
}

function chapterPayload(entry: EndgameEntry, row: VerifyRow | undefined) {
  const moves = legalPrefix(entry, row?.pv ?? []);
  // children[0] is the mainline, so the line nests one node per ply. Build it
  // from the tail backwards: each move wraps the node that follows it.
  let child: SerializedNode | null = null;
  for (const move of [...moves].reverse()) {
    child = { uci: `${move.from}${move.to}`, children: child ? [child] : [] };
  }
  const chain = child ? [child] : [];

  // Both overlays are built per locale and omitted when the dictionary cannot
  // render the whole string, so a chapter is never half English and half
  // Chinese — it either localizes completely or stays in the base language.
  const chapterI18n: I18nOverlay = {};
  const commentI18n: Record<string, string> = {};
  for (const lang of ENDGAME_STUDY_LANGS) {
    const name = localizedChapterName(entry, lang);
    if (name) chapterI18n[lang] = { name };
    const comment = localizedRootComment(entry, row, moves.length, lang);
    if (comment) commentI18n[lang] = comment;
  }

  return {
    name: chapterName(entry),
    variant: 'xiangqi' as const,
    orientation: 'red' as const,
    ...(Object.keys(chapterI18n).length > 0 ? { i18n: chapterI18n } : {}),
    root: {
      version: 1 as const,
      rootFen: endgameEntryFen(entry),
      root: {
        annotations: {
          comments: [
            {
              text: rootComment(entry, row, moves.length),
              ...(Object.keys(commentI18n).length > 0 ? { i18n: commentI18n } : {}),
            },
          ],
        },
        children: chain,
      },
    },
  };
}

/** The create-study body, shared by the poster and by --emit. */
const STUDY_NAME = 'Xiangqi basic endgames: what wins and what draws';

function studyCreateBody(visibility: string, chapter: unknown): Record<string, unknown> {
  return {
    name: STUDY_NAME,
    description:
      'The book verdicts of the basic endgames, each rooted at a representative position with Pikafish’s line as the mainline. Play them out against the engine rather than taking the verdict on trust. Where the verdicts come from, how they were checked, and the two the engine refused to confirm until a tablebase settled them: https://brianhliou.com/posts/xiangqi-basic-endgames/',
    i18n: ENDGAME_STUDY_I18N,
    visibility,
    chapter,
  };
}

class Session {
  private cookie = '';

  constructor(private readonly base: string) {}

  /** Adopt a session established elsewhere (a real browser login). */
  useCookie(cookie: string): void {
    this.cookie = cookie;
  }

  async get(path: string): Promise<Response> {
    return fetch(`${this.base}${path}`, {
      headers: { ...(this.cookie ? { cookie: this.cookie } : {}) },
    });
  }

  async del(path: string): Promise<Response> {
    return fetch(`${this.base}${path}`, {
      method: 'DELETE',
      headers: { ...(this.cookie ? { cookie: this.cookie } : {}) },
    });
  }

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

  async signIn(email: string): Promise<void> {
    const start = await this.post('/api/auth/email/start', { email });
    if (!start.ok) throw new Error(`auth start failed: ${start.status} ${await start.text()}`);
    const started = (await start.json()) as { loginId?: string; devCode?: string };
    if (!started.loginId || !started.devCode) {
      throw new Error(
        'auth start did not return a dev code. This seeder only works against a dev server ' +
          'with dev auth codes enabled; it will not attempt to read a real inbox.',
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

async function main(): Promise<void> {
  const args = parseArgs();
  const base = typeof args.base === 'string' ? args.base : 'http://127.0.0.1:3001';
  const jsonPath = typeof args.json === 'string' ? args.json : null;
  const email = typeof args.email === 'string' ? args.email : null;
  const visibility = typeof args.visibility === 'string' ? args.visibility : 'public';
  const dryRun = args['dry-run'] === true;

  const rows: VerifyRow[] = jsonPath
    ? (JSON.parse(readFileSync(jsonPath, 'utf8')) as VerifyRow[])
    : [];
  const byId = new Map(rows.map((row) => [row.id, row]));

  const chapters = XIANGQI_ENDGAME_CORPUS.map((entry) => chapterPayload(entry, byId.get(entry.id)));
  const withLines = chapters.filter((chapter) => chapter.root.root.children.length > 0).length;
  console.log(
    `${chapters.length} chapters prepared, ${withLines} with an engine mainline` +
      (rows.length === 0 ? ' (no verification JSON given, so positions only)' : ''),
  );

  // Write exactly what would be POSTed, without posting it. Lets the payloads be
  // inspected, diffed, or handed to a client that already holds a session.
  const emitPath = typeof args.emit === 'string' ? args.emit : null;
  if (emitPath) {
    const [firstChapter, ...restChapters] = chapters;
    writeFileSync(
      emitPath,
      JSON.stringify({ study: studyCreateBody(visibility, firstChapter), chapters: restChapters }),
    );
    console.log(`wrote ${chapters.length} chapter payloads to ${emitPath}`);
    return;
  }

  if (dryRun) {
    for (const chapter of chapters) {
      let depth = 0;
      let node = chapter.root.root as SerializedNode;
      while (node.children.length > 0) {
        node = node.children[0] as SerializedNode;
        depth += 1;
      }
      console.log(`  ${chapter.name.padEnd(60)} ${depth} plies`);
    }
    return;
  }

  // A supplied cookie wins over --email: it is the only way to reach a server
  // that does not hand out dev codes, and it means this script never handles a
  // password or an inbox. Never logged — the value is a live session.
  const suppliedCookie = process.env.MISTBOARD_SESSION_COOKIE?.trim();
  if (!suppliedCookie && !email) {
    console.error(
      '--email is required unless --dry-run is set, or set MISTBOARD_SESSION_COOKIE to use an existing session',
    );
    process.exitCode = 1;
    return;
  }

  const session = new Session(base);
  if (suppliedCookie) {
    session.useCookie(suppliedCookie);
    console.log(`using the supplied session at ${base}`);
  } else {
    await session.signIn(email as string);
    console.log(`signed in as ${email} at ${base}`);
  }

  // Do not create a second copy on a re-run (see seed-study-idempotency.ts).
  const decision = await resolveExistingStudy(
    { get: (path) => session.get(path), del: (path) => session.del(path) },
    STUDY_NAME,
    { replace: args.replace === true },
  );
  if (decision.action === 'skip') return;

  const [first, ...rest] = chapters;
  if (!first) return;
  const createResponse = await session.post('/api/studies', studyCreateBody(visibility, first));
  if (!createResponse.ok) {
    throw new Error(`create study failed: ${createResponse.status} ${await createResponse.text()}`);
  }
  const created = (await createResponse.json()) as { study: { id: string } };
  const studyId = created.study.id;
  console.log(`created study ${studyId} (${visibility}) with chapter 1`);

  for (const [index, chapter] of rest.entries()) {
    const response = await session.post(`/api/studies/${studyId}/chapters`, chapter);
    if (!response.ok) {
      throw new Error(
        `add chapter ${index + 2} (${chapter.name}) failed: ${response.status} ${await response.text()}`,
      );
    }
    console.log(`  + chapter ${index + 2}: ${chapter.name}`);
  }

  console.log('');
  console.log(
    `done. ${chapters.length} chapters at ${base.replace(':3001', ':3000')}/study/${studyId}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
