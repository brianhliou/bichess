// Article slug -> page meta. Content source of truth is
// apps/web/src/articles-data.ts; this map duplicates only the share-card
// surface (title + description) plus `kind`, which decides the canonical URL
// space: kind 'rules' lives under /rules/<slug>, everything else under
// /blog/<slug>. The server can't import the web bundle, so the
// duplication is enforced by apps/web/src/articles-meta-sync.test.ts: a new
// or renamed article without a matching entry here fails web tests instead
// of shipping a wrong-direction 301 or a generic share card.
export type ArticleKind = 'rules' | 'article';

const NON_INDEXED_ARTICLE_SLUGS = new Set(['shogi', 'shogi4', 'dark-shogi']);

// Rules pages for variants retired from public surfaces (the source of truth is
// VARIANT_PUBLIC_SURFACE_ENABLED in apps/web/src/variant-public-surfaces.ts).
// Their URLs stay live on purpose and the prerenderer already stamps them
// `noindex, follow`; this set is what keeps the SITEMAP from advertising them
// anyway, which had the site telling Google to index pages the pages
// themselves declined.
//
// This is a second copy of a list the server cannot import, so it is only safe
// because articles-meta-sync.test.ts fails when the two disagree. Do not edit
// one end alone.
const RETIRED_RULES_SLUGS = new Set([
  'crossroads-chess',
  'dark-crazyhouse',
  'dark-crossroads-chess',
  'dark-draft960',
  'dark-mini-xiangqi',
  'drop-mini-xiangqi',
  'kriegspiel',
  'mini-xiangqi',
  'reveal-chess',
]);

// Slugs that exist in articles-data but are not published yet. A draft is
// hidden in the production web build (the route 404s client-side), but the
// server still answers /blog/<slug> with a 200 shell and injects this file's
// title + description, so without this set a crawler sees a live page for an
// unpublished article. Kept in sync by articles-meta-sync.test.ts, which fails
// if a non-published article is missing here or a published one is still
// listed - so promoting an article to 'published' is what removes it, and
// nobody has to remember this file exists.
const UNPUBLISHED_ARTICLE_SLUGS = new Set([
  'xiangqi-champions',
  // Written and reviewable at /blog/<slug> in dev, deliberately not published:
  // the jieqi page wants Brian's read at full length, and the Vietnamese one
  // wants a native reader before it reaches the audience it is written for.
  'jieqi-platform',
  'co-up',
  'luat-co-up',
  'fog-openings',
  'fog-chess-concepts',
  'shogi',
  'how-puzzle-mining-works',
]);

export function articleIsUnpublished(slug: string): boolean {
  return UNPUBLISHED_ARTICLE_SLUGS.has(slug);
}

export function articleIsIndexable(slug: string): boolean {
  return (
    !NON_INDEXED_ARTICLE_SLUGS.has(slug) &&
    !UNPUBLISHED_ARTICLE_SLUGS.has(slug) &&
    !RETIRED_RULES_SLUGS.has(slug)
  );
}

export const ARTICLE_META: Record<
  string,
  { title: string; description: string; kind: ArticleKind }
> = {
  'co-up': {
    title: 'Cờ úp trên Mistboard',
    kind: 'article',
    description:
      'Chơi cờ úp với máy hoặc với bạn bè, miễn phí và không cần tài khoản, rồi xem lại ván đấu với phân tích engine tách riêng phần may rủi khỏi phần quyết định.',
  },
  'luat-co-up': {
    title: 'Luật cờ úp',
    kind: 'article',
    description:
      'Luật cờ úp đầy đủ: cách bày quân, cách đi quân úp trước và sau khi lật, ăn quân úp, chiếu bí và các trường hợp hòa.',
  },
  'jieqi-platform': {
    title: 'Jieqi on Mistboard',
    kind: 'article',
    description:
      'A modern jieqi platform: play the engine or a friend, free and without an account, with engine analysis that handles reveals correctly.',
  },
  chess: {
    title: 'Chess Rules',
    kind: 'rules',
    description:
      'Standard chess rules, the primer behind Fog Chess: castling, promotion, en passant, the draw rules, and a famous game to play through.',
  },
  'fog-chess': {
    title: 'Fog Chess Rules',
    kind: 'rules',
    description:
      'Fog Chess rules: chess under Fog of War, where each side sees only the squares its pieces reach, there are no check warnings, and the king falls by capture.',
  },
  'fog-chess-concepts': {
    title: 'Fog Chess Concepts',
    kind: 'article',
    description:
      'Strategy concepts for Fog Chess: read fogged squares and capture clues, model the hidden positions you could be facing, cluster them into the few that matter, and pick moves that survive every one.',
  },
  'xiangqi-champions': {
    title: 'Who Is the Greatest Xiangqi Player?',
    kind: 'article',
    description:
      'Nine hundred years of Chinese chess, and a championship only sixty-nine years old. Hu Ronghua, the men who came before the title existed, and the decade that was struck from the record.',
  },
  'fog-openings': {
    title: 'An Opening System for Fog Chess',
    kind: 'article',
    description:
      'A complete Fog of War chess opening system built on 1.c4 and 2.Qa4, measured across 899 games. The queen doubles as a sensor and sometimes captures the king on move three. Which Black replies hold, which collapse, and where the system stops working.',
  },
  'dark-draft960': {
    title: 'Dark Draft960',
    kind: 'rules',
    description:
      "Fog Chess with a sealed opening draft: each player picks one of three Chess960 back ranks and never sees the other's.",
  },
  xiangqi: {
    title: 'Xiangqi Rules',
    kind: 'rules',
    description:
      'The rules of xiangqi, also called Chinese chess, the primer behind Fog Xiangqi: palaces, the river, cannon screens, facing generals, and a famous game to play through.',
  },
  'fog-xiangqi': {
    title: 'Fog Xiangqi Rules',
    kind: 'rules',
    description:
      'Xiangqi under Fog of War: each side sees only the points its pieces reach, hidden blockers matter, and the general falls by capture.',
  },
  'mini-xiangqi': {
    title: 'Mini Xiangqi',
    kind: 'rules',
    description:
      'Mini Xiangqi rules, the 7×7 primer behind Dark Mini Xiangqi: no advisors or elephants, no river, sideways soldiers, and checkmate to win.',
  },
  'dark-mini-xiangqi': {
    title: 'Dark Mini Xiangqi',
    kind: 'rules',
    description:
      'Mini Xiangqi under Fog of War: each side sees only the points its pieces reach on the 7×7 board, and the general falls by capture.',
  },
  'drop-mini-xiangqi': {
    title: 'Drop Mini Xiangqi Rules',
    kind: 'rules',
    description:
      'Mini Xiangqi with reserves: captured pieces enter your hand, then drop back outside the enemy palace.',
  },
  'fortress-xiangqi': {
    title: 'Fortress Xiangqi Rules',
    kind: 'rules',
    description:
      'Xiangqi with a pocket: faithful piece movement plus crazyhouse-style drops and the new Treasure piece.',
  },
  'crossroads-chess': {
    title: 'Crossroads Chess Rules',
    kind: 'rules',
    description:
      'A modern variant that fuses chess and xiangqi on a 6 by 8 river board. The pieces you already know from both games, and two ways to win: checkmate, or race your king across.',
  },
  shogi: {
    title: 'Shogi Rules',
    kind: 'rules',
    description:
      'Standard shogi rules, the primer behind Fog Shogi: how the eight pieces move, promotion in the far ranks, the drop rule that puts captured pieces back in play, and how a game is won.',
  },
  'dark-shogi': {
    title: 'Fog Shogi Rules',
    kind: 'rules',
    description:
      'Fog Shogi rules: shogi under Fog of War, with private hands, drop bounces, and king capture.',
  },
  shogi4: {
    title: 'Shogi4 (4×4 Shogi) Rules',
    kind: 'rules',
    description:
      "The complete rules of Shogi4, Oca Studios' public-domain animal drop-shogi on a 4×4 board: how the Carp, Tapir, Raccoon-dog, Fox, and royal move, plus the friendly-jump, evolution, drops, and king-capture wins.",
  },
  misty: {
    title: 'How Misty Plays',
    kind: 'article',
    description:
      "Misty is Mistboard's Fog Chess engine: how it sees, searches possible boards, avoids hidden catastrophes, and where the current version stands.",
  },
  mistybanqi: {
    title: 'How MistyBanqi Plays',
    kind: 'article',
    description:
      'MistyBanqi is the engine you play in Banqi on Mistboard: a classical search engine with a hand-written evaluation. How it thinks, and the blind spot worth knowing: it can draw a game it has already won.',
  },
  'server-enforced-fog': {
    title: 'Programming Fog Chess with Server-Side Truth',
    kind: 'article',
    description:
      'How Mistboard keeps hidden information on the server: canonical state, seat-scoped views, private live rooms, and public postgame review.',
  },
  kriegspiel: {
    title: 'Kriegspiel Rules',
    kind: 'rules',
    description:
      'The complete rules of Kriegspiel, the 1899 ancestor of Fog Chess: you see only your own pieces, an umpire rejects illegal tries and announces captures, checks, and pawn tries, and checkmate wins.',
  },
  'dark-crazyhouse': {
    title: 'Dark Crazyhouse Rules',
    kind: 'rules',
    description:
      'Crazyhouse under Fog of War: captured pieces flip color into your hand and drop back into play, hands are private, you can parachute a drop into the fog, and the king falls by capture.',
  },
  'dark-crossroads-chess': {
    title: 'Dark Crossroads Chess Rules',
    kind: 'rules',
    description:
      'Crossroads Chess under Fog of War: each side sees only the squares its pieces reach, there are no check warnings, the king falls by capture, and the race to the far rank becomes a one-move gamble in the dark.',
  },
  jieqi: {
    title: 'Jieqi Rules (Reveal Xiangqi)',
    kind: 'rules',
    description:
      'The complete rules of Jieqi, the hidden-piece Chinese chess variant, in English: every piece except the generals starts face-down, makes its first move as the point it stands on, and reveals itself after moving. Play it free in your browser.',
  },
  banqi: {
    title: 'Banqi Rules (Chinese Dark Chess)',
    kind: 'rules',
    description:
      'The complete rules of Banqi, also called Chinese dark chess or blind chess: flip or move one square each turn, capture by rank, cannons jump. Play it free in your browser.',
  },
  'titled-players': {
    title: 'Bring your title to Mistboard',
    kind: 'article',
    description:
      'Verified titled players get a gold badge beside their name, a coaching page students can find, and a front page that will carry their work. Verification takes about two minutes.',
  },
  'riverbank-cannon': {
    title: 'The Riverbank Cannon Problem',
    kind: 'article',
    description:
      'Red\u2019s opening cannon reaches the riverbank first, one move from firing down any of five files, and in fog you never see it coming. Whether that breaks the game came down to one elephant move, one poisoned defense, and a coin flip we priced with the engine.',
  },
  'how-puzzle-mining-works': {
    title: 'Where Mistboard’s xiangqi puzzles come from',
    kind: 'article',
    description:
      'Mistboard ran 3,500 real xiangqi games through Pikafish looking for tactics. It found 10,503 blunders and published 1,211 of them. The reasons the other 9,292 were thrown out turn out to be a working definition of what a puzzle is.',
  },
  'skill-vs-luck': {
    title: 'Separating Skill from Luck in Flip Games',
    kind: 'article',
    description:
      'Half the moves in banqi, jieqi, and flip jungle are dice rolls, so a chess-style review blames you for variance. Mistboard’s game review splits every flip into the decision and the tile: luck-stripped accuracy, a luck line on the advantage graph, and what 52 human-versus-engine games say about who really earned their wins.',
  },
  jungle: {
    title: 'Jungle Chess Rules (Dou Shou Qi, Animal Chess)',
    kind: 'rules',
    description:
      'The complete rules of Jungle Chess, also called Dou Shou Qi or Animal Chess: eight ranked animals on a 7×9 board, the rat beats the elephant, only the rat swims, the lion and tiger leap the rivers. Play rated games and analyse them free in your browser.',
  },
  'jungle-flip': {
    title: 'Flip Jungle Rules (Flip Dou Shou Qi)',
    kind: 'rules',
    description:
      'The complete rules of Flip Jungle, the 4×4 flip version of Jungle Chess: animals start face-down, you flip or move each turn, capture by rank, equal ranks destroy each other. Play it free in your browser.',
  },
  'reveal-chess': {
    title: 'Reveal Chess Rules',
    kind: 'rules',
    description:
      'The complete rules of Reveal Chess, standard chess with a hidden starting arrangement: every piece except the king starts face-down, moves by the square it occupies, and reveals its true identity the moment it moves. Checkmate to win.',
  },
};

export function canonicalArticleBase(slug: string): 'blog' | 'rules' {
  return ARTICLE_META[slug]?.kind === 'rules' ? 'rules' : 'blog';
}
