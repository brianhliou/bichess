// Bridge between a parsed xiangqi PGN game and a study chapter.
//
// A study chapter is a SerializedTree (see tree-serialize.ts): UCIs plus
// annotations, positions rebuilt by replay. A PGN game is a move tree with
// comments and NAGs. They are the same shape, so this file is a structural
// translation in both directions and holds no board logic of its own — the
// kernel's reader/writer in @mistboard/game does all the notation work.

import {
  parseStandardXiangqiFen,
  parseXiangqiPgn,
  standardXiangqiFen,
  writeXiangqiPgn,
  type XiangqiGameState,
  type XiangqiMove,
  type XiangqiNotationStyle,
  type XiangqiPgnGame,
  type XiangqiPgnNode,
  type XiangqiPgnResult,
  xiangqiMoveToFsfUci,
  xiangqiPgnPlayers,
} from '@mistboard/game';
import type { NodeAnnotations, NodeComment } from './game-tree.js';
import type { SerializedNode, SerializedTree } from './tree-serialize.js';

/** One importable chapter: the tree to store plus the name to store it under. */
export interface XiangqiPgnChapter {
  name: string;
  root: SerializedTree;
  /** Mainline ply count, for the import summary. */
  plyCount: number;
  /** Set when the game only partly read; the chapter still holds what did. */
  warning?: string;
}

export interface XiangqiPgnImport {
  chapters: XiangqiPgnChapter[];
  /** Games we could not read at all, with the reason, so the dialog can say
   *  which ones were skipped instead of silently importing fewer. */
  skipped: { name: string; reason: string }[];
}

/** Parse PGN text into chapter-ready trees. Never throws. */
export function importXiangqiPgnChapters(text: string): XiangqiPgnImport {
  const chapters: XiangqiPgnChapter[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const games = parseXiangqiPgn(text);
  games.forEach((game, index) => {
    const name = chapterName(game, index, games.length);
    // A game with no readable moves AND no start position is nothing at all;
    // one with a [FEN] but no moves is a legitimate position-only chapter.
    if (game.error && game.children.length === 0 && !game.tags.FEN) {
      skipped.push({ name, reason: game.error });
      return;
    }
    chapters.push({
      name,
      root: toSerializedTree(game),
      plyCount: game.plyCount,
      ...(game.error ? { warning: game.error } : {}),
    });
  });
  return { chapters, skipped };
}

/** Name a chapter from its tags, the way a reader would name it themselves:
 *  the players if it has them, else the event, else a positional fallback. */
function chapterName(game: XiangqiPgnGame, index: number, total: number): string {
  const { red, black } = xiangqiPgnPlayers(game.tags);
  if (red && black) {
    const event = game.tags.Event?.trim();
    const heading = `${red} - ${black}`;
    return event && event !== '?' ? `${heading} (${event})` : heading;
  }
  const event = game.tags.Event?.trim();
  if (event && event !== '?') return event;
  return total > 1 ? `Game ${index + 1}` : 'Imported game';
}

function toSerializedTree(game: XiangqiPgnGame): SerializedTree {
  const root: SerializedNode = {
    children: game.children.map(toSerializedNode),
  };
  const rootComment = annotationsFor(game.comment, []);
  if (rootComment) root.annotations = rootComment;
  const fen = game.tags.FEN?.trim();
  // Store the CANONICAL spelling, not the file's, so the chapter loader and the
  // exporter agree on the position (same posture as the study root elsewhere).
  const parsed = fen ? parseStandardXiangqiFen(fen, 'pgn-import') : null;
  return {
    version: 1,
    root,
    ...(parsed?.ok ? { rootFen: standardXiangqiFen(parsed.state) } : {}),
  };
}

function toSerializedNode(node: XiangqiPgnNode): SerializedNode {
  const out: SerializedNode = {
    uci: xiangqiMoveToFsfUci(node.move),
    children: node.children.map(toSerializedNode),
  };
  const annotations = annotationsFor(node.comment, node.nags);
  if (annotations) out.annotations = annotations;
  return out;
}

function annotationsFor(
  comment: string | undefined,
  nags: readonly number[],
): NodeAnnotations | undefined {
  const comments: NodeComment[] = comment ? [{ text: comment }] : [];
  if (comments.length === 0 && nags.length === 0) return undefined;
  return {
    ...(comments.length > 0 ? { comments } : {}),
    ...(nags.length > 0 ? { glyphs: [...nags] } : {}),
  };
}

// --- export -------------------------------------------------------------------

export interface XiangqiPgnExportMeta {
  event?: string;
  red?: string;
  black?: string;
  result?: XiangqiPgnResult;
  date?: string;
}

/** Render a stored chapter tree back to PGN text. Nodes whose UCI no longer
 *  replays are dropped, the same degradation the chapter loader applies. */
export function exportXiangqiPgnChapter(
  tree: SerializedTree,
  meta: XiangqiPgnExportMeta = {},
  style: XiangqiNotationStyle = 'coordinate',
): string {
  const parsed = tree.rootFen ? parseStandardXiangqiFen(tree.rootFen, 'pgn-export') : null;
  const start: XiangqiGameState | undefined = parsed?.ok ? parsed.state : undefined;
  const tags: Record<string, string> = {};
  if (meta.event) tags.Event = meta.event;
  if (meta.red) tags.Red = meta.red;
  if (meta.black) tags.Black = meta.black;
  if (meta.date) tags.Date = meta.date;
  return writeXiangqiPgn(
    {
      tags,
      ...(meta.result ? { result: meta.result } : {}),
      ...(start ? { initialState: start } : {}),
      children: toPgnNodes(tree.root.children),
      ...(rootComment(tree.root) ? { comment: rootComment(tree.root) } : {}),
    },
    { style },
  );
}

function rootComment(node: SerializedNode): string | undefined {
  return node.annotations?.comments?.[0]?.text;
}

function toPgnNodes(nodes: readonly SerializedNode[]): XiangqiPgnNode[] {
  const out: XiangqiPgnNode[] = [];
  for (const node of nodes) {
    const move = uciToMove(node.uci);
    if (!move) continue;
    out.push({
      move,
      token: node.uci ?? '',
      ...(rootComment(node) ? { comment: rootComment(node) } : {}),
      nags: node.annotations?.glyphs ?? [],
      children: toPgnNodes(node.children),
    });
  }
  return out;
}

// FSF UCI for xiangqi is a plain square pair (files a-i, ranks 1-10), so the
// split is at the boundary between the first square's rank and the next file.
function uciToMove(uci: string | undefined): XiangqiMove | null {
  if (!uci) return null;
  const match = /^([a-i](?:10|[1-9]))([a-i](?:10|[1-9]))$/.exec(uci);
  if (!match) return null;
  return { from: match[1], to: match[2] } as XiangqiMove;
}

// --- whole-study export --------------------------------------------------------

export interface XiangqiPgnStudyChapter {
  name: string;
  root: SerializedTree;
}

/** The whole study as one multi-game PGN, one game per chapter. That is the
 *  shape lichess exports, and the shape our own reader splits back apart. */
export function buildStudyPgn(
  studyName: string,
  chapters: readonly XiangqiPgnStudyChapter[],
): string {
  return chapters
    .map((chapter) =>
      exportXiangqiPgnChapter(chapter.root, { event: `${studyName}: ${chapter.name}` }),
    )
    .join('\n');
}

/** Hand the reader a .pgn file. Object URL rather than a data: URI so a large
 *  study does not have to fit in a URL. */
export function downloadStudyPgn(
  studyName: string,
  chapters: readonly XiangqiPgnStudyChapter[],
): void {
  const blob = new Blob([buildStudyPgn(studyName, chapters)], {
    type: 'application/x-chess-pgn',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFileName(studyName)}.pgn`;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke on the next turn: revoking synchronously races the download start in
  // WebKit, which reads the blob after the click handler returns.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function safeFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^\w一-鿿 -]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return cleaned.length > 0 ? cleaned : 'study';
}
