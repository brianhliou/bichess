import type { Article, ArticleBlock } from '../types.js';

// Platform showcase for jieqi: what Mistboard offers, stated plainly, with
// three figures captured from a real production game rather than mocked. The
// persuasion is meant to come from the screenshots; the copy states capability
// and stops.
//
// Facts checked against the code rather than assumed: three casual time
// controls (registry `timePresetIds`), the lobby lists the bot as Pikafish
// while the analysis panel names the engine PikaJieQi, jieqi is casual-only
// (`supportsRated: false`), and /analysis has no auth gate.

export const jieqiPlatformArticle: Article = {
  slug: 'jieqi-platform',
  kind: 'article',
  publisher: 'mistboard',
  boardFamily: 'xiangqi',
  title: 'Jieqi on Mistboard',
  seoTitle: 'Play Jieqi Online, with Engine Analysis',
  summary:
    'A modern jieqi platform: play the engine or a friend, free and without an account, with engine analysis that handles reveals correctly.',
  showSummaryOnPage: false,
  status: 'draft',
  publishedAt: '2026-08-28',
  audience:
    'Jieqi players looking for a place to play and review their games, and anyone curious how a game with random reveals gets analysed honestly.',
  intro: [
    {
      kind: 'paragraph',
      text:
        'Jieqi is [xiangqi](/rules/xiangqi) with every piece face-down. A piece moves as whatever normally starts on its square, then flips and keeps its true identity from then on. The [rules page](/rules/jieqi) covers the details.',
    },
    {
      kind: 'paragraph',
      text:
        'Mistboard supports jieqi in full: play, analyse, review, and study. It is free, it works without an account, and it is open source.',
    },
  ],
  sections: [
    {
      heading: 'The board',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Intersection and square-grid layouts, several piece sets, optional coordinates, and a full-size board on a phone.',
        },
      ],
    },
    {
      heading: 'Playing',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Play the engine at 1+1, 3+2 or 5+5, or send a link to a friend. Neither needs an account. Jieqi games here are casual: there is no jieqi ladder yet.',
        },
      ],
    },
    {
      heading: 'Analysis that handles reveals',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'About half the moves in a jieqi game are reveals, and a reveal combines a decision with a random draw. Mistboard scores the two separately.',
        },
        {
          kind: 'paragraph',
          text:
            'Each reveal is evaluated across every piece the tile could be, with each outcome scored as its own position and weighted by how likely it is. The review then shows a ranked set of candidate moves with the played move marked, a dice badge giving the luck in win percentage, and an accuracy figure graded on the decision half only.',
        },
        {
          kind: 'image-figure',
          src: '/article-thumbs/jieqi-reveal-candidates.png',
          alt: 'A jieqi review move list. Move 19 is a reveal carrying a dice badge reading minus 21 percent, above four ranked candidate moves at 52, 39, 34 and 29 percent with the played move marked second. Move 21 carries plus 43 percent, move 21 for black plus 6 percent, and move 22 minus 10 percent, each with its own ranked candidates. The ordinary plies between them carry a single evaluation and no candidates.',
          caption:
            'Reveal plies get ranked candidates and a luck price, good or bad. Ordinary plies get a normal evaluation.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text:
            'Because accuracy excludes the draw, it measures how you played rather than what you drew. A lucky tile cannot inflate it and an unlucky one cannot dent it.',
        },
        {
          kind: 'cta',
          buttons: [
            { label: 'Open the analysis board', href: '/analysis/jieqi', emphasis: 'primary' },
          ],
        },
      ],
    },
    {
      heading: 'Engine analysis, on our servers and in your browser',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Finished games are analysed server-side. The analysis board runs the same engine locally, compiled to WebAssembly, at full depth and with several candidate moves drawn on the board.',
        },
        {
          kind: 'image-figure',
          src: '/article-thumbs/jieqi-local-engine.png',
          alt: 'The analysis board with the local engine switched on: PikaJieQi at depth 18 and 335,000 nodes per second, three candidate lines each with an evaluation, and arrows for each drawn on the jieqi board.',
          caption: 'Depth 18 at 335,000 nodes per second, running in a browser tab.',
        } as ArticleBlock,
      ],
    },
    {
      heading: 'The engine',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'PikaJieQi is a fork of Pikafish, the open-source xiangqi engine, on a branch built for jieqi. Classical search with a hand-written evaluation, no neural network. It is listed as Pikafish in the lobby.',
        },
        {
          kind: 'paragraph',
          text:
            'It receives only the redacted board, with every face-down piece written as a faceless x. It does not know the deal, and a test fails the build if the wire format ever leaks a true identity.',
        },
        {
          kind: 'paragraph',
          text:
            'Its known weakness is that it values its own hidden pieces optimistically, so it over-commits them. That bias sits in the evaluation rather than the search depth, which means more thinking time does not remove it.',
        },
        {
          kind: 'image-figure',
          src: '/article-thumbs/jieqi-accuracy-summary.png',
          alt: 'A game summary: the advantage graph swinging back and forth across the game, beside accuracy cards reading Pikafish 84 percent with eleven inaccuracies, three mistakes and five blunders, and Guest 90 percent with three inaccuracies, no mistakes and two blunders.',
          caption:
            'A recent game the engine lost. Accuracy is luck-stripped, so the gap is play rather than draw.',
        } as ArticleBlock,
        {
          kind: 'cta',
          buttons: [
            { label: 'Play the engine', href: '/?play=computer&gameSpecId=jieqi', emphasis: 'primary' },
          ],
        },
      ],
    },
    {
      heading: 'Open source',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The site is open source, including the redaction boundary that keeps the engine honest and the tests that guard it.',
        },
      ],
    },
    {
      heading: 'Start playing',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Jieqi is free here, with no account required.',
        },
        {
          kind: 'cta',
          buttons: [
            { label: 'Play the engine', href: '/?play=computer&gameSpecId=jieqi', emphasis: 'primary' },
            { label: 'Play a friend', href: '/?play=friend&gameSpecId=jieqi', emphasis: 'secondary' },
            { label: 'Read the rules', href: '/rules/jieqi', emphasis: 'secondary' },
          ],
        },
      ],
    },
  ],
};
