import type { Article, ArticleBlock } from '../types.js';
import { BANQI_LUCK_CHART_SVG, BANQI_LUCK_THUMBNAIL_SVG } from './banqi-luck-chart.js';
import { BANQI_LUCK_FLIP_POOL, BANQI_LUCK_GAME } from './banqi-luck-game.js';

// The decision-vs-luck methodology essay. Every measured number in the prose
// comes from the offline mining run recorded in docs-private/luck-article/
// (FINDINGS.md holds the per-game data; the chart + exhibit game files beside
// this one are generated from the same run). Exhibit games are real prod games
// on brianhliou's accounts.
const FLIP_POOL_ROWS = BANQI_LUCK_FLIP_POOL.rows.map((row) => [
  `${row.color} ${row.role}`,
  `×${row.count}`,
  `${row.win.toFixed(0)}%`,
]);
const FLIP_POOL_ACTUAL_ROW = BANQI_LUCK_FLIP_POOL.rows.findIndex((row) => row.actual);

export const banqiLuckArticle: Article = {
  slug: 'banqi-luck',
  kind: 'article',
  publisher: 'mistboard',
  title: 'Separating Skill from Luck in Banqi',
  seoTitle: 'Banqi (Chinese Dark Chess) Game Review: Separating Skill from Luck',
  summary:
    'Half the moves in a banqi game are dice rolls, so a chess-style review blames you for variance. Mistboard’s game review splits every flip into the decision and the tile: luck-stripped accuracy, a luck line on the advantage graph, and what 52 human-versus-engine games say about who really earned their wins.',
  status: 'draft',
  publishedAt: '2026-08-21',
  audience:
    'Banqi, jieqi, and jungle players who want an honest review of their games, and anyone curious how you grade a move that includes a dice roll.',
  thumbnail: { kind: 'svg', svg: BANQI_LUCK_THUMBNAIL_SVG },
  intro: [
    {
      kind: 'paragraph',
      text:
        'I beat my own bot at banqi and felt good about it for roughly a minute, which is how long it took to open the game review. The review splits every flip into the decision I made and the tile I got, and it says the tiles did the work.',
    },
    {
      kind: 'paragraph',
      text:
        'My flips came out **76 points of win chance better than average**. The bot’s came out 12 points worse. I made the worse decisions, by a wide margin. I won anyway.',
    },
    {
      kind: 'paragraph',
      text: 'Most game review tools cannot say any of that.',
    },
  ],
  sections: [
    {
      heading: 'A flip is a decision plus a dice roll',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Half the moves in a banqi game turn over a face-down tile. One move, two parts: choosing which tile to turn, and finding out what it is.',
        },
        {
          kind: 'paragraph',
          text:
            'A chess-style review grades the swing of the whole move. Flip the corner tile, find the enemy general, and the review calls it a blunder. It was a bad tile, not a bad decision.',
        },
        {
          kind: 'paragraph',
          text:
            'This is why banqi reviews on Mistboard show no centipawn loss: it cannot be separated from the tiles, so next to numbers that can be, it reads as noise.',
        },
      ],
    },
    {
      heading: 'Backgammon solved this decades ago',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Backgammon software prices every roll against the average roll and reports a luck-adjusted result, so a match report can tell you that you played better and lost. GnuBG and eXtreme Gammon both do it. Poker has the same idea in all-in EV.',
        },
        {
          kind: 'paragraph',
          text:
            'Chess never built any of this because chess has no dice. Banqi is a chess-family game with dice in it, and it inherited chess’s tools, which have no luck column.',
        },
      ],
    },
    {
      heading: 'The average tile in the bag',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Banqi’s chance is countable. Both players can see which tiles are still face down, and the full set of pieces is known, so at any flip you can list every tile that square could be. That makes the honest baseline computable:',
        },
        {
          kind: 'code',
          text:
            'for each tile the square could be:\n    put that tile under the square\n    play the flip\n    evaluate the position\naverage the results, weighted by count',
        },
        {
          kind: 'paragraph',
          text:
            'That average is what your decision was worth **before the dice**. Three numbers per flip:',
        },
        {
          kind: 'table',
          headers: ['per flip', 'meaning'],
          rows: [
            ['played', 'the average value of the flip you chose'],
            ['best', 'the same average for the best move available'],
            ['realized', 'what your actual tile produced'],
          ],
        },
        {
          kind: 'code',
          text:
            'decision loss = best - played      (skill, always >= 0)\nluck          = realized - played  (the dice, signed)',
        },
        {
          kind: 'paragraph',
          text:
            'Zero luck is exactly the average tile in the bag, by construction, not by an engine’s opinion.',
        },
        { kind: 'sub-heading', text: 'The flip from the intro, enumerated' },
        {
          kind: 'paragraph',
          text:
            'Ply 6 of the game this article opens with: Black turns the tile on g3. Twenty-seven tiles are still face down, twelve kinds, and each one leads to a different game.',
        },
        {
          kind: 'table',
          headers: ['what the g3 tile could be', 'count', 'win% for Black'],
          rows: FLIP_POOL_ROWS,
          highlightRows: [FLIP_POOL_ACTUAL_ROW],
        },
        {
          kind: 'paragraph',
          text:
            'The same flip is worth anywhere from 13% (my own general, deep in contested ground) to 82% (my own soldier, safe and useful there). The weighted average is **45%: that number is the decision**, and it is what accuracy grades.',
        },
        {
          kind: 'paragraph',
          text:
            'The highlighted row is what the bag actually handed me. Realized 82, played 45, luck plus 37, and none of it to my credit.',
        },
        { kind: 'sub-heading', text: 'Why not just ask the engine' },
        {
          kind: 'paragraph',
          text:
            'The obvious shortcut is to ask the engine what the flip move is worth and call the difference luck, but engines are biased about their own dice. Our jieqi engine over-values its reveals, which makes it play greedy, gambling lines. Averaging fixed positions, each with the tile already decided, keeps the chance node out of the search entirely, so the bias has nowhere to live.',
        },
        { kind: 'sub-heading', text: 'The flip that deals you your color' },
        {
          kind: 'paragraph',
          text:
            'The first flip of the game decides which color you play: whatever ink comes up, that side is yours. The counterfactuals for that flip vary your own army, so the decomposition prices "which side did I get" as luck. That sounds wrong for about ten seconds, and then it sounds exactly right.',
        },
      ],
    },
    {
      heading: 'What the review draws',
      blocks: [
        {
          kind: 'raw-svg',
          svg: BANQI_LUCK_CHART_SVG,
          caption:
            'The exhibit game below. Solid: the game as played, from Red’s side. Dashed: the same game with every flip at its average. The gap is the luck.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text:
            'The advantage graph gets a second line. The solid line is the game as it happened. The dashed line subtracts your accumulated luck: the trajectory if every flip had come out average. The shaded band between them is the luck, building up or draining away as the game runs.',
        },
        {
          kind: 'paragraph',
          text:
            'Accuracy is graded on the decision numbers only, so a lucky flip does not improve it and an unlucky one does not hurt it.',
        },
      ],
    },
    {
      heading: 'The receipts',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The win I opened with: 156 plies against the bot, and the graph tells on me. At ply 6 the 45% flip came up worth 82%. No decision in the game moved the needle that far.',
        },
        {
          kind: 'paragraph',
          text:
            'In total: my flips **plus 76**, the bot’s minus 12, and my flip decisions gave away 74 points against the bot’s zero. The dashed line has me losing most of the game. The solid line has me winning. The bag overruled the play. The whole game is [open on Mistboard](/banqi/game/bq_7e8ce2e7-8e64-4453-b9fd-9dcc4bd52fa9), replay below.',
        },
        {
          kind: 'banqi-replay',
          spec: {
            red: 'MistyBanqi',
            black: 'brianhliou',
            event: 'The exhibit game, live on Mistboard',
            outcome: 'Black wins · 156 plies · net luck +88 to Black',
            resultText:
              'Black wins when Red runs out of moves. The decision numbers say Red earned the better game; the tiles said otherwise, starting with the flip at ply 6.',
            deal: BANQI_LUCK_GAME.deal,
            moves: BANQI_LUCK_GAME.moves,
          },
          caption: 'Step to ply 6: the flip worth 45% on average that came up worth 82%.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text:
            'It cuts the other way too. In [another game](/banqi/game/bq_123a6232-6f9f-4677-90ae-a75d5700a446) I lost, one flip at ply 19 cost 34 points of win chance on its own. My decisions that game were ordinary. The old review would have marked that flip as the losing blunder. The new one marks it as the moment the game was decided by something that was not a choice.',
        },
      ],
    },
    {
      heading: 'Fifty-two games of evidence',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'We ran the decomposition over 52 recent human-versus-Misty banqi games from the site.',
        },
        {
          kind: 'table',
          headers: ['across 52 human vs Misty games', 'value'],
          rows: [
            ['human record', '14 wins, 33 losses, 5 draws'],
            ['net luck toward the human, in the wins', '+28 points on average'],
            ['net luck toward the human, in the losses', '−9 points on average'],
          ],
          highlightRows: [1],
        },
        {
          kind: 'paragraph',
          text:
            'The bot is stronger, and beating it has usually taken help from the bag. If you have beaten it, the review will now tell you how much help you got.',
        },
      ],
    },
    {
      heading: 'Jieqi rolls different dice',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Jieqi gets the same treatment with a different pool. A jieqi reveal draws from your own remaining dark pieces, so you know the color and not the piece. A banqi tile is dark to both players, color included. Different bags, same arithmetic, and jungle’s flip variant makes a third. Every one of them gets the dashed line.',
        },
      ],
    },
    {
      heading: 'For the builders',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The subtle bug in this construction is the counterfactual itself. Relabel the flipped square from a soldier to a cannon and you have quietly added a cannon to the game and removed a soldier: the global piece counts change, the position rebalances by about two pieces, and the pool average inflates. The implementation swaps instead. The counterfactual tile trades places with a face-down square that really holds one, so the hidden multiset stays exactly the game’s multiset and only the location moves.',
        },
        {
          kind: 'paragraph',
          text:
            'Everything is win% from the flipping player’s point of view. A post-flip position has the opponent to move, so the engine’s side-to-move score gets negated, and a flip that ends the game outright scores exactly 100, 50, or 0 with no engine call. Win% rather than centipawns because luck has to be summable across a whole game and bounded at both ends, and because a flip that walks into mate has no sensible centipawn value.',
        },
        {
          kind: 'paragraph',
          text:
            'Search budgets are node counts, not time, so the same game grades identically on a fast laptop and a loaded server. The realized value is one term of the same averaged search rather than a separate deeper query, so a flip is never graded by two numbers from different depths.',
        },
        {
          kind: 'paragraph',
          text:
            'The decision ceiling considers only the engine’s top move, on purpose: a better move the engine ranked second is missed, which means decision loss is only ever under-counted. The review can fail to flag a mistake. It cannot invent one.',
        },
      ],
    },
    {
      heading: 'Where the numbers stop',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The win percentages come from our banqi engine at a fixed search budget, and that engine is also the opponent in these games, so its own flips grade as near-perfect partly because it agrees with itself. Read "the bot lost zero points" with that in mind. The human numbers have no such problem.',
        },
        {
          kind: 'paragraph',
          text:
            'One more honest limit: subtracting luck point-by-point treats win chance as linear, which it is not. The directions are trustworthy. The second decimal is not.',
        },
      ],
    },
    {
      heading: 'Try it on your own games',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Open any finished banqi, jieqi, or jungle flip game on Mistboard, yours or anyone’s from the [watch page](/watch), and request computer analysis. The luck numbers appear per flip in the move list, and the dashed line shows the game the bag would have given you.',
        },
        {
          kind: 'paragraph',
          text:
            'Sometimes it agrees you were robbed. Sometimes it takes your win away. It did both to me in one afternoon.',
        },
        {
          kind: 'cta',
          buttons: [
            { label: 'Play Banqi', href: '/?play=computer&gameSpecId=banqi', emphasis: 'primary' },
            { label: 'Banqi rules', href: '/rules/banqi', emphasis: 'secondary' },
          ],
        } as ArticleBlock,
      ],
    },
  ],
};
