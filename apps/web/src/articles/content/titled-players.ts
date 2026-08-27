import type { Article } from '../types.js';

// Supply-side recruitment page for verified titled players. Deliberately
// describes only what already ships (badge, coach listing, featurable study,
// video library, streamer directory, guest byline); every line here should stay
// checkable by a skeptical reader in one click. Xiangqi-first on purpose: the
// English-language xiangqi audience is the one thing Mistboard offers that
// nowhere else does, while chess titles are better recruited by name than by
// broadcast.
//
// The streamer line deliberately does NOT link /streamer: the directory is
// empty until someone is seeded into streamers-data.ts, and sending a recruit
// to "no streamers are listed yet" undoes the paragraph above it. Link it once
// there is someone to show.

export const titledPlayersArticle: Article = {
  slug: 'titled-players',
  kind: 'article',
  publisher: 'mistboard',
  boardFamily: 'xiangqi',
  title: 'Titled players are welcome here',
  seoTitle: 'For titled xiangqi and chess players',
  summary:
    'Verify a xiangqi or chess title and your badge shows next to your name across the site, along with a coach listing, a study that can reach the front page, and a place in the video library.',
  showSummaryOnPage: false,
  // A standing recruitment page, not a post: it is linked to directly and kept
  // current, so it stays out of the chronological blog index rather than aging
  // down it.
  showInIndex: false,
  status: 'published',
  publishedAt: '2026-08-27',
  audience:
    'Titled xiangqi players (WXF, CXA, national federations) and titled chess players curious about xiangqi.',
  intro: [
    {
      kind: 'paragraph',
      text: 'If you hold a xiangqi or chess title, verify it at [mistboard.com/verify-title](/verify-title). An admin reads every request by hand, and your badge shows next to your name across the site once it clears.',
    },
    {
      kind: 'paragraph',
      text: 'Mistboard takes WXF and CXA titles (XGM, XIM, XNM, XWGM, XWIM) and FIDE titles (GM, IM, FM, CM, WGM, WIM, WFM, WCM). Link your federation profile, give your real name, and mention the results behind the claim.',
    },
  ],
  sections: [
    {
      heading: 'Why bother',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Xiangqi has no serious English-language home. The Chinese platforms are large and good and I am not competing with them. What does not exist anywhere is a place where a xiangqi master can reach people who do not read Chinese, and where a chess player curious about xiangqi can find something better than a Wikipedia article.',
        },
        {
          kind: 'paragraph',
          text: 'That is the gap, and titled players are the part I cannot build myself.',
        },
      ],
    },
    {
      heading: 'What a verified title gets you',
      blocks: [
        {
          kind: 'paragraph',
          text: '**The badge.** Shown everywhere your name appears: games, profile, ladders, forum, studies.',
        },
        {
          kind: 'paragraph',
          text: '**A coach listing.** Publish a profile at [/coach](/coach) with a headline, languages, your rate, and how students should reach you. No commission and no payment processing. Students reach you directly.',
        },
        {
          kind: 'paragraph',
          text: '**An annotated study.** Write one and I can feature it on the homepage under your name.',
        },
        {
          kind: 'paragraph',
          text: '**The video library.** If you make xiangqi videos, [/videos](/videos) will carry them.',
        },
        {
          kind: 'paragraph',
          text: '**A streamer listing.** If you stream, you get a place in the directory.',
        },
        {
          kind: 'paragraph',
          text: '**A byline.** Send me something longer and I will edit and publish it under your name.',
        },
        {
          kind: 'paragraph',
          text: 'The study is the one I would push hardest. A master’s annotations are worth more to a learner here than anything I can write.',
        },
        {
          kind: 'paragraph',
          text: 'You would be early, nothing here is behind a paywall, and I answer my own email.',
        },
        {
          kind: 'cta',
          layout: 'single-row',
          buttons: [
            { label: 'Verify your title', href: '/verify-title', emphasis: 'primary' },
            { label: 'Ask me something first', href: '/contact', emphasis: 'secondary' },
          ],
        },
      ],
    },
  ],
};
