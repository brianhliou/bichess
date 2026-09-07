// The generated per-move comment our own analysis writes onto a judged move, and
// the parser that reads one back.
//
// Lives here, beside practice-catalog.ts and for the same reason, because FOUR
// places need this one sentence to be the same sentence: two study builders write
// it (apps/server seed-xiangqi-champions-study.ts and scripts/world-title-study.mjs),
// the article replay renderer parses it to localize the hover text, and the study
// i18n overlay is keyed to it. When the builder and the reader each carried their
// own copy of the shape, they disagreed: the renderer's pattern required an eval
// of one word, the builder emitted `mate in 4`, and every mate-scored judgment
// fell through to the un-parsed branch and rendered its raw English sentence under
// a Chinese label.
//
// So: the sentence is written by `judgmentComment` and read by
// `parseJudgmentComment`, they are tested against each other, and nothing spells
// it out a third time.

/** The fields a judgment comment is built from, and the fields the parser
 *  recovers from one. `evalText` is already formatted ('+1.12', 'mate in 4', or
 *  '' when the position was never scored); `hasLine` says whether a refutation
 *  branch sits beside the move, because the sentence points at it. */
export type XiangqiJudgment = {
  judgment: string;
  lost: number | string;
  evalText: string;
  hasLine: boolean;
};

export function judgmentComment({ judgment, lost, evalText, hasLine }: XiangqiJudgment): string {
  const evalPart = evalText ? `, eval ${evalText} after` : '';
  const linePart = hasLine ? ' The engine wanted the line in the sibling branch.' : '';
  return `${judgment}: ${lost} win% given up${evalPart}.${linePart}`;
}

/** `mate in 4` is two spaces wide, so the eval cannot be matched as one token —
 *  the alternation is listed first so it wins over the single-token branch. */
const MACHINE_NOTE =
  /^(blunder|mistake|inaccuracy):\s*([\d.]+)\s*win% given up(?:,\s*eval\s*(mate in \d+|\S+?)\s*after)?\.(\s*The engine wanted the line in the sibling branch\.)?$/i;

/**
 * Recover the fields from a comment `judgmentComment` wrote, or null for anything
 * else.
 *
 * Null is the load-bearing half. These chapters carry hand-written prose about the
 * game in the same field as the generated sentence, and a caller that assumed
 * everything was a template would hand a machine translation to the one kind of
 * text that needs a human.
 */
export function parseJudgmentComment(text: string): XiangqiJudgment | null {
  const match = MACHINE_NOTE.exec(text.trim());
  if (!match) return null;
  return {
    judgment: match[1]!.toLowerCase(),
    lost: match[2]!,
    evalText: match[3] ?? '',
    hasLine: Boolean(match[4]),
  };
}
