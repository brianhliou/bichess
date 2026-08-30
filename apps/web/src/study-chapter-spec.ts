// Turn a persisted study chapter into a replay spec at runtime.
//
// This conversion already existed once, in scripts/study-chapter-to-article.mjs,
// which bakes constants into an article at authoring time. That is the right
// shape for a published article (a page should not depend on a study still
// existing), and the wrong shape for an embed, whose whole promise is that it
// shows what the study says now. Both call the same logic here rather than
// keeping a second copy that drifts.

import { ASSESSMENT_GLYPH } from './assessment-glyphs.js';
import type { XiangqiReplayAnnotation, XiangqiReplaySpec } from './xiangqi-replay.js';

/** NAG codes as the study stores them, mapped to what the widget renders. */
const GLYPH: Record<number, NonNullable<XiangqiReplayAnnotation['glyph']>> = {
  1: '!',
  2: '?',
  3: '!!',
  4: '??',
  6: '?!',
};

export type StudyTreeNode = {
  uci?: string;
  children?: StudyTreeNode[];
  annotations?: {
    glyphs?: number[];
    comments?: { text?: string }[];
  };
};

export type StudyChapterPayload = {
  id: string;
  name?: string;
  variant?: string;
  orientation?: 'red' | 'black' | string;
  tags?: Record<string, string | undefined>;
  root?: { root?: StudyTreeNode };
};

/**
 * UCI here uses ranks 1-10; ICCS, which the widget parses, uses 0-9. Returns
 * null for anything that is not a plain from+to move so a malformed node
 * truncates the line instead of poisoning the spec.
 */
export function uciToIccs(uci: string): string | null {
  const m = /^([a-i])(\d{1,2})([a-i])(\d{1,2})$/.exec(uci);
  if (!m) return null;
  const fromRank = Number(m[2]) - 1;
  const toRank = Number(m[4]) - 1;
  if (fromRank < 0 || fromRank > 9 || toRank < 0 || toRank > 9) return null;
  return `${m[1]}${fromRank}${m[3]}${toRank}`;
}

/**
 * The FIRST child of a node is the game continuation; any later child is a
 * variation hung off the same parent, which is how an engine refutation is
 * attached and so converts straight back into the line the widget steps.
 */
export function studyChapterToReplaySpec(chapter: StudyChapterPayload): XiangqiReplaySpec | null {
  const mainline: string[] = [];
  const byPly: Record<number, XiangqiReplayAnnotation> = {};
  let node = chapter.root?.root;
  let ply = 0;

  while (node?.children?.length) {
    const played = node.children[0];
    if (!played) break;
    const iccs = played.uci ? uciToIccs(played.uci) : null;
    if (!iccs) break;
    ply += 1;
    mainline.push(iccs);

    const glyph = (played.annotations?.glyphs ?? [])
      .map((code) => GLYPH[code])
      .find((g): g is NonNullable<XiangqiReplayAnnotation['glyph']> => Boolean(g));
    const note = played.annotations?.comments?.[0]?.text;
    const siblings = node.children.slice(1);

    if (glyph || note || siblings.length) {
      const line: string[] = [];
      let variation: StudyTreeNode | undefined = siblings[0];
      // The verdict closes the line, so it sits on the line's LAST node. Walking
      // past it and forgetting it is how a backfilled study still showed its
      // sidelines ending on nothing: the NAGs were stored, and this hop dropped
      // every code outside the 1-6 the GLYPH map above covers.
      let lineEval: string | undefined;
      while (variation?.uci) {
        const step = uciToIccs(variation.uci);
        if (!step) break;
        line.push(step);
        const assessed = (variation.annotations?.glyphs ?? []).find(
          (code) => ASSESSMENT_GLYPH[code] !== undefined,
        );
        lineEval = assessed === undefined ? undefined : ASSESSMENT_GLYPH[assessed];
        variation = variation.children?.[0];
      }
      byPly[ply] = {
        ...(glyph ? { glyph } : {}),
        ...(note ? { note } : {}),
        ...(line.length ? { line: line.join(' ') } : {}),
        ...(lineEval ? { lineEval } : {}),
      };
    }
    node = played;
  }

  if (!mainline.length) return null;
  const tags = chapter.tags ?? {};
  return {
    iccs: mainline.join(' '),
    red: tags.red ?? 'Red',
    black: tags.black ?? 'Black',
    event: tags.event ?? chapter.name ?? '',
    ...(chapter.orientation === 'black' ? { perspective: 'black' as const } : {}),
    resultText: tags.result ?? '*',
    annotations: { byPly },
  };
}
