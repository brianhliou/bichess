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
  title: 'Bring your title to Mistboard',
  seoTitle: 'For titled xiangqi and chess players',
  summary:
    'Verified titled players get a gold badge beside their name, a coaching page students can find, and a front page that will carry their work. Verification takes about two minutes.',
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
      text: 'Verified titled players get a gold badge beside their name, a coaching page students can find, and a front page that will carry their work. Verification takes about two minutes: start at [mistboard.com/verify-title](/verify-title).',
    },
    {
      kind: 'paragraph',
      text: 'Mistboard accepts WXF and CXA titles (XGM, XIM, XNM, XWGM, XWIM) and FIDE titles (GM, IM, FM, CM, WGM, WIM, WFM, WCM). Link your federation profile, give your real name, note the results behind the claim, and an admin reviews it personally.',
    },
  ],
  sections: [
    {
      heading: 'What you get',
      blocks: [
        {
          kind: 'paragraph',
          text: '**The badge.** Gold, beside your name, everywhere you appear: games, profile, ladders, forum, studies. Every player who sees you play sees the title first.',
        },
        {
          kind: 'paragraph',
          text: '**Your own coaching page.** Publish at [/coach](/coach) with your headline, languages, rate, and contact details. Students reach you directly and pay you directly. Mistboard takes nothing: no commission, no processing fees, no cut of your lesson.',
        },
        {
          kind: 'paragraph',
          text: '**The front page.** Write an annotated study and it can lead the homepage under your name. Your analysis is what players come here to read, and there is no queue in front of you.',
        },
        {
          kind: 'paragraph',
          text: '**The video library.** If you make xiangqi videos, [/videos](/videos) will carry them and send viewers your way.',
        },
        {
          kind: 'paragraph',
          text: '**A place in the streamer directory.** Stream here and get listed.',
        },
        {
          kind: 'paragraph',
          text: '**Your own byline.** Send something longer and it gets edited and published under your name, with your title beside it.',
        },
      ],
    },
    {
      heading: 'Why Mistboard',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Mistboard is where xiangqi is played in English. Free, open source, no ads, no paywall, no premium tier. Every board, every puzzle, every lesson is open to everyone who shows up.',
        },
        {
          kind: 'paragraph',
          text: 'That audience has never had a serious English-language home, and it has never had titled players to learn from. You would be among the first, on a site built to put your name in front of them rather than bury it.',
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
