import type { Article, ArticleBlock } from '../types.js';
import {
  PM_EXPLORE_BANDS,
  PM_GATE_LADDER,
  PM_MATE_LANDS,
  PM_PIPELINE,
  PM_QUIET_KEY_MOVE,
  PM_SCAN_LOOP,
  PM_SELECTION,
  PM_UNIQUENESS_GATE,
} from '../puzzle-mining-diagrams.js';

// How the xiangqi puzzle pipeline works end to end, written for developers:
// ingest, mining, publication, then serving. Restructured 2026-08-31 from a
// piece that only covered the middle two.
//
// PIN BEFORE PUBLISHING: the 10,503 candidate total does not reconcile. It is
// internally consistent here (9,209 rejects + 1,294 survivors), but the per-run
// table in docs-private/mining-track.md sums to 11,353 for the same two runs.
// Everything downstream agrees exactly (1,294 verified, 1,214 audit-passed,
// 1,211 published), so the two totals are counting different things, probably
// scan-emitted rows against candidates that reached verify. Re-query the runs
// and correct the figure before this leaves draft.
//
// Every number in the prose comes from the two production runs that built the
// current corpus:
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
  title: 'Where Mistboard’s xiangqi puzzles come from',
  seoTitle: 'How Mistboard mines xiangqi puzzles from real games',
  summary:
    'Mistboard ran 3,500 real xiangqi games through Pikafish looking for tactics. It found 10,503 blunders and published 1,211 of them. Here is the whole pipeline, from a licensed dump of amateur games to the code that decides which puzzle you see next.',
  status: 'draft',
  publishedAt: '2026-09-03',
  audience:
    'Developers curious how an automated puzzle pipeline decides what counts as a puzzle, and players who want to know where the puzzles on this site come from.',
  boardFamily: 'xiangqi',
  intro: [
    {
      kind: 'paragraph',
      text: 'Lichess mines its own games for puzzles, publishes the code, and has a corpus in the millions. Xiangqi has no public corpus and no published method, which is why the xiangqi puzzles online are hand-composed endgame studies rather than positions somebody reached.',
    },
    {
      kind: 'paragraph',
      text: 'This is a pipeline that turns a licensed dump of amateur games into rated, served puzzles. **About one blunder in nine survives it.** The reasons the other eight fail add up to a definition of what a puzzle is.',
    },
    {
      kind: 'paragraph',
      text: 'Six stages, each discarding work for a different reason. Every number below was measured on amateur games from one source in August 2026. The counts go stale the next time the miner runs; the rates should hold for games like these, and probably will not hold for master games, where blunders are rarer and subtler. That is a prediction, not a result.',
    },
    {
      kind: 'raw-svg',
      svg: PM_PIPELINE,
      caption:
        'The whole pipeline. Each stage names its budget, the green figure is the rate it passes on, and the dotted line is what it discards. Absolute counts are from August 2026 and are the part that ages.',
    } as ArticleBlock,
  ],
  sections: [
    {
      heading: 'Where the games come from',
      blocks: [
        {
          kind: 'paragraph',
          text: 'The games come from [ElephantChess](https://elephantchess.io/about/datasets), which publishes its own site’s games as anonymised monthly datasets under GPL-3.0. Amateur games, which matters: strong players do not blunder often enough to be a supply.',
        },
        {
          kind: 'paragraph',
          text: 'Every source carries a licence status, starting at unknown. Publication refuses any puzzle whose source is not marked cleared, so a corpus can be imported and mined and still never reach a player. Two much larger xiangqi collections sit in that state.',
        },
        {
          kind: 'paragraph',
          text: 'Games are replayed through the site’s own rules code on the way in, move by move. One that does not survive the replay never enters the library.',
        },
        {
          kind: 'paragraph',
          text: 'The hard part of ingest is deciding what counts as a game we already have. ElephantChess re-anonymises every release, so ids change between dumps. June and July 2026 share **no game ids at all** and 10,469 identical games. Importing on id doubles the corpus with copies of itself, which is what happened.',
        },
        {
          kind: 'paragraph',
          text: 'So identity is a hash of date, result and moves. Those three collide zero times across 11,767 games in one dump. Drop the date and you get ten collisions in July and seven in June: two different games that happened to end the same way, silently merged.',
        },
        {
          kind: 'paragraph',
          text: 'Before any engine time is spent, a run’s game list is frozen, sampled across rating quartiles, time controls, results and lengths so it does not turn out to be all blitz. A run four hundred games into a scan cannot grow.',
        },
        {
          kind: 'paragraph',
          text: 'As of August 2026 the cleared corpus was 10,469 games, of which roughly 4,500 had been mined. Both numbers are meant to grow; the next licensed source is the thing that moves them.',
        },
      ],
    },
    {
      heading: 'Scanning a game for candidates',
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
          text: 'One detail halves this pass. Judging a move needs the position’s value before and after, and both are already there if the scans stay in order: the move played is worth the negation of the next position’s score. One search per position, not two, on the pass that touches every position of every game.',
        },
        {
          kind: 'code',
          language: 'typescript',
          text: PM_SCAN_LOOP,
        },
        {
          kind: 'paragraph',
          text: 'Across 3,500 games that yields 10,503 candidates. Three per game, give or take. Human beings blunder a lot.',
        },
      ],
    },
    {
      heading: 'Proving the answer',
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
          text: 'Building the line move by move rather than taking the principal variation whole is what separates a puzzle from a plausible sequence. A PV is one line the engine liked from one search; it says nothing about whether move three was forced. A solver who finds a different move three and is told they are wrong has been lied to. Every solver move in a published line was searched from its own bare position and passed the same gate as the first.',
        },
        {
          kind: 'paragraph',
          text: 'A plain centipawn gap is the wrong rule: two moves 50 centipawns apart are both fine, and demanding one punishes a solver for choosing correctly. What makes a move **the** answer is that every alternative is wrong, either giving the win away or winning materially less. What follows is a cascade of thresholds tested in order, and it is a heuristic rather than anything principled: fail-closed by design, so anything it cannot separate is thrown away.',
        },
        {
          kind: 'code',
          language: 'typescript',
          text: PM_UNIQUENESS_GATE,
        },
        {
          kind: 'raw-svg',
          svg: PM_GATE_LADDER,
          caption:
            'The gate in evaluation order. Green passes the move, grey rejects it, and the label on the right is the reason stored on the candidate. Order matters: the 200cp floor is checked before the win-rate test so that engine noise around the boundary cannot admit a near-tie.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: 'Each false branch is a way a real blunder fails to be a puzzle, and the reason is stored on the rejected candidate. The table below is those strings, counted.',
        },
        {
          kind: 'paragraph',
          text: 'Then the surviving line has to be between 3 and 7 plies, always ending on the solver’s move, and it gets replayed through the actual xiangqi rules engine to confirm it is legal from first move to last.',
        },
        {
          kind: 'table',
          headers: ['Outcome', 'Share of candidates'],
          rows: [
            ['Rejected: near-tie', '35%'],
            ['Rejected: too short', '32%'],
            ['Rejected: mate never arrived', '12%'],
            ['Rejected: not unique, or not winning', '9%'],
            ['Survived to the audit', '12%'],
          ],
          highlightRows: [0],
          caption:
            'Where candidates die. Measured over 10,503 candidates from 3,500 games in August 2026; the shares have held to within about two points across three runs, and the totals will not survive the next one.',
        },
        {
          kind: 'paragraph',
          text: '**Near-tie is the big one, about a third.** The player had a winning move and so did something else. Both work, there is no answer to check against, so there is no puzzle, even though the blunder was real and the position genuinely won.',
        },
        {
          kind: 'paragraph',
          text: '**Too short** is another third. The win existed but took one obvious move: hang a chariot, lose a chariot. True, and worth nothing to a solver.',
        },
        {
          kind: 'paragraph',
          text: 'Between them, two thirds of everything found. Roughly one candidate in eight survives, steadier across three runs than any absolute number here, and steady only because all three ran on the same kind of game.',
        },
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
          text: 'A 6% disagreement rate between two runs of the same engine at different budgets, on positions the first pass had cleared. That is the argument for the second pass: one engine at one depth is not a source of truth about its own verdicts.',
        },
        {
          kind: 'paragraph',
          text: 'Both passes share one UCI driver, one parser, one score conversion and one gate. The audit is independent in budget, not in definition. A second implementation would test whether two people wrote the same rule the same way, a different question from whether the rule survives more depth.',
        },
      ],
    },
    {
      heading: 'Running it so the results mean something',
      blocks: [
        {
          kind: 'paragraph',
          text: 'A corpus you cannot regenerate is one you cannot correct. Four things are pinned before a run and cannot change during it.',
        },
        {
          kind: 'paragraph',
          text: 'The game list, ordered, with its sampling cohorts. The engine, by sha256 of the binary and its network, then checked again by asking the running process to identify itself, so a rebuilt binary of the same name cannot slip in. The search budgets and the gate thresholds, both stored on the run rather than read from code.',
        },
        {
          kind: 'paragraph',
          text: 'That last one matters. Thresholds move as you learn what makes a good puzzle, and a run reading them from current source makes "these cleared a 200 centipawn gap" quietly false for the older half of the corpus. Stored per run, every puzzle can name the rule that admitted it.',
        },
        {
          kind: 'paragraph',
          text: 'Legality is checked against the same rules code three times: on import, when the solution line is assembled, and at publication. The same function each time, so it is a consistency check rather than three opinions.',
        },
        {
          kind: 'paragraph',
          text: 'The economics come from one asymmetry: the cheap pass runs on every position, the expensive one only on candidates. Scanning is 60,000 nodes per position. Verification is 600,000 and a depth floor of 20, ten times as much, on the three positions per game that survived. The audit is deeper and uncapped, on the tenth of those that survived verification.',
        },
        {
          kind: 'paragraph',
          text: 'Mining 1,000 games costs about six core-hours, which works out to roughly **one core-minute per published puzzle**. The remaining 5,969 games of the licensed corpus are about 45 core-hours, or six dollars of rented CPU. Compute stopped being the constraint some time ago.',
        },
        {
          kind: 'paragraph',
          text: 'Scanning scales almost linearly and auditing does not. Four workers to 32 took scanning from 16.7 games a minute to 63, a 3.8x return on 8x the workers, with the database under 1% CPU. The audit at that width started timing out: two of 902 candidates blew the four-minute engine ceiling at 32, against none of 392 at four. An uncapped depth-22 search does not share a machine gracefully. Fan the scan wide, keep the audit narrow, measured and not yet implemented.',
        },
      ],
    },
    {
      heading: 'Publishing what survived',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Clearing the audit does not make a puzzle live. Publication is a separate command, and it re-checks the work before writing.',
        },
        {
          kind: 'paragraph',
          text: 'It drops duplicate positions, checking across every run rather than just this one: two games can reach the same position, and before that check the same puzzle shipped twice from two sources. It confirms each puzzle’s recorded game and ply still match its candidate, and replays every solution through the rules engine once more.',
        },
        {
          kind: 'paragraph',
          text: 'Then it prints what it would do and stops. Writing needs the run id back, the exact puzzle count expected, and a hash over the precise set of candidates, puzzles and judgements. It re-plans inside the transaction and aborts if either moved while you were reading.',
        },
        {
          kind: 'paragraph',
          text: '**The human review is thinner than its schema.** There is a full editorial layer: a verdict per puzzle, twelve rejection reasons, and a tool ranking candidates by how interesting they look. But a bulk publish writes the approval rows itself with no reviewer recorded, so the human step is one person authorising several hundred puzzles rather than reading them. Hand-approving each one would have stopped this corpus in the hundreds.',
        },
        {
          kind: 'paragraph',
          text: 'Tags come from the solution, decided when the puzzle is mined. Mate in one, two or three, or simply winning. Winning material when the key move captures. Crushing when the blunder swung more than 600 centipawns. Endgame at fourteen pieces or fewer, middlegame above that.',
        },
        {
          kind: 'paragraph',
          text: 'Difficulty is computed on load, not stored. Mate depth sets the base; a quiet first move adds 90, a capturing one subtracts 45, an unrecovered sacrifice adds up to 200, and the count of defensive replies pushes either way around a pivot of 34. Depth alone was useless: four distinct ratings for the whole corpus, with 943 of 1,605 puzzles sharing one. The derived number gives 402.',
        },
      ],
    },
    {
      heading: 'Which puzzle you actually get',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Something has to choose which puzzle you see. Today that runs in your browser over the whole list, which works at this size and should not stay there.',
        },
        {
          kind: 'paragraph',
          text: 'Unseen puzzles come first, ordered against your rating for that variant, which starts at 1500. Each scores on distance from your rating, plus a penalty for repeating the theme you just solved and noise so two visits differ. Seen puzzles queue behind, least recently seen first, so old material comes back around.',
        },
        {
          kind: 'paragraph',
          text: 'Every fifth puzzle ignores all of that and draws at random from a band around your rating: 300 points wide, widening to 600 and then 1200 if the band comes up empty. The band exists because of what happened without one. Once the derived difficulties spread the corpus across 1255 to 2600, an unbounded random pick was handing 1300-rated players 2600-rated puzzles, with 35% of the pool more than 500 points from where it should have been.',
        },
        {
          kind: 'raw-svg',
          svg: PM_EXPLORE_BANDS,
          caption:
            'Bands to scale against the real corpus range. Without one, the draw is the whole axis.',
        } as ArticleBlock,        {
          kind: 'code',
          language: 'typescript',
          text: PM_SELECTION,
        },
        {
          kind: 'paragraph',
          text: 'Signed out, the seen list lives in your browser and holds 5,000 entries. Signed in, server-side attempts merge into it, so a puzzle solved on your phone does not reappear on your laptop.',
        },
        {
          kind: 'paragraph',
          text: 'Attempts are rated like games. You and the puzzle each carry a Glicko-2 rating and one attempt moves both: solve it, you gain, the puzzle loses. Only your first attempt at a puzzle ever counts, enforced in the database rather than the page, so a failed puzzle cannot be farmed.',
        },
        {
          kind: 'paragraph',
          text: 'The daily puzzle is a hash of the date and slot modulo the eligible count, so every visitor gets the same one and yesterday’s is recomputed rather than stored.',
        },
      ],
    },
    {
      heading: 'What this does not do',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Positions with two winning answers are rejected by construction, 3,667 of them. Some are genuinely ambiguous; others are a mate in three beside a mate in five, which most sites would accept as either. Taking both means scoring a solver against a set rather than a line, which is a different program.',
        },
        {
          kind: 'paragraph',
          text: 'Nothing is mined continuously. Every run works from a frozen dump, so games played here contribute nothing back. The obvious version, where your lost game becomes somebody else’s puzzle, is not built.',
        },
        {
          kind: 'paragraph',
          text: 'The corpus is capped by licensing, not compute. At the amateur-game yield of one puzzle per three, everything cleared runs out near 3,700. Ten thousand needs about 28,000 games, nearly three times what is licensed, so the next gain comes from rights and not from a faster miner. A master-game corpus would change that arithmetic in both directions: more games available, fewer puzzles per game.',
        },
        {
          kind: 'paragraph',
          text: 'Difficulty is a prior, not a measurement: derived from the solution, then corrected by Glicko as people attempt it. A puzzle nobody has tried is rated by a formula that has never seen a solver.',
        },
        {
          kind: 'paragraph',
          text: 'The gate itself has never been checked against a human. Its four thresholds were chosen by reading rejected positions, not by measuring whether the puzzles they admit are good ones, and the win-rate curve borrows a scale constant from chess that nobody has recalibrated for xiangqi, where the pieces are worth different things. Solve rates, reveal rates and abandonment are all recorded per puzzle, so the data to grade the gate exists and has not been pointed at it.',
        },
      ],
    },
    {
      heading: 'What a puzzle turns out to be',
      blocks: [
        {
          kind: 'paragraph',
          text: '1,211 puzzles from 3,500 games. Roughly one per three games, and one for every nine blunders found. The corpus now serves 1,605 standard xiangqi puzzles, each carrying the game it came from and the exact ply where somebody went wrong.',
        },
        {
          kind: 'paragraph',
          text: '**Two thirds of them open with a move that captures nothing.** 1,052 of 1,605. If you hunt for tactics by scanning the captures first, which is what most of us do, you are looking at the wrong third of the board most of the time.',
        },
        {
          kind: 'raw-svg',
          svg: PM_QUIET_KEY_MOVE,
          caption:
            'One of the 1,052, exactly as it is served. Red plays the chariot from b3 all the way to h3, taking nothing and threatening nothing yet. Black’s horse comes back to c3 to cover the mate.',
        } as ArticleBlock,
        {
          kind: 'raw-svg',
          svg: PM_MATE_LANDS,
          caption:
            'It does not cover it. The chariot climbs the h-file to h9 and the general on f9 has no square. This is ply 84 of a real game played on 2026-04-22; the loser had a defence and picked the wrong one.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text: '**Only 10% involve giving material away.** Sacrifices are the tactics people remember, so I had assumed they would be a larger slice. In real games between real players, the winning move is usually just a move.',
        },
        {
          kind: 'paragraph',
          text: 'A puzzle is not a position you are winning. Most winning positions have several winning moves, and that is what disqualifies them: a third of everything found died on that alone. A puzzle is a position with one answer, deep enough that finding it takes work, and stable enough that a stronger engine still agrees an hour later.',
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
