// Article localization (zh-Hans / zh-Hant).
//
// Model: the English Article in articles-data.ts is the single structural source
// of truth. A translated render is produced by deep-cloning the article and
// substituting any string that appears as a key in the per-language dictionary.
// Board geometry (squares, piece roles, orientation, arrows) never matches a key,
// so only human-readable content (title, summary, headings, prose, board labels,
// CTA labels) is swapped. No duplicated structure → no drift when the English
// article changes shape.
//
// Dictionaries are authored from docs-private/translation-experiment-dark-chess-zh.md
// (head term 迷雾国际象棋 / 迷霧國際象棋 validated against the zh chess-variant
// community; Traditional carries the Taiwan lexical forks, not a glyph conversion).
import type { Article } from './articles-data.js';
import { contentLocalePrefix, type Locale, localizedHref } from './i18n/locale.js';

export type ArticleLang = Extract<Locale, 'zh-Hans' | 'zh-Hant'>;

export const ARTICLE_LANGS: ArticleLang[] = ['zh-Hans', 'zh-Hant'];

// URL prefix per language. `/zh-hans/blog/<slug>`, `/zh-hant/blog/<slug>`.
export const ARTICLE_LANG_PREFIX: Record<ArticleLang, string> = {
  'zh-Hans': contentLocalePrefix('zh-Hans'),
  'zh-Hant': contentLocalePrefix('zh-Hant'),
};

// Articles cross the localized publication boundary only after their English
// copy is frozen, every prose string exists in both zh scripts, and a
// maintainer explicitly opts the slug in. Native quality review is tracked
// separately. This list drives runtime links, prerendering, and the coverage
// contract. A partial dictionary may exist while work is in progress, but it
// is never a promise that the public article is localized.
export const TRANSLATED_ARTICLE_SLUGS = [
  'fog-chess',
  'fog-xiangqi',
  'chess',
  'xiangqi',
  'dark-draft960',
  'shogi4',
  'mini-xiangqi',
  'dark-mini-xiangqi',
  'drop-mini-xiangqi',
  'reveal-xiangqi',
  'flip-xiangqi',
  'mistybanqi',
  'jungle',
  'jungle-flip',
  'fortress-xiangqi',
  'misty',
  'server-enforced-fog',
] as const;

const TRANSLATED_ARTICLE_SLUG_SET = new Set<string>(TRANSLATED_ARTICLE_SLUGS);

export function isArticleTranslationPublished(slug: string): boolean {
  return TRANSLATED_ARTICLE_SLUG_SET.has(slug);
}

export function publishedArticleLang(
  slug: string,
  requested: ArticleLang | undefined,
): ArticleLang | undefined {
  return requested && isArticleTranslationPublished(slug) ? requested : undefined;
}

export function localizedArticleHref(article: Article, locale: Locale): string {
  const base = article.kind === 'rules' ? 'rules' : 'blog';
  const targetLocale =
    (locale === 'zh-Hans' || locale === 'zh-Hant') && !isArticleTranslationPublished(article.slug)
      ? 'en'
      : locale;
  return localizedHref(`/${base}/${article.slug}`, targetLocale);
}

const ZH_HANS: Record<string, string> = {
  // -- Fortress Xiangqi --
  'Fortress Xiangqi Rules': '堡垒象棋规则',
  'Xiangqi with a pocket: every familiar piece moves as in xiangqi, plus crazyhouse-style drops and one new piece, the Treasure.':
    '带持子的象棋：所有熟悉的棋子都按象棋规则移动，再加入疯狂屋式打入和一个新棋子「宝」。',
  'Fortress Xiangqi is an [Xiangqi](/rules/xiangqi) variant with a reserve, designed by Brian H. Liou in 2026 as a Mistboard original. Every familiar piece moves exactly as it does in xiangqi, and one new piece, the Treasure, joins the back rank. The new rule is the [crazyhouse](https://en.wikipedia.org/wiki/Crazyhouse) loop: capture a piece, hold it in hand, and drop it back into the fight.':
    '堡垒象棋是一种带持子的[象棋](/rules/xiangqi)变体，由 Brian H. Liou 于 2026 年为 Mistboard 原创设计。所有熟悉的棋子都完全按象棋规则移动，底线另加入一个新棋子「宝」。新规则采用[疯狂屋](https://en.wikipedia.org/wiki/Crazyhouse)的循环：吃掉棋子，将它收入持子，再打回战场。',
  'Captured material never leaves the game, so every capture becomes future pressure. A quiet trade can turn into a later attack, and a fortress can be built, then cracked open by the very material it gave away. The result is fair, decisive, comeback-rich, and short.':
    '被吃的子永远不会离开对局，因此每次吃子都会变成未来的压力。一次平静的兑子可能化为后续攻势；一座堡垒可以筑起，也可能被它送出的子力反过来攻破。由此形成的对局公平、果断、逆转机会多，而且简短。',
  'Board and palaces': '棋盘与九宫',
  'The board is 7 files (a to g) by 8 ranks, with a river between ranks 4 and 5. Each side has a 3 by 3 palace, but the two palaces sit in opposite corners: Red holds the bottom left (a1 to c3) and Black holds the top right (e6 to g8). The whole setup has 180 degree rotational symmetry.':
    '棋盘为 7 路（a 至 g）、8 横线，河界位于第 4 与第 5 横线之间。双方各有一个 3×3 九宫，但两个九宫分处对角：红方占左下角（a1 至 c3），黑方占右上角（e6 至 g8）。整个布局具有 180 度旋转对称性。',
  'The starting position. Red holds the bottom-left palace, Black the top-right, and the Treasure starts on each palace corner.':
    '初始局面。红方占左下九宫，黑方占右上九宫，双方的「宝」都从各自九宫的角上出发。',
  'Red moves first. This is open information: both players see the whole board and both reserves.':
    '红方先行。这是完全信息游戏：双方都能看到整个棋盘和双方的持子。',
  'Every standard piece moves exactly as it does in [xiangqi](/rules/xiangqi). In the diagrams below, a green dot marks a quiet destination, a green ring marks a capture, and a red cross marks a point the piece cannot reach.':
    '所有标准棋子都完全按照[象棋](/rules/xiangqi)规则移动。在下图中，绿点表示不吃子的落点，绿圈表示吃子，红叉表示该棋子无法到达的点。',
  '**Chariot:** slides any distance orthogonally, the strongest piece on the board. Here it can take the soldier on d7.':
    '**车：**沿横线或竖线移动任意距离，是棋盘上最强的棋子。此处它可以吃掉 d7 的兵。',
  '**Cannon:** moves like the Chariot on open lines, but captures only by jumping exactly one screen piece, friend or enemy. On the right, the cannon on d2 takes the chariot on d7 over its own soldier screen.':
    '**炮：**在空线上走法与车相同，但吃子时必须恰好跳过一个炮架，不论敌我。右图中，d2 的炮隔着己方兵作炮架，吃掉 d7 的车。',
  '**Horse:** steps one point orthogonally, then one point diagonally outward. If the orthogonal step is occupied, that whole direction is blocked. On the right, the soldier on d5 takes away both forward destinations.':
    '**马：**先沿横向或纵向走一步，再向外斜走一步。如果第一步的位置被占据，该方向就会蹩马腿。右图中，d5 的兵封住了马向前的两个落点。',
  '**Elephant:** moves exactly two points diagonally, is blocked by an occupied midpoint (the elephant eye), and can never cross the river.':
    '**象：**沿对角线恰好走两点，中点（象眼）有子时会被塞象眼，而且永远不能过河。',
  '**Advisor:** moves one point diagonally and stays inside the palace.':
    '**士：**沿对角线走一点，并且始终留在九宫内。',
  '**General:** moves one point orthogonally and stays inside the palace. One xiangqi rule retires itself here: because the palaces sit in opposite corners, the two generals never share a file, so the facing-generals rule never comes into play.':
    '**将帅：**沿横向或纵向走一点，并且始终留在九宫内。有一条象棋规则在这里自然失效：两个九宫位于对角，两位将帅永远不会处于同一路，因此不会出现将帅照面的情况。',
  '**Soldier:** moves one point forward or sideways, never backward. It has the sideways step from the opening move, where a xiangqi soldier earns it only by crossing the river. Every Fortress soldier is a veteran: the war is already on.':
    '**兵：**向前或横向走一点，不能后退。它从开局起就能横走，而普通象棋的兵要过河后才获得这一能力。堡垒象棋里的每个兵都是老兵：战事早已开始。',
  '**Treasure:** the one new piece. It steps one point in any of the eight directions, all game. It never promotes and is never confined. Think of it as a queen that only steps one square: a strong palace defender early, and a flexible attacker once it advances or is dropped.':
    '**宝：**唯一的新棋子。整局都可以向八个方向中的任一方向走一点。它不会升变，也不受区域限制。可以把它看作每次只走一格的后：开局时是强力的九宫守卫，前进或打入后则是灵活的攻击子。',
  'The Treasure steps one point in any of the eight directions. Here it has eight moves, including the capture on e5.':
    '「宝」可以向八个方向中的任一方向走一点。此处它有八种走法，包括吃掉 e5 的棋子。',
  'There are no promotions and no past-river changes. Soldiers move the same on both sides of the river; the river only stops the Elephant, which never crosses it.':
    '没有升变，也没有过河后的走法变化。兵在河界两侧的走法相同；河界只限制永远不能过河的象。',
  'Capture, hold, drop': '吃子、持子、打入',
  'When you capture an enemy piece, it flips to your color and enters your hand. The hand is open information: it can hold any number of pieces, and they can wait there for any number of turns. On your turn you either move a piece on the board, or spend the move to drop one piece from hand onto an empty point.':
    '吃掉敌方棋子后，它会变成你的颜色并进入持子。持子是公开信息，可以容纳任意数量的棋子，也可以保留任意多个回合。轮到你时，可以移动盘面上的棋子，也可以用这一回合把一枚持子打入空点。',
  'Attackers drop anywhere, including deep in the enemy half: the Chariot, Horse, Cannon, Soldier, and Treasure. Defenders drop only where they could legally stand.':
    '攻击子可以打入任何位置，包括敌方纵深：车、马、炮、兵和宝。防守子只能打入其本来可以合法停留的位置。',
  'A captured Advisor drops only onto an empty point of your own palace.':
    '被吃的士只能打入己方九宫内的空点。',
  'A captured Elephant drops onto any empty point in your own half.':
    '被吃的象可以打入己方半场的任意空点。',
  'A dropped piece is live immediately. A drop may give check or deliver checkmate, and a dropped Soldier can step sideways wherever it lands. The one limit is the usual one: no move, drop included, may leave your own general in check.':
    '打入的棋子立即生效。打入可以将军或将死，打入的兵无论落在哪里都可以横走。唯一限制与平常相同：任何着法，包括打入，都不能让己方将帅处于被将军状态。',
  'How games end': '对局如何结束',
  'Checkmate wins. A player left with no legal move loses by stalemate, the xiangqi convention. There is no fifty-move or no-progress draw and no shogi-style impasse rule: the game continues until one side breaks.':
    '将死获胜。按照象棋惯例，无合法着法的一方因困毙而负。没有五十回合规则或无进展和棋，也没有将棋式的入玉规则：对局会继续，直到一方被攻破。',
  'Repetition is governed by the chasing rule. When the same position occurs for the third time, the game is adjudicated: if one side gave check with every move of the repeating cycle, that side loses. You cannot perpetual-check your way out of a lost game. A repetition that neither side is forcing with checks is an honest standoff and is drawn, the only drawn result in the game.':
    '重复局面由长将规则裁定。同一局面第三次出现时进行判定：如果一方在重复循环中的每一步都在将军，该方判负。不能靠长将逃出败势。若双方都没有用连续将军强迫重复，则视为真正的僵持并判和，这是本游戏唯一的和棋结果。',
  'Games can also end by timeout, resignation, or abandonment.':
    '对局也可能因超时、认输或弃局而结束。',
  'What makes it Fortress Xiangqi': '为什么它叫堡垒象棋',
  'Most chess variants trade fairness for decisiveness. Drops break that tradeoff: they keep the game fair while cutting draws and shortening play, and your captured material comes back at your own king, so every exchange is a real decision. Cheap pieces parachuted behind enemy lines deliver many of the finishes, which is the good kind of explosive.':
    '多数棋类变体会用公平性换取更果断的结果。打入打破了这种取舍：它既保持公平，又减少和棋、缩短对局；你被吃掉的子力还会回头攻击自己的将帅，因此每次兑子都是实质抉择。许多终局由廉价棋子空降敌后完成，带来恰到好处的爆发力。',
  'The rules were locked by engine testing rather than taste. Both-side attacker drops won out over a same-side variant that built beautiful fortresses but ran to 246-ply grinds. In engine sampling of the final rules, about 11 percent of games were drawn, one win in five came from behind, and the average game ran 83 plies.':
    '规则由引擎测试定案，而不是凭个人喜好。允许攻击子打入双方半场的版本胜过了只许打入己方半场的版本；后者虽然能筑出漂亮堡垒，却会拖成长达 246 回合步的苦战。在最终规则的引擎抽样中，约 11% 的对局为和棋，五场胜局中有一场来自逆转，平均对局长度为 83 回合步。',
  'Step through this engine game played under the production rules. Both sides spend their reserves early and often: watch Red build the attack from hand with the cannon drop at move 13 and the treasure drop at move 16, the advisor drop back into its own palace to defend at move 19, and the finish, where the mating pieces arrive by parachute.':
    '逐步回放这盘按生产规则进行的引擎对局。双方很早就频繁使用持子：观察红方如何在第 13 回合打入炮、第 16 回合打入宝，从持子构筑攻势；又如何在第 19 回合把士打回己方九宫防守；最后，将死棋子如同空降般抵达战场。',

  // -- How Misty Plays --
  'Misty is the bot you play on Mistboard in Fog of War chess. It is not allowed to peek. The server sends it the same kind of limited view a human player gets, then Misty has to choose a move from that uncertainty.':
    'Misty 是你在 Mistboard 迷雾国际象棋中对弈的机器人。它不允许偷看。服务器只会向它发送与人类玩家同类的受限视野，然后 Misty 必须在这种不确定性中选择着法。',
  'It plays under the same fog you do': '它和你在同一片迷雾下对弈',
  'Misty never sees the canonical board. Each move, it gets only what the side to move can legally observe under Fog of War: its own pieces, the squares they see, and the captures in view. Everything else is hidden. It plays under the same rules you do, and you can verify that: Mistboard is open source, so anyone can audit the server code that enforces the fog before the engine sees a position.':
    'Misty 永远看不到规范真实棋盘。每一步，它只会得到轮到走棋的一方在迷雾国际象棋规则下可以合法观察的内容：自己的棋子、这些棋子能看见的格子，以及视野内发生的吃子。其余一切都被隐藏。它与你遵守相同规则，而且这一点可以验证：Mistboard 是开源的，任何人都能审计在引擎看到局面之前执行迷雾规则的服务器代码。',
  'A classical chess engine like Stockfish has one advantage: it can see the whole board. It picks its move by searching the game tree, looking ahead through the lines both sides could play and backing up the best line (minimax). The search assumes a single true position and a single true continuation.':
    'Stockfish 这样的经典国际象棋引擎有一个优势：它能看到整个棋盘。它通过搜索博弈树来选择着法，向前推演双方可能走出的变化，再回传最佳变化的价值（极小化极大算法）。这种搜索假设只有一个真实局面和一条真实的延续。',
  "Under fog there is no single position to search. Misty can't see the opponent's pieces, so the board it has to reason about is a belief set: many legal boards consistent with what it has observed. A move that wins on one board can hang the king on another. Misty samples from that set, searches those worlds, and looks for a move that holds up across them.":
    '迷雾下不存在一个可供搜索的单一局面。Misty 看不到对手的棋子，因此它必须推理的是一个信念集合：许多与已观察信息一致的合法棋盘。同一步棋可能在一个棋盘上获胜，却在另一个棋盘上白送国王。Misty 从集合中采样，搜索这些可能世界，并寻找在它们之中都站得住脚的着法。',
  'That family of approach is called perfect-information Monte Carlo. It is also the family used by Obscuro, the strongest published Fog of War chess engine. The hard part is not just playing chess. It is keeping the hidden-board model honest while the clock is running.':
    '这一类方法称为完全信息蒙特卡洛。公开发表的最强迷雾国际象棋引擎 Obscuro 也采用同类方法。难点不只是下好国际象棋，而是在时钟不停走动时，让隐藏棋盘模型始终忠于已知信息。',
  "What's hard": '难点在哪里',
  'Two things. The first is the possible-board set itself. A few plies into a foggy middlegame, "every consistent board" blows up fast. Misty has to keep that uncertainty under control inside a live-game time budget.':
    '有两个难点。第一个就是可能棋盘的集合本身。迷雾中局只走几个回合步后，「所有一致的棋盘」数量就会迅速爆炸。Misty 必须在实时对局的时间预算内控制这种不确定性。',
  'The second is picking a move over that set. Scoring one move means weighing it across thousands of possible boards at once, and the obvious way to do that, averaging the outcomes, quietly buries disasters. A move that loses the king on a small slice of boards may barely move the average, but it still loses those games outright. Reasoning well over a distribution of boards, rather than a single board, is most of what the engine does.':
    '第二个难点是在这个集合上选择着法。为一步棋评分，意味着同时衡量它在数千个可能棋盘上的表现；最直观的办法是取结果平均值，却会悄悄掩埋灾难。如果一步棋只在少部分棋盘上丢王，平均分可能几乎不变，但那些对局仍会直接输掉。引擎的大部分工作，就是针对棋盘分布而非单一棋盘进行可靠推理。',
  'What changed in the current release': '当前版本有哪些变化',
  'The current production engine is Misty 1.5. Most of the work since the first public release has been hardening, not a new personality: avoid rare king walks into hidden captures, avoid major-piece hangs in fog, stop stale search memory from leaking into a new live position, see fog-castles during search, and steer away from unstable early lines with a small opening book.':
    '当前生产引擎是 Misty 1.5。首次公开发布后的大部分工作都在加固，而不是塑造新个性：避免国王偶尔走进隐藏吃子范围，避免大子在迷雾中白送，阻止过期的搜索记忆泄漏到新的实时局面，在搜索中看见迷雾下的王车易位，并用小型开局库避开不稳定的早期变化。',
  'That does not make Misty solved or perfectly safe. It means the cheap fog-specific failures that made earlier versions look silly are much rarer, so games against it test your understanding instead of your patience.':
    '这并不意味着 Misty 已被彻底解决或绝对安全。它意味着那些让早期版本显得可笑的低级迷雾特有错误已经少见得多，因此与它对弈考验的是你的理解，而不是耐心。',
  'Where it stands': '它目前处于什么水平',
  "Misty is the strongest Fog of War chess engine I've seen available to play, but version numbers are not ratings. The yardstick that matters is human play, and I won't put a number on it until a serious human match earns one.":
    'Misty 是我见过可以直接对弈的最强迷雾国际象棋引擎，但版本号不是等级分。真正有意义的标尺是人类实战；在一场严肃的人机比赛给出依据之前，我不会为它标上数字。',
  "What's next": '下一步是什么',
  'Misty itself stays focused on Fog of War chess. The same redacted engine protocol now supports variant-specific siblings, including Misty DMX for Dark Mini Xiangqi and MistyBanqi for Banqi, but those are separate engines with their own rules and evaluation problems.':
    'Misty 本身会继续专注于迷雾国际象棋。同一套脱敏引擎协议现在也支持针对特定变体的同系引擎，包括迷雾迷你象棋的 Misty DMX 和暗棋的 MistyBanqi，但它们是独立引擎，各有自己的规则与评估问题。',
  "Misty is live on Mistboard, and every serious game against it sharpens the estimate of where it stands. Play one, and you're part of the benchmark.":
    'Misty 已在 Mistboard 上线，每一盘严肃的人机对局都会让我们更准确地估计它的水平。来下一盘，你也会成为这项基准的一部分。',
  'All articles': '全部文章',
  'For engine builders': '致引擎开发者',
  "If you build Fog of War engines, I'd like to play yours against Misty. There's almost no public head-to-head data between engines for this variant, and engine-vs-engine games are the cleanest way to see where any of them stand. Get in touch and we'll set up a match.":
    '如果你在开发迷雾国际象棋引擎，我希望让它与 Misty 对弈。这个变体几乎没有公开的引擎正面对战数据，而引擎之间的比赛是判断各自水平最清晰的方式。联系我们，我们可以安排一场比赛。',
  'Get in touch': '联系我们',
  References: '参考资料',
  '[Obscuro (Zhang & Sandholm, ICLR 2026)](https://arxiv.org/abs/2506.01242). The academic neighbor is Reconnaissance Blind Chess, whose engine lineage runs StrangeFish (CMU, 2018), ReBeL (FAIR, 2020), Penumbra (Georgia Tech), and Obscuro (CMU, 2026).':
    '[Obscuro（Zhang 与 Sandholm，ICLR 2026）](https://arxiv.org/abs/2506.01242)。与之相邻的学术领域是侦察盲棋，其引擎谱系包括 StrangeFish（CMU，2018）、ReBeL（FAIR，2020）、Penumbra（Georgia Tech）和 Obscuro（CMU，2026）。',

  // -- Programming Fog Chess with Server-Side Truth --
  'Truth stays server-side': '真实局面留在服务器端',
  'The triptych is the architecture in miniature. The center board exists only on the server. White and Black each receive a different projection, and neither projection contains the full truth with a visual layer hiding it.':
    '这组三联棋盘就是整个架构的缩影。中央棋盘只存在于服务器上。白方与黑方各自收到不同的投影视图，任何一份投影都不是用视觉图层遮住完整真实局面。',
  'The rule is simple: compute truth once, project the allowed view per seat, and keep the full event log private until the game is over.':
    '规则很简单：只计算一次真实状态，再为每个席位投影其获准看到的视图，并在对局结束前将完整事件日志保持私密。',
  'That single boundary supports live PvP, engine games, calibration, tournaments, and review. This article stays focused on the player-facing live room: what each browser receives, who can receive it, and when the record becomes public.':
    '这一条边界同时支撑实时玩家对战、引擎对局、校准、赛事和复盘。本文聚焦面向玩家的实时房间：每个浏览器会收到什么、谁可以接收，以及对局记录何时公开。',
  'How views are computed': '视图如何计算',
  'For a player, the boundary is `PlayerView`: visible squares, visible pieces, legal moves, status, and clock for that seat. Opponent pieces outside the visibility set are not hidden fields. They are absent.':
    '对玩家而言，这条边界就是 `PlayerView`：该席位可见的格子、可见棋子、合法着法、状态和时钟。可见范围之外的对方棋子不是被藏在字段里，而是根本不存在于数据中。',
  'The important part is the direction of dependency. The client can render fog because it receives a visibility mask, but it cannot remove fog to recover pieces it was never sent.':
    '关键在于依赖方向。客户端因为收到可见性掩码而能够渲染迷雾，却无法通过移除迷雾来恢复从未发送给它的棋子。',
  'Sample data payload': '示例数据载荷',
  'The live move stream uses `event-appended`, a per-move frame. This is the white payload from the position above, shortened to the fields that matter:':
    '实时走子流使用 `event-appended`，每步发送一帧。下面是上方局面中发给白方的载荷，已缩减为关键字段：',
  '**Core fields:** `seat` identifies the recipient, `seq` orders the stream, `state.board` is the redacted board, `state.visibleSquares` is the clear-vs-fog mask, and `state.status` carries the canonical turn/result state.':
    '**核心字段：**`seat` 标识接收者，`seq` 为数据流排序，`state.board` 是脱敏后的棋盘，`state.visibleSquares` 是清晰区域与迷雾区域的掩码，`state.status` 携带规范的轮次与结果状态。',
  'If the appended event is visible to this seat, the frame includes one filtered `event`. If the move is hidden, `event` is omitted and the projected `state` still advances. The player knows a turn happened, not what happened in the fog.':
    '如果新增事件对该席位可见，这一帧会包含一个经过过滤的 `event`。如果走子被隐藏，`event` 会被省略，但投影后的 `state` 仍会推进。玩家知道一回合已经发生，却不知道迷雾中发生了什么。',
  'Snapshots still exist for first connect, explicit recovery, and final resync. They carry the filtered event history needed to hydrate the client, so they are larger than per-move frames.':
    '首次连接、显式恢复和最终重新同步仍会使用快照。快照携带客户端初始化所需的过滤事件历史，因此比逐步帧更大。',
  'Player move': '玩家走子',
  'A move request is just coordinates:': '走子请求只有坐标：',
  'The server validates the request against canonical state, applies the move, appends an event, and projects the next view. The client never decides whether hidden information exists, whether an invisible move happened, or whether the game is over.':
    '服务器根据规范状态验证请求，执行走子，追加事件，再投影下一份视图。客户端永远不负责判断是否存在隐藏信息、是否发生了不可见走子，或对局是否结束。',
  'Seat-gated live rooms': '按席位控制的实时房间',
  'During a live game, the server sends game data only to the two seats. After each move, it projects one view for White and one view for Black, then sends each view only to a socket that has proven it controls that seat.':
    '实时对局期间，服务器只向两个对局席位发送游戏数据。每步之后，它分别为白方和黑方投影一份视图，再将每份视图只发送给已经证明自己控制该席位的套接字。',
  'Seat proof': '席位证明',
  'A socket gets live room data only after it proves control of the white or black seat. Anonymous seats use random bearer tokens; the server stores a SHA-256 token hash and compares the presented token in constant time.':
    '套接字只有在证明自己控制白方或黑方席位后，才能获得实时房间数据。匿名席位使用随机不记名令牌；服务器保存 SHA-256 令牌哈希，并以恒定时间比较提交的令牌。',
  'Account seats': '账号席位',
  'Signed-in seats add the account session check on top of the seat claim. The token proves this browser can reclaim the seat; the session proves the account still matches the seat assignment.':
    '已登录席位会在席位声明之上增加账号会话检查。令牌证明该浏览器可以取回席位；会话则证明账号仍与席位分配相符。',
  'No live spectator view': '没有实时观战视图',
  'Non-players do not get a live spectator projection. A socket without a valid seat is rejected before room data is sent, and the live replay endpoint returns 403 until the game reaches a terminal state.':
    '非对局玩家不会获得实时观战投影。没有有效席位的套接字会在房间数据发送前被拒绝，而实时回放端点会一直返回 403，直到对局进入终局状态。',
  'Postgame review': '赛后复盘',
  'When the game becomes terminal, the privacy rule changes. The room no longer rejects non-players after the result, and the game page becomes the durable public review surface.':
    '对局进入终局状态后，隐私规则随之改变。结果产生后，房间不再拒绝非对局玩家，游戏页面则成为持久的公开复盘界面。',
  'A spectator who opens the room during play gets no board. The same person can open the finished game page after the result and inspect the event log. That is the product rule: private while decisions are live, reviewable once the record is settled.':
    '观众在对局进行时打开房间，看不到棋盘。结果产生后，同一个人可以打开已结束的游戏页面并检查事件日志。这就是产品规则：决策仍在进行时保持私密，记录确定后可以复盘。',
  'That split is important for rated play. A rated result can point at a public completed game without giving non-players access to live hidden information.':
    '这种区分对计分对局很重要。计分结果可以指向一盘公开的已完成对局，同时不让非对局玩家接触实时隐藏信息。',
  'It also keeps reconnect and review on the same foundation. Live reconnect rebuilds a filtered player view from the event log. Postgame review uses the same log after the hidden-information constraint has expired.':
    '它也让重连与复盘建立在同一基础上。实时重连从事件日志重建过滤后的玩家视图；隐藏信息限制失效后，赛后复盘使用同一份日志。',
  'Scope and verification': '范围与验证',
  'This is not a full anti-cheat claim. It is the narrower integrity claim this architecture can prove: during live play, hidden truth is not sent to unauthorized browser paths; after the game ends, the record is reviewable.':
    '这并不是一项完整的反作弊声明，而是该架构能够证明的、更具体的完整性保证：实时对局期间，隐藏真实状态不会发送到未经授权的浏览器路径；对局结束后，记录可供复盘。',
  'Anonymous casual seats are bearer-token seats, not account-grade identity, and there is no live spectator mode for hidden-information games.':
    '匿名休闲席位依靠不记名令牌，并不具备账号级身份保证；隐藏信息游戏也没有实时观战模式。',
  'Mistboard covers this boundary with WebSocket and payload regression tests that drive real moves and assert on the bytes each seat receives.':
    'Mistboard 用 WebSocket 与载荷回归测试覆盖这条边界：测试会执行真实走子，并断言每个席位实际收到的字节。',
  'That is the line Mistboard defends: during play, there is no browser-side truth to unmask. After play, there is a public record to inspect.':
    '这就是 Mistboard 守住的界线：对局期间，浏览器端没有可以揭开的真实局面；对局结束后，则有公开记录可供检查。',

  // -- How MistyBanqi Plays (engine article) --
  'How MistyBanqi Plays': 'MistyBanqi 是怎么下棋的',
  'MistyBanqi is the engine you play in Banqi on Mistboard: a classical search engine with a hand-written evaluation. How it thinks, and the blind spot worth knowing: it can draw a game it has already won.':
    'MistyBanqi 是你在 Mistboard 上对弈暗棋时面对的引擎：一个采用手写评估的经典搜索引擎。它如何思考，以及一个值得知道的盲点：它会把已经赢定的棋下成和棋。',
  'How it thinks': '它如何思考',
  "Banqi hides information in its own way: every tile starts face-down, and flipping one reveals a random piece from the bag of what's left. So unlike chess, the engine's search tree mixes ordinary moves with chance events. MistyBanqi treats a flip as a chance node, averaging over the pieces the tile might turn out to be, and otherwise searches like a classical chess engine: it looks ahead through the lines both sides could play and backs up the value of the best one.":
    '暗棋以自己独特的方式隐藏信息：每枚棋子起初都背面朝下，翻开一枚，就会从剩下的棋子里随机翻出一枚。因此和国际象棋不同，引擎的搜索树里既有普通着法，也有随机事件。MistyBanqi 把翻子当作一个概率节点，对这枚棋子可能翻出的各种身份取加权平均；其余部分则像经典国际象棋引擎那样搜索：向前推演双方可能走的着法，再把最佳一路的价值回传上来。',
  "What it can't do is judge a position by feel. Every leaf of that search gets scored by a hand-written evaluation: material on a corrected value table (the cannon, which captures by jumping a screen, is the most dangerous piece on the board), how many squares each piece controls, how exposed the general is, and a handful of other terms. The engine is only as good as those terms, which is where the weakness below comes from.":
    '它做不到的是凭感觉判断局面。这棵搜索树的每个叶子节点，都由一套手写的评估来打分：基于一张修正过的子力价值表的子力（炮靠隔子吃，是盘面上最危险的棋子）、每枚棋子控制多少格、将帅有多暴露，以及另外一些项。引擎的水平完全取决于这些项的好坏——下面要讲的弱点正源于此。',
  'Most of the time, it wins': '大多数时候，它会赢',
  "MistyBanqi will beat most people, and it does it the way a classical engine does: by calculating captures several moves deep. Step through a game where it clears the board. Banqi swings with the flips, so it even fell behind on material early here, then worked its way back until the opponent had no piece left to move. Tiles flip to their dealt piece the first time they're turned over.":
    'MistyBanqi 能赢过大多数人，而它取胜的方式正是经典引擎的方式：往前算上好几步的吃子。逐步回放下面这盘它把对手清光的棋。暗棋的局势随翻子起伏，这盘里它开局甚至一度子力落后，随后一步步扳了回来，直到对手没有棋子可走。每枚棋子第一次被翻开时，会翻出它所发到的身份。',
  'That kind of capture-by-capture calculation is the strong half of its game. The blind spot is the other half: what happens when the win needs no more captures, just patience.':
    '这种一子一子算下去的计算，是它棋力强的那一半。盲点是另一半：当胜利不再需要吃子、只需要耐心时，会发生什么。',
  'It can draw a game it has won': '它会把赢定的棋下成和棋',
  'Here is the same engine in a position it has completely won. It is up ten pieces to two, with nothing left to capture, and the only task is to walk the win home. It draws instead.':
    '同样这个引擎，下面处在一个它已经完全赢定的局面。它以十子对两子领先，已经没有子可吃，唯一要做的就是把胜势走到底。结果它却下成了和棋。',
  "Nothing in the evaluation rewards converting a won position over just holding material, so a position it's winning by a mile and a position it has actually won score about the same. With no term pushing it to make progress, it shuffles, and Banqi's threefold-repetition rule ends the game a draw.":
    '评估里没有任何一项会因为「把优势转化为胜利」而比「单纯守住子力」给更高的分，于是一个遥遥领先的局面和一个真正已经赢下的局面，得分几乎一样。既然没有哪一项促使它取得进展，它就只是来回挪子，而暗棋的三次重复局面规则便把这盘判成和棋。',
  "There's an upshot for you here. If you're losing on material, you're not necessarily lost: herd one of its strong pieces into a perpetual chase, and MistyBanqi may walk into the draw it can't see it should decline.":
    '这对你有个实用的启示。如果你子力落后，并不一定就输了：用长捉缠住它的一枚大子，MistyBanqi 可能就一头走进那个它看不出自己本该拒绝的和棋。',
  'It can also lose its own general': '它也可能丢掉自己的将帅',
  'A related blind spot involves the general. A soldier is the only piece that can capture it, and the engine is slow to make room for a general boxed into a corner. It will sometimes march a piece off to the far side of the board while a lone enemy soldier walks up and traps it. Same gap as the draw above: the evaluation has no real sense of a slow, quiet threat building several moves away.':
    '另一个相关的盲点和将帅有关。只有兵（卒）能吃将帅，而当将帅被逼到角落时，引擎迟迟不为它腾出退路。有时它会把一枚棋子调到棋盘另一头，任由一枚孤零零的敌方兵走上来把将帅困死。这和上面的和棋是同一类毛病：评估对一个缓慢、安静、还要好几步才成形的威胁，没有真正的感觉。',
  'How each of these was found, reproduced, and measured is written up in detail in the engineering post linked below.':
    '这些问题各自是如何被发现、复现并量化的，下面链接的工程博客文章里有详细记录。',
  'Why these exist, and what’s next': '为什么会有这些问题，以及下一步',
  "These are the limits of a hand-written evaluation: it can only value what someone thought to encode, and conversion and slow king-hunts are exactly the long-horizon calls that are hard to write down. The fix the strongest Dark Chess programs use is a learned evaluation, trained from game outcomes, which lets the engine judge these on its own. That's the eventual next step for MistyBanqi. Until a learned version clears the current engine's bar in testing, the hand-written one is what you play: strong, and honest about where it cracks.":
    '这些是手写评估的局限：它只能给有人想到要编码进去的东西打分，而「把胜势转化为胜利」和「缓慢围猎将帅」恰恰是那种很难写成规则的长程判断。最强的暗棋程序采用的解法，是一套从对局胜负中学习得到的评估，让引擎能自己判断这些。这也是 MistyBanqi 终将迈出的下一步。在学习版于测试中越过现有引擎这道门槛之前，你面对的仍是手写版：强，且对自己会在哪里出问题保持坦诚。',
  'Play it': '来下一盘',
  'MistyBanqi is live on Mistboard. Take it on at the strength you pick, or read the full writeup of how it was built and measured.':
    'MistyBanqi 已在 Mistboard 上线。来按你选择的强度挑战它，或阅读它如何被构建与衡量的完整记录。',
  'The engineering story': '工程幕后故事',
  Human: '人类',
  'Human vs engine · mistboard.com': '人类对引擎 · mistboard.com',
  'Human vs engine': '人类对引擎',
  'Draw by repetition · MistyBanqi up 10 pieces to 2': '重复局面和棋 · MistyBanqi 十子对两子领先',
  'MistyBanqi wins · the opponent is left with no piece to move':
    'MistyBanqi 获胜 · 对手已无子可走',
  "MistyBanqi (Red) is up ten pieces to two, a trivially won position, but its evaluation gives no reward for converting a win over holding material, so it shuffles instead of pressing and the game is drawn by threefold repetition. If you're losing on material against it, this is the escape: herd a strong piece into a perpetual chase and it may let the draw happen.":
    'MistyBanqi（红方）以十子对两子领先，是一个轻松赢定的局面，但它的评估并不会因为「把优势转化为胜利」而比「守住子力」给更高的分，于是它只来回挪子、不去逼抢，最终因三次重复局面被判和棋。如果你对它子力落后，这就是脱身之道：用长捉缠住一枚大子，它也许就放任和棋发生。',
  'MistyBanqi (the first player) won this one outright, leaving the opponent with nothing to move. Banqi swings hard with the flips: it fell behind on material early here, then calculated its way back and cleared the board. Grinding down a position like this, capture by capture, is the strong half of its game.':
    'MistyBanqi（先手）干净利落地赢下了这盘，让对手无子可走。暗棋的局势随翻子剧烈起伏：这盘里它开局子力落后，随后凭计算一步步扳回，把对手清光。像这样一子一子地碾下去，是它棋力强的那一半。',

  // -- Article index cards --
  'How Misty Plays': 'Misty 是怎么下棋的',
  "Misty is Mistboard's Fog of War chess engine: how it sees, searches possible boards, avoids hidden catastrophes, and where the current version stands.":
    'Misty 是 Mistboard 的迷雾国际象棋引擎：它如何观察、搜索可能局面、避开隐藏灾难，以及当前版本处在什么水平。',
  'How Mistboard keeps hidden information on the server: canonical state, seat-scoped views, private live rooms, and public postgame review.':
    'Mistboard 如何把隐藏信息留在服务器端：规范真实局面、按座位投影视野、私密实时房间，以及公开的赛后复盘。',

  // -- Drop Mini Xiangqi (rules) --
  'Drop Mini Xiangqi Rules': '投放迷你象棋规则',
  'Mini Xiangqi with reserves: captured pieces enter your hand, then drop back outside the enemy palace.':
    '带持子的迷你象棋：被吃的棋子进入你的手牌，然后可以打回棋盘，但不能打入对方九宫。',
  'Drop Mini Xiangqi is [Mini Xiangqi](/rules/mini-xiangqi) with a reserve. The board is still 7 by 7, Red still moves first, and the general is protected by check and checkmate. The new rule is simple: captured pieces become yours, wait in your hand, and can return to the board as drops.':
    '投放迷你象棋是在[迷你象棋](/rules/mini-xiangqi)里加入持子。棋盘仍是 7×7，红方仍先走，将帅仍受将军与将死规则保护。新规则很简单：你吃掉的棋子会变成你的棋子，进入手牌，并可以通过打入回到棋盘。',
  'That reserve turns captures into future initiative. A quiet exchange can become a cannon drop, a soldier screen, or a new chariot lane several moves later.':
    '持子会把吃子变成之后的主动权。一次安静的交换，几步之后可能变成一次炮的打入、一个兵的炮架，或一条新的车路。',
  'Board and pieces': '棋盘与棋子',
  'The starting position, board, and movement are Mini Xiangqi. There are no advisors or elephants, no river, and each general remains inside its 3 by 3 palace.':
    '初始局面、棋盘与走法都沿用迷你象棋。没有士象、没有河界，每一方的将帅仍留在自己的 3×3 九宫内。',
  'This is open information. Both players see the whole board and both reserves. Unlike Dark Mini Xiangqi, there is no fog and no hidden move record.':
    '这是信息公开的游戏。双方都能看到整个棋盘和双方持子。不同于迷雾迷你象棋，这里没有迷雾，也没有隐藏的走子记录。',
  'Captures and reserves': '吃子与持子',
  'When you capture a non-general piece, it leaves the board, changes to your color, and enters your reserve. Generals are never captured and never enter a reserve: attacks on the general are checks, and a player in check must answer the threat.':
    '当你吃掉一枚非将帅棋子时，它离开棋盘，改为你的颜色，并进入你的持子。将帅永远不会被吃进持子：攻击将帅是将军，被将军的一方必须应对威胁。',
  'Instead of moving a board piece, you may drop one piece from your reserve onto an empty point outside the enemy palace. A dropped piece is live immediately: it can give check on the drop turn and moves normally on later turns.':
    '你可以不移动棋盘上的棋子，而是从持子中选择一枚，打入到对方九宫以外的空交叉点。打入的棋子立即生效：它可以在打入当手将军，之后也按正常走法移动。',
  'Drop restrictions': '打入限制',
  "Drops must land on empty points, and they cannot land inside the opponent's 3 by 3 palace. The current Mistboard rules allow chariots, horses, cannons, and soldiers in reserve. Generals never enter reserve.":
    '打入必须落在空交叉点，且不能落入对方的 3×3 九宫。目前 Mistboard 规则允许车、马、炮、兵进入持子。将帅永不进入持子。',
  'A dropped soldier follows Mini Xiangqi soldier movement after it lands: one point forward or sideways, never backward. Drops may give check immediately, and a drop is illegal if it leaves your own general in check.':
    '打入的兵落子后按迷你象棋的兵法移动：向前或横向走一个交叉点，永不后退。打入可以立即将军；如果一次打入会让自己的将帅仍处于被将军状态，则该打入不合法。',
  'Check and endings': '将军与终局',
  'Win by checkmate. As in Mini Xiangqi, a player with no legal move loses rather than drawing by stalemate. Games can also end by repetition, the no-capture rule, timeout, resignation, or abandonment.':
    '以将死获胜。与迷你象棋一样，没有合法着法的一方判负，而不是因困毙作和。对局也可能因重复局面、无吃子规则、超时、认输或弃局而结束。',
  'Step through this longer engine-lab game. It uses the current no-enemy-palace drop rule, shows both sides using reserves to defend and counterattack, and ends only after Black converts a late chariot attack.':
    '逐步重演这盘较长的引擎实验对局。它采用当前的不得打入对方九宫规则，展示双方如何用持子防守和反击，最终由黑方在后期车攻中转化胜势。',
  'FSF Red': 'FSF 红方',
  'FSF Black': 'FSF 黑方',
  'Fairy-Stockfish lab, no-enemy-palace drops': 'Fairy-Stockfish 实验局，不得打入对方九宫',
  "Black checkmates with 57...g1-f1. The final chariot capture beats Red's last defensive drop on f1.":
    '黑方以 57...g1-f1 将死。最后的车吃子击破了红方在 f1 的最后一次防守打入。',
  'Drop Mini Xiangqi is open for alpha play on Mistboard. You can play the Fairy Stockfish bot, create an invite for a friend, or find an open game from the homepage play panel by choosing Drop Mini Xiangqi in the Variant row.':
    '投放迷你象棋已在 Mistboard 开放 Alpha 对弈。你可以在首页对弈面板的“Variant”一行选择投放迷你象棋，对战 Fairy Stockfish 机器人、创建好友邀请，或寻找一局公开对局。',
  'Play the bot': '对战机器人',
  'Find opponent': '寻找对手',
  // -- Mini Xiangqi (rules) --
  'Mini Xiangqi rules, the 7×7 primer behind Dark Mini Xiangqi: no advisors or elephants, no river, sideways soldiers, and checkmate to win.':
    '迷你象棋规则，迷雾迷你象棋的 7×7 入门基础：没有士象、没有河界、兵可横走，以将死取胜。',
  'Mini Xiangqi was invented in 1973 by Shigenobu Kusumoto of Osaka, Japan. It is a simplified, reduced version of [xiangqi](/rules/xiangqi): a smaller board, fewer pieces, and no river.':
    '迷你象棋由日本大阪的楠本茂信于 1973 年发明。它是[象棋](/rules/xiangqi)的简化精简版本：棋盘更小、棋子更少，且没有河界。',
  'This page describes the open-information base game.': '本页介绍的是信息公开的底层游戏。',
  'Board and setup': '棋盘与布局',
  'Mini Xiangqi is xiangqi compressed onto a 7 by 7 board with a smaller army. The advisors and elephants are dropped and there is no river, but each general still keeps a 3 by 3 palace.':
    '迷你象棋是把象棋压缩到 7×7 棋盘、并削减子力的版本。去掉了士和象，也没有河界，但每一方的将帅仍保有一个 3×3 的九宫。',
  'Piece movement': '棋子走法',
  'Every piece except the soldier moves exactly as it does in [xiangqi](/rules/xiangqi).':
    '除兵（卒）以外，每种棋子的走法都与[象棋](/rules/xiangqi)完全相同。',
  '**Soldier:** a soldier moves and captures one point forward or sideways, never backward. With no river to cross, it has that sideways freedom from its very first move, unlike a soldier on the full xiangqi board.':
    '**兵（卒）：**兵向前或横向走一个交叉点并以此吃子，永不后退。由于没有河界可过，它从第一步起就拥有横走的自由，这与完整象棋棋盘上的兵不同。',
  'Facing generals are illegal here too. The two generals may never sit on the same open file with nothing between them, so a move that would expose that line is not allowed.':
    '将帅对脸在这里同样不合法。双方的将帅不能处在中间无子的同一条纵线上，因此任何会暴露这条直线的走法都不被允许。',
  'Winning and draws': '胜负与和棋',
  'Checkmate wins. As in xiangqi, a player who has no legal move loses rather than drawing by stalemate, and perpetual check or perpetual chase is not a free draw: a player who repeats an endless attack loses instead.':
    '将死即获胜。与象棋一样，没有合法走法的一方判负，而非因困毙而和棋；长将或长捉也不能用来免费求和：不断重复同样进攻的一方反而判负。',
  'A game is drawn when neither side has enough material to checkmate, when a long run of moves passes with no capture (xiangqi caps this much like chess’s fifty-move rule), or by a repetition that breaks none of the perpetual rules. These outcomes follow from the position, not from one player choosing to stop.':
    '当任何一方都没有足够的子力将死对方、长时间无吃子（象棋对此设有上限，类似国际象棋的五十回合规则），或出现不违反上述长打规则的重复局面时，对局判和。这些结果都由局面决定，而非某一方主动选择停手。',
  'A complete game': '一盘完整对局',
  'Mini Xiangqi has no canon of famous human games, so to watch the full army work together, step through a game in which Fairy-Stockfish, a strong open-source engine, plays both sides with full information. Notice how fast the chariots and cannons open lines: on a tight 7 by 7 board with no river, the generals come under fire far sooner than in full xiangqi.':
    '迷你象棋没有著名的人类对局传统，因此若想看全部子力协同作战，可以逐步重演一盘由强大的开源引擎 Fairy-Stockfish 在完全信息下执双方对弈的棋局。注意车和炮开线有多快：在紧凑、无河界的 7×7 棋盘上，将帅遭受火力的时间远比完整象棋来得早。',
  'Ready to try the Mistboard version? Play Misty DMX in Dark Mini Xiangqi, the Fog of War variant built on this same 7 by 7 board.':
    '准备试试 Mistboard 版本？在迷雾迷你象棋中对战 Misty DMX，这是建立在同一张 7×7 棋盘上的战争迷雾变体。',

  // -- Dark Mini Xiangqi (rules) --
  'Mini Xiangqi under Fog of War: each side sees only the points its pieces reach on the 7×7 board, and the general falls by capture.':
    '战争迷雾下的迷你象棋：在 7×7 棋盘上，每一方只能看到己方棋子可及的交叉点，将帅由被吃而落败。',
  'Fog Xiangqi readers who want the smaller experimental ruleset Mistboard is testing first.':
    '想了解 Mistboard 正在先行测试的小型实验规则的迷雾象棋读者。',
  '[Mini Xiangqi](/rules/mini-xiangqi) played with Fog of War: each player sees only their own pieces and the enemy pieces their army can reach. The board is 7 by 7, and the game ends by capturing the opposing general. If you know Mini Xiangqi, the sections below explain only what fog changes.':
    '在战争迷雾下进行的[迷你象棋](/rules/mini-xiangqi)：每位玩家只能看到己方棋子，以及己方子力可及的敌方棋子。棋盘为 7×7，以吃掉对方将帅结束对局。如果你已经会下迷你象棋，下面各节只讲解迷雾改变了什么。',
  'Board and fog': '棋盘与迷雾',
  'The board and army are the same as Mini Xiangqi. Fog of War then hides the board: you see your own pieces and every point they can reach, and everything else is fog.':
    '棋盘和子力与迷你象棋相同。战争迷雾随后遮住棋盘：你能看到己方棋子以及它们可及的每个交叉点，其余一切都是迷雾。',
  'The opening position from three angles. Red and Black each see only their own side clearly, while the server holds the true board in the middle. Vision is recomputed after every move, so opening a line or losing a piece immediately changes what each player knows.':
    '从三个视角看开局局面。红方与黑方各自只能清楚看到自己的一侧，而中间由服务器掌握真实棋盘。每走一步后视野都会重新计算，因此打开一条线路或失去一枚棋子都会立刻改变各方所掌握的信息。',
  'You never see enemy pieces outside your vision, whether a fogged point is empty, or the identity of a shrouded blocker.':
    '你永远看不到视野之外的敌方棋子，也看不到被迷雾遮住的交叉点是否为空，更看不到被遮蔽的阻挡子是什么。',
  'Capture the general to win. There is no checkmate and no check warning, so you can move into danger, leave your general exposed, or let the generals face each other across an open file.':
    '吃掉将帅即获胜。没有将死，也没有将军提示，因此你可以走入危险、让自己的将帅暴露，甚至让双方将帅在一条无遮挡的纵线上对脸。',
  "There is no stalemate draw: if the side to move has no legal move, it loses. With no check to freeze you, this almost never happens. Draws are judged from the true position, not either player's view: the game draws on threefold repetition, and also after 60 plies (30 moves by each side) without a capture.":
    '这里没有困毙判和：若轮到走子的一方没有合法着法，则判负。由于没有将军来限制你，这种情况几乎不会发生。和棋依据真实局面判断，而非任何一方各自的视野：对局会在三次重复局面时判和，也会在连续 60 个半回合（双方各 30 回合）无吃子时判和。',
  'Two pieces interact with fog in ways worth seeing up close.':
    '有两种棋子与迷雾的互动值得近距离一看。',
  'A cannon captures by jumping exactly one screen and landing on the first enemy piece beyond it. Under fog the rule is **screen shrouded, target revealed**: the screen shows as occupied but unidentified, the empty gap behind it stays fogged, and the capturable target is revealed as the enemy piece.':
    '炮吃子时正好越过一个炮架，落在其后的第一枚敌方棋子上。在迷雾下，规则是**炮架被遮、目标可见**：炮架显示为被占据但身份不明，其后的空隙仍处于迷雾中，而可吃的目标会直接显示为敌方棋子。',
  Horses: '马',
  'A horse moves one point orthogonally and then one diagonally outward, and cannot move if the leg point in between is occupied. If a hidden piece blocks the leg, the leg point shows as occupied but unidentified, and the destinations behind it drop out of your view.':
    '马先沿横竖方向走一个交叉点，再斜向外走一个交叉点；如果中间的马腿位置被占据，它就不能走。如果有一枚隐藏的棋子蹩住马腿，马腿位置会显示为被占据但身份不明，其后的落点则从你的视野中消失。',
  'A complete game under fog': '一盘迷雾下的完整对局',
  'To see the whole army work under Fog of War, step through a game where Mistboard’s engine, Misty DMX, plays both sides. Each ply is shown three ways: what Red can see, the server’s true board, and what Black can see.':
    '想看全部子力在战争迷雾下协同作战，可以逐步重演一盘由 Mistboard 引擎 Misty DMX 执双方对弈的棋局。每一手都以三种方式呈现：红方所见、服务器上的真实棋盘，以及黑方所见。',
  'Dark Mini Xiangqi is open for alpha play. You can play Misty DMX, create an invite, or find an opponent from the homepage play panel by choosing Dark Mini Xiangqi in the Variant row.':
    '迷雾迷你象棋现已开放 Alpha 对弈。你可以在首页对弈面板的“Variant”一行选择迷雾迷你象棋，然后对战 Misty DMX、创建邀请，或寻找对手。',
  'Play Misty': '对战 Misty',
  'Play Misty DMX': '对战 Misty DMX',
  'Create invite': '创建邀请',

  // -- Shogi4 (4x4 Shogi) --
  'Shogi4 (4×4 Shogi) Rules': 'Shogi4（4×4 将棋）规则',
  "The complete rules of Shogi4 (4x4 Shogi), Oca Studios' public-domain animal drop-shogi on a 4×4 board: how the Carp, Tapir, Raccoon-dog, Fox, and royal move, plus the friendly-jump, evolution, drops, and king-capture wins.":
    'Shogi4（4×4 将棋）的完整规则，由 Oca Studios 发布并进入公有领域的 4×4 棋盘动物打入将棋：鲤鱼、貘、狸、狐与王的走法，以及跳越友子、进化、打入与吃王取胜。',
  "Shogi4, also called 4x4 Shogi, is a drop-shogi played with animal tiles on a 4×4 board. It plays much like ordinary shogi shrunk to sixteen squares: pieces step in marked directions, captured pieces switch sides and drop back into play, and you win by taking the king. The one rule shogi players won't recognize is that a piece may hop over a friendly piece, added so your own pieces don't jam each other on a board this small.":
    'Shogi4（又称 4×4 将棋）是一种在 4×4 棋盘上用动物棋子进行的打入将棋。它玩起来很像缩小到十六格的普通将棋：棋子按棋面标示的方向走动，被吃的棋子改换阵营并可重新打入棋盘，吃掉王即获胜。唯一一条将棋玩家会感到陌生的规则是：棋子可以跳越一枚己方棋子，这是为了避免在这么小的棋盘上自己的棋子互相堵塞而加入的。',
  'Oca Studios released Shogi4 into the public domain in its "Four" series, free as a print-and-play set and as an app. Each player has five pieces: a Carp, a Tapir, a Raccoon-dog, a Fox, and a royal (a Crane for the first player, a Pheasant for the second).':
    'Oca Studios 在其「Four」系列中将 Shogi4 发布到公有领域，作为可打印自玩的套装和应用免费提供。每位玩家有五枚棋子：鲤鱼、貘、狸、狐，以及一枚王（先手为鹤，后手为雉）。',
  'The board and setup': '棋盘与摆子',
  "The board is 4×4, with a farm to either side that holds captured pieces. A tile's owner is shown by its facing: the first player's tiles point up the board, the second player's point down.":
    '棋盘为 4×4，两侧各有一个农场用来存放被吃的棋子。棋子的归属由朝向表示：先手的棋子朝向棋盘上方，后手的朝向下方。',
  'Every piece moves one square per turn, in the directions printed on its tile. On reaching the far row, each non-royal piece evolves, flipping to its evolved side. The pairs below show the base piece, then its evolved form, with a dot on every square each can reach (forward is up).':
    '每枚棋子每回合走一格，方向按棋面所印。到达最远一行时，每枚非王棋子都会进化，翻到其进化面。下面每一对依次展示基础棋子及其进化形态，并在各自能到达的每个格子上标一个点（上方为前进方向）。',
  '**Carp → Koi.** The Carp steps one square straight forward, a pawn. It evolves into a Koi, which moves as a silver from shogi.':
    '**鲤鱼 → Koi。**鲤鱼向正前方走一格，相当于将棋中的步兵。它进化为 Koi，走法与将棋中的银将相同。',
  '**Tapir → Baku.** The Tapir steps forward or to a forward diagonal. It evolves into a Baku, a silver.':
    '**貘 → Baku。**貘向前方或前斜方走一格。它进化为 Baku，走法同银将。',
  '**Raccoon-dog → Tanuki.** The Raccoon-dog steps one diagonal. It evolves into a Tanuki, a silver.':
    '**狸 → Tanuki。**狸向斜方走一格。它进化为 Tanuki，走法同银将。',
  '**Fox → Kitsune.** The Fox steps one orthogonal. It evolves into a Kitsune, which moves as a gold from shogi.':
    '**狐 → Kitsune。**狐向横竖方向走一格。它进化为 Kitsune，走法与将棋中的金将相同。',
  '**Crane / Pheasant.** The royal steps one square in any of the eight directions, a king. The two royals differ only in theme. It never evolves, and capturing it ends the game.':
    '**鹤 / 雉。**王可向八个方向中的任意一个走一格，相当于国际象棋的王。两种王仅在主题上不同。它永不进化，被吃掉即终局。',
  'Jumping over a friendly piece': '跳越友方棋子',
  'A piece can leap over a friendly piece. If an ally sits on the next square in a direction the piece moves, the piece jumps it and lands on the square just beyond, empty or capturing an enemy there. It works in any direction the piece itself moves: straight for a Carp, on the diagonal for a Raccoon-dog, any of the eight for the royal.':
    '棋子可以跳越一枚己方棋子。如果在该棋子可走的某个方向上、紧邻的格子里有一枚友方棋子，它便可越过这枚棋子，落到再往前的那一格上：该格可以为空，也可以吃掉那里的敌方棋子。这适用于棋子本身能走的任意方向：鲤鱼沿直线，狸沿斜线，王则可沿八个方向中的任意一个。',
  'Capturing, farms, and drops': '吃子、农场与打入',
  'Move onto an enemy to capture it; it switches sides into your farm, reverting to its base form if it was evolved.':
    '走到敌方棋子所在的格子即可吃掉它；它会改换阵营进入你的农场，若此前已进化，则恢复为基础形态。',
  "Instead of moving, drop a piece from your farm onto any empty square, except those on the far row (the opponent's back rank).":
    '你也可以不走子，而是从农场中取出一枚棋子打入任意空格，但最远一行（对方底线）除外。',
  Winning: '取胜',
  'Capturing the royal is the only way to win. No check, no checkmate: the game ends the moment a royal is taken.':
    '吃掉王是唯一的取胜方式。没有将军，也没有将死：王一旦被吃，对局立即结束。',
  'There is no stalemate. Because moving the king into capture range is legal, a lack of safe moves never ends the game: you simply make the unsafe move and play on until a king is taken. A side with no legal move at all, boxed in with nothing to drop, loses rather than draws.':
    '不存在逼和。由于把王走入可被吃的范围是合法的，缺少安全着法绝不会结束对局：你只管走那步不安全的棋，继续对弈，直到有一方的王被吃。若一方完全没有合法着法（被困住且无子可打入），则判负，而非和棋。',
  'Repetition and draws': '重复与和棋',
  "The original rules address neither repetition nor a move-count limit. Our convention fills the gap: a position reached three times is an automatic draw. That rule is ours, not Oca's, and changes none of the rules above.":
    '原始规则既未规定重复局面，也未规定步数上限。我们的约定补上了这一空缺：同一局面出现三次即自动判和。这条规则是我们定的，并非 Oca 的，且不改变上述任何规则。',
  "Fairy-Stockfish self-play on the friendly-jump engine (this site's patched build). White wins in 73 plies; the mating move is itself a friendly jump.":
    'Fairy-Stockfish 在支持越友规则的引擎（本站修补版）上进行的自我对弈。白方在 73 个半回合内取胜；制胜的那一步本身就是一次跳越友子。',
  'Starting position': '初始局面',
  'Source and license': '来源与许可',
  'Shogi4 and its tile art are by Oca Studios, which released its whole "Four" series into the public domain. The [BoardGameGeek entry](https://boardgamegeek.com/boardgame/146291/shogi4) is a catalog reference.':
    'Shogi4 及其棋子美术由 Oca Studios 创作，该工作室已将其整个「Four」系列发布到公有领域。[BoardGameGeek 条目](https://boardgamegeek.com/boardgame/146291/shogi4)可作为目录参考。',
  "We recovered the exact rules from Oca's official Shogi4 app, decompiling it to read the move logic directly: the friendly-jump geometry, the single drop ban, and king-capture as the sole win all come from there. Oca's public rules page and starting-position graphic (now reachable only through the [Internet Archive](https://web.archive.org/web/20240926113424/https://www.ocastudios.com/four/shogi/), since the live site is down) corroborate the board and the basic moves.":
    '我们通过反编译 Oca 官方的 Shogi4 应用、直接读取其走子逻辑，还原出了确切的规则：跳越友子的几何规则、唯一的打入禁区，以及以吃王作为唯一取胜方式，都来自于此。Oca 的公开规则页面和初始局面图（由于其网站已关闭，现在只能通过 [Internet Archive](https://web.archive.org/web/20240926113424/https://www.ocastudios.com/four/shogi/) 访问）也印证了棋盘和基本走法。',
  'Playing Shogi4': '开始游玩 Shogi4',
  "Shogi4 isn't playable on the site yet; for now this page is the rules reference. Browse the rest of the rules, or compare it with the chess and xiangqi primers.":
    'Shogi4 目前还不能在本站对弈；现阶段本页作为规则参考。你可以浏览其余规则，或将它与国际象棋和象棋入门相互对照。',

  // -- Dark Draft960 --
  'Dark Draft960': '迷雾选阵960',
  'The draft': '选阵',
  "The server deals each player three random Chess960 back ranks. You pick one. Your opponent independently picks one of theirs. The drafts are sealed. Neither side sees the other's offers or choice.":
    '服务器为每位玩家发出三种随机的国际象棋960 底线阵型。你从中选一种，对手也各自从自己的三种中选一种。双方的选阵都是密封的：任何一方都看不到对方的候选阵型或最终选择。',
  "Say both players picked offer A. Each side sees only its own back rank; the opponent's stays in fog. Only the server holds both.":
    '假设双方都选了候选 A。每一方只能看到自己的底线阵型，对方的则隐藏在迷雾中。只有服务器同时掌握双方的阵型。',
  '960 × 960 = **921,600** possible starts. Standard chess is one of them.':
    '960 × 960 = **921,600** 种可能的开局。标准国际象棋只是其中之一。',
  'Dark Draft960 is a future variant, not playable yet. There is no set release date.':
    '迷雾选阵960 是一个未来的变体，目前尚不可对弈，也没有确定的发布日期。',

  // -- Xiangqi primer (rules) --
  'Xiangqi Rules': '象棋规则',
  'Red and Black alternate moves, with Red first. Each side begins with 16 pieces: one general, two advisors, two elephants, two horses, two chariots, two cannons, and five soldiers. The goal is to checkmate the opposing general.':
    '红黑双方轮流走子，红方先行。每一方开局有 16 枚棋子：一个将（帅）、两个士（仕）、两个象（相）、两个马、两个车、两个炮（砲）和五个兵（卒）。目标是将死对方的将帅。',
  'The board has 9 files and 10 ranks. In the traditional presentation, pieces sit on the intersections of the lines rather than inside squares.':
    '棋盘有 9 条纵线和 10 条横线。在传统的呈现方式中，棋子落在线的交叉点上，而不是格子内。',
  "The **palace** is the 3 by 3 box on each player's back side. Generals and advisors must stay inside their own palace. The **river** divides the board in half. Elephants cannot cross it, and soldiers gain sideways movement after crossing it.":
    '**九宫**是每一方底线一侧的 3×3 区域。将帅与士仕必须留在己方九宫之内。**楚河汉界**将棋盘分为两半。象（相）不能过河，而兵（卒）过河之后可以横向走子。',
  "A piece captures by landing on an enemy-occupied point, and no piece may move through an occupied point. The cannon's capturing jump is the only exception. The pieces are listed below in the traditional order.":
    '棋子通过落在敌方占据的交叉点上来吃子，而任何棋子都不能穿过被占据的交叉点。炮的吃子跳跃是唯一的例外。下面按传统顺序列出各棋子。',
  '**General:** moves one point horizontally or vertically and can never leave its own palace. The two generals may never face each other along an open file with nothing between them: a move that would expose that line is illegal. In effect, a general guards the file in front of it like a chariot.':
    '**将（帅）：**横向或纵向走一个交叉点，永远不能离开己方九宫。双方的将帅不能在中间无子的同一条纵线上对脸：任何让这条直线暴露出来的走法都是不合法的。实际上，将帅就像一只车那样守住它正前方的纵线。',
  '**Advisor:** moves one point diagonally and, like the general, stays inside the palace.':
    '**士（仕）：**斜向走一个交叉点，与将帅一样必须留在九宫之内。',
  "**Elephant:** moves exactly two points diagonally and cannot cross the river, so it never leaves its own half. It does not jump: a piece on the midpoint of the diagonal, the elephant's eye, blocks the move.":
    '**象（相）：**沿斜线正好走两个交叉点（俗称「象走田」），且不能过河，因此它永远不会离开己方半边。它不能跳越：如果斜线中点（象眼）上有棋子，这步走法就被挡住。',
  "**Horse:** moves one point orthogonally and then one point diagonally outward, like a chess knight, but it does not jump. If the orthogonal point it steps through, the horse's leg, is occupied, the horse cannot move in that direction.":
    '**马：**先沿横竖方向走一个交叉点，再斜向外走一个交叉点，走「日」字，类似国际象棋的马，但它不能跳越。如果它经过的那个横竖交叉点（马腿）被占据（蹩马腿），马便不能朝那个方向走。',
  '**Chariot:** moves any distance horizontally or vertically and cannot jump, exactly like a rook. It is the strongest piece on the board.':
    '**车：**横向或纵向走任意距离，不能越子，与国际象棋的车完全相同。它是棋盘上最强的棋子。',
  '**Cannon:** moves like a chariot when it is not capturing. To capture, it jumps over exactly one piece, friend or foe, called the screen, and lands on an enemy piece beyond it.':
    '**炮（砲）：**不吃子时走法与车相同。吃子时，它正好越过一枚棋子（不分敌我），这枚棋子称为炮架，并落在其后的一枚敌方棋子上。',
  '**Soldier:** moves one point straight forward and never backward. After crossing the river it may also move one point sideways. It never promotes.':
    '**兵（卒）：**向正前方走一个交叉点，永不后退。过河之后，它还可以横向走一个交叉点。它不会升变。',
  'Check, checkmate, and endings': '将军、将死与终局',
  'A general is in check when an enemy piece attacks it, and the player in check must answer the threat. If there is no legal answer, it is checkmate and the checked player loses.':
    '当敌方棋子攻击将帅时，即为将军，被将军的一方必须应对这一威胁。如果没有合法的应法，便是将死，被将军的一方告负。',
  'A player who has no legal move at all also loses. This is the opposite of Western chess, where having no legal move is a stalemate draw.':
    '完全没有合法走法的一方同样告负。这与西洋的国际象棋相反，在那里没有合法走法算作逼和（和棋）。',
  'Xiangqi also restricts endless forcing cycles. Perpetual check and perpetual chase are not allowed: a player who repeats an endless attack loses rather than forcing a draw. Tournament rules spell out detailed repetition procedures for exactly when a cycle counts as perpetual.':
    '象棋还限制无止境的逼着循环。长将与长捉是不允许的：一方若不断重复同样的进攻，将被判负，而不能借此逼和。比赛规则对何时算作「长」给出了详细的重复判定程序。',
  'A game is drawn when neither side has enough material to checkmate, by a repetition that breaks none of those rules, or when a long run of moves passes with no capture. The no-capture limit depends on the rule set: the World Xiangqi Federation rules use a fifty-move rule, while the Chinese (CXA) rules require at least sixty plies before a draw can be claimed.':
    '当任何一方都没有足够的子力将死对方、出现不违反上述规则的重复局面，或长时间无吃子时，对局判和。无吃子的上限取决于所采用的规则：世界象棋联合会的规则采用五十回合规则，而中国象棋协会（CXA）的规则则要求至少 60 个半回合之后才能提出和棋。',
  "To see the pieces work together, step through the most famous trap in xiangqi. It comes from Juzhongmi (橘中秘), a manual printed in 1632. Red gives up a horse; when Black grabs it, Red's chariots and cannons pour through the gap and checkmate on the thirteenth move.":
    '想看棋子如何协同作战，可以逐步重演象棋中最著名的陷阱：弃马十三着。它出自 1632 年刊印的棋谱《橘中秘》。红方故意送出一匹马，黑方一旦贪吃，红方的车炮便乘虚而入，在第十三着将死对手。',
  'Mini Xiangqi': '迷你象棋',
  'Dark Mini Xiangqi': '迷雾迷你象棋',

  // -- Chess primer --
  'Chess Rules': '国际象棋规则',
  'Chess is a two-player strategy game played for centuries. It descends from the Indian game chaturanga of around the 6th century and reached Europe through Persia and the Islamic world; its modern form, with the long-range queen and bishop, took shape in Europe in the late 1400s.':
    '国际象棋是一种已有数百年历史的双人策略游戏。它源自约公元 6 世纪的印度游戏恰图兰加，经由波斯和伊斯兰世界传入欧洲；其现代形式（拥有远程的后和象）于 15 世纪末在欧洲成形。',
  'Board setup': '棋盘布置',
  'Chess is played on an 8 by 8 board of alternating light and dark squares.':
    '国际象棋在 8×8 的棋盘上进行，棋盘由深浅相间的方格组成。',
  'White moves first, then players alternate. Each side fills the two rows nearest it, with the queen starting on her own color. On your turn, move one piece to a legal square: you cannot land on your own piece, and landing on an enemy piece captures it, removing it from the board.':
    '白方先走，之后双方轮流走子。每一方在最靠近自己的两排摆满棋子，后摆在与自身同色的格子上。轮到你时，将一枚棋子走到一个合法的格子：你不能落在自己的棋子上，而落在敌方棋子上即可将其吃掉，并把它从棋盘上移走。',
  'Each piece moves in its own way. In every diagram below, the highlighted squares are the legal moves and captures for the marked white piece.':
    '每种棋子都有各自的走法。在下面每一幅图中，高亮的格子表示被标记的白方棋子的合法走法与吃子。',
  '**King:** moves one square in any direction. In regular chess, a king may not move onto a square attacked by the opponent.':
    '**王：**可向任意方向走一格。在普通国际象棋中，王不能走到被对方攻击的格子上。',
  '**Queen:** moves any number of squares horizontally, vertically, or diagonally. Other pieces block her path.':
    '**后：**可沿横线、竖线或斜线走任意格数。其他棋子会挡住它的去路。',
  '**Rook:** moves any number of squares horizontally or vertically. It cannot jump, so the first occupied square in a line stops it.':
    '**车：**可沿横线或竖线走任意格数。它不能跳子，因此一条线上第一个被占据的格子就会挡住它。',
  '**Bishop:** moves any number of squares diagonally. Because diagonals stay on one color, each bishop stays on light squares or dark squares for the whole game.':
    '**象：**可沿斜线走任意格数。由于斜线始终保持同一种颜色，每个象在整盘棋中都只走浅色格或只走深色格。',
  '**Knight:** moves in an L shape: two squares one way and one square sideways. The knight is the only piece that jumps over other pieces.':
    '**马：**走「L」形：朝一个方向走两格，再横向走一格。马是唯一能跳过其他棋子的棋子。',
  '**Pawn:** the pawn moves and captures differently from every other piece. It moves straight forward into an empty square, one square at a time, or two squares from its starting position. It can never move backward or sideways, and a piece directly in front of it blocks it completely. It captures only diagonally forward, one square (the green rings below), never straight ahead. Two further pawn rules, promotion and en passant, appear under Special moves below.':
    '**兵：**兵的走法和吃法与其他所有棋子都不同。它向正前方走入一个空格，每次一格，或在起始位置时一次走两格。它永远不能后退或横走，正前方若紧挨着一枚棋子便会被完全挡住。它只能向斜前方吃子，一格（见下图的绿色圆环），绝不向正前方吃子。另有两条与兵有关的规则：升变与吃过路兵，见下文的「特殊走法」。',
  'Check and checkmate': '将军与将死',
  'In regular chess, the king is protected by check and checkmate. A king is **in check** when an enemy piece attacks it. The checked player must make a legal move that leaves the king safe.':
    '在普通国际象棋中，王受到将军与将死规则的保护。当敌方棋子攻击王时，王即处于**被将军**的状态。被将军的一方必须走一步合法着法，使王重新安全。',
  'Most checks are answered in one of three ways: move the king, block the line of attack, or capture the attacking piece. If none of those legal answers works, the game ends by **checkmate**.':
    '应对将军通常有三种方法：移动王、挡住攻击线路，或吃掉发动攻击的棋子。如果这些合法应法都行不通，对局便以**将死**告终。',
  'In regular chess the king is never actually captured: the game ends at checkmate, with the king still on the board.':
    '在普通国际象棋中，王从不会真的被吃掉：对局在将死时结束，此时王仍留在棋盘上。',
  'Special moves': '特殊走法',
  'Castling is a one-move king-and-rook move. The king moves two squares toward a rook, and that rook moves to the square the king crossed. In regular chess, the pieces must be unmoved, the path must be empty, and the king cannot castle out of, through, or into check.':
    '王车易位是一步同时移动王和车的走法。王朝着一只车的方向走两格，那只车则移动到王越过的格子上。在普通国际象棋中，参与易位的王与车此前都不能动过，中间的格子必须为空，且王不能在被将军时易位、不能穿过被攻击的格子易位，也不能易位到被攻击的格子上。',
  'Queenside castling works the same way on the other side: the king moves two squares toward the rook, and the rook lands next to it.':
    '后翼易位在另一侧以同样方式进行：王朝着车走两格，车则落到王的旁边。',
  Promotion: '升变',
  'When a pawn reaches the farthest rank, it promotes into a queen, rook, bishop, or knight.':
    '当兵到达最远的一条横线时，它会升变为后、车、象或马。',
  'En passant is the unusual pawn capture. If an enemy pawn moves two squares from its starting rank and lands beside your pawn, your pawn may capture it diagonally as if it had moved only one square. This chance exists only on the very next move.':
    '吃过路兵是一种特殊的兵吃子。如果敌方的兵从起始横线一次走两格，并停在你的兵旁边，你的兵可以斜向吃掉它，就好像它只走了一格一样。这个机会只在紧接着的下一步存在。',
  'Not every game is won. Some end in a draw, where neither side wins.':
    '并非每盘棋都分出胜负。有些以和棋告终，即双方都不获胜。',
  Stalemate: '逼和',
  'Stalemate is when the player to move has no legal move but their king is not in check. It is a draw, not a win, even if one side is far ahead. Below it is Black to move: the king on a8 is not in check, yet every square it could step to is covered by the white queen, and Black has nothing else to move. The game is drawn.':
    '逼和是指轮到走子的一方没有任何合法着法，但其王并未被将军。它判作和棋，而非取胜，即使一方大占优势也是如此。下图轮到黑方走子：a8 的王没有被将军，但它能走到的每一个格子都被白后控制，而黑方又无其他棋子可走。对局判和。',
  'Other draws': '其他和棋',
  '**Threefold repetition:** the same position, with the same player to move, occurs three times. Either player can then claim a draw.':
    '**三次重复局面：**同一局面在同一方走子的情况下出现三次。此时任一方都可以提出和棋。',
  '**Fifty-move rule:** fifty moves by each side pass with no capture and no pawn move. The clock resets whenever a pawn moves or a piece is taken.':
    '**五十回合规则：**双方各走五十回合而无任何吃子、也无任何兵的走动。每当有兵走动或有棋子被吃，计数便重新归零。',
  '**Insufficient material:** neither side has enough force to deliver checkmate, such as king versus king, or king and a lone bishop or knight against a bare king.':
    '**子力不足：**任何一方都没有足够的子力完成将死，例如单王对单王，或一王加单象或单马对单王。',
  '**Agreement:** both players simply agree to a draw.': '**协议和棋：**双方直接同意作和。',
  'A famous game': '一盘名局',
  'To see the pieces work together in a real game, step through Game 11 of the 2014 World Championship in Sochi. Playing White, Magnus Carlsen grinds down Viswanathan Anand in a Berlin endgame to clinch the title; Anand resigns on move 45.':
    '想看棋子在实战中如何协同，可以逐步重演 2014 年索契世界冠军赛的第 11 局。执白的马格努斯·卡尔森在柏林防御残局中逐步磨垮维斯瓦纳坦·阿南德，锁定冠军；阿南德在第 45 回合认输。',
  'Where to next': '接下来去哪',
  'All rules': '全部规则',
  'Dark Chess Concepts': '迷雾国际象棋概念',
  // section headings
  'The starting position': '开局局面',
  'What you see': '你能看到什么',
  'Win condition: king capture': '胜负条件：吃王',
  Draws: '和棋',
  'Edge cases': '特殊情形',
  'Reading the fog': '读懂迷雾',
  'A sample game': '一盘示例对局',
  // sub-headings
  Castling: '王车易位',
  'Pawn vision': '兵的视野',
  'En passant': '吃过路兵',
  'Pawn moves': '兵的走动',
  Captures: '吃子',
  'Dark chess is not only about the pieces you see. Fogged squares, missing destinations, and vanished pieces are information too. This concepts series starts with the most useful habit: reading what the fog is telling you.':
    '迷雾国际象棋不只关乎你看得见的棋子。被迷雾遮住的格子、消失的目的地和不见的棋子本身也是信息。这个概念系列从最有用的习惯开始：读懂迷雾正在告诉你的事。',
  'Each side sees the squares its own pieces could legally move to (under [regular chess rules](https://en.wikipedia.org/wiki/Rules_of_chess)), plus the squares they stand on. Everything else is fog.':
    '每一方能看到己方棋子（按[普通国际象棋规则](https://zh.wikipedia.org/zh-hans/国际象棋规则)）可以合法走到的格子，以及棋子当前所在的格子。其余一切都笼罩在迷雾之中。',
  "Here's the same rule, piece by piece.": '同一条规则，逐子来看。',
  'Vision moves with pieces. When a piece moves, the squares it used to cover go dark (unless another piece still sees them), and the squares it now reaches light up.':
    '视野随棋子移动。当一个棋子走动时，它原先覆盖的格子会重新陷入黑暗（除非另有棋子仍能看到它们），而它新触及的格子则会亮起。',
  "Notice the rook on d7 sees the queen on b7 and the king on h7, but not a7. A piece's vision ends where its movement ends.":
    '注意 d7 的车能看到 b7 的后和 h7 的王，却看不到 a7。棋子的视野止于它走法的尽头。',
  'The game ends when a king is captured. No check, no checkmate, no warning.':
    '当一方的王被吃掉时，对局即告结束。没有将军，没有将死，也没有任何预警。',
  "Mistboard auto-draws games on threefold repetition (same true position three times, same side to move, same castling and en-passant rights) and the 50-move rule (fifty full moves with no pawn move or capture). Both apply to the true position, not either player's view. There is no stalemate draw and no insufficient-material draw.":
    'Mistboard 会在三次重复局面（同一真实局面出现三次，且轮到走子的一方相同、王车易位权与吃过路兵权也相同）或五十回合规则（连续五十个回合无兵的走动、也无吃子）时自动判和。两条规则都针对真实局面，而非任何一方各自的视野。这里没有逼和，也没有子力不足判和。',
  'A king may castle out of, through, or into check.':
    '王可以在被将军时易位，可以穿过被攻击的格子易位，也可以易位到被攻击的格子上。',
  'Pawns see forward push squares when those squares are empty. They see diagonal squares only when an enemy piece is actually there to capture.':
    '兵在前方格为空时能看到可推进的格子。只有当斜前方真的有敌方棋子可吃时，兵才会看到那个斜线格。',
  'White does not see a4 or b4: black pawns block those pushes, so they are not legal moves. Some rulesets reveal blocked pawn squares; Mistboard does not.':
    '白方看不到 a4 或 b4：黑兵挡住了这些推进，所以它们不是合法走法。有些规则会显示被阻挡的兵推进格；Mistboard 不会。',
  "En passant is chess's strangest move, so our vision rule bends for it: the capturing pawn sees the captured pawn on its adjacent square. The window is one move only. Pass on the capture and the chance is gone.":
    '吃过路兵是国际象棋中最奇特的一步，因此我们的视野规则为它破了个例：执行吃子的兵能看到相邻格子上那个将被吃掉的对方兵。这个窗口只持续一步。若放弃这次吃子，机会便不复存在。',
  "You can read the darkness to deduce what's happening on the board.":
    '你可以通过解读这片黑暗，推断棋盘上正在发生什么。',
  'The goal is not perfect certainty. A good dark chess player learns which hidden worlds are dangerous enough to respect, then chooses moves that survive those worlds.':
    '目标不是获得完美确定性。优秀的迷雾棋手会判断哪些隐藏局面危险到必须尊重，然后选择在那些局面中也能成立的走法。',
  'A pawn sees where it can push. Fog on a push square means an opponent piece or pawn is blocking it.':
    '兵能看到它可以推进到的格子。若推进格被迷雾遮住，就说明那里有对方的棋子或兵挡着。',
  "Same signal in opening play. After 1.d4 e6 2.Nf3 Bb4, b4 leaves White's view: the b2-pawn no longer pushes there. A Black piece just landed on b4. Pawn, knight, or bishop, and White can't tell which. But c3 and d2 are visible empty, so a bishop would capture the king next move. White has to defend on that assumption.":
    '开局中也有同样的信号。在 1.d4 e6 2.Nf3 Bb4 之后，b4 离开了白方的视野：b2 的兵不再能推进到那里。说明刚有一枚黑方棋子落在了 b4。可能是兵、马或象，白方无从判断是哪一个。但 c3 与 d2 都清晰可见且为空，因此一枚象下一步就能吃掉白王。白方只能按这个最坏的假设来防守。',
  "When the opponent takes one of your pieces, the capture square falls to fog. You can't see what took. Here: White pawn on d5, with four Black attackers around it (c6 pawn, e6 pawn, c7 knight, d7 rook). After 1...exd5, the d5 pawn vanishes. Which Black piece took it?":
    '当对方吃掉你的一枚棋子时，被吃的那个格子会随即陷入迷雾。你看不到是谁吃的。例如：白方有一个兵在 d5，周围有四个黑方攻击者（c6 兵、e6 兵、c7 马、d7 车）。在 1...exd5 之后，d5 的兵消失了。是哪一枚黑子吃掉了它？',
  'Add a White bishop on h3. Its diagonal keeps e6 in view. After the same 1...exd5, White loses d5 and the bishop sees e6 fall empty. So the e-pawn took.':
    '现在在 h3 添一枚白象。它的斜线让 e6 始终处在视野内。同样走 1...exd5 之后，白方失去 d5，而那枚象看到 e6 变空了。于是可知：是 e 路的兵吃的。',
  "Here is a complete game between Mistboard's engine and a human, shown from both player views and the server's full position.":
    '下面是一盘 Mistboard 引擎对阵真人的完整对局，同时展示双方视野和服务器上的完整局面。',
  'Read the rules': '阅读规则',
  // board labels
  "WHITE'S VIEW": '白方视野',
  'SERVER TRUTH': '服务器真相',
  "BLACK'S VIEW": '黑方视野',
  PAWN: '兵',
  KNIGHT: '马',
  BISHOP: '象',
  ROOK: '车',
  QUEEN: '后',
  KING: '王',
  BEFORE: '之前',
  AFTER: '之后',
  'EMPTY AHEAD': '前方空旷',
  'BLOCKED AHEAD': '前方受阻',
  'The board': '棋盘',
  'The pieces': '棋子',
  'Back to all rules': '返回全部规则',
  // section headings
  'Win condition: general capture': '胜负条件：擒获将帅',
  'Play status': '对弈状态',
  // sub-headings
  Cannons: '炮（砲）',
  'Facing generals': '将帅对脸',
  'Horse legs': '蹩马腿',
  'Elephant eyes': '塞象眼',
  // paragraphs
  'At the start, you see your own pieces and every legal destination they control. Everything else is fog. Your opponent sees a different board from the same true position.':
    '开局时，你能看到己方棋子以及它们所控制的每一个合法落点。其余一切都是迷雾。你的对手会从同一个真实局面看到一张不同的棋盘。',
  'Vision is recomputed from the true position after every move, so hidden blockers, cannon screens, horse legs, elephant eyes, and newly opened lines immediately change what you know.':
    '每走一步之后，视野都会根据真实局面重新计算，因此隐藏的阻挡子、炮架、马腿、象眼，以及新打开的线路都会立刻改变你所掌握的信息。',
  'Capture the general to win. Checks and checkmates are not announced, and the server does not warn a player who has moved into danger.':
    '擒获将帅即获胜。将军与将死都不会被告知，并且当一方走入危险时，服务器也不会发出警告。',
  "Games auto-draw on threefold repetition and after 60 plies with no capture. Both are judged from the true position, not either player's view. There is no stalemate draw: if the side to move has no legal move, it loses, and with no check to freeze you, this almost never happens.":
    '对局会在三次重复局面，以及连续 60 个半回合无吃子时自动判和。两者都依据真实局面判断，而非任何一方各自的视野。这里没有困毙判和：若轮到走子的一方没有合法着法，则判负；而由于没有将军来限制你，这种情况几乎不会发生。',
  'A cannon moves like a chariot when it is not capturing. To capture, it jumps exactly one screen and lands on the first enemy piece beyond it. Under fog, the screen appears as unknown occupancy and the target is visible as the enemy piece.':
    '炮（砲）不吃子时走法与车相同。吃子时，它正好越过一个炮架，落在其后的第一枚敌方棋子上。在迷雾下，炮架显示为未知的占据状态，目标则作为敌方棋子可见。',
  'A horse can move only when the adjacent leg square is clear. If a hidden piece blocks that leg, the destination disappears from your visible set and the leg square appears as a ? marker.':
    '只有当相邻的马腿位置空着时，马才能走动。如果有一枚隐藏的棋子蹩住了那条马腿，落点就会从你的可见集合中消失，而马腿位置则显示为一个「?」标记。',
  'An elephant moves two points diagonally and cannot cross the river. If a hidden piece sits on the midpoint eye, the diagonal destination disappears and the eye square appears as a ? marker.':
    '象（相）沿斜线走两个交叉点，且不能过河。如果有一枚隐藏的棋子塞在中点的象眼上，斜线落点就会消失，而象眼位置则显示为一个「?」标记。',
  // -- Jieqi (rules) --
  Setup: '布局',
  "Set each general face-up on its normal palace point. Shuffle each side's other fifteen pieces and deal them face-down onto the remaining starting points. Neither player knows any hidden identities, including their own.":
    '将双方的将帅各自正面朝上摆在九宫内通常的位置。把每一方其余十五枚棋子洗混，背面朝下地发到剩余的起始位置上。任何一方都不知道任何暗子的身份，包括自己的暗子。',
  'First moves use starting points': '首步按起始位置行棋',
  'Before reveal, a dark piece uses the role of the starting point it occupies, not its hidden identity. A dark piece on a corner point plays like a chariot; dark pieces on horse, advisor, elephant, cannon, and soldier points use those matching moves.':
    '翻明之前，暗子按其所在起始位置对应的兵种行棋，而不是按它隐藏的真实身份。位于角点的暗子像车一样走；位于马、士、象、炮、兵起始位置上的暗子，则分别按这些兵种的走法行棋。',
  'The normal restrictions still apply to that first move: horse legs, elephant eyes, cannon screens, palace limits for advisor points, and the river limit for elephant points. Once the move resolves, the piece flips face-up for both players.':
    '通常的限制对这首步同样适用：蹩马腿、塞象眼、炮架，士位受九宫限制，象位受河界限制。这步走完后，该棋子即对双方翻为正面朝上。',
  'Revealed pieces use identity': '翻明后的棋子按真实身份行棋',
  "After reveal, use the piece's identity from its current point. Advisors may leave the palace, and elephants may cross the river. Their movement shapes do not change: advisors step one point diagonally; elephants move two points diagonally and are still eye-blocked.":
    '翻明之后，棋子从它当前所在的位置按其真实身份行棋。士可以离开九宫，象可以过河。它们的走子形状不变：士斜走一个交叉点；象斜走两个交叉点，并且仍会被塞象眼。',
  'Horses, chariots, and cannons move normally. Soldiers use the normal river rule from wherever they reveal: forward only before crossing, forward or sideways after crossing, never backward.':
    '马、车、炮按常规走法行棋。兵（卒）则从它翻明的位置起套用通常的过河规则：过河前只能向前，过河后可向前或横走，永不后退。',
  'Captured dark pieces': '被吃掉的暗子',
  'If a dark piece is captured before revealing, only the capturer learns what it was. The owner sees one dark piece leave the board, but not its identity. Later, the capturer can rule out that hidden identity elsewhere.':
    '如果一枚暗子在翻明之前被吃掉，只有吃子的一方知道它是什么。棋子的主人只看到一枚暗子离开棋盘，却看不到它的身份。此后，吃子的一方便可以排除其他位置上存在这个隐藏身份的可能。',
  'This reference uses the common Jieqi convention: the capturer sees it. Some cờ úp groups handle captured dark pieces differently, so agree on the convention before over-the-board play.':
    '本规则参考采用揭棋的常见约定：吃子一方可见。某些 cờ úp（越南揭棋）流派对被吃暗子的处理方式不同，因此在线下实地对弈前应先就采用的约定达成一致。',
  'Checks, wins, and draws': '将军、胜负与和棋',
  "Every occupied point is visible, so players can see when the general is attacked. An unmoved dark piece attacks from its starting point using that point's role. Once it moves, it reveals immediately; any check from the destination uses the revealed identity.":
    '每个被占据的交叉点都是可见的，因此双方都能看出将帅何时受到攻击。尚未走动的暗子按其起始位置对应的兵种从该位置发动攻击。一旦走动，它立即翻明；任何来自落点的将军都按翻明后的真实身份计算。',
  'Win by checkmating the general or leaving the opponent with no legal move. The facing-generals rule still applies, and dark pieces block the file like any other piece.':
    '将死对方将帅，或让对方无合法走法可走，即可获胜。将帅对脸的规则依然有效，暗子也和其他棋子一样会挡住纵线。',
  'Repetition follows xiangqi long-beat rules, not a generic threefold or fourfold result. Perpetual check and direct perpetual chase are forbidden, so the forcing side must change course or lose; mutual forcing and ordinary repeated positions are judged by the xiangqi cycle, not by board equality alone. The automatic draw convention in this reference is the Guangdong/Tencent no-capture clock: 60 full moves, meaning 120 plies, without a capture.':
    '重复局面依照象棋的长打规则裁定，而不是笼统地按三次或四次重复出结果。长将和直接的长捉都被禁止，因此发动逼着的一方必须改变着法，否则判负；互打以及普通的重复局面则依据象棋的循环判例裁定，而不能只看局面是否相同。本规则参考采用的自动判和约定是广东/腾讯的无吃子回合数：连续 60 个完整回合（即 120 个半回合）无吃子即判和。',
  Name: '名称',
  Names: '名称',
  'Step through a full self-play game below. Dark pieces show as colored backs and flip to their dealt identity the first time they move, so a corner that plays like a chariot can reveal a soldier. Red wins by checkmate.':
    '在下方逐步查看一整盘自我对弈的棋局。暗子以彩色背面显示，第一次走动时翻开，显示其发到的身份，因此一个像车一样走子的角落棋子，翻开后可能是一个兵。红方以将死获胜。',
  'The board is half a xiangqi board: thirty-two squares in a 4x8 grid, shown here with the long side horizontal. Unlike xiangqi, pieces sit inside the squares rather than on intersections, and the thirty-two shuffled pieces exactly fill the board, every one face-down.':
    '棋盘是半张象棋棋盘：4×8 共三十二个方格，此处以长边横置显示。与象棋不同，棋子放在方格之内，而不是交叉点上；洗匀后的三十二枚棋子恰好填满棋盘，每一枚都背面朝下。',
  'Colors are not assigned in advance. The first player opens the game by flipping any piece: whatever color comes up is theirs, and the opponent plays the other.':
    '颜色不会事先分配。先行的一方翻开任意一枚棋子来开局：翻出什么颜色，那一方就执该色，对手执另一色。',
  Turns: '回合',
  'On your turn, do exactly one of three things: flip any face-down piece, move one of your revealed pieces one square orthogonally onto an empty square, or capture with one of your revealed pieces. A flip reveals the piece to both players, even if it belongs to your opponent. There is no passing.':
    '轮到你时，只能做三件事之一：翻开任意一枚背面朝下的棋子，将你的一枚已翻开的棋子沿上下左右走一格到空格，或用你的一枚已翻开的棋子吃子。翻子会向双方亮出该棋子，即使它属于对手也是如此。不能虚着（不可跳过行棋）。',
  'Capture by rank': '按等级吃子',
  'The cannon sits outside this rank ladder and uses its own capture rule. As a target, though, it still ranks just above the soldier, shown in the dashed slot below. Face-down pieces cannot be captured at all: a piece must be flipped before anyone can take it, which makes every flip next to a strong enemy piece a calculated risk.':
    '炮不在这一等级序列之内，使用自己的吃子规则。不过作为被吃目标，它仍排在卒之上，如下方虚线格中所示。背面朝下的棋子完全不能被吃：任何棋子都必须先翻开，才能被吃，因此在强敌旁边翻子，每一次都是经过权衡的冒险。',
  'The cannon': '炮',
  'The cannon ignores rank when it captures. For a capture only, it may travel any distance along a row or column and jump exactly one intervening piece, the screen. It then takes the first piece beyond that screen, and only if that piece is a revealed enemy. If a friendly or face-down piece sits there instead, the line is blocked and the cannon cannot reach past it. The screen itself can be friendly, enemy, or face-down.':
    '炮吃子时不论等级。仅在吃子时，它可以沿一行或一列移动任意距离，并恰好越过中间一枚棋子，即炮架。它吃掉炮架另一侧的第一枚棋子，且仅当该棋子是已翻开的敌方棋子。如果那里是己方棋子或背面朝下的棋子，则该线被挡住，炮无法越过它。炮架本身可以是己方、敌方或背面朝下的棋子。',
  'A non-capturing cannon move is still just one square orthogonally, like every other piece. Because a cannon needs a screen to capture, it cannot take an adjacent piece. As a target, an adjacent cannon can be taken by a general, advisor, elephant, chariot, or horse, but not by a soldier.':
    '炮在不吃子时，与其他棋子一样，也只能沿上下左右走一格。由于炮吃子需要炮架，它不能吃相邻的棋子。作为被吃目标，相邻的炮可以被将、士、象、车或马吃掉，但不能被卒吃掉。',
  'You win when your opponent has no legal move, usually because every enemy piece is captured, sometimes because they are boxed in. The general is not royal: capturing it is progress, not the win, and play continues until one side is wiped out or stuck.':
    '当对手轮到自己却无棋可走时，你获胜——通常是因为敌方棋子被全部吃光，有时则是被困死、无路可走。这里的将不是王棋：吃掉它只是进展，而非胜利，棋局会一直进行到一方被吃光或被困死为止。',
  'Mistboard draws a game two ways: 40 plies (single moves) with no flip or capture, or threefold repetition, the same position three times. Either counter resets on any flip or capture, since those cannot be taken back. There is no perpetual-chase rule; over the board, agree the no-progress and repetition limits before you start.':
    'Mistboard 有两种自动和棋：连续 40 步（单步）内没有翻子也没有吃子，或者同一局面出现三次的三次重复。任何翻子或吃子都会让相应计数清零，因为这类着法无法收回。这里没有长捉判负规则；线下对弈时，请在开局前约定无进展与重复局面的处理标准。',
  'Play MistyBanqi': '对战 MistyBanqi',
  'Challenge a friend': '挑战好友',
  'MistyBanqi · Strongest': 'MistyBanqi · 最强',
  'MistyBanqi (Red) wins by resignation · 49 moves': 'MistyBanqi（红方）因对手认输获胜 · 49 回合',
  'Three rules give the game its character: the rat captures the elephant, only the rat can swim, and the lion and tiger leap the rivers.':
    '三条规则赋予了这盘棋的特色：老鼠能吃大象，只有老鼠能下水，狮和虎能跳过河。',
  'Strongest at the left, weakest at the right.': '最强在左，最弱在右。',
  Traps: '陷阱',
  'Step a piece onto one of your opponent’s three trap squares and it loses all rank while it stands there, so any defending piece can take it, down to a rat capturing a trapped elephant. Only an enemy’s traps do this: a piece can sit on one of its own traps and keeps its full rank.':
    '把一枚棋子走进对方三个陷阱格之一，它在停留期间会丧失全部等级，因此任何防守方棋子都能吃掉它，哪怕是老鼠吃掉落入陷阱的大象。只有敌方的陷阱才有此效果：棋子可以停在自己的陷阱上，并保持全部等级。',
  'Move any piece into your opponent’s den and you win immediately. You also win by capturing every enemy piece. You can never move a piece onto your own den, so the only den you can enter is the enemy’s.':
    '任何一枚棋子走进对方的兽穴，你立刻获胜。吃光对方所有棋子同样获胜。你永远不能把棋子走进自己的兽穴，所以你能进入的只有对方的兽穴。',
  'Games draw on threefold repetition, or when 100 half-moves (50 by each player) pass with no capture.':
    '若同一局面出现三次，或连续 100 个半回合（每方 50 步）无吃子，则判和。',
  'A full game': '完整对局',
  'Step through a real game between two strengths of our bot. Watch the lion leap the river, the rat swim up the far lane and take the elephant in the open, and Red march the rest of the way into Black’s den.':
    '逐步回放我们机器人两个强度之间的真实对局。看狮子跳过河、老鼠沿远侧通道游上去并在空地上吃掉大象，最后红方一路走进黑方的兽穴。',
  'All sixteen pieces, one of each animal in two colors, are shuffled and placed face-down on the sixteen squares. Nobody knows which animal or which color sits under a tile until it is flipped. The first tile you flip sets your color for the rest of the game.':
    '全部十六枚棋子（两种颜色各八种动物）洗匀后背面朝上放在十六个格子里。在翻开之前，谁也不知道某个格子下面是哪种动物、哪种颜色。你翻开的第一枚棋子决定你在本局其余时间的颜色。',
  'A turn': '一个回合',
  'On your turn you either flip one face-down tile to reveal it, or move one of your own revealed animals one square up, down, left, or right. Early on, before pieces come up, flipping is all you can do.':
    '轮到你时，你要么翻开一枚背面朝上的棋子使其亮明，要么把己方一枚已翻开的动物上下左右走一格。开局阶段，在棋子尚未翻出之前，你能做的只有翻棋。',
  Capturing: '吃子',
  'You win when your opponent has nothing left to do: no piece to move and no tile to flip. In practice that means capturing or trading away everything they have.':
    '当对手无事可做时你获胜：既没有棋子可走，也没有棋子可翻。实际上，这意味着把对方拥有的一切吃掉或换掉。',
  'Games draw on threefold repetition, or when 40 half-moves (20 by each player) pass with no flip, capture, or trade.':
    '若同一局面出现三次，或连续 40 个半回合（每方 20 步）没有翻棋、吃子或同归于尽，则判和。',
  'A game is also drawn the moment the pieces left on the board can no longer force a win — two survivors of equal rank, or a lone piece that can never corner the opponent’s last piece on the small board. These dead positions are settled as a draw right away rather than played out to the repetition count.':
    '当盘面上剩下的棋子已无法取胜时，本局同样判和——例如两枚同级的棋子，或一枚在小棋盘上永远逼不住对方最后一子的孤子。这类死局会立即判和，而不必一直走到三次重复局面。',
  'Step through a game our bot played against itself. The two lions meet and both leave the board, an elephant runs through three pieces until it hits the other elephant and they cancel too, and the side left standing wins. Tiles flip to their dealt animal the first time they are turned over.':
    '逐步回放我们机器人左右互搏的一盘棋。两只狮子相遇、双双离场；一头大象连吃三子，直到撞上另一头大象、两象也同归于尽；最后还有棋子站着的一方获胜。棋子第一次被翻开时，会显示其发到的动物。',
  'Engine vs engine': '引擎对引擎',
  'Red wins by reaching the den · 69 moves': '红方进入兽穴获胜 · 69 步',
  'Red’s rat has already taken Black’s elephant in the open, and with the strongest piece off the board Red walks a piece straight into Black’s undefended den. Reaching the enemy den ends the game at once, no matter what material is left.':
    '红方的老鼠已经在空地上吃掉了黑方的大象，最强的棋子离场后，红方径直把一枚棋子走进黑方无人防守的兽穴。进入对方兽穴会立刻结束对局，无论场上还剩多少子力。',
  'Engine self-play': '引擎自我对弈',
  'Black wins by elimination · 36 moves': '黑方吃光对手获胜 · 36 步',
  'Both lions and both elephants have already traded off the board (同归于尽), and the pieces that survived all belong to Black. Red has nothing left that can move, so the game ends: with no piece to move and no tile to flip, Red loses.':
    '两只狮子和两头大象都已同归于尽离场，存活下来的棋子全部属于黑方。红方再无可走之子，于是对局结束：既没有棋子可走，也没有棋子可翻，红方告负。',

  // -- Branded rules names --
  'Fog Chess Rules': '迷雾国际象棋规则',
  'Fog Chess rules: chess under Fog of War, where each side sees only the squares its pieces reach, there are no check warnings, and the king falls by capture.':
    '迷雾国际象棋规则：战争迷雾下的国际象棋。每一方只能看到己方棋子可及的格子，没有将军提示，王被吃掉即负。',
  "[Fog Chess](https://en.wikipedia.org/wiki/Dark_chess) is Mistboard's public name for dark chess, also called Fog of War chess. Jens Bæk Nielsen and Torben Osted invented it in 1989. It is the implicit-fog version of the idea: no umpire, no scan action. Each side's visibility is derived from where its pieces can legally move.":
    '[迷雾国际象棋](https://en.wikipedia.org/wiki/Dark_chess)是 Mistboard 对 dark chess / Fog of War chess 的公开名称。Jens Bæk Nielsen 与 Torben Osted 于 1989 年发明了它。它属于隐式迷雾：没有裁判，也没有侦察动作。每一方的视野完全由己方棋子的合法走法范围推导而来。',
  'The rules of xiangqi, also called Chinese chess (象棋): palaces, the river, cannon screens, facing generals, and a famous game to play through. Now playable on Mistboard against the Pikafish engine or a friend.':
    '象棋规则：九宫、楚河汉界、炮架、将帅照面，以及一盘可逐步回放的名局。现在可在 Mistboard 上与 Pikafish 引擎或好友对弈。',
  'Xiangqi (象棋), also known as Chinese chess, is a two-player strategy game with roots in China going back many centuries. Its modern form, including the cannon, took shape around the Song dynasty (960 to 1279).':
    '象棋是一种源自中国、历史悠久的双人策略游戏。包括炮在内的现代形态，大致在宋代（960 至 1279 年）成型。',
  'Fog Xiangqi Rules': '迷雾象棋规则',
  'Fog Xiangqi rules: xiangqi under Fog of War, where each side sees only the points its pieces reach, hidden blockers matter, and the general falls by capture.':
    '战争迷雾下的象棋：每一方只能看到己方棋子可及的点位，隐藏阻挡会影响视野，擒获将帅即获胜。',
  'Fog Xiangqi is xiangqi (象棋) under Fog of War. Pieces keep their normal movement, but unseen enemy pieces stay hidden and danger is not announced. Capture the general to win.':
    '迷雾象棋是在战争迷雾下对弈的象棋。棋子保留正常走法，但看不见的敌方棋子会被隐藏，危险不会被提示。擒获将帅即获胜。',
  'If Xiangqi is new to you, start with [Xiangqi Rules](/rules/xiangqi). If you already play xiangqi, the sections below explain only what fog changes.':
    '如果你还不熟悉象棋，请先阅读[象棋规则](/rules/xiangqi)。如果你已经会下象棋，下面只解释迷雾改变了什么。',
  'Orthodox xiangqi forbids facing generals. Fog Xiangqi allows the position; if one general sees the other on a clear file, it can capture across that file.':
    '正统象棋禁止将帅照面。迷雾象棋允许这个局面；如果一方将帅在无阻挡的直线上看见对方，就可以沿这条线直接擒获。',
  'Flip Xiangqi Rules': '暗棋规则',
  'Use [Xiangqi Rules](/rules/xiangqi) for the base game. This page covers what changes.':
    '基础规则请参考[象棋规则](/rules/xiangqi)。本页只说明变化之处。',
  'Reveal Xiangqi': '揭棋',
  'Fog Chess': '迷雾国际象棋',
  'Standard chess rules, the primer behind Fog Chess: castling, promotion, en passant, the draw rules, and a famous game to play through.':
    '普通国际象棋规则，也就是迷雾国际象棋背后的基础：王车易位、升变、吃过路兵、和棋规则，以及一盘可逐步回放的名局。',
  'Chess is the open-information base game. Add Fog of War for Fog Chess, where enemy pieces outside your vision disappear and the king falls by capture.':
    '国际象棋是信息公开的底层游戏。为它加上战争迷雾，便得到迷雾国际象棋：你视野之外的敌方棋子会消失，而王由被吃而落败。',
  'Read Fog Chess': '阅读迷雾国际象棋',
  "Fog Chess with a sealed opening draft: each player picks one of three Chess960 back ranks and never sees the other's.":
    '带密封开局选择的迷雾国际象棋：每位玩家从三个 Chess960 底线阵型中选择一个，且永远看不到对手选择了哪个。',
  'Programming Fog Chess with Server-Side Truth': '用服务器端真实局面实现迷雾国际象棋',
  'Fog Chess adds one hidden-information rule to chess: each side sees only the squares its own pieces reach. The implementation question is where that rule runs. On Mistboard, it runs on the server, so the browser receives a `PlayerView`, not a full board with fog painted over it.':
    '迷雾国际象棋给国际象棋增加了一条隐藏信息规则：每一方只能看到己方棋子可及的格子。实现问题在于这条规则在哪里运行。在 Mistboard 上，它运行在服务器端，所以浏览器收到的是一个 `PlayerView`，而不是盖着迷雾图层的完整棋盘。',
  'Play Misty in Fog Chess, or read the rules article for the player-facing version of the same visibility model.':
    '来玩 Misty 的迷雾国际象棋，或阅读面向玩家的规则文章，了解同一套视野模型。',
  'Read Fog Chess Rules': '阅读迷雾国际象棋规则',
  'Jungle Chess Rules': '斗兽棋规则',
  "The classic Chinese animal-chess game, traditionally Dou Shou Qi (斗兽棋), on a 7×9 board. Eight ranked animals, rivers only the rat can cross, and a race to the opponent's den.":
    '经典中国动物棋斗兽棋，棋盘 7×9。八种按等级排列的动物，只有老鼠能过的河，以及冲入对方兽穴的竞赛。',
  "Jungle Chess is Mistboard's public name for Dou Shou Qi (斗兽棋), also called Animal Chess. It is a two-player game played across much of East Asia. Each side commands eight animals of different rank. You win by marching a piece into your opponent’s den, or by capturing all of their pieces.":
    '斗兽棋是 Mistboard 对 Dou Shou Qi（斗兽棋，也称 Animal Chess）采用的公开英文名称。这是流行于东亚许多地区的双人游戏。每方指挥八种不同等级的动物。把一枚棋子走进对方的兽穴，或吃光对方所有棋子，即获胜。',
  'Flip Jungle Rules': '翻翻棋规则',
  'The 4×4 flip version of Jungle Chess. Every animal starts face-down, you flip to reveal, and equal ranks trade off the board.':
    '斗兽棋的 4×4 翻面版本。所有动物开局均背面朝上，翻开即亮明身份，等级相同的双方同归于尽、一起离场。',
  'Reveal Xiangqi Rules': '揭棋规则',
  'Reveal Xiangqi rules: jieqi (揭棋), xiangqi with hidden non-general pieces that first move by starting point, then reveal and play by identity.':
    '揭棋规则：除将帅外的棋子都隐藏身份，首次按所在起始位置的棋子走法行棋，然后翻开并按真实身份行棋。',
  "Reveal Xiangqi is jieqi (揭棋, 'reveal chess'). It keeps xiangqi's board and checkmate goal, but hides every non-general piece. A dark piece first moves, attacks, and captures by the starting point it occupies. After that move, it reveals and plays by identity.":
    '揭棋就是 jieqi（揭棋，reveal chess）。它保留象棋的棋盘和将死目标，但隐藏所有非将帅棋子的身份。暗子首次按它所在起始位置的棋子走法移动、攻击和吃子，走完后翻开，之后按真实身份行棋。',
  '揭棋 is Mandarin jiēqí, meaning reveal chess. Luo Jinsheng of Guangzhou invented it in the 1980s, and Vietnamese play commonly calls this family cờ úp. On Mistboard, Reveal Xiangqi means jieqi; [Fog Xiangqi](/rules/fog-xiangqi) is the Fog of War variant, and [Flip Xiangqi](/rules/flip-xiangqi) is the half-board flip game.':
    '揭棋的普通话读音是 jiēqí，意为 reveal chess。广州的罗锦生在 1980 年代发明了它，越南玩法通常称这一类为 cờ úp。在 Mistboard 上，Reveal Xiangqi 指揭棋；[迷雾象棋](/rules/fog-xiangqi)是战争迷雾变体，[翻转象棋](/rules/flip-xiangqi)是半盘翻棋游戏。',
  'Flip Xiangqi rules, traditionally banqi (暗棋): the 4x8 half-board xiangqi flip game, with face-down pieces, rank captures, screen-jumping cannons, and no royal general.':
    '翻转象棋规则，传统名为暗棋：在 4×8 半盘上进行，棋子背面朝上，按等级吃子，炮隔子跳吃，也没有王棋。',
  "Flip Xiangqi is Mistboard's English name for banqi (暗棋, 'dark chess'), also called half chess or flip chess. It is played on half a xiangqi board with all thirty-two pieces shuffled face-down. Each turn, flip an unknown piece or move one of your revealed pieces one square. Captures follow rank, except for the cannon. You win by leaving the opponent with no legal move.":
    '翻转象棋是 Mistboard 对 banqi（暗棋，dark chess）采用的英文名称，也称 half chess 或 flip chess。它在半张象棋棋盘上进行，三十二枚棋子全部洗匀后背面朝上。每回合翻开一枚未知棋子，或将己方一枚已翻开棋子移动一格。除炮外，吃子按等级进行。让对手无合法着即获胜。',
  'It is the casual sibling of [Xiangqi](/rules/xiangqi): a short game that needs only an ordinary xiangqi set and half the board. It shares names with [Fog Chess](/rules/fog-chess), but it is a different game. Banqi rules vary between communities; this page states the exact rules used on Mistboard.':
    '它是[象棋](/rules/xiangqi)的休闲近亲：只需要一副普通象棋和半张棋盘即可进行。它在英文中与[迷雾国际象棋](/rules/fog-chess)共用一些名称，但两者是不同的游戏。暗棋规则因社群而异；本页明确说明 Mistboard 采用的规则。',
  'Most pieces capture enemy pieces of their own rank or lower by stepping onto an adjacent square. On Mistboard, the order is General > Advisor > Elephant > Chariot > Horse > Soldier. Two exceptions cross the ladder: a soldier can capture the general, and the general cannot capture soldiers.':
    '大多数棋子可走到相邻方格，吃掉同级或低级的敌子。Mistboard 的顺序是：将 > 士 > 象 > 车 > 马 > 卒。有两个跨越等级的例外：卒可吃将，将不能吃卒。',
  'Rules used on Mistboard': 'Mistboard 采用的规则',
  'There is no single worldwide banqi rules authority. Rank order, cannon captures, repetition, and no-progress limits can differ between clubs, families, and online implementations. Mistboard uses the ladder and screen-jumping cannon described above. For an over-the-board game, agree on those details before the first flip.':
    '暗棋没有全球统一的规则机构。不同俱乐部、家庭和网络实现对等级顺序、炮的吃法、重复和无进展限制可能有不同规定。Mistboard 采用上文所述的等级和隔子跳吃炮规则。线下对弈时，请在首次翻子前约定这些细节。',
  "暗棋 is Mandarin ànqí, 'dark chess'. The same game is also called 半棋 (half chess) and 翻棋 (flip chess); computer-game literature often calls it Chinese Dark Chess or banqi. Mistboard uses Flip Xiangqi to describe the turn-over-a-tile action. [Reveal Xiangqi](/rules/reveal-xiangqi) is the full-board game where hidden pieces reveal after moving, and [Fog Chess](/rules/fog-chess) is the chess variant played under Fog of War.":
    '「暗棋」的普通话读音是 ànqí，意为 dark chess。同一游戏也叫半棋和翻棋；计算机博弈文献常称其为 Chinese Dark Chess 或 banqi。Mistboard 用 Flip Xiangqi 表达翻开棋子的动作。[揭棋](/rules/reveal-xiangqi)是隐藏棋子走后翻开的全盘游戏，[迷雾国际象棋](/rules/fog-chess)则是在战争迷雾下进行的国际象棋变体。',
  'Step through a real game below: MistyBanqi (Strongest) moving first, a human second. The opening flip leaves MistyBanqi playing Red and the human Black. Black wins the opening material (the first eight captures are all Black’s), but Red keeps its elephant, the highest piece left, and grinds out the win. It is a clean illustration that in Flip Xiangqi, rank beats raw material. Tiles flip to their dealt piece the first time they are turned over.':
    '在下方逐步回放一盘真实对局：MistyBanqi（最强）先手，人类后手。开局的第一次翻子让 MistyBanqi 执红、人类执黑。黑方赢得开局子力，前八次吃子都属于黑方，但红方保住了盘面最高等级的象，最终获胜。这清楚说明：在翻转象棋中，等级胜过单纯子力。棋子首次翻开时会显示它被分配的身份。',
  "MistyBanqi is the bot you play in [Flip Xiangqi](/rules/flip-xiangqi) on Mistboard. It's a classical engine: it searches ahead and scores positions with a hand-written evaluation, no neural network, and it's open source. It will outplay most people. It also has a few honest blind spots, and the one worth knowing is that it can draw a game it has completely won.":
    'MistyBanqi 是你在 Mistboard 上对弈[翻转象棋](/rules/flip-xiangqi)时面对的机器人。它是一个经典引擎：向前搜索，用手写评估为局面打分，没有神经网络，而且开源。它能赢过大多数人，但也有几个坦诚的盲点，其中最值得了解的是：它会把已经完全赢定的棋下成和棋。',
  'The board is seven files wide and nine ranks deep. Your den sits at the center of your back rank, ringed by three trap squares. Two rivers, each a 2×3 block of water, split the middle of the board. Red moves first from the fixed starting position below.':
    '棋盘宽七列、深九行。你的兽穴位于底线中央，周围有三个陷阱格。两条河流各占 2×3 格，分开棋盘中部。红方从下方的固定初始局面先行。',
  'Ranks and captures': '等级与吃子',
  'Each side has the same eight animals. Strongest to weakest: elephant, lion, tiger, leopard, wolf, dog, cat, rat. A piece captures an adjacent enemy of equal or lower rank. The exception runs the other way: a rat on land can capture an elephant, and an elephant cannot capture a rat.':
    '双方各有相同的八种动物。从强到弱是：象、狮、虎、豹、狼、狗、猫、鼠。棋子可吃相邻的同级或低级敌子。例外恰好相反：陆地上的鼠可吃象，象不能吃鼠。',
  'How the animals move': '动物如何移动',
  'Every animal moves one square up, down, left, or right. Animals never move diagonally. Most animals stay on land, so they cannot enter a river. The rat, lion, and tiger are the three movement exceptions.':
    '每种动物都向上、下、左或右移动一格，不能斜走。大多数动物只能留在陆地，不能进入河流。鼠、狮和虎是三个移动例外。',
  Rat: '鼠',
  'The rat moves one square at a time like every other animal, but it is the only animal that can enter the water. A rat in a river can move and capture another rat there. It cannot capture an elephant directly from the water, so it must return to land first.':
    '鼠像其他动物一样每次移动一格，但它是唯一能进入水中的动物。河中的鼠可以移动，也可吃掉另一只河中的鼠。它不能从水中直接吃象，必须先回到陆地。',
  Lion: '狮',
  'The lion can move one land square normally, or leap straight across a river horizontally or vertically. It lands on the first square beyond the water and may capture an animal there if rank allows.':
    '狮可以在陆地上正常移动一格，也可水平或垂直跳过整条河。它落在水面另一侧的第一格，等级允许时可吃掉那里的动物。',
  Tiger: '虎',
  'The tiger has the same river leap as the lion: horizontal or vertical, from one bank to the other. A rat of either color on any water square in the path blocks a lion or tiger from jumping.':
    '虎与狮有相同的跳河能力：水平或垂直从一岸跳到另一岸。路径上任何水格里只要有一只任意颜色的鼠，就会阻止狮或虎跳跃。',
  'A rat in the river blocks the leap.': '河中的鼠会挡住跳跃。',
  'Flip Jungle is a small, fast relative of [Jungle Chess](/rules/jungle), built around the same eight ranked animals. Chinese names include 翻翻棋, roughly “flip-flip chess,” and 兽棋, “animal chess.” English speakers may also encounter Flip Animal Chess. All sixteen animals begin face-down on a four-by-four grid. There are no rivers, dens, or traps.':
    '翻翻棋是[斗兽棋](/rules/jungle)小巧快节奏的近亲，使用同样的八种等级动物。中文名称包括翻翻棋和兽棋；英语读者也可能看到 Flip Animal Chess。十六枚动物棋子全部背面朝上放在 4×4 棋盘上。这里没有河流、兽穴或陷阱。',
  'Its turn structure is especially close to [Flip Xiangqi](/rules/flip-xiangqi): reveal one unknown tile or move one of your revealed pieces. The board and pieces are different, but both games turn each flip into a choice between gaining information and improving position.':
    '它的回合结构尤其接近[翻转象棋](/rules/flip-xiangqi)：翻开一枚未知棋子，或移动一枚已翻开的己方棋子。棋盘和棋子不同，但两种游戏都让每次翻子成为「获取信息」与「改善局面」之间的选择。',
  'Animal ranks': '动物等级',
  'Both colors use the same ladder. Strongest to weakest: elephant, lion, tiger, leopard, wolf, dog, cat, rat. The rat still has one exception: it can capture the elephant, while the elephant cannot capture the rat.':
    '两种颜色使用同一等级顺序。从强到弱是：象、狮、虎、豹、狼、狗、猫、鼠。鼠仍有一个例外：它可以吃象，象不能吃鼠。',
  'Flip a tile': '翻开一枚棋子',
  'Move an animal': '移动一枚动物',
  'Move onto an adjacent enemy to capture it when your animal outranks it. The rat-beats-elephant exception from Jungle Chess still applies.':
    '当你的动物等级更高时，移到相邻敌子所在格即可吃掉它。斗兽棋中「鼠吃象」的例外仍然适用。',
  'A lion captures a lower-ranked wolf.': '狮吃掉等级较低的狼。',
  'Equal ranks work differently. When an animal captures an enemy of its own rank, both pieces leave the board (同归于尽, “they perish together”), and neither side keeps the square.':
    '同等级的处理方式不同。当动物吃与自己同等级的敌子时，两枚棋子都离开棋盘（同归于尽），双方都不占据该格。',
  'Equal animals remove each other.': '同等级动物会一起离场。',
  'Play on Mistboard': '在 Mistboard 上对弈',
  'Play vs computer': '对战电脑',
  'Xiangqi is playable on Mistboard. Play against an engine or challenge a friend. No account required.':
    '象棋可在 Mistboard 上对弈。挑战引擎或邀请好友，无需账户。',
  'Fortress Xiangqi is playable on Mistboard. Play against an engine or challenge a friend. No account required.':
    '堡垒象棋可在 Mistboard 上对弈。挑战引擎或邀请好友，无需账户。',
  'Flip Xiangqi is playable on Mistboard. Play against an engine or challenge a friend. No account required.':
    '翻转象棋可在 Mistboard 上对弈。挑战引擎或邀请好友，无需账户。',
  'Jungle Chess is playable on Mistboard. Play against an engine or challenge a friend. No account required.':
    '斗兽棋可在 Mistboard 上对弈。挑战引擎或邀请好友，无需账户。',
  'Flip Jungle is playable on Mistboard. Play against an engine or challenge a friend. No account required.':
    '翻翻棋可在 Mistboard 上对弈。挑战引擎或邀请好友，无需账户。',
  'Reveal Xiangqi is playable on Mistboard. Play against an engine or challenge a friend. No account required.':
    '揭棋可在 Mistboard 上对弈。挑战引擎或邀请好友，无需账户。',
  'Fog Xiangqi is playable on Mistboard. Play against an engine or challenge a friend. No account required.':
    '迷雾象棋可在 Mistboard 上对弈。挑战引擎或邀请好友，无需账户。',
  'Fog Chess is playable on Mistboard. Play against an engine or challenge a friend. No account required.':
    '迷雾国际象棋可在 Mistboard 上对弈。挑战引擎或邀请好友，无需账户。',
  'FIRST FLIP ASSIGNS COLOR': '首次翻子决定颜色',
  'CANNON SCREEN CAPTURE': '炮隔子吃',
  'CAPTURED PIECE KNOWLEDGE': '被吃暗子信息',
  HIGH: '高',
  LOW: '低',
  General: '将',
  Advisor: '士',
  Elephant: '象',
  Chariot: '车',
  Horse: '马',
  Cannon: '炮',
  Soldier: '卒',
  'RED KNOWS': '红方知道',
  'BLACK KNOWS': '黑方知道',
  'the captured piece was a horse': '被吃的是马',
  'one dark piece disappeared': '一枚暗子消失了',
  'Attacking, the cannon jumps a screen and ignores rank.': '炮进攻时隔一子跳吃，不看等级。',
  'As a target it ranks here: taken by horse and up, never by a soldier.':
    '作为目标时，炮排在这里：马以上可吃，卒不可吃。',
  'CAPTURE RANK LADDER': '吃子等级序列',
};

const ZH_HANT: Record<string, string> = {
  // Traditional starts from the complete Simplified key set, then every
  // authored Taiwan lexical or glyph fork below overrides that shared value.
  // Keep this spread first so new Traditional entries cannot be overwritten.
  ...ZH_HANS,
  // -- Fortress Xiangqi --
  'Fortress Xiangqi Rules': '堡壘象棋規則',
  'Xiangqi with a pocket: every familiar piece moves as in xiangqi, plus crazyhouse-style drops and one new piece, the Treasure.':
    '帶持子的象棋：所有熟悉的棋子都按象棋規則移動，再加入瘋狂屋式打入和一個新棋子「寶」。',
  'Fortress Xiangqi is an [Xiangqi](/rules/xiangqi) variant with a reserve, designed by Brian H. Liou in 2026 as a Mistboard original. Every familiar piece moves exactly as it does in xiangqi, and one new piece, the Treasure, joins the back rank. The new rule is the [crazyhouse](https://en.wikipedia.org/wiki/Crazyhouse) loop: capture a piece, hold it in hand, and drop it back into the fight.':
    '堡壘象棋是一種帶持子的[象棋](/rules/xiangqi)變體，由 Brian H. Liou 於 2026 年為 Mistboard 原創設計。所有熟悉的棋子都完全按象棋規則移動，底線另加入一個新棋子「寶」。新規則採用[瘋狂屋](https://en.wikipedia.org/wiki/Crazyhouse)的循環：吃掉棋子，將它收入持子，再打回戰場。',
  'Captured material never leaves the game, so every capture becomes future pressure. A quiet trade can turn into a later attack, and a fortress can be built, then cracked open by the very material it gave away. The result is fair, decisive, comeback-rich, and short.':
    '被吃的子永遠不會離開對局，因此每次吃子都會變成未來的壓力。一次平靜的兌子可能化為後續攻勢；一座堡壘可以築起，也可能被它送出的子力反過來攻破。由此形成的對局公平、果斷、逆轉機會多，而且簡短。',
  'Board and palaces': '棋盤與九宮',
  'The board is 7 files (a to g) by 8 ranks, with a river between ranks 4 and 5. Each side has a 3 by 3 palace, but the two palaces sit in opposite corners: Red holds the bottom left (a1 to c3) and Black holds the top right (e6 to g8). The whole setup has 180 degree rotational symmetry.':
    '棋盤為 7 路（a 至 g）、8 橫線，河界位於第 4 與第 5 橫線之間。雙方各有一個 3×3 九宮，但兩個九宮分處對角：紅方占左下角（a1 至 c3），黑方占右上角（e6 至 g8）。整個布局具有 180 度旋轉對稱性。',
  'The starting position. Red holds the bottom-left palace, Black the top-right, and the Treasure starts on each palace corner.':
    '初始局面。紅方占左下九宮，黑方占右上九宮，雙方的「寶」都從各自九宮的角上出發。',
  'Red moves first. This is open information: both players see the whole board and both reserves.':
    '紅方先行。這是完全資訊遊戲：雙方都能看到整個棋盤和雙方的持子。',
  'Every standard piece moves exactly as it does in [xiangqi](/rules/xiangqi). In the diagrams below, a green dot marks a quiet destination, a green ring marks a capture, and a red cross marks a point the piece cannot reach.':
    '所有標準棋子都完全按照[象棋](/rules/xiangqi)規則移動。在下圖中，綠點表示不吃子的落點，綠圈表示吃子，紅叉表示該棋子無法到達的點。',
  '**Chariot:** slides any distance orthogonally, the strongest piece on the board. Here it can take the soldier on d7.':
    '**車：**沿橫線或直線移動任意距離，是棋盤上最強的棋子。此處它可以吃掉 d7 的兵。',
  '**Cannon:** moves like the Chariot on open lines, but captures only by jumping exactly one screen piece, friend or enemy. On the right, the cannon on d2 takes the chariot on d7 over its own soldier screen.':
    '**炮：**在空線上走法與車相同，但吃子時必須恰好跳過一個炮架，不論敵我。右圖中，d2 的炮隔著己方兵作炮架，吃掉 d7 的車。',
  '**Horse:** steps one point orthogonally, then one point diagonally outward. If the orthogonal step is occupied, that whole direction is blocked. On the right, the soldier on d5 takes away both forward destinations.':
    '**馬：**先沿橫向或縱向走一步，再向外斜走一步。如果第一步的位置被占據，該方向就會蹩馬腿。右圖中，d5 的兵封住了馬向前的兩個落點。',
  '**Elephant:** moves exactly two points diagonally, is blocked by an occupied midpoint (the elephant eye), and can never cross the river.':
    '**象：**沿對角線恰好走兩點，中點（象眼）有子時會被塞象眼，而且永遠不能過河。',
  '**Advisor:** moves one point diagonally and stays inside the palace.':
    '**士：**沿對角線走一點，並且始終留在九宮內。',
  '**General:** moves one point orthogonally and stays inside the palace. One xiangqi rule retires itself here: because the palaces sit in opposite corners, the two generals never share a file, so the facing-generals rule never comes into play.':
    '**將帥：**沿橫向或縱向走一點，並且始終留在九宮內。有一條象棋規則在這裡自然失效：兩個九宮位於對角，兩位將帥永遠不會處於同一路，因此不會出現將帥照面的情況。',
  '**Soldier:** moves one point forward or sideways, never backward. It has the sideways step from the opening move, where a xiangqi soldier earns it only by crossing the river. Every Fortress soldier is a veteran: the war is already on.':
    '**兵：**向前或橫向走一點，不能後退。它從開局起就能橫走，而普通象棋的兵要過河後才獲得這項能力。堡壘象棋裡的每個兵都是老兵：戰事早已開始。',
  '**Treasure:** the one new piece. It steps one point in any of the eight directions, all game. It never promotes and is never confined. Think of it as a queen that only steps one square: a strong palace defender early, and a flexible attacker once it advances or is dropped.':
    '**寶：**唯一的新棋子。整局都可以向八個方向中的任一方向走一點。它不會升變，也不受區域限制。可以把它看作每次只走一格的后：開局時是強力的九宮守衛，前進或打入後則是靈活的攻擊子。',
  'The Treasure steps one point in any of the eight directions. Here it has eight moves, including the capture on e5.':
    '「寶」可以向八個方向中的任一方向走一點。此處它有八種走法，包括吃掉 e5 的棋子。',
  'There are no promotions and no past-river changes. Soldiers move the same on both sides of the river; the river only stops the Elephant, which never crosses it.':
    '沒有升變，也沒有過河後的走法變化。兵在河界兩側的走法相同；河界只限制永遠不能過河的象。',
  'Capture, hold, drop': '吃子、持子、打入',
  'When you capture an enemy piece, it flips to your color and enters your hand. The hand is open information: it can hold any number of pieces, and they can wait there for any number of turns. On your turn you either move a piece on the board, or spend the move to drop one piece from hand onto an empty point.':
    '吃掉敵方棋子後，它會變成你的顏色並進入持子。持子是公開資訊，可以容納任意數量的棋子，也可以保留任意多個回合。輪到你時，可以移動盤面上的棋子，也可以用這一回合把一枚持子打入空點。',
  'Attackers drop anywhere, including deep in the enemy half: the Chariot, Horse, Cannon, Soldier, and Treasure. Defenders drop only where they could legally stand.':
    '攻擊子可以打入任何位置，包括敵方縱深：車、馬、炮、兵和寶。防守子只能打入其本來可以合法停留的位置。',
  'A captured Advisor drops only onto an empty point of your own palace.':
    '被吃的士只能打入己方九宮內的空點。',
  'A captured Elephant drops onto any empty point in your own half.':
    '被吃的象可以打入己方半場的任意空點。',
  'A dropped piece is live immediately. A drop may give check or deliver checkmate, and a dropped Soldier can step sideways wherever it lands. The one limit is the usual one: no move, drop included, may leave your own general in check.':
    '打入的棋子立即生效。打入可以將軍或將死，打入的兵無論落在哪裡都可以橫走。唯一限制與平常相同：任何著法，包括打入，都不能讓己方將帥處於被將軍狀態。',
  'How games end': '對局如何結束',
  'Checkmate wins. A player left with no legal move loses by stalemate, the xiangqi convention. There is no fifty-move or no-progress draw and no shogi-style impasse rule: the game continues until one side breaks.':
    '將死獲勝。按照象棋慣例，無合法著法的一方因困斃而負。沒有五十回合規則或無進展和棋，也沒有將棋式的入玉規則：對局會繼續，直到一方被攻破。',
  'Repetition is governed by the chasing rule. When the same position occurs for the third time, the game is adjudicated: if one side gave check with every move of the repeating cycle, that side loses. You cannot perpetual-check your way out of a lost game. A repetition that neither side is forcing with checks is an honest standoff and is drawn, the only drawn result in the game.':
    '重複局面由長將規則裁定。同一局面第三次出現時進行判定：如果一方在重複循環中的每一步都在將軍，該方判負。不能靠長將逃出敗勢。若雙方都沒有用連續將軍強迫重複，則視為真正的僵持並判和，這是本遊戲唯一的和棋結果。',
  'Games can also end by timeout, resignation, or abandonment.':
    '對局也可能因超時、認輸或棄局而結束。',
  'What makes it Fortress Xiangqi': '為什麼它叫堡壘象棋',
  'Most chess variants trade fairness for decisiveness. Drops break that tradeoff: they keep the game fair while cutting draws and shortening play, and your captured material comes back at your own king, so every exchange is a real decision. Cheap pieces parachuted behind enemy lines deliver many of the finishes, which is the good kind of explosive.':
    '多數棋類變體會用公平性換取更果斷的結果。打入打破了這種取捨：它既保持公平，又減少和棋、縮短對局；你被吃掉的子力還會回頭攻擊自己的將帥，因此每次兌子都是實質抉擇。許多終局由廉價棋子空降敵後完成，帶來恰到好處的爆發力。',
  'The rules were locked by engine testing rather than taste. Both-side attacker drops won out over a same-side variant that built beautiful fortresses but ran to 246-ply grinds. In engine sampling of the final rules, about 11 percent of games were drawn, one win in five came from behind, and the average game ran 83 plies.':
    '規則由引擎測試定案，而不是憑個人喜好。允許攻擊子打入雙方半場的版本勝過了只許打入己方半場的版本；後者雖然能築出漂亮堡壘，卻會拖成長達 246 回合步的苦戰。在最終規則的引擎抽樣中，約 11% 的對局為和棋，五場勝局中有一場來自逆轉，平均對局長度為 83 回合步。',
  'Step through this engine game played under the production rules. Both sides spend their reserves early and often: watch Red build the attack from hand with the cannon drop at move 13 and the treasure drop at move 16, the advisor drop back into its own palace to defend at move 19, and the finish, where the mating pieces arrive by parachute.':
    '逐步回放這盤按正式規則進行的引擎對局。雙方很早就頻繁使用持子：觀察紅方如何在第 13 回合打入炮、第 16 回合打入寶，從持子構築攻勢；又如何在第 19 回合把士打回己方九宮防守；最後，將死棋子如同空降般抵達戰場。',

  // -- How Misty Plays --
  'Misty is the bot you play on Mistboard in Fog of War chess. It is not allowed to peek. The server sends it the same kind of limited view a human player gets, then Misty has to choose a move from that uncertainty.':
    'Misty 是你在 Mistboard 迷霧國際象棋中對弈的機器人。它不允許偷看。伺服器只會向它傳送與人類玩家同類的受限視野，然後 Misty 必須在這種不確定性中選擇著法。',
  'It plays under the same fog you do': '它和你在同一片迷霧下對弈',
  'Misty never sees the canonical board. Each move, it gets only what the side to move can legally observe under Fog of War: its own pieces, the squares they see, and the captures in view. Everything else is hidden. It plays under the same rules you do, and you can verify that: Mistboard is open source, so anyone can audit the server code that enforces the fog before the engine sees a position.':
    'Misty 永遠看不到規範真實棋盤。每一步，它只會得到輪到走棋的一方在迷霧國際象棋規則下可以合法觀察的內容：自己的棋子、這些棋子能看見的格子，以及視野內發生的吃子。其餘一切都被隱藏。它與你遵守相同規則，而且這一點可以驗證：Mistboard 是開源的，任何人都能稽核在引擎看到局面之前執行迷霧規則的伺服器程式碼。',
  'A classical chess engine like Stockfish has one advantage: it can see the whole board. It picks its move by searching the game tree, looking ahead through the lines both sides could play and backing up the best line (minimax). The search assumes a single true position and a single true continuation.':
    'Stockfish 這樣的經典國際象棋引擎有一個優勢：它能看到整個棋盤。它透過搜尋博弈樹來選擇著法，向前推演雙方可能走出的變化，再回傳最佳變化的價值（極小化極大演算法）。這種搜尋假設只有一個真實局面和一條真實的延續。',
  "Under fog there is no single position to search. Misty can't see the opponent's pieces, so the board it has to reason about is a belief set: many legal boards consistent with what it has observed. A move that wins on one board can hang the king on another. Misty samples from that set, searches those worlds, and looks for a move that holds up across them.":
    '迷霧下不存在一個可供搜尋的單一局面。Misty 看不到對手的棋子，因此它必須推理的是一個信念集合：許多與已觀察資訊一致的合法棋盤。同一步棋可能在一個棋盤上獲勝，卻在另一個棋盤上白送國王。Misty 從集合中取樣，搜尋這些可能世界，並尋找在它們之中都站得住腳的著法。',
  'That family of approach is called perfect-information Monte Carlo. It is also the family used by Obscuro, the strongest published Fog of War chess engine. The hard part is not just playing chess. It is keeping the hidden-board model honest while the clock is running.':
    '這一類方法稱為完全資訊蒙地卡羅。公開發表的最強迷霧國際象棋引擎 Obscuro 也採用同類方法。難點不只是下好國際象棋，而是在時鐘不停走動時，讓隱藏棋盤模型始終忠於已知資訊。',
  "What's hard": '難點在哪裡',
  'Two things. The first is the possible-board set itself. A few plies into a foggy middlegame, "every consistent board" blows up fast. Misty has to keep that uncertainty under control inside a live-game time budget.':
    '有兩個難點。第一個就是可能棋盤的集合本身。迷霧中局只走幾個回合步後，「所有一致的棋盤」數量就會迅速爆炸。Misty 必須在即時對局的時間預算內控制這種不確定性。',
  'The second is picking a move over that set. Scoring one move means weighing it across thousands of possible boards at once, and the obvious way to do that, averaging the outcomes, quietly buries disasters. A move that loses the king on a small slice of boards may barely move the average, but it still loses those games outright. Reasoning well over a distribution of boards, rather than a single board, is most of what the engine does.':
    '第二個難點是在這個集合上選擇著法。為一步棋評分，意味著同時衡量它在數千個可能棋盤上的表現；最直觀的辦法是取結果平均值，卻會悄悄掩埋災難。如果一步棋只在少部分棋盤上丟王，平均分可能幾乎不變，但那些對局仍會直接輸掉。引擎的大部分工作，就是針對棋盤分布而非單一棋盤進行可靠推理。',
  'What changed in the current release': '目前版本有哪些變化',
  'The current production engine is Misty 1.5. Most of the work since the first public release has been hardening, not a new personality: avoid rare king walks into hidden captures, avoid major-piece hangs in fog, stop stale search memory from leaking into a new live position, see fog-castles during search, and steer away from unstable early lines with a small opening book.':
    '目前正式環境的引擎是 Misty 1.5。首次公開發布後的大部分工作都在加固，而不是塑造新個性：避免國王偶爾走進隱藏吃子範圍，避免大子在迷霧中白送，阻止過期的搜尋記憶洩漏到新的即時局面，在搜尋中看見迷霧下的王車易位，並用小型開局庫避開不穩定的早期變化。',
  'That does not make Misty solved or perfectly safe. It means the cheap fog-specific failures that made earlier versions look silly are much rarer, so games against it test your understanding instead of your patience.':
    '這並不意味著 Misty 已被徹底解決或絕對安全。它意味著那些讓早期版本顯得可笑的低級迷霧特有錯誤已經少見得多，因此與它對弈考驗的是你的理解，而不是耐心。',
  'Where it stands': '它目前處於什麼水準',
  "Misty is the strongest Fog of War chess engine I've seen available to play, but version numbers are not ratings. The yardstick that matters is human play, and I won't put a number on it until a serious human match earns one.":
    'Misty 是我見過可以直接對弈的最強迷霧國際象棋引擎，但版本號不是等級分。真正有意義的標尺是人類實戰；在一場嚴肅的人機比賽給出依據之前，我不會為它標上數字。',
  "What's next": '下一步是什麼',
  'Misty itself stays focused on Fog of War chess. The same redacted engine protocol now supports variant-specific siblings, including Misty DMX for Dark Mini Xiangqi and MistyBanqi for Banqi, but those are separate engines with their own rules and evaluation problems.':
    'Misty 本身會繼續專注於迷霧國際象棋。同一套去識別化引擎協定現在也支援針對特定變體的同系引擎，包括迷霧迷你象棋的 Misty DMX 和暗棋的 MistyBanqi，但它們是獨立引擎，各有自己的規則與評估問題。',
  "Misty is live on Mistboard, and every serious game against it sharpens the estimate of where it stands. Play one, and you're part of the benchmark.":
    'Misty 已在 Mistboard 上線，每一盤嚴肅的人機對局都會讓我們更準確地估計它的水準。來下一盤，你也會成為這項基準的一部分。',
  'All articles': '全部文章',
  'For engine builders': '致引擎開發者',
  "If you build Fog of War engines, I'd like to play yours against Misty. There's almost no public head-to-head data between engines for this variant, and engine-vs-engine games are the cleanest way to see where any of them stand. Get in touch and we'll set up a match.":
    '如果你在開發迷霧國際象棋引擎，我希望讓它與 Misty 對弈。這個變體幾乎沒有公開的引擎正面對戰資料，而引擎之間的比賽是判斷各自水準最清楚的方式。聯絡我們，我們可以安排一場比賽。',
  'Get in touch': '聯絡我們',
  References: '參考資料',
  '[Obscuro (Zhang & Sandholm, ICLR 2026)](https://arxiv.org/abs/2506.01242). The academic neighbor is Reconnaissance Blind Chess, whose engine lineage runs StrangeFish (CMU, 2018), ReBeL (FAIR, 2020), Penumbra (Georgia Tech), and Obscuro (CMU, 2026).':
    '[Obscuro（Zhang 與 Sandholm，ICLR 2026）](https://arxiv.org/abs/2506.01242)。與之相鄰的學術領域是偵察盲棋，其引擎譜系包括 StrangeFish（CMU，2018）、ReBeL（FAIR，2020）、Penumbra（Georgia Tech）和 Obscuro（CMU，2026）。',

  // -- Programming Fog Chess with Server-Side Truth --
  'Truth stays server-side': '真實局面留在伺服器端',
  'The triptych is the architecture in miniature. The center board exists only on the server. White and Black each receive a different projection, and neither projection contains the full truth with a visual layer hiding it.':
    '這組三聯棋盤就是整個架構的縮影。中央棋盤只存在於伺服器上。白方與黑方各自收到不同的投影檢視，任何一份投影都不是用視覺圖層遮住完整真實局面。',
  'The rule is simple: compute truth once, project the allowed view per seat, and keep the full event log private until the game is over.':
    '規則很簡單：只計算一次真實狀態，再為每個席位投影其獲准看到的檢視，並在對局結束前將完整事件紀錄保持私密。',
  'That single boundary supports live PvP, engine games, calibration, tournaments, and review. This article stays focused on the player-facing live room: what each browser receives, who can receive it, and when the record becomes public.':
    '這一條邊界同時支援即時玩家對戰、引擎對局、校準、賽事和複盤。本文聚焦面向玩家的即時房間：每個瀏覽器會收到什麼、誰可以接收，以及對局紀錄何時公開。',
  'How views are computed': '檢視如何計算',
  'For a player, the boundary is `PlayerView`: visible squares, visible pieces, legal moves, status, and clock for that seat. Opponent pieces outside the visibility set are not hidden fields. They are absent.':
    '對玩家而言，這條邊界就是 `PlayerView`：該席位可見的格子、可見棋子、合法著法、狀態和時鐘。可見範圍之外的對方棋子不是被藏在欄位裡，而是根本不存在於資料中。',
  'The important part is the direction of dependency. The client can render fog because it receives a visibility mask, but it cannot remove fog to recover pieces it was never sent.':
    '關鍵在於相依方向。用戶端因為收到可見性遮罩而能夠渲染迷霧，卻無法透過移除迷霧來恢復從未傳送給它的棋子。',
  'Sample data payload': '範例資料負載',
  'The live move stream uses `event-appended`, a per-move frame. This is the white payload from the position above, shortened to the fields that matter:':
    '即時走子串流使用 `event-appended`，每步傳送一個訊框。下面是上方局面中傳給白方的負載，已縮減為關鍵欄位：',
  '**Core fields:** `seat` identifies the recipient, `seq` orders the stream, `state.board` is the redacted board, `state.visibleSquares` is the clear-vs-fog mask, and `state.status` carries the canonical turn/result state.':
    '**核心欄位：**`seat` 標識接收者，`seq` 為資料流排序，`state.board` 是去識別化後的棋盤，`state.visibleSquares` 是清晰區域與迷霧區域的遮罩，`state.status` 攜帶規範的輪次與結果狀態。',
  'If the appended event is visible to this seat, the frame includes one filtered `event`. If the move is hidden, `event` is omitted and the projected `state` still advances. The player knows a turn happened, not what happened in the fog.':
    '如果新增事件對該席位可見，這個訊框會包含一個經過過濾的 `event`。如果走子被隱藏，`event` 會被省略，但投影後的 `state` 仍會推進。玩家知道一回合已經發生，卻不知道迷霧中發生了什麼。',
  'Snapshots still exist for first connect, explicit recovery, and final resync. They carry the filtered event history needed to hydrate the client, so they are larger than per-move frames.':
    '首次連線、明確復原和最終重新同步仍會使用快照。快照攜帶用戶端初始化所需的過濾事件歷程，因此比逐步訊框更大。',
  'Player move': '玩家走子',
  'A move request is just coordinates:': '走子請求只有座標：',
  'The server validates the request against canonical state, applies the move, appends an event, and projects the next view. The client never decides whether hidden information exists, whether an invisible move happened, or whether the game is over.':
    '伺服器根據規範狀態驗證請求，執行走子，附加事件，再投影下一份檢視。用戶端永遠不負責判斷是否存在隱藏資訊、是否發生了不可見走子，或對局是否結束。',
  'Seat-gated live rooms': '按席位控制的即時房間',
  'During a live game, the server sends game data only to the two seats. After each move, it projects one view for White and one view for Black, then sends each view only to a socket that has proven it controls that seat.':
    '即時對局期間，伺服器只向兩個對局席位傳送遊戲資料。每步之後，它分別為白方和黑方投影一份檢視，再將每份檢視只傳送給已經證明自己控制該席位的通訊端。',
  'Seat proof': '席位證明',
  'A socket gets live room data only after it proves control of the white or black seat. Anonymous seats use random bearer tokens; the server stores a SHA-256 token hash and compares the presented token in constant time.':
    '通訊端只有在證明自己控制白方或黑方席位後，才能取得即時房間資料。匿名席位使用隨機持有人權杖；伺服器保存 SHA-256 權杖雜湊，並以固定時間比較提交的權杖。',
  'Account seats': '帳號席位',
  'Signed-in seats add the account session check on top of the seat claim. The token proves this browser can reclaim the seat; the session proves the account still matches the seat assignment.':
    '已登入席位會在席位聲明之上增加帳號工作階段檢查。權杖證明該瀏覽器可以取回席位；工作階段則證明帳號仍與席位分配相符。',
  'No live spectator view': '沒有即時觀戰檢視',
  'Non-players do not get a live spectator projection. A socket without a valid seat is rejected before room data is sent, and the live replay endpoint returns 403 until the game reaches a terminal state.':
    '非對局玩家不會取得即時觀戰投影。沒有有效席位的通訊端會在房間資料傳送前被拒絕，而即時回放端點會一直回傳 403，直到對局進入終局狀態。',
  'Postgame review': '賽後複盤',
  'When the game becomes terminal, the privacy rule changes. The room no longer rejects non-players after the result, and the game page becomes the durable public review surface.':
    '對局進入終局狀態後，隱私規則隨之改變。結果產生後，房間不再拒絕非對局玩家，遊戲頁面則成為持久的公開複盤介面。',
  'A spectator who opens the room during play gets no board. The same person can open the finished game page after the result and inspect the event log. That is the product rule: private while decisions are live, reviewable once the record is settled.':
    '觀眾在對局進行時打開房間，看不到棋盤。結果產生後，同一個人可以打開已結束的遊戲頁面並檢查事件紀錄。這就是產品規則：決策仍在進行時保持私密，紀錄確定後可以複盤。',
  'That split is important for rated play. A rated result can point at a public completed game without giving non-players access to live hidden information.':
    '這種區分對計分對局很重要。計分結果可以指向一盤公開的已完成對局，同時不讓非對局玩家接觸即時隱藏資訊。',
  'It also keeps reconnect and review on the same foundation. Live reconnect rebuilds a filtered player view from the event log. Postgame review uses the same log after the hidden-information constraint has expired.':
    '它也讓重新連線與複盤建立在同一基礎上。即時重新連線從事件紀錄重建過濾後的玩家檢視；隱藏資訊限制失效後，賽後複盤使用同一份紀錄。',
  'Scope and verification': '範圍與驗證',
  'This is not a full anti-cheat claim. It is the narrower integrity claim this architecture can prove: during live play, hidden truth is not sent to unauthorized browser paths; after the game ends, the record is reviewable.':
    '這並不是一項完整的反作弊聲明，而是該架構能夠證明的、更具體的完整性保證：即時對局期間，隱藏真實狀態不會傳送到未經授權的瀏覽器路徑；對局結束後，紀錄可供複盤。',
  'Anonymous casual seats are bearer-token seats, not account-grade identity, and there is no live spectator mode for hidden-information games.':
    '匿名休閒席位依靠持有人權杖，並不具備帳號級身分保證；隱藏資訊遊戲也沒有即時觀戰模式。',
  'Mistboard covers this boundary with WebSocket and payload regression tests that drive real moves and assert on the bytes each seat receives.':
    'Mistboard 用 WebSocket 與負載迴歸測試覆蓋這條邊界：測試會執行真實走子，並斷言每個席位實際收到的位元組。',
  'That is the line Mistboard defends: during play, there is no browser-side truth to unmask. After play, there is a public record to inspect.':
    '這就是 Mistboard 守住的界線：對局期間，瀏覽器端沒有可以揭開的真實局面；對局結束後，則有公開紀錄可供檢查。',

  // -- How MistyBanqi Plays (engine article) --
  'How MistyBanqi Plays': 'MistyBanqi 是怎麼下棋的',
  'MistyBanqi is the engine you play in Banqi on Mistboard: a classical search engine with a hand-written evaluation. How it thinks, and the blind spot worth knowing: it can draw a game it has already won.':
    'MistyBanqi 是你在 Mistboard 上對弈暗棋時面對的引擎：一個採用手寫評估的經典搜尋引擎。它如何思考，以及一個值得知道的盲點：它會把已經贏定的棋下成和棋。',
  'How it thinks': '它如何思考',
  "Banqi hides information in its own way: every tile starts face-down, and flipping one reveals a random piece from the bag of what's left. So unlike chess, the engine's search tree mixes ordinary moves with chance events. MistyBanqi treats a flip as a chance node, averaging over the pieces the tile might turn out to be, and otherwise searches like a classical chess engine: it looks ahead through the lines both sides could play and backs up the value of the best one.":
    '暗棋以自己獨特的方式隱藏資訊：每枚棋子起初都背面朝下，翻開一枚，就會從剩下的棋子裡隨機翻出一枚。因此和西洋棋不同，引擎的搜尋樹裡既有普通著法，也有隨機事件。MistyBanqi 把翻子當作一個機率節點，對這枚棋子可能翻出的各種身分取加權平均；其餘部分則像經典西洋棋引擎那樣搜尋：向前推演雙方可能走的著法，再把最佳一路的價值回傳上來。',
  "What it can't do is judge a position by feel. Every leaf of that search gets scored by a hand-written evaluation: material on a corrected value table (the cannon, which captures by jumping a screen, is the most dangerous piece on the board), how many squares each piece controls, how exposed the general is, and a handful of other terms. The engine is only as good as those terms, which is where the weakness below comes from.":
    '它做不到的是憑感覺判斷盤面。這棵搜尋樹的每個葉子節點，都由一套手寫的評估來打分：基於一張修正過的子力價值表的子力（炮靠隔子吃，是盤面上最危險的棋子）、每枚棋子控制多少格、將帥有多暴露，以及另外一些項。引擎的水準完全取決於這些項的好壞——下面要講的弱點正源於此。',
  'Most of the time, it wins': '大多數時候，它會贏',
  "MistyBanqi will beat most people, and it does it the way a classical engine does: by calculating captures several moves deep. Step through a game where it clears the board. Banqi swings with the flips, so it even fell behind on material early here, then worked its way back until the opponent had no piece left to move. Tiles flip to their dealt piece the first time they're turned over.":
    'MistyBanqi 能贏過大多數人，而它取勝的方式正是經典引擎的方式：往前算上好幾步的吃子。逐步回放下面這盤它把對手清光的棋。暗棋的局勢隨翻子起伏，這盤裡它開局甚至一度子力落後，隨後一步步扳了回來，直到對手沒有棋子可走。每枚棋子第一次被翻開時，會翻出它所發到的身分。',
  'That kind of capture-by-capture calculation is the strong half of its game. The blind spot is the other half: what happens when the win needs no more captures, just patience.':
    '這種一子一子算下去的計算，是它棋力強的那一半。盲點是另一半：當勝利不再需要吃子、只需要耐心時，會發生什麼。',
  'It can draw a game it has won': '它會把贏定的棋下成和棋',
  'Here is the same engine in a position it has completely won. It is up ten pieces to two, with nothing left to capture, and the only task is to walk the win home. It draws instead.':
    '同樣這個引擎，下面處在一個它已經完全贏定的局面。它以十子對兩子領先，已經沒有子可吃，唯一要做的就是把勝勢走到底。結果它卻下成了和棋。',
  "Nothing in the evaluation rewards converting a won position over just holding material, so a position it's winning by a mile and a position it has actually won score about the same. With no term pushing it to make progress, it shuffles, and Banqi's threefold-repetition rule ends the game a draw.":
    '評估裡沒有任何一項會因為「把優勢轉化為勝利」而比「單純守住子力」給更高的分，於是一個遙遙領先的局面和一個真正已經贏下的局面，得分幾乎一樣。既然沒有哪一項促使它取得進展，它就只是來回挪子，而暗棋的三次重複局面規則便把這盤判成和棋。',
  "There's an upshot for you here. If you're losing on material, you're not necessarily lost: herd one of its strong pieces into a perpetual chase, and MistyBanqi may walk into the draw it can't see it should decline.":
    '這對你有個實用的啟示。如果你子力落後，並不一定就輸了：用長捉纏住它的一枚大子，MistyBanqi 可能就一頭走進那個它看不出自己本該拒絕的和棋。',
  'It can also lose its own general': '它也可能丟掉自己的將帥',
  'A related blind spot involves the general. A soldier is the only piece that can capture it, and the engine is slow to make room for a general boxed into a corner. It will sometimes march a piece off to the far side of the board while a lone enemy soldier walks up and traps it. Same gap as the draw above: the evaluation has no real sense of a slow, quiet threat building several moves away.':
    '另一個相關的盲點和將帥有關。只有兵（卒）能吃將帥，而當將帥被逼到角落時，引擎遲遲不為它騰出退路。有時它會把一枚棋子調到棋盤另一頭，任由一枚孤零零的敵方兵走上來把將帥困死。這和上面的和棋是同一類毛病：評估對一個緩慢、安靜、還要好幾步才成形的威脅，沒有真正的感覺。',
  'How each of these was found, reproduced, and measured is written up in detail in the engineering post linked below.':
    '這些問題各自是如何被發現、重現並量化的，下面連結的工程部落格文章裡有詳細記錄。',
  'Why these exist, and what’s next': '為什麼會有這些問題，以及下一步',
  "These are the limits of a hand-written evaluation: it can only value what someone thought to encode, and conversion and slow king-hunts are exactly the long-horizon calls that are hard to write down. The fix the strongest Dark Chess programs use is a learned evaluation, trained from game outcomes, which lets the engine judge these on its own. That's the eventual next step for MistyBanqi. Until a learned version clears the current engine's bar in testing, the hand-written one is what you play: strong, and honest about where it cracks.":
    '這些是手寫評估的侷限：它只能給有人想到要編碼進去的東西打分，而「把勝勢轉化為勝利」和「緩慢圍獵將帥」恰恰是那種很難寫成規則的長程判斷。最強的暗棋程式採用的解法，是一套從對局勝負中學習得到的評估，讓引擎能自己判斷這些。這也是 MistyBanqi 終將邁出的下一步。在學習版於測試中越過現有引擎這道門檻之前，你面對的仍是手寫版：強，且對自己會在哪裡出問題保持坦誠。',
  'Play it': '來下一盤',
  'MistyBanqi is live on Mistboard. Take it on at the strength you pick, or read the full writeup of how it was built and measured.':
    'MistyBanqi 已在 Mistboard 上線。來按你選擇的強度挑戰它，或閱讀它如何被打造與衡量的完整記錄。',
  'The engineering story': '工程幕後故事',
  Human: '人類',
  'Human vs engine · mistboard.com': '人類對引擎 · mistboard.com',
  'Human vs engine': '人類對引擎',
  'Draw by repetition · MistyBanqi up 10 pieces to 2': '重複局面和棋 · MistyBanqi 十子對兩子領先',
  'MistyBanqi wins · the opponent is left with no piece to move':
    'MistyBanqi 獲勝 · 對手已無子可走',
  "MistyBanqi (Red) is up ten pieces to two, a trivially won position, but its evaluation gives no reward for converting a win over holding material, so it shuffles instead of pressing and the game is drawn by threefold repetition. If you're losing on material against it, this is the escape: herd a strong piece into a perpetual chase and it may let the draw happen.":
    'MistyBanqi（紅方）以十子對兩子領先，是一個輕鬆贏定的局面，但它的評估並不會因為「把優勢轉化為勝利」而比「守住子力」給更高的分，於是它只來回挪子、不去逼搶，最終因三次重複局面被判和棋。如果你對它子力落後，這就是脫身之道：用長捉纏住一枚大子，它也許就放任和棋發生。',
  'MistyBanqi (the first player) won this one outright, leaving the opponent with nothing to move. Banqi swings hard with the flips: it fell behind on material early here, then calculated its way back and cleared the board. Grinding down a position like this, capture by capture, is the strong half of its game.':
    'MistyBanqi（先手）乾淨俐落地贏下了這盤，讓對手無子可走。暗棋的局勢隨翻子劇烈起伏：這盤裡它開局子力落後，隨後憑計算一步步扳回，把對手清光。像這樣一子一子地輾下去，是它棋力強的那一半。',

  // -- Article index cards --
  'How Misty Plays': 'Misty 是怎麼下棋的',
  "Misty is Mistboard's Fog of War chess engine: how it sees, searches possible boards, avoids hidden catastrophes, and where the current version stands.":
    'Misty 是 Mistboard 的迷霧國際象棋引擎：它如何觀察、搜尋可能盤面、避開隱藏災難，以及目前版本處在什麼水平。',
  'How Mistboard keeps hidden information on the server: canonical state, seat-scoped views, private live rooms, and public postgame review.':
    'Mistboard 如何把隱藏資訊留在伺服器端：標準真實局面、按座位投影視野、私密即時房間，以及公開的賽後複盤。',

  // -- Drop Mini Xiangqi (rules) --
  'Drop Mini Xiangqi Rules': '投放迷你象棋規則',
  'Mini Xiangqi with reserves: captured pieces enter your hand, then drop back outside the enemy palace.':
    '帶持子的迷你象棋：被吃的棋子進入你的手牌，之後可以打回棋盤，但不能打入對方九宮。',
  'Drop Mini Xiangqi is [Mini Xiangqi](/rules/mini-xiangqi) with a reserve. The board is still 7 by 7, Red still moves first, and the general is protected by check and checkmate. The new rule is simple: captured pieces become yours, wait in your hand, and can return to the board as drops.':
    '投放迷你象棋是在[迷你象棋](/rules/mini-xiangqi)裡加入持子。棋盤仍是 7×7，紅方仍先走，將帥仍受將軍與將死規則保護。新規則很簡單：你吃掉的棋子會變成你的棋子，進入手牌，並可以透過打入回到棋盤。',
  'That reserve turns captures into future initiative. A quiet exchange can become a cannon drop, a soldier screen, or a new chariot lane several moves later.':
    '持子會把吃子變成之後的主動權。一次安靜的交換，幾步之後可能變成一次炮的打入、一個兵的炮架，或一條新的車路。',
  'Board and pieces': '棋盤與棋子',
  'The starting position, board, and movement are Mini Xiangqi. There are no advisors or elephants, no river, and each general remains inside its 3 by 3 palace.':
    '初始局面、棋盤與走法都沿用迷你象棋。沒有士象、沒有河界，每一方的將帥仍留在自己的 3×3 九宮內。',
  'This is open information. Both players see the whole board and both reserves. Unlike Dark Mini Xiangqi, there is no fog and no hidden move record.':
    '這是資訊公開的遊戲。雙方都能看到整個棋盤和雙方持子。不同於迷霧迷你象棋，這裡沒有迷霧，也沒有隱藏的走子紀錄。',
  'Captures and reserves': '吃子與持子',
  'When you capture a non-general piece, it leaves the board, changes to your color, and enters your reserve. Generals are never captured and never enter a reserve: attacks on the general are checks, and a player in check must answer the threat.':
    '當你吃掉一枚非將帥棋子時，它離開棋盤，改為你的顏色，並進入你的持子。將帥永遠不會被吃進持子：攻擊將帥是將軍，被將軍的一方必須應對威脅。',
  'Instead of moving a board piece, you may drop one piece from your reserve onto an empty point outside the enemy palace. A dropped piece is live immediately: it can give check on the drop turn and moves normally on later turns.':
    '你可以不移動棋盤上的棋子，而是從持子中選一枚，打入到對方九宮以外的空交叉點。打入的棋子立即生效：它可以在打入當手將軍，之後也按正常走法移動。',
  'Drop restrictions': '打入限制',
  "Drops must land on empty points, and they cannot land inside the opponent's 3 by 3 palace. The current Mistboard rules allow chariots, horses, cannons, and soldiers in reserve. Generals never enter reserve.":
    '打入必須落在空交叉點，且不能落入對方的 3×3 九宮。目前 Mistboard 規則允許車、馬、炮、兵進入持子。將帥永不進入持子。',
  'A dropped soldier follows Mini Xiangqi soldier movement after it lands: one point forward or sideways, never backward. Drops may give check immediately, and a drop is illegal if it leaves your own general in check.':
    '打入的兵落子後按迷你象棋的兵法移動：向前或橫向走一個交叉點，永不後退。打入可以立即將軍；如果一次打入會讓自己的將帥仍處於被將軍狀態，則該打入不合法。',
  'Check and endings': '將軍與終局',
  'Win by checkmate. As in Mini Xiangqi, a player with no legal move loses rather than drawing by stalemate. Games can also end by repetition, the no-capture rule, timeout, resignation, or abandonment.':
    '以將死獲勝。與迷你象棋一樣，沒有合法著法的一方判負，而不是因困斃作和。對局也可能因重複局面、無吃子規則、超時、認輸或棄局而結束。',
  'Step through this longer engine-lab game. It uses the current no-enemy-palace drop rule, shows both sides using reserves to defend and counterattack, and ends only after Black converts a late chariot attack.':
    '逐步重演這盤較長的引擎實驗對局。它採用目前不得打入對方九宮的規則，展示雙方如何用持子防守和反擊，最終由黑方在後期車攻中轉化勝勢。',
  'FSF Red': 'FSF 紅方',
  'FSF Black': 'FSF 黑方',
  'Fairy-Stockfish lab, no-enemy-palace drops': 'Fairy-Stockfish 實驗局，不得打入對方九宮',
  "Black checkmates with 57...g1-f1. The final chariot capture beats Red's last defensive drop on f1.":
    '黑方以 57...g1-f1 將死。最後的車吃子擊破了紅方在 f1 的最後一次防守打入。',
  'Drop Mini Xiangqi is open for alpha play on Mistboard. You can play the Fairy Stockfish bot, create an invite for a friend, or find an open game from the homepage play panel by choosing Drop Mini Xiangqi in the Variant row.':
    '投放迷你象棋已在 Mistboard 開放 Alpha 對弈。你可以在首頁對弈面板的「Variant」一行選擇投放迷你象棋，對戰 Fairy Stockfish 機器人、建立好友邀請，或尋找一局公開對局。',
  'Play the bot': '對戰機器人',
  'Find opponent': '尋找對手',
  // -- Mini Xiangqi (rules) --
  'Mini Xiangqi rules, the 7×7 primer behind Dark Mini Xiangqi: no advisors or elephants, no river, sideways soldiers, and checkmate to win.':
    '迷你象棋規則，迷霧迷你象棋的 7×7 入門基礎：沒有士象、沒有河界、兵可橫走，以將死取勝。',
  'Mini Xiangqi was invented in 1973 by Shigenobu Kusumoto of Osaka, Japan. It is a simplified, reduced version of [xiangqi](/rules/xiangqi): a smaller board, fewer pieces, and no river.':
    '迷你象棋由日本大阪的楠本茂信於 1973 年發明。它是[象棋](/rules/xiangqi)的簡化精簡版本：棋盤更小、棋子更少，且沒有河界。',
  'This page describes the open-information base game.': '本頁介紹的是資訊公開的底層遊戲。',
  'Board and setup': '棋盤與佈局',
  'Mini Xiangqi is xiangqi compressed onto a 7 by 7 board with a smaller army. The advisors and elephants are dropped and there is no river, but each general still keeps a 3 by 3 palace.':
    '迷你象棋是把象棋壓縮到 7×7 棋盤、並削減子力的版本。去掉了士和象，也沒有河界，但每一方的將帥仍保有一個 3×3 的九宮。',
  'Piece movement': '棋子走法',
  'Every piece except the soldier moves exactly as it does in [xiangqi](/rules/xiangqi).':
    '除兵（卒）以外，每種棋子的走法都與[象棋](/rules/xiangqi)完全相同。',
  '**Soldier:** a soldier moves and captures one point forward or sideways, never backward. With no river to cross, it has that sideways freedom from its very first move, unlike a soldier on the full xiangqi board.':
    '**兵（卒）：**兵向前或橫向走一個交叉點並以此吃子，永不後退。由於沒有河界可過，牠從第一步起就擁有橫走的自由，這與完整象棋棋盤上的兵不同。',
  'Facing generals are illegal here too. The two generals may never sit on the same open file with nothing between them, so a move that would expose that line is not allowed.':
    '將帥對臉在這裡同樣不合法。雙方的將帥不能處在中間無子的同一條縱線上，因此任何會暴露這條直線的走法都不被允許。',
  'Winning and draws': '勝負與和棋',
  'Checkmate wins. As in xiangqi, a player who has no legal move loses rather than drawing by stalemate, and perpetual check or perpetual chase is not a free draw: a player who repeats an endless attack loses instead.':
    '將死即獲勝。與象棋一樣，沒有合法走法的一方判負，而非因困斃而和棋；長將或長捉也不能用來免費求和：不斷重複同樣進攻的一方反而判負。',
  'A game is drawn when neither side has enough material to checkmate, when a long run of moves passes with no capture (xiangqi caps this much like chess’s fifty-move rule), or by a repetition that breaks none of the perpetual rules. These outcomes follow from the position, not from one player choosing to stop.':
    '當任何一方都沒有足夠的子力將死對方、長時間無吃子（象棋對此設有上限，類似國際象棋的五十回合規則），或出現不違反上述長打規則的重複局面時，對局判和。這些結果都由局面決定，而非某一方主動選擇停手。',
  'A complete game': '一盤完整對局',
  'Mini Xiangqi has no canon of famous human games, so to watch the full army work together, step through a game in which Fairy-Stockfish, a strong open-source engine, plays both sides with full information. Notice how fast the chariots and cannons open lines: on a tight 7 by 7 board with no river, the generals come under fire far sooner than in full xiangqi.':
    '迷你象棋沒有著名的人類對局傳統，因此若想看全部子力協同作戰，可以逐步重演一盤由強大的開源引擎 Fairy-Stockfish 在完全資訊下執雙方對弈的棋局。注意車和炮開線有多快：在緊湊、無河界的 7×7 棋盤上，將帥遭受火力的時間遠比完整象棋來得早。',
  'Ready to try the Mistboard version? Play Misty DMX in Dark Mini Xiangqi, the Fog of War variant built on this same 7 by 7 board.':
    '準備試試 Mistboard 版本？在迷霧迷你象棋中對戰 Misty DMX，這是建立在同一張 7×7 棋盤上的戰爭迷霧變體。',

  // -- Dark Mini Xiangqi (rules) --
  'Mini Xiangqi under Fog of War: each side sees only the points its pieces reach on the 7×7 board, and the general falls by capture.':
    '戰爭迷霧下的迷你象棋：在 7×7 棋盤上，每一方只能看到己方棋子可及的交叉點，將帥由被吃而落敗。',
  'Fog Xiangqi readers who want the smaller experimental ruleset Mistboard is testing first.':
    '想了解 Mistboard 正在先行測試的小型實驗規則的迷霧象棋讀者。',
  '[Mini Xiangqi](/rules/mini-xiangqi) played with Fog of War: each player sees only their own pieces and the enemy pieces their army can reach. The board is 7 by 7, and the game ends by capturing the opposing general. If you know Mini Xiangqi, the sections below explain only what fog changes.':
    '在戰爭迷霧下進行的[迷你象棋](/rules/mini-xiangqi)：每位玩家只能看到己方棋子，以及己方子力可及的敵方棋子。棋盤為 7×7，以吃掉對方將帥結束對局。如果你已經會下迷你象棋，下面各節只講解迷霧改變了什麼。',
  'Board and fog': '棋盤與迷霧',
  'The board and army are the same as Mini Xiangqi. Fog of War then hides the board: you see your own pieces and every point they can reach, and everything else is fog.':
    '棋盤和子力與迷你象棋相同。戰爭迷霧隨後遮住棋盤：你能看到己方棋子以及牠們可及的每個交叉點，其餘一切都是迷霧。',
  'The opening position from three angles. Red and Black each see only their own side clearly, while the server holds the true board in the middle. Vision is recomputed after every move, so opening a line or losing a piece immediately changes what each player knows.':
    '從三個視角看開局局面。紅方與黑方各自只能清楚看到自己的一側，而中間由伺服器掌握真實棋盤。每走一步後視野都會重新計算，因此打開一條線路或失去一枚棋子都會立刻改變各方所掌握的資訊。',
  'You never see enemy pieces outside your vision, whether a fogged point is empty, or the identity of a shrouded blocker.':
    '你永遠看不到視野之外的敵方棋子，也看不到被迷霧遮住的交叉點是否為空，更看不到被遮蔽的阻擋子是什麼。',
  'Capture the general to win. There is no checkmate and no check warning, so you can move into danger, leave your general exposed, or let the generals face each other across an open file.':
    '吃掉將帥即獲勝。沒有將死，也沒有將軍提示，因此你可以走入危險、讓自己的將帥暴露，甚至讓雙方將帥在一條無遮擋的縱線上對臉。',
  "There is no stalemate draw: if the side to move has no legal move, it loses. With no check to freeze you, this almost never happens. Draws are judged from the true position, not either player's view: the game draws on threefold repetition, and also after 60 plies (30 moves by each side) without a capture.":
    '這裡沒有困斃判和：若輪到走子的一方沒有合法著法，則判負。由於沒有將軍來限制你，這種情況幾乎不會發生。和棋依據真實局面判斷，而非任何一方各自的視野：對局會在三次重複局面時判和，也會在連續 60 個半回合（雙方各 30 回合）無吃子時判和。',
  'Two pieces interact with fog in ways worth seeing up close.':
    '有兩種棋子與迷霧的互動值得近距離一看。',
  'A cannon captures by jumping exactly one screen and landing on the first enemy piece beyond it. Under fog the rule is **screen shrouded, target revealed**: the screen shows as occupied but unidentified, the empty gap behind it stays fogged, and the capturable target is revealed as the enemy piece.':
    '炮吃子時正好越過一個炮架，落在其後的第一枚敵方棋子上。在迷霧下，規則是**炮架被遮、目標可見**：炮架顯示為被佔據但身份不明，其後的空隙仍處於迷霧中，而可吃的目標會直接顯示為敵方棋子。',
  Horses: '馬',
  'A horse moves one point orthogonally and then one diagonally outward, and cannot move if the leg point in between is occupied. If a hidden piece blocks the leg, the leg point shows as occupied but unidentified, and the destinations behind it drop out of your view.':
    '馬先沿橫豎方向走一個交叉點，再斜向外走一個交叉點；如果中間的馬腿位置被佔據，牠就不能走。如果有一枚隱藏的棋子蹩住馬腿，馬腿位置會顯示為被佔據但身份不明，其後的落點則從你的視野中消失。',
  'A complete game under fog': '一盤迷霧下的完整對局',
  'To see the whole army work under Fog of War, step through a game where Mistboard’s engine, Misty DMX, plays both sides. Each ply is shown three ways: what Red can see, the server’s true board, and what Black can see.':
    '想看全部子力在戰爭迷霧下協同作戰，可以逐步重演一盤由 Mistboard 引擎 Misty DMX 執雙方對弈的棋局。每一手都以三種方式呈現：紅方所見、伺服器上的真實棋盤，以及黑方所見。',
  'Dark Mini Xiangqi is open for alpha play. You can play Misty DMX, create an invite, or find an opponent from the homepage play panel by choosing Dark Mini Xiangqi in the Variant row.':
    '迷霧迷你象棋現已開放 Alpha 對弈。你可以在首頁對弈面板的「Variant」一行選擇迷霧迷你象棋，然後對戰 Misty DMX、建立邀請，或尋找對手。',
  'Play Misty': '對戰 Misty',
  'Play Misty DMX': '對戰 Misty DMX',
  'Create invite': '建立邀請',

  // -- Shogi4 (4x4 Shogi) --
  'Shogi4 (4×4 Shogi) Rules': 'Shogi4（4×4 將棋）規則',
  "The complete rules of Shogi4 (4x4 Shogi), Oca Studios' public-domain animal drop-shogi on a 4×4 board: how the Carp, Tapir, Raccoon-dog, Fox, and royal move, plus the friendly-jump, evolution, drops, and king-capture wins.":
    'Shogi4（4×4 將棋）的完整規則，由 Oca Studios 發布並進入公有領域的 4×4 棋盤動物打入將棋：鯉魚、貘、狸、狐與王的走法，以及跳越友子、進化、打入與吃王取勝。',
  "Shogi4, also called 4x4 Shogi, is a drop-shogi played with animal tiles on a 4×4 board. It plays much like ordinary shogi shrunk to sixteen squares: pieces step in marked directions, captured pieces switch sides and drop back into play, and you win by taking the king. The one rule shogi players won't recognize is that a piece may hop over a friendly piece, added so your own pieces don't jam each other on a board this small.":
    'Shogi4（又稱 4×4 將棋）是一種在 4×4 棋盤上用動物棋子進行的打入將棋。它玩起來很像縮小到十六格的普通將棋：棋子按棋面標示的方向走動，被吃的棋子改換陣營並可重新打入棋盤，吃掉王即獲勝。唯一一條將棋玩家會感到陌生的規則是：棋子可以跳越一枚己方棋子，這是為了避免在這麼小的棋盤上自己的棋子互相堵塞而加入的。',
  'Oca Studios released Shogi4 into the public domain in its "Four" series, free as a print-and-play set and as an app. Each player has five pieces: a Carp, a Tapir, a Raccoon-dog, a Fox, and a royal (a Crane for the first player, a Pheasant for the second).':
    'Oca Studios 在其「Four」系列中將 Shogi4 發布到公有領域，作為可列印自玩的套裝和應用免費提供。每位玩家有五枚棋子：鯉魚、貘、狸、狐，以及一枚王（先手為鶴，後手為雉）。',
  'The board and setup': '棋盤與擺子',
  "The board is 4×4, with a farm to either side that holds captured pieces. A tile's owner is shown by its facing: the first player's tiles point up the board, the second player's point down.":
    '棋盤為 4×4，兩側各有一個農場用來存放被吃的棋子。棋子的歸屬由朝向表示：先手的棋子朝向棋盤上方，後手的朝向下方。',
  'Every piece moves one square per turn, in the directions printed on its tile. On reaching the far row, each non-royal piece evolves, flipping to its evolved side. The pairs below show the base piece, then its evolved form, with a dot on every square each can reach (forward is up).':
    '每枚棋子每回合走一格，方向按棋面所印。到達最遠一行時，每枚非王棋子都會進化，翻到其進化面。下面每一對依次展示基礎棋子及其進化形態，並在各自能到達的每個格子上標一個點（上方為前進方向）。',
  '**Carp → Koi.** The Carp steps one square straight forward, a pawn. It evolves into a Koi, which moves as a silver from shogi.':
    '**鯉魚 → Koi。**鯉魚向正前方走一格，相當於將棋中的步兵。它進化為 Koi，走法與將棋中的銀將相同。',
  '**Tapir → Baku.** The Tapir steps forward or to a forward diagonal. It evolves into a Baku, a silver.':
    '**貘 → Baku。**貘向前方或前斜方走一格。它進化為 Baku，走法同銀將。',
  '**Raccoon-dog → Tanuki.** The Raccoon-dog steps one diagonal. It evolves into a Tanuki, a silver.':
    '**狸 → Tanuki。**狸向斜方走一格。它進化為 Tanuki，走法同銀將。',
  '**Fox → Kitsune.** The Fox steps one orthogonal. It evolves into a Kitsune, which moves as a gold from shogi.':
    '**狐 → Kitsune。**狐向橫豎方向走一格。它進化為 Kitsune，走法與將棋中的金將相同。',
  '**Crane / Pheasant.** The royal steps one square in any of the eight directions, a king. The two royals differ only in theme. It never evolves, and capturing it ends the game.':
    '**鶴 / 雉。**王可向八個方向中的任意一個走一格，相當於國際象棋的王。兩種王僅在主題上不同。它永不進化，被吃掉即終局。',
  'Jumping over a friendly piece': '跳越友方棋子',
  'A piece can leap over a friendly piece. If an ally sits on the next square in a direction the piece moves, the piece jumps it and lands on the square just beyond, empty or capturing an enemy there. It works in any direction the piece itself moves: straight for a Carp, on the diagonal for a Raccoon-dog, any of the eight for the royal.':
    '棋子可以跳越一枚己方棋子。如果在該棋子可走的某個方向上、緊鄰的格子裡有一枚友方棋子，它便可越過這枚棋子，落到再往前的那一格上：該格可以為空，也可以吃掉那裡的敵方棋子。這適用於棋子本身能走的任意方向：鯉魚沿直線，狸沿斜線，王則可沿八個方向中的任意一個。',
  'Capturing, farms, and drops': '吃子、農場與打入',
  'Move onto an enemy to capture it; it switches sides into your farm, reverting to its base form if it was evolved.':
    '走到敵方棋子所在的格子即可吃掉它；它會改換陣營進入你的農場，若此前已進化，則恢復為基礎形態。',
  "Instead of moving, drop a piece from your farm onto any empty square, except those on the far row (the opponent's back rank).":
    '你也可以不走子，而是從農場中取出一枚棋子打入任意空格，但最遠一行（對方底線）除外。',
  Winning: '取勝',
  'Capturing the royal is the only way to win. No check, no checkmate: the game ends the moment a royal is taken.':
    '吃掉王是唯一的取勝方式。沒有將軍，也沒有將死：王一旦被吃，對局立即結束。',
  'There is no stalemate. Because moving the king into capture range is legal, a lack of safe moves never ends the game: you simply make the unsafe move and play on until a king is taken. A side with no legal move at all, boxed in with nothing to drop, loses rather than draws.':
    '不存在逼和。由於把王走入可被吃的範圍是合法的，缺少安全著法絕不會結束對局：你只管走那步不安全的棋，繼續對弈，直到有一方的王被吃。若一方完全沒有合法著法（被困住且無子可打入），則判負，而非和棋。',
  'Repetition and draws': '重複與和棋',
  "The original rules address neither repetition nor a move-count limit. Our convention fills the gap: a position reached three times is an automatic draw. That rule is ours, not Oca's, and changes none of the rules above.":
    '原始規則既未規定重複局面，也未規定步數上限。我們的約定補上了這一空缺：同一局面出現三次即自動判和。這條規則是我們定的，並非 Oca 的，且不改變上述任何規則。',
  "Fairy-Stockfish self-play on the friendly-jump engine (this site's patched build). White wins in 73 plies; the mating move is itself a friendly jump.":
    'Fairy-Stockfish 在支援越友規則的引擎（本站修補版）上進行的自我對弈。白方在 73 個半回合內取勝；制勝的那一步本身就是一次跳越友子。',
  'Starting position': '初始局面',
  'Source and license': '來源與授權',
  'Shogi4 and its tile art are by Oca Studios, which released its whole "Four" series into the public domain. The [BoardGameGeek entry](https://boardgamegeek.com/boardgame/146291/shogi4) is a catalog reference.':
    'Shogi4 及其棋子美術由 Oca Studios 創作，該工作室已將其整個「Four」系列發布到公有領域。[BoardGameGeek 條目](https://boardgamegeek.com/boardgame/146291/shogi4)可作為目錄參考。',
  "We recovered the exact rules from Oca's official Shogi4 app, decompiling it to read the move logic directly: the friendly-jump geometry, the single drop ban, and king-capture as the sole win all come from there. Oca's public rules page and starting-position graphic (now reachable only through the [Internet Archive](https://web.archive.org/web/20240926113424/https://www.ocastudios.com/four/shogi/), since the live site is down) corroborate the board and the basic moves.":
    '我們透過反編譯 Oca 官方的 Shogi4 應用、直接讀取其走子邏輯，還原出了確切的規則：跳越友子的幾何規則、唯一的打入禁區，以及以吃王作為唯一取勝方式，都來自於此。Oca 的公開規則頁面和初始局面圖（由於其網站已關閉，現在只能透過 [Internet Archive](https://web.archive.org/web/20240926113424/https://www.ocastudios.com/four/shogi/) 存取）也印證了棋盤和基本走法。',
  'Playing Shogi4': '開始遊玩 Shogi4',
  "Shogi4 isn't playable on the site yet; for now this page is the rules reference. Browse the rest of the rules, or compare it with the chess and xiangqi primers.":
    'Shogi4 目前還不能在本站對弈；現階段本頁作為規則參考。你可以瀏覽其餘規則，或將它與國際象棋和象棋入門相互對照。',

  // -- Dark Draft960 --
  'Dark Draft960': '迷霧選陣960',
  'The draft': '選陣',
  "The server deals each player three random Chess960 back ranks. You pick one. Your opponent independently picks one of theirs. The drafts are sealed. Neither side sees the other's offers or choice.":
    '伺服器為每位玩家發出三種隨機的國際象棋960 底線陣型。你從中選一種，對手也各自從自己的三種中選一種。雙方的選陣都是密封的：任何一方都看不到對方的候選陣型或最終選擇。',
  "Say both players picked offer A. Each side sees only its own back rank; the opponent's stays in fog. Only the server holds both.":
    '假設雙方都選了候選 A。每一方只能看到自己的底線陣型，對方的則隱藏在迷霧中。只有伺服器同時掌握雙方的陣型。',
  '960 × 960 = **921,600** possible starts. Standard chess is one of them.':
    '960 × 960 = **921,600** 種可能的開局。標準國際象棋只是其中之一。',
  'Dark Draft960 is a future variant, not playable yet. There is no set release date.':
    '迷霧選陣960 是一個未來的變體，目前尚不可對弈，也沒有確定的發布日期。',

  // -- Xiangqi primer (rules) --
  'Xiangqi Rules': '象棋規則',
  'Red and Black alternate moves, with Red first. Each side begins with 16 pieces: one general, two advisors, two elephants, two horses, two chariots, two cannons, and five soldiers. The goal is to checkmate the opposing general.':
    '紅黑雙方輪流走子，紅方先行。每一方開局有 16 枚棋子：一個將（帥）、兩個士（仕）、兩個象（相）、兩個馬、兩個車、兩個炮（砲）和五個兵（卒）。目標是將死對方的將帥。',
  'The board has 9 files and 10 ranks. In the traditional presentation, pieces sit on the intersections of the lines rather than inside squares.':
    '棋盤有 9 條縱線和 10 條橫線。在傳統的呈現方式中，棋子落在線的交叉點上，而不是格子內。',
  "The **palace** is the 3 by 3 box on each player's back side. Generals and advisors must stay inside their own palace. The **river** divides the board in half. Elephants cannot cross it, and soldiers gain sideways movement after crossing it.":
    '**九宮**是每一方底線一側的 3×3 區域。將帥與士仕必須留在己方九宮之內。**楚河漢界**將棋盤分為兩半。象（相）不能過河，而兵（卒）過河之後可以橫向走子。',
  "A piece captures by landing on an enemy-occupied point, and no piece may move through an occupied point. The cannon's capturing jump is the only exception. The pieces are listed below in the traditional order.":
    '棋子透過落在敵方佔據的交叉點上來吃子，而任何棋子都不能穿過被佔據的交叉點。炮的吃子跳躍是唯一的例外。下面按傳統順序列出各棋子。',
  '**General:** moves one point horizontally or vertically and can never leave its own palace. The two generals may never face each other along an open file with nothing between them: a move that would expose that line is illegal. In effect, a general guards the file in front of it like a chariot.':
    '**將（帥）：**橫向或縱向走一個交叉點，永遠不能離開己方九宮。雙方的將帥不能在中間無子的同一條縱線上對臉：任何讓這條直線暴露出來的走法都是不合法的。實際上，將帥就像一隻車那樣守住它正前方的縱線。',
  '**Advisor:** moves one point diagonally and, like the general, stays inside the palace.':
    '**士（仕）：**斜向走一個交叉點，與將帥一樣必須留在九宮之內。',
  "**Elephant:** moves exactly two points diagonally and cannot cross the river, so it never leaves its own half. It does not jump: a piece on the midpoint of the diagonal, the elephant's eye, blocks the move.":
    '**象（相）：**沿斜線正好走兩個交叉點（俗稱「象走田」），且不能過河，因此牠永遠不會離開己方半邊。牠不能跳越：如果斜線中點（象眼）上有棋子，這步走法就被擋住。',
  "**Horse:** moves one point orthogonally and then one point diagonally outward, like a chess knight, but it does not jump. If the orthogonal point it steps through, the horse's leg, is occupied, the horse cannot move in that direction.":
    '**馬：**先沿橫豎方向走一個交叉點，再斜向外走一個交叉點，走「日」字，類似西洋棋的騎士，但牠不能跳越。如果牠經過的那個橫豎交叉點（馬腿）被佔據（蹩馬腿），馬便不能朝那個方向走。',
  '**Chariot:** moves any distance horizontally or vertically and cannot jump, exactly like a rook. It is the strongest piece on the board.':
    '**車：**橫向或縱向走任意距離，不能越子，與西洋棋的城堡完全相同。牠是棋盤上最強的棋子。',
  '**Cannon:** moves like a chariot when it is not capturing. To capture, it jumps over exactly one piece, friend or foe, called the screen, and lands on an enemy piece beyond it.':
    '**炮（砲）：**不吃子時走法與車相同。吃子時，牠正好越過一枚棋子（不分敵我），這枚棋子稱為炮架，並落在其後的一枚敵方棋子上。',
  '**Soldier:** moves one point straight forward and never backward. After crossing the river it may also move one point sideways. It never promotes.':
    '**兵（卒）：**向正前方走一個交叉點，永不後退。過河之後，牠還可以橫向走一個交叉點。牠不會升變。',
  'Check, checkmate, and endings': '將軍、將死與終局',
  'A general is in check when an enemy piece attacks it, and the player in check must answer the threat. If there is no legal answer, it is checkmate and the checked player loses.':
    '當敵方棋子攻擊將帥時，即為將軍，被將軍的一方必須應對這一威脅。如果沒有合法的應法，便是將死，被將軍的一方告負。',
  'A player who has no legal move at all also loses. This is the opposite of Western chess, where having no legal move is a stalemate draw.':
    '完全沒有合法走法的一方同樣告負。這與西洋棋相反，在那裡沒有合法走法算作逼和（和棋）。',
  'Xiangqi also restricts endless forcing cycles. Perpetual check and perpetual chase are not allowed: a player who repeats an endless attack loses rather than forcing a draw. Tournament rules spell out detailed repetition procedures for exactly when a cycle counts as perpetual.':
    '象棋還限制無止境的逼著循環。長將與長捉是不允許的：一方若不斷重複同樣的進攻，將被判負，而不能藉此逼和。比賽規則對何時算作「長」給出了詳細的重複判定程序。',
  'A game is drawn when neither side has enough material to checkmate, by a repetition that breaks none of those rules, or when a long run of moves passes with no capture. The no-capture limit depends on the rule set: the World Xiangqi Federation rules use a fifty-move rule, while the Chinese (CXA) rules require at least sixty plies before a draw can be claimed.':
    '當任何一方都沒有足夠的子力將死對方、出現不違反上述規則的重複局面，或長時間無吃子時，對局判和。無吃子的上限取決於所採用的規則：世界象棋聯合會的規則採用五十回合規則，而中國象棋協會（CXA）的規則則要求至少 60 個半回合之後才能提出和棋。',
  "To see the pieces work together, step through the most famous trap in xiangqi. It comes from Juzhongmi (橘中秘), a manual printed in 1632. Red gives up a horse; when Black grabs it, Red's chariots and cannons pour through the gap and checkmate on the thirteenth move.":
    '想看棋子如何協同作戰，可以逐步重演象棋中最著名的陷阱：棄馬十三著。它出自 1632 年刊印的棋譜《橘中祕》。紅方故意送出一匹馬，黑方一旦貪吃，紅方的車炮便乘虛而入，在第十三著將死對手。',
  'Mini Xiangqi': '迷你象棋',
  'Dark Mini Xiangqi': '迷霧迷你象棋',

  // -- Chess primer --
  'Chess Rules': '國際象棋規則',
  'Chess is a two-player strategy game played for centuries. It descends from the Indian game chaturanga of around the 6th century and reached Europe through Persia and the Islamic world; its modern form, with the long-range queen and bishop, took shape in Europe in the late 1400s.':
    '國際象棋是一種已有數百年歷史的雙人策略遊戲。它源自約公元 6 世紀的印度遊戲恰圖蘭加，經由波斯和伊斯蘭世界傳入歐洲；其現代形式（擁有遠程的后和象）於 15 世紀末在歐洲成形。',
  'Board setup': '棋盤佈置',
  'Chess is played on an 8 by 8 board of alternating light and dark squares.':
    '國際象棋在 8×8 的棋盤上進行，棋盤由深淺相間的方格組成。',
  'White moves first, then players alternate. Each side fills the two rows nearest it, with the queen starting on her own color. On your turn, move one piece to a legal square: you cannot land on your own piece, and landing on an enemy piece captures it, removing it from the board.':
    '白方先走，之後雙方輪流走子。每一方在最靠近自己的兩排擺滿棋子，后擺在與自身同色的格子上。輪到你時，將一枚棋子走到一個合法的格子：你不能落在自己的棋子上，而落在敵方棋子上即可將其吃掉，並把它從棋盤上移走。',
  'Each piece moves in its own way. In every diagram below, the highlighted squares are the legal moves and captures for the marked white piece.':
    '每種棋子都有各自的走法。在下面每一幅圖中，高亮的格子表示被標記的白方棋子的合法走法與吃子。',
  '**King:** moves one square in any direction. In regular chess, a king may not move onto a square attacked by the opponent.':
    '**王：**可向任意方向走一格。在普通國際象棋中，王不能走到被對方攻擊的格子上。',
  '**Queen:** moves any number of squares horizontally, vertically, or diagonally. Other pieces block her path.':
    '**后：**可沿橫線、豎線或斜線走任意格數。其他棋子會擋住它的去路。',
  '**Rook:** moves any number of squares horizontally or vertically. It cannot jump, so the first occupied square in a line stops it.':
    '**車：**可沿橫線或豎線走任意格數。它不能跳子，因此一條線上第一個被佔據的格子就會擋住它。',
  '**Bishop:** moves any number of squares diagonally. Because diagonals stay on one color, each bishop stays on light squares or dark squares for the whole game.':
    '**象：**可沿斜線走任意格數。由於斜線始終保持同一種顏色，每個象在整盤棋中都只走淺色格或只走深色格。',
  '**Knight:** moves in an L shape: two squares one way and one square sideways. The knight is the only piece that jumps over other pieces.':
    '**馬：**走「L」形：朝一個方向走兩格，再橫向走一格。馬是唯一能跳過其他棋子的棋子。',
  '**Pawn:** the pawn moves and captures differently from every other piece. It moves straight forward into an empty square, one square at a time, or two squares from its starting position. It can never move backward or sideways, and a piece directly in front of it blocks it completely. It captures only diagonally forward, one square (the green rings below), never straight ahead. Two further pawn rules, promotion and en passant, appear under Special moves below.':
    '**兵：**兵的走法和吃法與其他所有棋子都不同。它向正前方走入一個空格，每次一格，或在起始位置時一次走兩格。它永遠不能後退或橫走，正前方若緊挨著一枚棋子便會被完全擋住。它只能向斜前方吃子，一格（見下圖的綠色圓環），絕不向正前方吃子。另有兩條與兵有關的規則：升變與吃過路兵，見下文的「特殊走法」。',
  'Check and checkmate': '將軍與將死',
  'In regular chess, the king is protected by check and checkmate. A king is **in check** when an enemy piece attacks it. The checked player must make a legal move that leaves the king safe.':
    '在普通國際象棋中，王受到將軍與將死規則的保護。當敵方棋子攻擊王時，王即處於**被將軍**的狀態。被將軍的一方必須走一步合法著法，使王重新安全。',
  'Most checks are answered in one of three ways: move the king, block the line of attack, or capture the attacking piece. If none of those legal answers works, the game ends by **checkmate**.':
    '應對將軍通常有三種方法：移動王、擋住攻擊線路，或吃掉發動攻擊的棋子。如果這些合法應法都行不通，對局便以**將死**告終。',
  'In regular chess the king is never actually captured: the game ends at checkmate, with the king still on the board.':
    '在普通國際象棋中，王從不會真的被吃掉：對局在將死時結束，此時王仍留在棋盤上。',
  'Special moves': '特殊走法',
  'Castling is a one-move king-and-rook move. The king moves two squares toward a rook, and that rook moves to the square the king crossed. In regular chess, the pieces must be unmoved, the path must be empty, and the king cannot castle out of, through, or into check.':
    '王車易位是一步同時移動王和車的走法。王朝著一隻車的方向走兩格，那隻車則移動到王越過的格子上。在普通國際象棋中，參與易位的王與車此前都不能動過，中間的格子必須為空，且王不能在被將軍時易位、不能穿過被攻擊的格子易位，也不能易位到被攻擊的格子上。',
  'Queenside castling works the same way on the other side: the king moves two squares toward the rook, and the rook lands next to it.':
    '后翼易位在另一側以同樣方式進行：王朝著車走兩格，車則落到王的旁邊。',
  Promotion: '升變',
  'When a pawn reaches the farthest rank, it promotes into a queen, rook, bishop, or knight.':
    '當兵到達最遠的一條橫線時，它會升變為后、車、象或馬。',
  'En passant is the unusual pawn capture. If an enemy pawn moves two squares from its starting rank and lands beside your pawn, your pawn may capture it diagonally as if it had moved only one square. This chance exists only on the very next move.':
    '吃過路兵是一種特殊的兵吃子。如果敵方的兵從起始橫線一次走兩格，並停在你的兵旁邊，你的兵可以斜向吃掉它，就好像它只走了一格一樣。這個機會只在緊接著的下一步存在。',
  'Not every game is won. Some end in a draw, where neither side wins.':
    '並非每盤棋都分出勝負。有些以和棋告終，即雙方都不獲勝。',
  Stalemate: '逼和',
  'Stalemate is when the player to move has no legal move but their king is not in check. It is a draw, not a win, even if one side is far ahead. Below it is Black to move: the king on a8 is not in check, yet every square it could step to is covered by the white queen, and Black has nothing else to move. The game is drawn.':
    '逼和是指輪到走子的一方沒有任何合法著法，但其王並未被將軍。它判作和棋，而非取勝，即使一方大佔優勢也是如此。下圖輪到黑方走子：a8 的王沒有被將軍，但它能走到的每一個格子都被白后控制，而黑方又無其他棋子可走。對局判和。',
  'Other draws': '其他和棋',
  '**Threefold repetition:** the same position, with the same player to move, occurs three times. Either player can then claim a draw.':
    '**三次重複局面：**同一局面在同一方走子的情況下出現三次。此時任一方都可以提出和棋。',
  '**Fifty-move rule:** fifty moves by each side pass with no capture and no pawn move. The clock resets whenever a pawn moves or a piece is taken.':
    '**五十回合規則：**雙方各走五十回合而無任何吃子、也無任何兵的走動。每當有兵走動或有棋子被吃，計數便重新歸零。',
  '**Insufficient material:** neither side has enough force to deliver checkmate, such as king versus king, or king and a lone bishop or knight against a bare king.':
    '**子力不足：**任何一方都沒有足夠的子力完成將死，例如單王對單王，或一王加單象或單馬對單王。',
  '**Agreement:** both players simply agree to a draw.': '**協議和棋：**雙方直接同意作和。',
  'A famous game': '一盤名局',
  'To see the pieces work together in a real game, step through Game 11 of the 2014 World Championship in Sochi. Playing White, Magnus Carlsen grinds down Viswanathan Anand in a Berlin endgame to clinch the title; Anand resigns on move 45.':
    '想看棋子在實戰中如何協同，可以逐步重演 2014 年索契世界冠軍賽的第 11 局。執白的馬格努斯·卡爾森在柏林防禦殘局中逐步磨垮維斯瓦納坦·阿南德，鎖定冠軍；阿南德在第 45 回合認輸。',
  'Where to next': '接下來去哪',
  'All rules': '全部規則',
  'Dark Chess Concepts': '迷霧國際象棋概念',
  'The starting position': '開局局面',
  'What you see': '你能看到什麼',
  'Win condition: king capture': '勝負條件：吃王',
  Draws: '和棋',
  'Edge cases': '特殊情形',
  'Reading the fog': '讀懂迷霧',
  'A sample game': '一盤示例對局',
  Castling: '王車易位',
  'Pawn vision': '兵的視野',
  'En passant': '吃過路兵',
  'Pawn moves': '兵的走動',
  Captures: '吃子',
  'Dark chess is not only about the pieces you see. Fogged squares, missing destinations, and vanished pieces are information too. This concepts series starts with the most useful habit: reading what the fog is telling you.':
    '迷霧國際象棋不只關乎你看得見的棋子。被迷霧遮住的格子、消失的目的地和不見的棋子本身也是資訊。這個概念系列從最有用的習慣開始：讀懂迷霧正在告訴你的事。',
  'Each side sees the squares its own pieces could legally move to (under [regular chess rules](https://en.wikipedia.org/wiki/Rules_of_chess)), plus the squares they stand on. Everything else is fog.':
    '每一方能看到己方棋子（按[普通國際象棋規則](https://zh.wikipedia.org/zh-hant/国际象棋规则)）可以合法走到的格子，以及棋子當前所在的格子。其餘一切都籠罩在迷霧之中。',
  "Here's the same rule, piece by piece.": '同一條規則，逐子來看。',
  'Vision moves with pieces. When a piece moves, the squares it used to cover go dark (unless another piece still sees them), and the squares it now reaches light up.':
    '視野隨棋子移動。當一個棋子走動時，它原先覆蓋的格子會重新陷入黑暗（除非另有棋子仍能看到它們），而它新觸及的格子則會亮起。',
  "Notice the rook on d7 sees the queen on b7 and the king on h7, but not a7. A piece's vision ends where its movement ends.":
    '注意 d7 的車能看到 b7 的后和 h7 的王，卻看不到 a7。棋子的視野止於它走法的盡頭。',
  'The game ends when a king is captured. No check, no checkmate, no warning.':
    '當一方的王被吃掉時，對局即告結束。沒有將軍，沒有將死，也沒有任何預警。',
  "Mistboard auto-draws games on threefold repetition (same true position three times, same side to move, same castling and en-passant rights) and the 50-move rule (fifty full moves with no pawn move or capture). Both apply to the true position, not either player's view. There is no stalemate draw and no insufficient-material draw.":
    'Mistboard 會在三次重複局面（同一真實局面出現三次，且輪到走子的一方相同、王車易位權與吃過路兵權也相同）或五十回合規則（連續五十個回合無兵的走動、也無吃子）時自動判和。兩條規則都針對真實局面，而非任何一方各自的視野。這裡沒有逼和，也沒有子力不足判和。',
  'A king may castle out of, through, or into check.':
    '王可以在被將軍時易位，可以穿過被攻擊的格子易位，也可以易位到被攻擊的格子上。',
  'Pawns see forward push squares when those squares are empty. They see diagonal squares only when an enemy piece is actually there to capture.':
    '兵在前方格為空時能看到可推進的格子。只有當斜前方真的有敵方棋子可吃時，兵才會看到那個斜線格。',
  'White does not see a4 or b4: black pawns block those pushes, so they are not legal moves. Some rulesets reveal blocked pawn squares; Mistboard does not.':
    '白方看不到 a4 或 b4：黑兵擋住了這些推進，所以它們不是合法走法。有些規則會顯示被阻擋的兵推進格；Mistboard 不會。',
  "En passant is chess's strangest move, so our vision rule bends for it: the capturing pawn sees the captured pawn on its adjacent square. The window is one move only. Pass on the capture and the chance is gone.":
    '吃過路兵是國際象棋中最奇特的一步，因此我們的視野規則為它破了個例：執行吃子的兵能看到相鄰格子上那個將被吃掉的對方兵。這個窗口只持續一步。若放棄這次吃子，機會便不復存在。',
  "You can read the darkness to deduce what's happening on the board.":
    '你可以透過解讀這片黑暗，推斷棋盤上正在發生什麼。',
  'The goal is not perfect certainty. A good dark chess player learns which hidden worlds are dangerous enough to respect, then chooses moves that survive those worlds.':
    '目標不是獲得完美確定性。優秀的迷霧棋手會判斷哪些隱藏局面危險到必須尊重，然後選擇在那些局面中也能成立的走法。',
  'A pawn sees where it can push. Fog on a push square means an opponent piece or pawn is blocking it.':
    '兵能看到它可以推進到的格子。若推進格被迷霧遮住，就說明那裡有對方的棋子或兵擋著。',
  "Same signal in opening play. After 1.d4 e6 2.Nf3 Bb4, b4 leaves White's view: the b2-pawn no longer pushes there. A Black piece just landed on b4. Pawn, knight, or bishop, and White can't tell which. But c3 and d2 are visible empty, so a bishop would capture the king next move. White has to defend on that assumption.":
    '開局中也有同樣的信號。在 1.d4 e6 2.Nf3 Bb4 之後，b4 離開了白方的視野：b2 的兵不再能推進到那裡。說明剛有一枚黑方棋子落在了 b4。可能是兵、馬或象，白方無從判斷是哪一個。但 c3 與 d2 都清晰可見且為空，因此一枚象下一步就能吃掉白王。白方只能按這個最壞的假設來防守。',
  "When the opponent takes one of your pieces, the capture square falls to fog. You can't see what took. Here: White pawn on d5, with four Black attackers around it (c6 pawn, e6 pawn, c7 knight, d7 rook). After 1...exd5, the d5 pawn vanishes. Which Black piece took it?":
    '當對方吃掉你的一枚棋子時，被吃的那個格子會隨即陷入迷霧。你看不到是誰吃的。例如：白方有一個兵在 d5，周圍有四個黑方攻擊者（c6 兵、e6 兵、c7 馬、d7 車）。在 1...exd5 之後，d5 的兵消失了。是哪一枚黑子吃掉了它？',
  'Add a White bishop on h3. Its diagonal keeps e6 in view. After the same 1...exd5, White loses d5 and the bishop sees e6 fall empty. So the e-pawn took.':
    '現在在 h3 添一枚白象。它的斜線讓 e6 始終處在視野內。同樣走 1...exd5 之後，白方失去 d5，而那枚象看到 e6 變空了。於是可知：是 e 路的兵吃的。',
  "Here is a complete game between Mistboard's engine and a human, shown from both player views and the server's full position.":
    '下面是一盤 Mistboard 引擎對陣真人的完整對局，同時展示雙方視野和伺服器上的完整局面。',
  'Read the rules': '閱讀規則',
  "WHITE'S VIEW": '白方視野',
  'SERVER TRUTH': '伺服器真相',
  "BLACK'S VIEW": '黑方視野',
  PAWN: '兵',
  KNIGHT: '馬',
  BISHOP: '象',
  ROOK: '車',
  QUEEN: '后',
  KING: '王',
  BEFORE: '之前',
  AFTER: '之後',
  'EMPTY AHEAD': '前方空曠',
  'BLOCKED AHEAD': '前方受阻',
  'The board': '棋盤',
  'The pieces': '棋子',
  'Back to all rules': '返回全部規則',
  // section headings
  'Win condition: general capture': '勝負條件：擒獲將帥',
  'Play status': '對弈狀態',
  // sub-headings
  Cannons: '炮（砲）',
  'Facing generals': '將帥對臉',
  'Horse legs': '蹩馬腿',
  'Elephant eyes': '塞象眼',
  // paragraphs
  'At the start, you see your own pieces and every legal destination they control. Everything else is fog. Your opponent sees a different board from the same true position.':
    '開局時，你能看到己方棋子以及它們所控制的每一個合法落點。其餘一切都是迷霧。你的對手會從同一個真實局面看到一張不同的棋盤。',
  'Vision is recomputed from the true position after every move, so hidden blockers, cannon screens, horse legs, elephant eyes, and newly opened lines immediately change what you know.':
    '每走一步之後，視野都會根據真實局面重新計算，因此隱藏的阻擋子、炮架、馬腿、象眼，以及新打開的線路都會立刻改變你所掌握的資訊。',
  'Capture the general to win. Checks and checkmates are not announced, and the server does not warn a player who has moved into danger.':
    '擒獲將帥即獲勝。將軍與將死都不會被告知，並且當一方走入危險時，伺服器也不會發出警告。',
  "Games auto-draw on threefold repetition and after 60 plies with no capture. Both are judged from the true position, not either player's view. There is no stalemate draw: if the side to move has no legal move, it loses, and with no check to freeze you, this almost never happens.":
    '對局會在三次重複局面，以及連續 60 個半回合無吃子時自動判和。兩者都依據真實局面判斷，而非任何一方各自的視野。這裡沒有困斃判和：若輪到走子的一方沒有合法著法，則判負；而由於沒有將軍來限制你，這種情況幾乎不會發生。',
  'A cannon moves like a chariot when it is not capturing. To capture, it jumps exactly one screen and lands on the first enemy piece beyond it. Under fog, the screen appears as unknown occupancy and the target is visible as the enemy piece.':
    '炮（砲）不吃子時走法與車相同。吃子時，牠正好越過一個炮架，落在其後的第一枚敵方棋子上。在迷霧下，炮架顯示為未知的佔據狀態，目標則作為敵方棋子可見。',
  'A horse can move only when the adjacent leg square is clear. If a hidden piece blocks that leg, the destination disappears from your visible set and the leg square appears as a ? marker.':
    '只有當相鄰的馬腿位置空著時，馬才能走動。如果有一枚隱藏的棋子蹩住了那條馬腿，落點就會從你的可見集合中消失，而馬腿位置則顯示為一個「?」標記。',
  'An elephant moves two points diagonally and cannot cross the river. If a hidden piece sits on the midpoint eye, the diagonal destination disappears and the eye square appears as a ? marker.':
    '象（相）沿斜線走兩個交叉點，且不能過河。如果有一枚隱藏的棋子塞在中點的象眼上，斜線落點就會消失，而象眼位置則顯示為一個「?」標記。',
  // -- Jieqi (rules) --
  Setup: '佈局',
  "Set each general face-up on its normal palace point. Shuffle each side's other fifteen pieces and deal them face-down onto the remaining starting points. Neither player knows any hidden identities, including their own.":
    '將雙方的將帥各自正面朝上擺在九宮內通常的位置。把每一方其餘十五枚棋子洗混，背面朝下地發到剩餘的起始位置上。任何一方都不知道任何暗子的身份，包括自己的暗子。',
  'First moves use starting points': '首步按起始位置行棋',
  'Before reveal, a dark piece uses the role of the starting point it occupies, not its hidden identity. A dark piece on a corner point plays like a chariot; dark pieces on horse, advisor, elephant, cannon, and soldier points use those matching moves.':
    '翻明之前，暗子按其所在起始位置對應的兵種行棋，而不是按牠隱藏的真實身份。位於角點的暗子像車一樣走；位於馬、士、象、炮、兵起始位置上的暗子，則分別按這些兵種的走法行棋。',
  'The normal restrictions still apply to that first move: horse legs, elephant eyes, cannon screens, palace limits for advisor points, and the river limit for elephant points. Once the move resolves, the piece flips face-up for both players.':
    '通常的限制對這首步同樣適用：蹩馬腿、塞象眼、炮架，士位受九宮限制，象位受河界限制。這步走完後，該棋子即對雙方翻為正面朝上。',
  'Revealed pieces use identity': '翻明後的棋子按真實身份行棋',
  "After reveal, use the piece's identity from its current point. Advisors may leave the palace, and elephants may cross the river. Their movement shapes do not change: advisors step one point diagonally; elephants move two points diagonally and are still eye-blocked.":
    '翻明之後，棋子從牠當前所在的位置按其真實身份行棋。士可以離開九宮，象可以過河。牠們的走子形狀不變：士斜走一個交叉點；象斜走兩個交叉點，並且仍會被塞象眼。',
  'Horses, chariots, and cannons move normally. Soldiers use the normal river rule from wherever they reveal: forward only before crossing, forward or sideways after crossing, never backward.':
    '馬、車、炮按常規走法行棋。兵（卒）則從牠翻明的位置起套用通常的過河規則：過河前只能向前，過河後可向前或橫走，永不後退。',
  'Captured dark pieces': '被吃掉的暗子',
  'If a dark piece is captured before revealing, only the capturer learns what it was. The owner sees one dark piece leave the board, but not its identity. Later, the capturer can rule out that hidden identity elsewhere.':
    '如果一枚暗子在翻明之前被吃掉，只有吃子的一方知道牠是什麼。棋子的主人只看到一枚暗子離開棋盤，卻看不到牠的身份。此後，吃子的一方便可以排除其他位置上存在這個隱藏身份的可能。',
  'This reference uses the common Jieqi convention: the capturer sees it. Some cờ úp groups handle captured dark pieces differently, so agree on the convention before over-the-board play.':
    '本規則參考採用揭棋的常見約定：吃子一方可見。某些 cờ úp（越南揭棋）流派對被吃暗子的處理方式不同，因此在線下實地對弈前應先就採用的約定達成一致。',
  'Checks, wins, and draws': '將軍、勝負與和棋',
  "Every occupied point is visible, so players can see when the general is attacked. An unmoved dark piece attacks from its starting point using that point's role. Once it moves, it reveals immediately; any check from the destination uses the revealed identity.":
    '每個被佔據的交叉點都是可見的，因此雙方都能看出將帥何時受到攻擊。尚未走動的暗子按其起始位置對應的兵種從該位置發動攻擊。一旦走動，牠立即翻明；任何來自落點的將軍都按翻明後的真實身份計算。',
  'Win by checkmating the general or leaving the opponent with no legal move. The facing-generals rule still applies, and dark pieces block the file like any other piece.':
    '將死對方將帥，或讓對方無合法走法可走，即可獲勝。將帥對臉的規則依然有效，暗子也和其他棋子一樣會擋住縱線。',
  'Repetition follows xiangqi long-beat rules, not a generic threefold or fourfold result. Perpetual check and direct perpetual chase are forbidden, so the forcing side must change course or lose; mutual forcing and ordinary repeated positions are judged by the xiangqi cycle, not by board equality alone. The automatic draw convention in this reference is the Guangdong/Tencent no-capture clock: 60 full moves, meaning 120 plies, without a capture.':
    '重複局面依照象棋的長打規則裁定，而不是籠統地按三次或四次重複出結果。長將和直接的長捉都被禁止，因此發動逼著的一方必須改變著法，否則判負；互打以及普通的重複局面則依據象棋的循環判例裁定，而不能只看局面是否相同。本規則參考採用的自動判和約定是廣東／騰訊的無吃子回合數：連續 60 個完整回合（即 120 個半回合）無吃子即判和。',
  Name: '名稱',
  Names: '名稱',
  'Step through a full self-play game below. Dark pieces show as colored backs and flip to their dealt identity the first time they move, so a corner that plays like a chariot can reveal a soldier. Red wins by checkmate.':
    '在下方逐步查看一整盤自我對弈的棋局。暗子以彩色背面顯示，第一次走動時翻開，顯示其發到的身份，因此一個像車一樣走子的角落棋子，翻開後可能是一個兵。紅方以將死獲勝。',
  'The board is half a xiangqi board: thirty-two squares in a 4x8 grid, shown here with the long side horizontal. Unlike xiangqi, pieces sit inside the squares rather than on intersections, and the thirty-two shuffled pieces exactly fill the board, every one face-down.':
    '棋盤是半張象棋棋盤：4×8 共三十二個方格，此處以長邊橫置顯示。與象棋不同，棋子放在方格之內，而不是交叉點上；洗勻後的三十二枚棋子恰好填滿棋盤，每一枚都背面朝下。',
  'Colors are not assigned in advance. The first player opens the game by flipping any piece: whatever color comes up is theirs, and the opponent plays the other.':
    '顏色不會事先分配。先行的一方翻開任意一枚棋子來開局：翻出什麼顏色，那一方就執該色，對手執另一色。',
  Turns: '回合',
  'On your turn, do exactly one of three things: flip any face-down piece, move one of your revealed pieces one square orthogonally onto an empty square, or capture with one of your revealed pieces. A flip reveals the piece to both players, even if it belongs to your opponent. There is no passing.':
    '輪到你時，只能做三件事之一：翻開任意一枚背面朝下的棋子，將你的一枚已翻開的棋子沿上下左右走一格到空格，或用你的一枚已翻開的棋子吃子。翻子會向雙方亮出該棋子，即使它屬於對手也是如此。不能虛著（不可跳過行棋）。',
  'Capture by rank': '按等級吃子',
  'The cannon sits outside this rank ladder and uses its own capture rule. As a target, though, it still ranks just above the soldier, shown in the dashed slot below. Face-down pieces cannot be captured at all: a piece must be flipped before anyone can take it, which makes every flip next to a strong enemy piece a calculated risk.':
    '砲不在這一等級序列之內，使用自己的吃子規則。不過作為被吃目標，它仍排在卒之上，如下方虛線格中所示。背面朝下的棋子完全不能被吃：任何棋子都必須先翻開，才能被吃，因此在強敵旁邊翻子，每一次都是經過權衡的冒險。',
  'The cannon': '砲',
  'The cannon ignores rank when it captures. For a capture only, it may travel any distance along a row or column and jump exactly one intervening piece, the screen. It then takes the first piece beyond that screen, and only if that piece is a revealed enemy. If a friendly or face-down piece sits there instead, the line is blocked and the cannon cannot reach past it. The screen itself can be friendly, enemy, or face-down.':
    '砲吃子時不論等級。僅在吃子時，它可以沿一行或一列移動任意距離，並恰好越過中間一枚棋子，即砲架。它吃掉砲架另一側的第一枚棋子，且僅當該棋子是已翻開的敵方棋子。如果那裡是己方棋子或背面朝下的棋子，則該線被擋住，砲無法越過它。砲架本身可以是己方、敵方或背面朝下的棋子。',
  'A non-capturing cannon move is still just one square orthogonally, like every other piece. Because a cannon needs a screen to capture, it cannot take an adjacent piece. As a target, an adjacent cannon can be taken by a general, advisor, elephant, chariot, or horse, but not by a soldier.':
    '砲在不吃子時，與其他棋子一樣，也只能沿上下左右走一格。由於砲吃子需要砲架，它不能吃相鄰的棋子。作為被吃目標，相鄰的砲可以被將、士、象、車或馬吃掉，但不能被卒吃掉。',
  'You win when your opponent has no legal move, usually because every enemy piece is captured, sometimes because they are boxed in. The general is not royal: capturing it is progress, not the win, and play continues until one side is wiped out or stuck.':
    '當對手輪到自己卻無棋可走時，你獲勝——通常是因為敵方棋子被全部吃光，有時則是被困死、無路可走。這裡的將不是王棋：吃掉它只是進展，而非勝利，棋局會一直進行到一方被吃光或被困死為止。',
  'Mistboard draws a game two ways: 40 plies (single moves) with no flip or capture, or threefold repetition, the same position three times. Either counter resets on any flip or capture, since those cannot be taken back. There is no perpetual-chase rule; over the board, agree the no-progress and repetition limits before you start.':
    'Mistboard 有兩種自動和棋：連續 40 步（單步）內沒有翻子也沒有吃子，或者同一局面出現三次的三次重複。任何翻子或吃子都會讓相應計數清零，因為這類著法無法收回。這裡沒有長捉判負規則；線下對弈時，請在開局前約定無進展與重複局面的處理標準。',
  'Play MistyBanqi': '對戰 MistyBanqi',
  'Challenge a friend': '挑戰好友',
  'MistyBanqi · Strongest': 'MistyBanqi · 最強',
  'MistyBanqi (Red) wins by resignation · 49 moves': 'MistyBanqi（紅方）因對手認輸獲勝 · 49 回合',
  'Three rules give the game its character: the rat captures the elephant, only the rat can swim, and the lion and tiger leap the rivers.':
    '三條規則賦予了這盤棋的特色：老鼠能吃大象，只有老鼠能下水，獅和虎能跳過河。',
  'Strongest at the left, weakest at the right.': '最強在左，最弱在右。',
  Traps: '陷阱',
  'Step a piece onto one of your opponent’s three trap squares and it loses all rank while it stands there, so any defending piece can take it, down to a rat capturing a trapped elephant. Only an enemy’s traps do this: a piece can sit on one of its own traps and keeps its full rank.':
    '把一枚棋子走進對方三個陷阱格之一，它在停留期間會喪失全部等級，因此任何防守方棋子都能吃掉它，哪怕是老鼠吃掉落入陷阱的大象。只有敵方的陷阱才有此效果：棋子可以停在自己的陷阱上，並保持全部等級。',
  'Move any piece into your opponent’s den and you win immediately. You also win by capturing every enemy piece. You can never move a piece onto your own den, so the only den you can enter is the enemy’s.':
    '任何一枚棋子走進對方的獸穴，你立刻獲勝。吃光對方所有棋子同樣獲勝。你永遠不能把棋子走進自己的獸穴，所以你能進入的只有對方的獸穴。',
  'Games draw on threefold repetition, or when 100 half-moves (50 by each player) pass with no capture.':
    '若同一局面出現三次，或連續 100 個半回合（每方 50 步）無吃子，則判和。',
  'A full game': '完整對局',
  'Step through a real game between two strengths of our bot. Watch the lion leap the river, the rat swim up the far lane and take the elephant in the open, and Red march the rest of the way into Black’s den.':
    '逐步回放我們機器人兩個強度之間的真實對局。看獅子跳過河、老鼠沿遠側通道游上去並在空地上吃掉大象，最後紅方一路走進黑方的獸穴。',
  'All sixteen pieces, one of each animal in two colors, are shuffled and placed face-down on the sixteen squares. Nobody knows which animal or which color sits under a tile until it is flipped. The first tile you flip sets your color for the rest of the game.':
    '全部十六枚棋子（兩種顏色各八種動物）洗勻後背面朝上放在十六個格子裡。在翻開之前，誰也不知道某個格子下面是哪種動物、哪種顏色。你翻開的第一枚棋子決定你在本局其餘時間的顏色。',
  'A turn': '一個回合',
  'On your turn you either flip one face-down tile to reveal it, or move one of your own revealed animals one square up, down, left, or right. Early on, before pieces come up, flipping is all you can do.':
    '輪到你時，你要麼翻開一枚背面朝上的棋子使其亮明，要麼把己方一枚已翻開的動物上下左右走一格。開局階段，在棋子尚未翻出之前，你能做的只有翻棋。',
  Capturing: '吃子',
  'You win when your opponent has nothing left to do: no piece to move and no tile to flip. In practice that means capturing or trading away everything they have.':
    '當對手無事可做時你獲勝：既沒有棋子可走，也沒有棋子可翻。實際上，這意味著把對方擁有的一切吃掉或換掉。',
  'Games draw on threefold repetition, or when 40 half-moves (20 by each player) pass with no flip, capture, or trade.':
    '若同一局面出現三次，或連續 40 個半回合（每方 20 步）沒有翻棋、吃子或同歸於盡，則判和。',
  'A game is also drawn the moment the pieces left on the board can no longer force a win — two survivors of equal rank, or a lone piece that can never corner the opponent’s last piece on the small board. These dead positions are settled as a draw right away rather than played out to the repetition count.':
    '當盤面上剩下的棋子已無法取勝時，本局同樣判和——例如兩枚同級的棋子，或一枚在小棋盤上永遠逼不住對方最後一子的孤子。這類死局會立即判和，而不必一直走到三次重複局面。',
  'Step through a game our bot played against itself. The two lions meet and both leave the board, an elephant runs through three pieces until it hits the other elephant and they cancel too, and the side left standing wins. Tiles flip to their dealt animal the first time they are turned over.':
    '逐步回放我們機器人左右互搏的一盤棋。兩隻獅子相遇、雙雙離場；一頭大象連吃三子，直到撞上另一頭大象、兩象也同歸於盡；最後還有棋子站著的一方獲勝。棋子第一次被翻開時，會顯示其發到的動物。',
  'Engine vs engine': '引擎對引擎',
  'Red wins by reaching the den · 69 moves': '紅方進入獸穴獲勝 · 69 步',
  'Red’s rat has already taken Black’s elephant in the open, and with the strongest piece off the board Red walks a piece straight into Black’s undefended den. Reaching the enemy den ends the game at once, no matter what material is left.':
    '紅方的老鼠已經在空地上吃掉了黑方的大象，最強的棋子離場後，紅方逕直把一枚棋子走進黑方無人防守的獸穴。進入對方獸穴會立刻結束對局，無論場上還剩多少子力。',
  'Engine self-play': '引擎自我對弈',
  'Black wins by elimination · 36 moves': '黑方吃光對手獲勝 · 36 步',
  'Both lions and both elephants have already traded off the board (同归于尽), and the pieces that survived all belong to Black. Red has nothing left that can move, so the game ends: with no piece to move and no tile to flip, Red loses.':
    '兩隻獅子和兩頭大象都已同歸於盡離場，存活下來的棋子全部屬於黑方。紅方再無可走之子，於是對局結束：既沒有棋子可走，也沒有棋子可翻，紅方告負。',

  // -- Branded rules names --
  'Fog Chess Rules': '迷霧國際象棋規則',
  'Fog Chess rules: chess under Fog of War, where each side sees only the squares its pieces reach, there are no check warnings, and the king falls by capture.':
    '迷霧國際象棋規則：戰爭迷霧下的國際象棋。每一方只能看到己方棋子可及的格子，沒有將軍提示，王被吃掉即負。',
  "[Fog Chess](https://en.wikipedia.org/wiki/Dark_chess) is Mistboard's public name for dark chess, also called Fog of War chess. Jens Bæk Nielsen and Torben Osted invented it in 1989. It is the implicit-fog version of the idea: no umpire, no scan action. Each side's visibility is derived from where its pieces can legally move.":
    '[迷霧國際象棋](https://en.wikipedia.org/wiki/Dark_chess)是 Mistboard 對 dark chess / Fog of War chess 的公開名稱。Jens Bæk Nielsen 與 Torben Osted 於 1989 年發明了它。它屬於隱式迷霧：沒有裁判，也沒有偵察動作。每一方的視野完全由己方棋子的合法走法範圍推導而來。',
  'The rules of xiangqi, also called Chinese chess (象棋): palaces, the river, cannon screens, facing generals, and a famous game to play through. Now playable on Mistboard against the Pikafish engine or a friend.':
    '象棋規則：九宮、楚河漢界、砲架、將帥照面，以及一盤可逐步回放的名局。現在可在 Mistboard 上與 Pikafish 引擎或好友對弈。',
  'Xiangqi (象棋), also known as Chinese chess, is a two-player strategy game with roots in China going back many centuries. Its modern form, including the cannon, took shape around the Song dynasty (960 to 1279).':
    '象棋是一種源自中國、歷史悠久的雙人策略遊戲。包括砲在內的現代形態，大致在宋代（960 至 1279 年）成型。',
  'Fog Xiangqi Rules': '迷霧象棋規則',
  'Fog Xiangqi rules: xiangqi under Fog of War, where each side sees only the points its pieces reach, hidden blockers matter, and the general falls by capture.':
    '戰爭迷霧下的象棋：每一方只能看到己方棋子可及的點位，隱藏阻擋會影響視野，擒獲將帥即獲勝。',
  'Fog Xiangqi is xiangqi (象棋) under Fog of War. Pieces keep their normal movement, but unseen enemy pieces stay hidden and danger is not announced. Capture the general to win.':
    '迷霧象棋是在戰爭迷霧下對弈的象棋。棋子保留正常走法，但看不見的敵方棋子會被隱藏，危險不會被提示。擒獲將帥即獲勝。',
  'If Xiangqi is new to you, start with [Xiangqi Rules](/rules/xiangqi). If you already play xiangqi, the sections below explain only what fog changes.':
    '如果你還不熟悉象棋，請先閱讀[象棋規則](/rules/xiangqi)。如果你已經會下象棋，下面只解釋迷霧改變了什麼。',
  'Orthodox xiangqi forbids facing generals. Fog Xiangqi allows the position; if one general sees the other on a clear file, it can capture across that file.':
    '正統象棋禁止將帥照面。迷霧象棋允許這個局面；如果一方將帥在無阻擋的直線上看見對方，就可以沿這條線直接擒獲。',
  'Flip Xiangqi Rules': '暗棋規則',
  'Use [Xiangqi Rules](/rules/xiangqi) for the base game. This page covers what changes.':
    '基礎規則請參考[象棋規則](/rules/xiangqi)。本頁只說明變化之處。',
  'Reveal Xiangqi': '揭棋',
  'Fog Chess': '迷霧國際象棋',
  'Standard chess rules, the primer behind Fog Chess: castling, promotion, en passant, the draw rules, and a famous game to play through.':
    '普通國際象棋規則，也就是迷霧國際象棋背後的基礎：王車易位、升變、吃過路兵、和棋規則，以及一盤可逐步回放的名局。',
  'Chess is the open-information base game. Add Fog of War for Fog Chess, where enemy pieces outside your vision disappear and the king falls by capture.':
    '國際象棋是資訊公開的底層遊戲。為它加上戰爭迷霧，便得到迷霧國際象棋：你視野之外的敵方棋子會消失，而王由被吃而落敗。',
  'Read Fog Chess': '閱讀迷霧國際象棋',
  "Fog Chess with a sealed opening draft: each player picks one of three Chess960 back ranks and never sees the other's.":
    '帶密封開局選擇的迷霧國際象棋：每位玩家從三個 Chess960 底線陣型中選擇一個，且永遠看不到對手選擇了哪個。',
  'Programming Fog Chess with Server-Side Truth': '用伺服器端真實局面實現迷霧國際象棋',
  'Fog Chess adds one hidden-information rule to chess: each side sees only the squares its own pieces reach. The implementation question is where that rule runs. On Mistboard, it runs on the server, so the browser receives a `PlayerView`, not a full board with fog painted over it.':
    '迷霧國際象棋給國際象棋增加了一條隱藏資訊規則：每一方只能看到己方棋子可及的格子。實作問題在於這條規則在哪裡執行。在 Mistboard 上，它執行在伺服器端，所以瀏覽器收到的是一個 `PlayerView`，而不是蓋著迷霧圖層的完整棋盤。',
  'Play Misty in Fog Chess, or read the rules article for the player-facing version of the same visibility model.':
    '來玩 Misty 的迷霧國際象棋，或閱讀面向玩家的規則文章，了解同一套視野模型。',
  'Read Fog Chess Rules': '閱讀迷霧國際象棋規則',
  'Jungle Chess Rules': '鬥獸棋規則',
  "The classic Chinese animal-chess game, traditionally Dou Shou Qi (斗兽棋), on a 7×9 board. Eight ranked animals, rivers only the rat can cross, and a race to the opponent's den.":
    '經典中國動物棋鬥獸棋，棋盤 7×9。八種按等級排列的動物，只有老鼠能過的河，以及衝入對方獸穴的競賽。',
  "Jungle Chess is Mistboard's public name for Dou Shou Qi (斗兽棋), also called Animal Chess. It is a two-player game played across much of East Asia. Each side commands eight animals of different rank. You win by marching a piece into your opponent’s den, or by capturing all of their pieces.":
    '鬥獸棋是 Mistboard 對 Dou Shou Qi（鬥獸棋，也稱 Animal Chess）採用的公開英文名稱。這是流行於東亞許多地區的雙人遊戲。每方指揮八種不同等級的動物。把一枚棋子走進對方的獸穴，或吃光對方所有棋子，即獲勝。',
  'Flip Jungle Rules': '翻翻棋規則',
  'The 4×4 flip version of Jungle Chess. Every animal starts face-down, you flip to reveal, and equal ranks trade off the board.':
    '鬥獸棋的 4×4 翻面版本。所有動物開局均背面朝上，翻開即亮明身分，等級相同的雙方同歸於盡、一起離場。',
  'Reveal Xiangqi Rules': '揭棋規則',
  'Rules used on Mistboard': 'Mistboard 採用的規則',
  'Ranks and captures': '等級與吃子',
  'How the animals move': '動物如何移動',
  Rat: '鼠',
  Lion: '獅',
  Tiger: '虎',
  'Animal ranks': '動物等級',
  'Flip a tile': '翻開一枚棋子',
  'Move an animal': '移動一枚動物',
  'FIRST FLIP ASSIGNS COLOR': '首次翻子決定顏色',
  'CANNON SCREEN CAPTURE': '砲隔子吃',
  'CAPTURED PIECE KNOWLEDGE': '被吃暗子資訊',
  HIGH: '高',
  LOW: '低',
  General: '將',
  Advisor: '士',
  Elephant: '象',
  Chariot: '車',
  Horse: '馬',
  Cannon: '砲',
  Soldier: '卒',
  'RED KNOWS': '紅方知道',
  'BLACK KNOWS': '黑方知道',
  'the captured piece was a horse': '被吃的是馬',
  'one dark piece disappeared': '一枚暗子消失了',
  'Attacking, the cannon jumps a screen and ignores rank.': '砲進攻時隔一子跳吃，不看等級。',
  'As a target it ranks here: taken by horse and up, never by a soldier.':
    '作為目標時，砲排在這裡：馬以上可吃，卒不可吃。',
  'CAPTURE RANK LADDER': '吃子等級序列',
};

const ARTICLE_DICTS: Record<ArticleLang, Record<string, string>> = {
  'zh-Hans': ZH_HANS,
  'zh-Hant': ZH_HANT,
};

function deepTranslate<T>(value: T, dict: Record<string, string>): T {
  if (typeof value === 'string') return (dict[value] ?? value) as T;
  if (Array.isArray(value)) return value.map((v) => deepTranslate(v, dict)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepTranslate(v, dict);
    return out as T;
  }
  return value;
}

// Returns a deep copy of the article with content strings swapped to `lang`.
// Strings absent from the dictionary fall through as English (graceful partial
// translation). Does not mutate the source article.
export function translateArticle(article: Article, lang: ArticleLang): Article {
  return deepTranslate(article, ARTICLE_DICTS[lang]);
}

export function translateArticleText(lang: ArticleLang | undefined, text: string): string {
  return lang ? (ARTICLE_DICTS[lang][text] ?? text) : text;
}

// True when `text` has an authored translation for `lang`. The translation
// coverage test uses this to assert that every prose string in a locked
// article resolves in both zh scripts, so an English edit that orphans a
// dictionary key fails the build instead of silently rendering English.
export function hasTranslation(lang: ArticleLang, text: string): boolean {
  return Object.hasOwn(ARTICLE_DICTS[lang], text);
}

// Every authored dictionary key for `lang`. The coverage reporter uses this to
// flag orphaned keys: entries that no longer match any current article string
// (the residue of an English edit that left a stale translation behind).
export function translationKeys(lang: ArticleLang): string[] {
  return Object.keys(ARTICLE_DICTS[lang]);
}
