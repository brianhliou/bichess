import { JIEQI_PLATFORM_GAME } from '../../jieqi-platform-game.js';
import type { Article, ArticleBlock } from '../types.js';

// Platform page for jieqi, and the source document the Vietnamese co-up page is
// translated from. Written for a player, not an engineer: the replay and the three
// screenshots do the selling, and the copy says what a thing does and stops.
//
// Cut hard on purpose, roughly in half. Every mechanism sentence that survived
// earns its place by answering a question a player would actually ask; the ones
// that explained how the software works were the ones that went.
//
// Facts checked against the code and against prod rather than assumed: three
// casual time controls (registry `timePresetIds`), the lobby lists the bot as
// Pikafish while the analysis panel names the engine PikaJieQi, /analysis has no
// auth gate, jieqi is in STUDY_ELIGIBLE_SPEC_IDS, and /study is a live route
// (/studies is not). Jieqi's spec carries `rated: true` but
// `publicSurface: 'casual'`, so the rating pool exists while games are not
// actually rated: the page promises no ladder.
//
// The opening replay and every figure come from jq_96f40ebb, one 146-ply game the
// engine lost. Keeping them from a single game is deliberate: a reader steps
// through it up top, then meets the same game in the graph and the flip table
// instead of re-orienting each time. Figures are captured from CACHED analysis, so
// a change to JIEQI_ANALYSIS_DEPTH invalidates them (the cache key carries depth)
// and they have to be re-shot. That has already bitten once.

export const jieqiPlatformArticle: Article = {
  slug: 'jieqi-platform',
  kind: 'article',
  publisher: 'mistboard',
  boardFamily: 'xiangqi',
  title: 'Jieqi on Mistboard',
  seoTitle: 'Play Jieqi Online, with Engine Analysis',
  summary:
    'Play jieqi against the engine or a friend, free and without an account, then review the game with analysis that separates your choices from your luck.',
  showSummaryOnPage: false,
  status: 'draft',
  publishedAt: '2026-08-28',
  audience: 'Jieqi players looking for somewhere to play and review their games.',
  intro: [
    {
      kind: 'paragraph',
      text:
        'Jieqi is [xiangqi](/rules/xiangqi) with every piece face-down. A piece moves as whatever normally starts on its square, then flips and keeps that identity for the rest of the game. You begin without knowing what anything is, including your own pieces. The [rules page](/rules/jieqi) has the details.',
    },
    {
      kind: 'paragraph',
      text:
        'It is a young game. Jieqi (揭棋) came out of Hong Kong and Guangdong and has spread over the last couple of decades, mostly among Chinese and Vietnamese players, who call it cờ úp.',
    },
    {
      // A reader who arrived from a "play jieqi" search wants a board, not an
      // argument. Everything below still earns its place for whoever scrolls; it
      // should not be the toll they pay to reach a button.
      kind: 'cta',
      buttons: [
        { label: 'Play the engine', href: '/?play=computer&gameSpecId=jieqi', emphasis: 'primary' },
        { label: 'Play a friend', href: '/?play=friend&gameSpecId=jieqi', emphasis: 'secondary' },
      ],
    },
    {
      kind: 'jieqi-replay',
      spec: {
        red: JIEQI_PLATFORM_GAME.red,
        black: JIEQI_PLATFORM_GAME.black,
        event: JIEQI_PLATFORM_GAME.event,
        outcome: JIEQI_PLATFORM_GAME.outcome,
        resultText: JIEQI_PLATFORM_GAME.result,
        deal: JIEQI_PLATFORM_GAME.deal,
        moves: JIEQI_PLATFORM_GAME.moves,
        perspective: 'black',
      },
      caption:
        'A real game here, and a close one: the engine led most of the way and lost it at the end. Step through and watch the pieces turn over.',
    } as ArticleBlock,
    {
      kind: 'paragraph',
      text:
        'Play the engine at 1+1, 3+2 or 5+5, or send a friend a link. Free, no sign-up, nothing to install.',
    },
  ],
  sections: [
    {
      heading: 'Review your games',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Ask for analysis on a finished game and you get a graph of the whole thing, an accuracy score for each player, and every inaccuracy, mistake and blunder marked with the move you should have played.',
        },
        {
          kind: 'image-figure',
          src: '/article-thumbs/jieqi-accuracy-summary.png',
          alt: 'A game summary: the advantage graph swinging back and forth across the game, beside accuracy cards reading Pikafish 86 percent with thirteen inaccuracies, two mistakes and one blunder, and Guest 91 percent with six inaccuracies, two mistakes and one blunder.',
          caption: 'The game above, graded.',
        } as ArticleBlock,
        { kind: 'sub-heading', text: 'It tells you how lucky each flip was' },
        {
          kind: 'paragraph',
          text:
            'Half your moves turn a piece over, and you never know what you are turning over. So the engine works out what each piece that tile could have been would have been worth, and compares it to what you actually got. The gap is your luck on that flip.',
        },
        {
          kind: 'image-figure',
          src: '/article-thumbs/jieqi-reveal-candidates.png',
          alt: 'A jieqi review move list. Move 19 is a flip carrying a dice badge reading minus 21 percent, above four ranked candidate moves at 52, 39, 34 and 29 percent with the played move marked second. Move 21 carries plus 43 percent, move 21 for black plus 6 percent, and move 22 minus 10 percent.',
          caption:
            'Every flip is priced, good or bad, next to the moves you could have played instead. The percentages are how often each move wins across all the pieces that tile might have been.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text:
            'Your accuracy is then built from the choices alone, so a lucky flip cannot flatter it and an unlucky one cannot spoil it.',
        },
        { kind: 'sub-heading', text: 'And it runs in your browser' },
        {
          kind: 'paragraph',
          text:
            'The analysis board runs the same engine on your own machine, drawing its best moves on the board as you try a line. Nothing is queued, nothing is sent anywhere, and it needs no account. [The engine is open source](https://github.com/brianhliou/pikafish-jieqi-wasm), so if a number here looks wrong you can go and read the code that produced it.',
        },
        {
          kind: 'image-figure',
          src: '/article-thumbs/jieqi-local-engine.png',
          alt: 'The analysis board with the local engine switched on: PikaJieQi at depth 18 and 335,000 nodes per second, three candidate lines each with an evaluation, and arrows for each drawn on the jieqi board.',
          caption: 'Running in a browser tab.',
        } as ArticleBlock,
        {
          kind: 'cta',
          buttons: [
            { label: 'Open the analysis board', href: '/analysis/jieqi', emphasis: 'primary' },
          ],
        },
        {
          // Deliberately no competitor named. The claims are about what this site
          // does; a table asserting what someone else lacks would need checking
          // every time they ship, and would be wrong before anyone noticed.
          kind: 'table',
          headers: ['', 'On Mistboard'],
          rows: [
            ['Play the engine or a friend', 'Free, no account'],
            ['Full-game analysis', 'Every finished game'],
            ['Luck measured separately', 'Every flip priced'],
            ['Engine in your browser', 'No queue, no account'],
            ['Studies with your own deals', 'Yes'],
            ['Open-source engine', 'Yes'],
            ['Rated ladder', 'Not yet'],
          ],
          caption: 'What you get, including what you do not.',
        },
      ],
    },
    {
      heading: 'The engine',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'PikaJieQi is a fork of [Pikafish](https://github.com/official-pikafish/Pikafish), the open-source xiangqi engine, on its jieqi branch. It only ever sees the face-down board, with every hidden piece written as a blank. It does not know the deal, and a test fails the build if that ever leaks.',
        },
        {
          kind: 'paragraph',
          text:
            "It is beatable, and the game at the top of this page is one it lost. What would fix that is a trained net: almost all of modern Pikafish's strength lives in one, and jieqi has none yet. If you train nets, or you know jieqi well enough to say where its judgement goes wrong, that is the help we would most like.",
        },
      ],
    },
    {
      heading: 'Studies',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'Save games and positions into a study, annotate the moves, share the link. There is little jieqi to study in English, so we made a start: [engine reference games](/study/wd6c7qvG) is PikaJieQi against itself, every game played to a finish. Step through them, branch off, and run the browser engine over your own line.',
        },
        {
          kind: 'cta',
          buttons: [{ label: 'Open the study', href: '/study/wd6c7qvG', emphasis: 'primary' }],
        },
      ],
    },
    {
      heading: 'Common questions',
      blocks: [
        {
          kind: 'faq',
          items: [
            {
              question: 'What is jieqi?',
              answer:
                'Jieqi is a xiangqi variant played on the same board with the same pieces, except every piece except the general starts face-down. A face-down piece moves as whatever normally starts on its square, then turns over and keeps that identity for the rest of the game. It is also called cờ úp in Vietnamese and 揭棋 in Chinese.',
            },
            {
              question: 'How is jieqi different from xiangqi?',
              answer:
                'The board, the pieces and the moves are identical to xiangqi. The difference is that you do not know which piece is which at the start, including your own, so about half your moves turn a piece over and find out. The goal is still checkmate.',
            },
            {
              question: 'Where can I play jieqi online for free?',
              answer:
                'You can play jieqi on Mistboard against the engine or against a friend. It is free, needs no account and nothing to install, and you can review any finished game with engine analysis afterwards.',
            },
            {
              question: 'Is jieqi just luck?',
              answer:
                'Reveals are random, but what you do with them is not. Mistboard measures the two separately: each flip is priced for how lucky it was, and your accuracy score is built only from your choices, so a good draw cannot flatter it and a bad one cannot spoil it.',
            },
            {
              question: 'Can a computer play jieqi well?',
              answer:
                'Reasonably, not brilliantly. Mistboard runs PikaJieQi, a fork of the open-source Pikafish xiangqi engine. It is beatable by a strong human, mainly because no neural network has been trained for jieqi and it evaluates positions by hand.',
            },
          ],
        },
      ],
    },
    {
      heading: 'Start playing',
      blocks: [
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
