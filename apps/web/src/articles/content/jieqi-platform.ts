import type { Article, ArticleBlock } from '../types.js';

// Platform showcase for jieqi: what Mistboard offers, stated plainly, with four
// figures captured from one real production game rather than mocked. The
// persuasion is meant to come from the screenshots; the copy states capability
// and stops.
//
// Facts checked against the code and against prod rather than assumed: three
// casual time controls (registry `timePresetIds`), the lobby lists the bot as
// Pikafish while the analysis panel names the engine PikaJieQi, /analysis has no
// auth gate, jieqi is in STUDY_ELIGIBLE_SPEC_IDS, and /study is a live route
// (/studies is not). Jieqi's spec carries `rated: true` but
// `publicSurface: 'casual'`, so the rating pool exists while games are not
// actually rated: the copy says casual and promises no ladder.
//
// Every figure comes from jq_96f40ebb, one 146-ply game the engine lost. Keeping
// them from a single game is deliberate: a reader can follow one game across the
// board, the graph and the reveal table instead of re-orienting four times.
// Figures are captured from CACHED analysis, so a change to
// JIEQI_ANALYSIS_DEPTH invalidates them (the cache key carries depth) and they
// have to be re-shot. That has already bitten once.

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
        'Jieqi is [xiangqi](/rules/xiangqi) with every piece face-down. A piece moves as whatever normally starts on its square, then flips and keeps its true identity for the rest of the game. The [rules page](/rules/jieqi) has the details.',
    },
    {
      kind: 'image-figure',
      src: '/article-thumbs/jieqi-midgame-board.png',
      alt: 'A jieqi board partway through a game. Some pieces are plain coloured discs, still face-down, while others have been revealed and show a chariot, horses, elephants, a cannon and soldiers in red and black outlines.',
      caption:
        'Move 18 of a real game. The plain discs are still face-down; everything else has been turned over and is committed to what it turned out to be.',
    } as ArticleBlock,
    {
      kind: 'paragraph',
      text:
        'Mistboard supports jieqi in full: play, analyse, review and study. It is free, it works without an account, and it is open source. The board comes in intersection or square-grid layouts with a few piece sets, coordinates are optional, and it stays full size on a phone.',
    },
  ],
  sections: [
    {
      heading: 'Playing',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Play the engine at 1+1, 3+2 or 5+5, or send a link to a friend. Neither needs an account.',
        },
        {
          kind: 'paragraph',
          text:
            'Every game is saved. You can replay it move by move, share the link, and run analysis over it whenever you like, including games you played as a guest. Jieqi here is casual: there is no jieqi ladder yet.',
        },
        {
          kind: 'cta',
          buttons: [
            {
              label: 'Play the engine',
              href: '/?play=computer&gameSpecId=jieqi',
              emphasis: 'primary',
            },
            { label: 'Play a friend', href: '/?play=friend&gameSpecId=jieqi', emphasis: 'secondary' },
          ],
        },
      ],
    },
    {
      heading: 'Analysis',
      blocks: [
        { kind: 'sub-heading', text: 'Every finished game gets a full pass' },
        {
          kind: 'paragraph',
          text:
            'Ask for computer analysis on a finished game and the engine evaluates every position in it. You get the advantage graph across the whole game, an accuracy figure per player, and each inaccuracy, mistake and blunder marked in the move list with the move that was better.',
        },
        {
          kind: 'image-figure',
          src: '/article-thumbs/jieqi-accuracy-summary.png',
          alt: 'A game summary: the advantage graph swinging back and forth across the game, beside accuracy cards reading Pikafish 86 percent with thirteen inaccuracies, two mistakes and one blunder, and Guest 91 percent with six inaccuracies, two mistakes and one blunder.',
          caption:
            'The same game, graded. The engine lost this one, and the graph shows why: it led for most of the middlegame and gave it back at the end.',
        } as ArticleBlock,
        { kind: 'sub-heading', text: 'Reveals are priced separately from decisions' },
        {
          kind: 'paragraph',
          text:
            'About half the moves in a jieqi game are reveals, and a reveal is a decision plus a random draw. Grading those together would score you on your luck. Mistboard scores them apart.',
        },
        {
          kind: 'paragraph',
          text:
            'Each reveal is evaluated across every piece the tile could have been, with each outcome scored as its own position and weighted by how likely it was. The review then shows a ranked set of candidate moves with the played move marked, and a dice badge giving what the draw itself was worth in win percentage.',
        },
        {
          kind: 'image-figure',
          src: '/article-thumbs/jieqi-reveal-candidates.png',
          alt: 'A jieqi review move list. Move 19 is a reveal carrying a dice badge reading minus 21 percent, above four ranked candidate moves at 52, 39, 34 and 29 percent with the played move marked second. Move 21 carries plus 43 percent, move 21 for black plus 6 percent, and move 22 minus 10 percent, each with its own ranked candidates. The ordinary plies between them carry a single evaluation and no candidates, one of them flagged as a blunder with the better move named.',
          caption:
            'Reveal plies get ranked candidates and a price for the draw, good or bad. Ordinary plies get a normal evaluation.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text:
            'Accuracy is graded on the decision half only. A lucky tile cannot inflate it and an unlucky one cannot dent it, so the number says how you played rather than what you drew.',
        },
        { kind: 'sub-heading', text: 'The same engine runs in your browser' },
        {
          kind: 'paragraph',
          text:
            'The analysis board runs the engine locally, compiled to WebAssembly, with several candidate moves drawn on the board as you move through a line. Nothing is queued and nothing is sent anywhere. It needs no account.',
        },
        {
          kind: 'image-figure',
          src: '/article-thumbs/jieqi-local-engine.png',
          alt: 'The analysis board with the local engine switched on: PikaJieQi at depth 18 and 335,000 nodes per second, three candidate lines each with an evaluation, and arrows for each drawn on the jieqi board.',
          caption: 'Depth 18 at 335,000 nodes per second, running in a browser tab.',
        } as ArticleBlock,
        {
          kind: 'cta',
          buttons: [
            { label: 'Open the analysis board', href: '/analysis/jieqi', emphasis: 'primary' },
          ],
        },
      ],
    },
    {
      heading: 'Studies',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Studies work for jieqi the way they do for xiangqi. Build one from a game or from a position you set up, keep several chapters in it, write notes against the moves, and share the link. Because a jieqi game starts from a deal rather than a fixed position, each chapter carries its own deal, so a study opens on exactly the board you saved.',
        },
        {
          kind: 'cta',
          buttons: [{ label: 'Browse studies', href: '/study', emphasis: 'primary' }],
        },
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
            'Its known weakness is that it values its own hidden pieces optimistically, so it over-commits them. That bias sits in the evaluation rather than the search depth, which means more thinking time does not remove it. The game above is one it lost that way.',
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
            {
              label: 'Play the engine',
              href: '/?play=computer&gameSpecId=jieqi',
              emphasis: 'primary',
            },
            { label: 'Play a friend', href: '/?play=friend&gameSpecId=jieqi', emphasis: 'secondary' },
            { label: 'Read the rules', href: '/rules/jieqi', emphasis: 'secondary' },
          ],
        },
      ],
    },
  ],
};
