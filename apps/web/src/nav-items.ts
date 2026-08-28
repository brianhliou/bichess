import type { I18nKey } from './i18n/catalog.js';
import { STREAMERS } from './streamers-data.js';

export const SHOW_ENGINE_LAB_LINKS = import.meta.env.VITE_SHOW_ENGINE_LAB_NAV === 'true';

export interface NavItem {
  label: string;
  labelKey: I18nKey;
  href: string;
  // Rendered hidden for signed-out visitors. The nav builds before auth
  // resolves, so site-shell picks the initial visibility from the persisted
  // signed-in hint and account-nav reconciles it once /api/auth/me settles.
  signedInOnly?: boolean;
  // An off-site destination (the Discord invite): rendered as-is (no locale
  // prefix), opens in a new tab, never marked active.
  external?: boolean;
  // Countries (ISO 3166-1 alpha-2) where the destination is unreachable, so the
  // item is not rendered for viewers there (viewer-geo.ts reads the country the
  // server stamped). A link that hangs is worse than no link.
  blockedIn?: readonly string[];
}

// Discord (discord.com and discord.gg) is blocked in mainland China, which was
// about a third of visitors in Aug 2026. Those visitors get the forum instead.
export const DISCORD_BLOCKED_IN: readonly string[] = ['CN'];

// The public invite to the Mistboard Discord (never expires, unlimited uses).
// Set up 2026-08-27. A discord.com/channels/... URL would only work for
// members, so the invite is the one link the site hands out.
export const DISCORD_INVITE_URL = 'https://discord.gg/Qp6AZ6qAYm';

export function primaryNavItems(): NavItem[] {
  return [
    { label: 'Play', labelKey: 'nav.play', href: '/' },
    { label: 'Puzzles', labelKey: 'nav.puzzles', href: '/puzzles' },
    { label: 'Watch', labelKey: 'nav.watch', href: '/watch' },
  ];
}

// Top-nav Community dropdown (lichess-aligned order): Players (the leaderboard),
// Coaches (the verified-coach directory), Friends (your following list), Forum,
// Blog (the articles surface), Discord (off-site invite). Teams is deliberately deferred. Kept distinct
// from communityRailItems(): the dropdown is the wide social entry, the rail is
// the leaderboard/bots sub-nav.
export function communityNavItems(): NavItem[] {
  return [
    { label: 'Players', labelKey: 'nav.players', href: '/player' },
    { label: 'Friends', labelKey: 'nav.friends', href: '/following', signedInOnly: true },
    { label: 'Forum', labelKey: 'nav.forum', href: '/forum' },
    { label: 'Blog', labelKey: 'nav.blog', href: '/blog' },
    {
      label: 'Discord',
      labelKey: 'nav.discord',
      href: DISCORD_INVITE_URL,
      external: true,
      blockedIn: DISCORD_BLOCKED_IN,
    },
  ];
}

// Community sub-navigation rail (lichess parity): Leaderboard + Online bots for
// now. Forum lives in the top-nav dropdown, not the rail.
export function communityRailItems(): NavItem[] {
  return [
    { label: 'Leaderboard', labelKey: 'nav.leaderboard', href: '/player' },
    { label: 'Rating stats', labelKey: 'nav.ratingStats', href: '/player/rating-stats' },
    { label: 'Online bots', labelKey: 'nav.onlineBots', href: '/bots' },
  ];
}

// Learn dropdown (lichess parity): rules are the durable starting point,
// followed by the interactive xiangqi course, then Studies and the verified-coach
// directory. The title itself links to /rules.
export function learnNavItems(): NavItem[] {
  return [
    { label: 'Rules', labelKey: 'nav.rules', href: '/rules' },
    { label: 'Xiangqi Basics', labelKey: 'nav.learnXiangqi', href: '/learn/xiangqi' },
    { label: 'Study', labelKey: 'nav.studies', href: '/study' },
    { label: 'Coaches', labelKey: 'nav.coaches', href: '/coach' },
  ];
}

// Public support link, rendered as the rightmost public nav item (left of the
// admin-only menu). Points at the existing /patron page. Labelled "Support",
// not "Donate": the page sells an optional patron subscription from a
// for-profit sole proprietorship, and donation wording reads as charitable
// fundraising to payment-processor review.
export function donateNavItem(): NavItem {
  return { label: 'Support', labelKey: 'nav.donate', href: '/patron' };
}

export function adminNavItems(): NavItem[] {
  return [
    { label: 'Database', labelKey: 'nav.database', href: '/database' },
    { label: 'Engines', labelKey: 'nav.engines', href: '/engines' },
    { label: 'Accounts', labelKey: 'nav.accounts', href: '/accounts' },
  ];
}

// Watch dropdown (lichess parity): the title links to Mistboard TV (/watch), and
// the panel lists Mistboard TV explicitly alongside tournament Broadcasts. The
// explicit TV item matters on touch / no-hover devices, where tapping the title
// opens the panel instead of navigating — without it there'd be no way to reach
// /watch from this menu. Kept minimal until there are more watch surfaces
// (streamers, video) to list.
export function watchNavItems(): NavItem[] {
  return [
    { label: 'Mistboard TV', labelKey: 'nav.tv', href: '/watch' },
    { label: 'Broadcasts', labelKey: 'nav.broadcasts', href: '/broadcast/xiangqi' },
    // The games database belongs with the watching surfaces because that is what
    // it holds: other people's finished games, from broadcasts, from the
    // archive, and from play here. It was reachable only by URL until now.
    { label: 'Games', labelKey: 'nav.games', href: '/games' },
    // Streamers appears only once the curated directory has someone in it.
    // Deriving the link from the data means an empty /streamer is never
    // reachable from the nav, and seeding the first entry needs no second edit.
    ...(STREAMERS.length > 0
      ? [{ label: 'Streamers', labelKey: 'nav.streamers' as const, href: '/streamer' }]
      : []),
    { label: 'Video library', labelKey: 'nav.videoLibrary', href: '/videos' },
  ];
}

export function utilityNavItems(): NavItem[] {
  const items: NavItem[] = [];
  if (SHOW_ENGINE_LAB_LINKS) items.push({ label: 'Lab', labelKey: 'nav.lab', href: '/lab' });
  return items;
}

// Tools dropdown (lichess parity): the analysis board is the anchor tool, the
// board editor sits beside it, and the engine Lab link folds in after them when
// enabled. Import / search are deferred until those surfaces exist.
export function toolsNavItems(): NavItem[] {
  return [
    { label: 'Analysis board', labelKey: 'nav.analysis', href: '/analysis/xiangqi' },
    { label: 'Board editor', labelKey: 'nav.editor', href: '/editor/xiangqi' },
    ...utilityNavItems(),
  ];
}
