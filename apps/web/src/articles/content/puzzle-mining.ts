import type { Article } from '../types.js';

// How the xiangqi puzzle miner works, written for developers. Every number in
// the prose comes from the two production runs that built the current corpus:
// xqpmr_98895c1e2387dfdb6a886ad9 (1,000 games) and
// xqpmr_d057075a5881ac85a879a776 (2,500 games), published 2026-08-23. The
// funnel counts are the candidate rows of those two runs; the motif counts come
// from deriveXiangqiPuzzleDifficulty over all 1,605 served puzzles. Threshold
// values are the frozen scan/audit profiles pinned on those runs, so they are
// the numbers that actually produced this corpus rather than current defaults.
export const puzzleMiningArticle: Article = {
  slug: 'how-puzzle-mining-works',
  kind: 'article',
  publisher: 'mistboard',
  title: "89% of blunders don't make puzzles",
  seoTitle: 'How Mistboard mines xiangqi puzzles from real games',
  summary:
    'Mistboard ran 3,500 real xiangqi games through Pikafish looking for tactics. It found 10,503 blunders and published 1,211 of them. The reasons the other 9,292 were thrown out turn out to be a working definition of what a puzzle is.',
  status: 'draft',
  publishedAt: '2026-08-23',
  audience:
    'Developers curious how an automated puzzle pipeline decides what counts as a puzzle, and players who want to know where the puzzles on this site come from.',
  boardFamily: 'xiangqi',
  intro: [
    {
      kind: 'paragraph',
      text: 'I ran 3,500 real xiangqi games through an engine looking for tactics. It found **10,503 moments where somebody blundered**. I published 1,211 of them.',
    },
    {
      kind: 'paragraph',
      text: 'The other 9,292 are the interesting part, because the reasons they got thrown out are a working definition of what a puzzle is.',
    },
  ],
  sections: [
    {
      heading: 'What happens to one game',
      blocks: [
        {
          kind: 'paragraph',
          text: 'A game arrives as a list of moves. The miner replays it and stops at every position after ply 8, asking Pikafish for its top two moves at 60,000 nodes. That is a shallow look, roughly depth 10 to 14, and it is shallow on purpose: this pass runs over every position of every game, so it has to be cheap.',
        },
        {
          kind: 'paragraph',
          text: 'A position becomes a candidate when two things are true at once. The move actually played loses at least 250 centipawns against the engine’s best, and the position it leaves behind is winning by at least 250 centipawns for the other side. A blunder that leaves the game merely equal is not a puzzle. There is nothing to find.',
        },
        {
          kind: 'paragraph',
          text: 'Two more filters run here. Positions already decided by 800 centipawns are skipped, because taking a won game and winning it more is not a tactic. And no game contributes more than three candidates, which stops one collapse from flooding the corpus with variations on itself.',
        },
        {
          kind: 'paragraph',
          text: 'Across 3,500 games that yields 10,503 candidates. Three per game, give or take. Human beings blunder a lot.',
        },
      ],
    },
    {
      heading: 'The first gate: is there exactly one answer',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Now it gets expensive. Each candidate goes back to the engine at depth 20 and 600,000 nodes, ten times the scan budget, and the position is handed over as a bare FEN with no move history attached. Same position, no context, so the engine cannot lean on the search it just did.',
        },
        {
          kind: 'paragraph',
          text: 'The line extends one solver move at a time and stops the moment the best move stops being clearly best. The test is on win rate rather than raw centipawns: the top move has to be above 0.8, the runner-up below 0.6, and the gap at least 200 centipawns. Fail any of those and the line ends there.',
        },
        {
          kind: 'paragraph',
          text: 'Then the surviving line has to be between 3 and 7 plies, always ending on the solver’s move, and it gets replayed through the actual xiangqi rules engine to confirm it is legal from first move to last.',
        },
        {
          kind: 'table',
          headers: ['Outcome', 'Candidates'],
          rows: [
            ['Found by the scan', '10,503'],
            ['Rejected: near-tie', '3,667'],
            ['Rejected: too short', '3,320'],
            ['Rejected: mate never arrived', '1,288'],
            ['Rejected: not unique, or not winning', '934'],
            ['Survived to the audit', '1,294'],
          ],
          highlightRows: [1],
          caption: 'Where candidates died, across both production runs.',
        },
        {
          kind: 'paragraph',
          text: '**Near-tie is the big one.** In 3,667 positions the player had a winning move and so did something else. Both work. There is no answer to check against, so there is no puzzle, even though the blunder was real and the position is genuinely won.',
        },
        {
          kind: 'paragraph',
          text: '**Too short** is 3,320 more. The win existed but took one obvious move: hang a chariot, lose a chariot. True, and worth nothing to a solver.',
        },
        {
          kind: 'paragraph',
          text: 'Between them that is two thirds of everything found.',
        },
      ],
    },
    {
      heading: 'The second gate: ask again, differently',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The 1,294 survivors go to a separate audit. Different worker, different process, depth 22 with no node ceiling, and no knowledge of what the first pass decided. It re-validates the puzzle against the rules engine, then re-checks uniqueness at every solver move in the line rather than just the first.',
        },
        {
          kind: 'paragraph',
          text: '80 puzzles failed here. 45 because a follow-up move deeper in the line turned out to have two answers, and 34 because the deeper search simply disagreed that the position was won.',
        },
        {
          kind: 'paragraph',
          text: 'That is a 6% disagreement rate between two runs of the same engine at different depths, on positions the first pass had already cleared. Worth having.',
        },
      ],
    },
    {
      heading: "What's left",
      blocks: [
        {
          kind: 'paragraph',
          text: '1,211 puzzles from 3,500 games. Roughly one per three games, and one for every nine blunders found. The corpus now serves 1,605 standard xiangqi puzzles, each carrying the game it came from and the exact ply where somebody went wrong.',
        },
        {
          kind: 'paragraph',
          text: 'Two things fell out of the finished set that I did not expect.',
        },
        {
          kind: 'paragraph',
          text: '**Two thirds of them open with a move that captures nothing.** 1,052 of 1,605. If you hunt for tactics by scanning the captures first, which is what most of us do, you are looking at the wrong third of the board most of the time.',
        },
        {
          kind: 'paragraph',
          text: '**Only 10% involve giving material away.** Sacrifices are the tactics people remember, so I had assumed they would be a larger slice. In real games between real players, the winning move is usually just a move.',
        },
      ],
    },
    {
      heading: 'The definition that falls out',
      blocks: [
        {
          kind: 'paragraph',
          text: 'A puzzle is not a position you are winning. Most winning positions have several winning moves, and that is exactly what disqualifies them: 3,667 of mine died on that alone. A puzzle is a position with one answer, deep enough that finding it takes work, and stable enough that a stronger engine still agrees an hour later.',
        },
        {
          kind: 'paragraph',
          text: 'That is a much narrower thing than a mistake. Nine out of ten mistakes do not qualify.',
        },
        {
          kind: 'cta',
          buttons: [
            { label: 'Solve xiangqi puzzles', href: '/puzzles', emphasis: 'primary' },
          ],
          layout: 'single-row',
        },
      ],
    },
  ],
};
