// Entries for the landing News box and the /feed page.
//
// Workflow: when shipping a user-facing change, append a new entry with
// today's date. Newest first (both surfaces sort by date descending). Skip
// for internal-only changes (engine internals, infra, CI, refactors).

export type AnnouncementKind = 'status' | 'article' | 'release' | 'update';

export type Announcement = {
  date: string; // ISO YYYY-MM-DD
  kind: AnnouncementKind;
  headline: string;
  body?: string;
  href?: string;
  cta?: string; // inline link label on /feed; falls back to "Read more"
  showInHomeArticleWidget?: boolean;
};

const baseAnnouncements: Announcement[] = [
  {
    date: '2026-07-04',
    kind: 'release',
    headline: 'Xiangqi has launched.',
    body: 'Standard Chinese chess on the full 9 by 10 board is now first-class on Mistboard: play the Pikafish engine at three strengths, or challenge a friend.',
    href: '/rules/xiangqi',
    cta: 'Study the rules',
  },
  {
    date: '2026-07-03',
    kind: 'release',
    headline: 'Forum and global chat have launched.',
    body: 'The forum is open for game analysis, engine talk, and site feedback, with the homepage global chat available for quick table-talk during live sessions.',
    href: '/forum',
    cta: 'Join the forum',
  },
  {
    date: '2026-07-01',
    kind: 'release',
    headline: 'Fortress has launched.',
    body: 'Xiangqi with a pocket: every piece moves as in Chinese chess, plus crazyhouse-style drops and the new Treasure. Play the bot or challenge a friend.',
    href: '/rules/fortress-xiangqi',
    cta: 'Study the rules',
  },
  {
    date: '2026-06-30',
    kind: 'release',
    headline: 'Jungle Chess has launched.',
    body: 'Rank-based animal chess on a 7 by 9 board with rivers, dens, and traps is live. Challenge a friend or take on the Misty Jungle engine.',
    href: '/rules/jungle',
    cta: 'Read rules',
  },
  {
    date: '2026-06-30',
    kind: 'release',
    headline: 'Flip Jungle has launched.',
    body: 'A 4 by 4 hidden-identity take on Dou Shou Qi: every animal starts face-down and flips as you play. Challenge a friend or take on the MistyJungleFlip engine.',
    href: '/rules/jungle-flip',
    cta: 'Read rules',
  },
  {
    date: '2026-06-22',
    kind: 'release',
    headline: 'Drop Mini Xiangqi has launched.',
    body: 'The 7 by 7 reserve fight is live with no enemy-palace drops, a full rules page, and a 114-ply FSF sample game to study.',
    href: '/rules/drop-mini-xiangqi',
    cta: 'Study the rules',
  },
  {
    date: '2026-06-20',
    kind: 'release',
    headline: 'Dark Crazyhouse has launched.',
    body: 'Crazyhouse under Fog of War is now live for invite games, with private hands, captured pieces entering reserve, and drops into the fog.',
    href: '/rules/dark-crazyhouse',
    cta: 'Read rules',
  },
  {
    date: '2026-06-20',
    kind: 'release',
    headline: 'Dark Crossroads Chess has launched.',
    body: 'Crossroads Chess under Fog of War is now live for invite games, with hidden enemy pieces, no check warnings, and the far-rank Try.',
    href: '/rules/dark-crossroads-chess',
    cta: 'Read rules',
  },
  {
    date: '2026-06-20',
    kind: 'release',
    headline: 'Fog Shogi has launched.',
    body: 'Shogi under Fog of War is now live for invite games, with private hands, drops into the fog, and king capture wins.',
    href: '/rules/dark-shogi',
    cta: 'Read rules',
  },
  {
    date: '2026-06-20',
    kind: 'release',
    headline: 'Kriegspiel is open for alpha play.',
    body: 'The original hidden-information chess: see only your own pieces, try moves through the umpire, and challenge a friend to a match.',
    href: '/rules/kriegspiel',
    cta: 'Read rules',
    showInHomeArticleWidget: false,
  },
  {
    date: '2026-06-18',
    kind: 'release',
    headline: 'Reveal Chess is open for alpha play.',
    body: 'Standard chess with a hidden starting arrangement: every piece but the king begins face-down and reveals its true identity the moment it moves. Challenge a friend to a match.',
    href: '/rules/reveal-chess',
    cta: 'Read rules',
  },
  {
    date: '2026-06-18',
    kind: 'release',
    headline: 'Fog Xiangqi is open for alpha play.',
    body: 'Fog of War on the full 9 by 10 xiangqi board: each side sees only the points its pieces reach. Challenge a friend to a match.',
    href: '/rules/fog-xiangqi',
    cta: 'Read rules',
  },
  {
    date: '2026-06-17',
    kind: 'release',
    headline: 'Flip Xiangqi is open for alpha play.',
    body: 'Flip Xiangqi on an 8 by 4 board: all 32 pieces start face-down and flip as you play. Challenge a friend to a match.',
    href: '/rules/flip-xiangqi',
    cta: 'Read rules',
    showInHomeArticleWidget: false,
  },
  {
    date: '2026-06-15',
    kind: 'release',
    headline: 'Reveal Xiangqi is open for alpha play.',
    body: 'Hidden-identity xiangqi: every non-general piece starts face-down and reveals as it moves. Take on PikaJieQi, our jieqi engine.',
    href: '/rules/reveal-xiangqi',
    cta: 'Read rules',
  },
  {
    date: '2026-06-11',
    kind: 'release',
    headline: 'Crossroads Chess has launched.',
    body: 'A 6 by 8 chess-xiangqi variant with checkmate and king-race wins is now live on Mistboard.',
    href: '/rules/crossroads-chess',
    cta: 'Read rules',
  },
  {
    date: '2026-05-09',
    kind: 'release',
    headline: 'Fog Chess is open for alpha play.',
    body: 'Fog of War chess is live on Mistboard, with private vision, no check warnings, and king capture wins.',
    href: '/rules/fog-chess',
    cta: 'Read rules',
  },
  {
    date: '2026-05-09',
    kind: 'status',
    headline: 'Mistboard is in alpha.',
    body: 'Casual dark chess is open. Rated beta is coming.',
    href: '/contact',
    cta: 'Send feedback',
  },
  {
    date: '2026-06-09',
    kind: 'release',
    headline: 'Dark Mini Xiangqi is open for alpha play.',
    body: 'A smaller Fog of War variant on a 7 by 7 xiangqi board, with Misty engine support.',
    href: '/rules/dark-mini-xiangqi',
    cta: 'Read rules',
  },
  {
    date: '2026-06-03',
    kind: 'release',
    headline: 'Misty 1.0 has launched.',
    body: 'Our Fog of War dark chess engine is now live to play.',
    href: '/?play=computer',
    cta: 'Play the engine',
  },
];

export function announcements(): Announcement[] {
  return baseAnnouncements;
}
