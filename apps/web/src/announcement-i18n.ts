// Announcement localization (zh-Hans / zh-Hant).
//
// Model: the English entry in announcements.ts stays the single source of truth
// and is authored exactly as it is today. A localized render substitutes any
// headline, body, or CTA that appears as a key in the per-language dictionary;
// anything missing falls back to the English string, so a new announcement
// renders in English until it is translated rather than rendering blank.
//
// This mirrors article-i18n.ts deliberately, including its failure mode: editing
// an English string detaches its translation silently. The guard is the same,
// announcement-i18n.coverage.test.ts fails on an orphaned key, which forces the
// dictionary edit to ride along with the copy change.
//
// Variant names follow the play catalog exactly (variant.*.name), so a reader
// sees the same term in the feed and in the lobby.
import type { Announcement } from './announcements.js';
import type { Locale } from './i18n/locale.js';

export type AnnouncementLang = Extract<Locale, 'zh-Hans' | 'zh-Hant'>;

// AWAITING A NATIVE READ: the 2026-08-22 batch (both bots / four times as many
// puzzles / move badges / skill from luck) shipped without one, by decision, to
// avoid holding the English feed. The two long bodies carry the most risk:
// 着法评级 for "move-judgment badge", 翻子回合 for "reveal ply", and 方差 for
// "variance". Correct them in place when a native reader gets to them.
export const ANNOUNCEMENT_LANGS: AnnouncementLang[] = ['zh-Hans', 'zh-Hant'];

const ZH_HANS: Record<string, string> = {
  // ── headlines ──
  'Both house bots play stronger.': '两台自家引擎都变强了。',
  'Four times as many xiangqi puzzles.': '象棋题目增至四倍。',
  'Move badges and best lines on every reviewable variant.':
    '所有支持复盘的棋类都有着法评级与最佳变化。',
  'Separating skill from luck in flip games.': '在翻子棋中区分棋力与运气。',
  'What Patron support will cost.': '赞助 Mistboard 的价格。',
  'A games database for xiangqi.': '象棋对局库。',
  'Perpetual check now loses in standard xiangqi.': '标准象棋中长将判负。',
  'Mistboard works on a phone.': 'Mistboard 已适配手机。',
  'Every composition has its own page.': '每则排局都有独立页面。',
  'Mistboard reads in Chinese.': 'Mistboard 已支持中文。',
  'Rated games at every time control.': '各种时限都可下等级分对局。',
  'An opening explorer for xiangqi.': '象棋开局库。',
  'Rated xiangqi is live.': '等级分象棋已上线。',
  'Secret in the Tangerine, both game volumes.': '《橘中秘》全部对局卷。',
  'Classical xiangqi, from the original woodblocks.': '古谱象棋，源自原始刻本。',
  'Correspondence play has launched.': '通信对局已上线。',
  'An analysis board for every game.': '每种棋类都有分析棋盘。',
  'Studies have launched.': '研习已上线。',
  'Mistboard TV is live.': 'Mistboard 电视已上线。',
  'Learn xiangqi from scratch.': '从零开始学象棋。',
  'Xiangqi puzzles have launched.': '象棋题目已上线。',
  'Xiangqi has launched.': '象棋已上线。',
  'Forum and global chat have launched.': '论坛与全站聊天已上线。',
  'Fortress has launched.': '堡垒象棋已上线。',
  'Jungle Chess has launched.': '斗兽棋已上线。',
  'Flip Jungle has launched.': '翻翻棋已上线。',
  'Drop Mini Xiangqi has launched.': '投放迷你象棋已上线。',
  'Dark Crazyhouse has launched.': '迷雾疯狂屋已上线。',
  'Dark Crossroads Chess has launched.': '迷雾十字路口国际象棋已上线。',
  'Fog Shogi has launched.': '迷雾将棋已上线。',
  'Kriegspiel is open for alpha play.': '裁判棋已开放内测对局。',
  'Reveal Chess is open for alpha play.': '翻开国际象棋已开放内测对局。',
  'Fog Xiangqi is open for alpha play.': '迷雾象棋已开放内测对局。',
  'Banqi is open for alpha play.': '暗棋已开放内测对局。',
  'Jieqi is open for alpha play.': '揭棋已开放内测对局。',
  'Crossroads Chess has launched.': '十字路口国际象棋已上线。',
  'Fog Chess is open for alpha play.': '迷雾国际象棋已开放内测对局。',
  'Mistboard is in alpha.': 'Mistboard 处于内测阶段。',
  'Dark Mini Xiangqi is open for alpha play.': '迷雾迷你象棋已开放内测对局。',
  'Misty 1.0 has launched.': 'Misty 1.0 已上线。',

  // ── bodies ──
  'Misty runs version 1.6 in fog chess, which closes a queen hang it used to walk into. Pikafish now searches jieqi to full depth; it had been stopping early, which made it easier to beat than it should have been.':
    '迷雾国际象棋中的 Misty 已升级到 1.6 版，修正了以往会送后的一类失误。揭棋中的 Pikafish 现在会搜索到完整深度；此前它过早停止搜索，因此比应有的水平更容易被击败。',
  'The standard xiangqi set goes from 394 puzzles to 1,605, every one mined from a finished game and checked by the engine before it ships.':
    '标准象棋题库从 394 题增加到 1,605 题，每一题都取自已结束的对局，并在上线前经过引擎校验。',
  'The move-judgment badge now sits on the board for all six variants with analysis, not xiangqi alone, and a blunder names the move that refutes it. Jieqi reveal plies get the ranked candidates the engine scored instead of a line, since nothing past a flip is knowable.':
    '着法评级标记现在会显示在全部六种支持分析的棋类棋盘上，不再只有象棋，漏着还会指出反驳它的具体着法。揭棋的翻子回合不再给出变化，而是列出引擎评分后的候选着法排名，因为翻子之后的局面无法预知。',
  'Half the moves in banqi, jieqi, and flip jungle are dice rolls, so a chess-style review blames you for variance. Game review splits every flip into the decision you made and the tile you got, and the article runs that over 52 human-versus-engine games.':
    '暗棋、揭棋和翻翻棋中有一半的着法取决于运气，用国际象棋那套复盘方式会把方差算在你头上。对局复盘把每次翻子拆成你做的决策和你翻到的子，文章用 52 局人机对局验证了这一点。',
  'The Support page lists the monthly amounts, what they include (a profile badge, no gameplay advantage), and the billing and refund terms in full. Checkout is not open yet.':
    '「支持 Mistboard」页面列出了每月的赞助金额、包含的内容（个人资料上的徽章，不影响对局），以及完整的计费与退款条款。结账尚未开放。',
  'Search finished games from three sources in one place: the historical corpus, the tournament boards we broadcast, and games played here.':
    '在同一处检索三个来源的已结束对局：历史棋谱库、我们直播的赛事棋盘，以及在本站下的对局。',
  'Repeating a check forever used to draw. The checker has to vary or lose the game, which is how the published rulesets score it and how the course has always taught it.':
    '此前一直重复将军会判和。现在长将的一方必须变着，否则判负，这与公布的规则以及本站课程一贯的讲法一致。',
  'Every page was swept at phone width: a full-size live board, lobby rows that still name the variant, and real touch targets on the controls you tap.':
    '每个页面都按手机宽度检查过：对局棋盘完整显示，大厅列表仍标明棋类，常用控件也有足够大的触控区域。',
  'Each endgame composition in the library is a page you can link to, and sharing one previews its own diagram rather than the site card.':
    '棋谱库中的每则排局都有可分享的链接，分享时预览的是该局自己的棋图，而不是站点的通用卡片。',
  'Playing, watching, the forum, and the xiangqi rules pages are all available in Simplified and Traditional Chinese. Switch languages in the settings menu.':
    '对局、观战、论坛和象棋规则页面均已提供简体中文与繁体中文。可在设置菜单中切换语言。',
  'Bullet, blitz, and rapid each keep their own rating now, instead of rated meaning 3+2 only. Correspondence stays casual on purpose.':
    '子弹、闪电和快速各自记录独立的等级分，不再只有 3+2 才算等级分对局。通信对局仍然只计休闲，这是有意为之。',
  'Open any position on the analysis board and see what has been played from it, with example games to study and the corpus it came from named on the panel.':
    '在分析棋盘上打开任意局面，即可看到从这里走出的着法统计，附示例对局，面板上也注明了数据出自哪个棋谱库。',
  'Choose Rated in the lobby. Your rating starts at 1500 and appears after it settles.':
    '在大厅选择「等级分」。等级分从 1500 起算，稳定后显示。',
  'Both volumes are playable move by move in English: 33 games with every printed variation.':
    '两卷都可用英文逐着打谱：33 局对弈，含书中全部变着。',
  'Read the earliest printings move by move, with every corrected misprint marked on the board.':
    '逐着阅读最早的刻本，所有勘正的讹误都标注在棋盘上。',
  'Post or accept a days-per-move seek, or send a friend a challenge link and play at your own pace.':
    '发布或接受「每着若干天」的约战，也可以把挑战链接发给好友，按自己的节奏下棋。',
  'Set up any position, import moves, run a local evaluation, or grade a finished game with server analysis.':
    '摆任意局面、导入着法、在本地运行评估，或用服务器分析为已结束的对局评分。',
  'Build shareable analysis boards: draw on the board, comment, branch variations, organize chapters, and publish interactive gamebook lessons.':
    '搭建可分享的分析棋盘：在盘面标注、写评注、分出变着、整理章节，并发布可互动的教学课程。',
  'Watch live games on the new Watch page, with a channel for every game and an Engines channel for bot-versus-bot matches.':
    '在新的「观战」页面看直播对局，每种棋类都有频道，另有引擎频道播放机器人之间的对弈。',
  'A free interactive course: 20 stages and 111 hands-on levels take you from how each piece moves to the named checkmate patterns.':
    '免费的互动课程：20 个阶段、111 个实操关卡，从每个棋子怎么走一直讲到有名的杀法。',
  'Tactics mined from real games, with puzzle ratings, hints, and a daily puzzle on the homepage.':
    '从真实对局中挖掘的战术题，配有题目等级分、提示，首页还有每日一题。',
  'Standard Chinese chess on the full 9 by 10 board is now first-class on Mistboard: play the Pikafish engine at three strengths, or challenge a friend.':
    '9×10 全盘的标准象棋已成为 Mistboard 的主要棋类：可与三档强度的 Pikafish 引擎对弈，也可以邀请好友。',
  'The forum is open for game analysis, engine talk, and site feedback, with the homepage global chat available for quick table-talk during live sessions.':
    '论坛已开放，可用于复盘、讨论引擎和反馈站点问题；首页的全站聊天则方便在对局时随口交流。',
  'Xiangqi with a pocket: every piece moves as in Chinese chess, plus crazyhouse-style drops and the new Treasure. Play the bot or challenge a friend.':
    '带手牌的象棋：所有棋子走法与象棋相同，另加疯狂屋式的打入和新增的「宝」。可与机器人对弈或邀请好友。',
  'Rank-based animal chess on a 7 by 9 board with rivers, dens, and traps is live. Challenge a friend or take on the Misty Jungle engine.':
    '按等级吃子的动物棋，7×9 棋盘，有河流、兽穴和陷阱，现已上线。可邀请好友，或挑战 Misty Jungle 引擎。',
  'Every animal starts face-down on a 4 by 4 board and flips as you play. Challenge a friend or the engine.':
    '4×4 棋盘上所有动物开局均背面朝上，边下边翻。可邀请好友或与引擎对弈。',
  'The 7 by 7 reserve fight is live with no enemy-palace drops, a full rules page, and a 114-ply FSF sample game to study.':
    '7×7 的手牌之争已上线：不可打入敌方九宫，附完整规则页，以及一局 114 着的 FSF 示例对局可供研究。',
  'Crazyhouse under Fog of War is now live for invite games, with private hands, captured pieces entering reserve, and drops into the fog.':
    '迷雾下的疯狂屋已开放邀请对局：手牌不公开，被吃的棋子进入手牌，并可打入迷雾之中。',
  'Crossroads Chess under Fog of War is now live for invite games, with hidden enemy pieces, no check warnings, and the far-rank Try.':
    '迷雾下的十字路口国际象棋已开放邀请对局：敌方棋子隐藏，没有将军提示，并保留冲到底线的「触阵」胜法。',
  'Shogi under Fog of War is now live for invite games, with private hands, drops into the fog, and king capture wins.':
    '迷雾下的将棋已开放邀请对局：手牌不公开，可打入迷雾，擒王即胜。',
  'The original hidden-information chess: see only your own pieces, try moves through the umpire, and challenge a friend to a match.':
    '最早的隐藏信息国际象棋：只看得见自己的棋子，通过裁判试着法，可邀请好友对局。',
  'Standard chess with a hidden starting arrangement: every piece but the king begins face-down and reveals its true identity the moment it moves. Challenge a friend to a match.':
    '开局摆法隐藏的国际象棋：除王以外的棋子开局均背面朝上，一走动就亮明真实身份。可邀请好友对局。',
  'Fog of War on the full 9 by 10 xiangqi board: each side sees only the points its pieces reach. Challenge a friend to a match.':
    '9×10 全盘象棋上的迷雾：每一方只看得见自己棋子能到达的点位。可邀请好友对局。',
  'Banqi on an 8 by 4 board: all 32 pieces start face-down and flip as you play. Challenge a friend to a match.':
    '8×4 棋盘上的暗棋：32 枚棋子开局均背面朝上，边下边翻。可邀请好友对局。',
  'Hidden-identity xiangqi: every non-general piece starts face-down and reveals as it moves. Take on PikaJieQi, our jieqi engine.':
    '隐藏身份的象棋：除将帅外的棋子开局均背面朝上，走动时翻开。可挑战我们的揭棋引擎 PikaJieQi。',
  'A 6 by 8 chess-xiangqi variant with checkmate and king-race wins is now live on Mistboard.':
    '融合国际象棋与象棋的 6×8 变体已在 Mistboard 上线，可将死取胜，也可比拼王的冲刺。',
  'Fog of War chess is live on Mistboard, with private vision, no check warnings, and king capture wins.':
    '迷雾国际象棋已在 Mistboard 上线：视野不公开，没有将军提示，擒王即胜。',
  'Casual dark chess is open. Rated beta is coming.': '休闲迷雾棋已开放，等级分公测即将推出。',
  'A smaller Fog of War variant on a 7 by 7 xiangqi board, with Misty engine support.':
    '7×7 象棋棋盘上的小型迷雾变体，支持 Misty 引擎。',
  'Our Fog of War dark chess engine is now live to play.': '我们的迷雾国际象棋引擎现已开放对弈。',

  // ── CTA labels ──
  'Search the games': '检索对局',
  'See the amounts': '查看赞助金额',
  'See the leaderboard': '查看排行榜',
  'Open volume one': '打开第一卷',
  'Browse the studies': '浏览研习',
  'Find a game': '找一局棋',
  'Read the article': '阅读文章',
  'Open the board': '打开棋盘',
  'Browse studies': '浏览研习',
  'Watch now': '立即观战',
  'Start the course': '开始课程',
  'Solve puzzles': '做题',
  'Study the rules': '研读规则',
  'Join the forum': '加入论坛',
  'Read rules': '阅读规则',
  'Send feedback': '反馈意见',
  'Play the engine': '与引擎对弈',
};

const ZH_HANT: Record<string, string> = {
  // ── headlines ──
  'Both house bots play stronger.': '兩台自家引擎都變強了。',
  'Four times as many xiangqi puzzles.': '象棋題目增至四倍。',
  'Move badges and best lines on every reviewable variant.':
    '所有支援覆盤的棋類都有著法評級與最佳變化。',
  'Separating skill from luck in flip games.': '在翻子棋中區分棋力與運氣。',
  'What Patron support will cost.': '贊助 Mistboard 的價格。',
  'A games database for xiangqi.': '象棋對局庫。',
  'Perpetual check now loses in standard xiangqi.': '標準象棋中長將判負。',
  'Mistboard works on a phone.': 'Mistboard 已適配手機。',
  'Every composition has its own page.': '每則排局都有獨立頁面。',
  'Mistboard reads in Chinese.': 'Mistboard 已支援中文。',
  'Rated games at every time control.': '各種時限都可下等級分對局。',
  'An opening explorer for xiangqi.': '象棋開局庫。',
  'Rated xiangqi is live.': '等級分象棋已上線。',
  'Secret in the Tangerine, both game volumes.': '《橘中祕》全部對局卷。',
  'Classical xiangqi, from the original woodblocks.': '古譜象棋，源自原始刻本。',
  'Correspondence play has launched.': '通信對局已上線。',
  'An analysis board for every game.': '每種棋類都有分析棋盤。',
  'Studies have launched.': '研習已上線。',
  'Mistboard TV is live.': 'Mistboard 電視已上線。',
  'Learn xiangqi from scratch.': '從零開始學象棋。',
  'Xiangqi puzzles have launched.': '象棋題目已上線。',
  'Xiangqi has launched.': '象棋已上線。',
  'Forum and global chat have launched.': '論壇與全站聊天已上線。',
  'Fortress has launched.': '堡壘象棋已上線。',
  'Jungle Chess has launched.': '鬥獸棋已上線。',
  'Flip Jungle has launched.': '翻翻棋已上線。',
  'Drop Mini Xiangqi has launched.': '打入迷你象棋已上線。',
  'Dark Crazyhouse has launched.': '迷霧瘋狂屋已上線。',
  'Dark Crossroads Chess has launched.': '迷霧十字路口西洋棋已上線。',
  'Fog Shogi has launched.': '迷霧將棋已上線。',
  'Kriegspiel is open for alpha play.': '裁判棋已開放內測對局。',
  'Reveal Chess is open for alpha play.': '翻開西洋棋已開放內測對局。',
  'Fog Xiangqi is open for alpha play.': '迷霧象棋已開放內測對局。',
  'Banqi is open for alpha play.': '暗棋已開放內測對局。',
  'Jieqi is open for alpha play.': '揭棋已開放內測對局。',
  'Crossroads Chess has launched.': '十字路口西洋棋已上線。',
  'Fog Chess is open for alpha play.': '迷霧國際象棋已開放內測對局。',
  'Mistboard is in alpha.': 'Mistboard 處於內測階段。',
  'Dark Mini Xiangqi is open for alpha play.': '迷霧迷你象棋已開放內測對局。',
  'Misty 1.0 has launched.': 'Misty 1.0 已上線。',

  // ── bodies ──
  'Misty runs version 1.6 in fog chess, which closes a queen hang it used to walk into. Pikafish now searches jieqi to full depth; it had been stopping early, which made it easier to beat than it should have been.':
    '迷霧國際象棋中的 Misty 已升級到 1.6 版，修正了以往會送后的一類失誤。揭棋中的 Pikafish 現在會搜尋到完整深度；此前它過早停止搜尋，因此比應有的水準更容易被擊敗。',
  'The standard xiangqi set goes from 394 puzzles to 1,605, every one mined from a finished game and checked by the engine before it ships.':
    '標準象棋題庫從 394 題增加到 1,605 題，每一題都取自已結束的對局，並在上線前經過引擎校驗。',
  'The move-judgment badge now sits on the board for all six variants with analysis, not xiangqi alone, and a blunder names the move that refutes it. Jieqi reveal plies get the ranked candidates the engine scored instead of a line, since nothing past a flip is knowable.':
    '著法評級標記現在會顯示在全部六種支援分析的棋類棋盤上，不再只有象棋，漏著還會指出反駁它的具體著法。揭棋的翻子回合不再給出變化，而是列出引擎評分後的候選著法排名，因為翻子之後的局面無法預知。',
  'Half the moves in banqi, jieqi, and flip jungle are dice rolls, so a chess-style review blames you for variance. Game review splits every flip into the decision you made and the tile you got, and the article runs that over 52 human-versus-engine games.':
    '暗棋、揭棋和翻翻棋中有一半的著法取決於運氣，用國際象棋那套覆盤方式會把方差算在你頭上。對局覆盤把每次翻子拆成你做的決策和你翻到的子，文章用 52 局人機對局驗證了這一點。',
  'The Support page lists the monthly amounts, what they include (a profile badge, no gameplay advantage), and the billing and refund terms in full. Checkout is not open yet.':
    '「支持 Mistboard」頁面列出了每月的贊助金額、包含的內容（個人資料上的徽章，不影響對局），以及完整的計費與退款條款。結帳尚未開放。',
  'Search finished games from three sources in one place: the historical corpus, the tournament boards we broadcast, and games played here.':
    '在同一處檢索三個來源的已結束對局：歷史棋譜庫、我們轉播的賽事棋盤，以及在本站下的對局。',
  'Repeating a check forever used to draw. The checker has to vary or lose the game, which is how the published rulesets score it and how the course has always taught it.':
    '此前一直重複將軍會判和。現在長將的一方必須變著，否則判負，這與公布的規則以及本站課程一貫的講法一致。',
  'Every page was swept at phone width: a full-size live board, lobby rows that still name the variant, and real touch targets on the controls you tap.':
    '每個頁面都按手機寬度檢查過：對局棋盤完整顯示，大廳列表仍標明棋類，常用控制項也有足夠大的觸控區域。',
  'Each endgame composition in the library is a page you can link to, and sharing one previews its own diagram rather than the site card.':
    '棋譜庫中的每則排局都有可分享的連結，分享時預覽的是該局自己的棋圖，而不是站點的通用卡片。',
  'Playing, watching, the forum, and the xiangqi rules pages are all available in Simplified and Traditional Chinese. Switch languages in the settings menu.':
    '對局、觀戰、論壇和象棋規則頁面均已提供簡體中文與繁體中文。可在設定選單中切換語言。',
  'Bullet, blitz, and rapid each keep their own rating now, instead of rated meaning 3+2 only. Correspondence stays casual on purpose.':
    '子彈、閃電和快速各自記錄獨立的等級分，不再只有 3+2 才算等級分對局。通信對局仍然只計休閒，這是刻意為之。',
  'Open any position on the analysis board and see what has been played from it, with example games to study and the corpus it came from named on the panel.':
    '在分析棋盤上開啟任意局面，即可看到從這裡走出的著法統計，附範例對局，面板上也註明了資料出自哪個棋譜庫。',
  'Choose Rated in the lobby. Your rating starts at 1500 and appears after it settles.':
    '在大廳選擇「等級分」。等級分從 1500 起算，穩定後顯示。',
  'Both volumes are playable move by move in English: 33 games with every printed variation.':
    '兩卷都可用英文逐著打譜：33 局對弈，含書中全部變著。',
  'Read the earliest printings move by move, with every corrected misprint marked on the board.':
    '逐著閱讀最早的刻本，所有勘正的訛誤都標註在棋盤上。',
  'Post or accept a days-per-move seek, or send a friend a challenge link and play at your own pace.':
    '發布或接受「每著若干天」的約戰，也可以把挑戰連結發給好友，按自己的節奏下棋。',
  'Set up any position, import moves, run a local evaluation, or grade a finished game with server analysis.':
    '擺任意局面、匯入著法、在本機執行評估，或用伺服器分析為已結束的對局評分。',
  'Build shareable analysis boards: draw on the board, comment, branch variations, organize chapters, and publish interactive gamebook lessons.':
    '搭建可分享的分析棋盤：在盤面標註、寫評註、分出變著、整理章節，並發布可互動的教學課程。',
  'Watch live games on the new Watch page, with a channel for every game and an Engines channel for bot-versus-bot matches.':
    '在新的「觀戰」頁面看直播對局，每種棋類都有頻道，另有引擎頻道播放機器人之間的對弈。',
  'A free interactive course: 20 stages and 111 hands-on levels take you from how each piece moves to the named checkmate patterns.':
    '免費的互動課程：20 個階段、111 個實作關卡，從每個棋子怎麼走一直講到有名的殺法。',
  'Tactics mined from real games, with puzzle ratings, hints, and a daily puzzle on the homepage.':
    '從真實對局中挖掘的戰術題，配有題目等級分、提示，首頁還有每日一題。',
  'Standard Chinese chess on the full 9 by 10 board is now first-class on Mistboard: play the Pikafish engine at three strengths, or challenge a friend.':
    '9×10 全盤的標準象棋已成為 Mistboard 的主要棋類：可與三檔強度的 Pikafish 引擎對弈，也可以邀請好友。',
  'The forum is open for game analysis, engine talk, and site feedback, with the homepage global chat available for quick table-talk during live sessions.':
    '論壇已開放，可用於覆盤、討論引擎和回報站點問題；首頁的全站聊天則方便在對局時隨口交流。',
  'Xiangqi with a pocket: every piece moves as in Chinese chess, plus crazyhouse-style drops and the new Treasure. Play the bot or challenge a friend.':
    '帶手牌的象棋：所有棋子走法與象棋相同，另加瘋狂屋式的打入和新增的「寶」。可與機器人對弈或邀請好友。',
  'Rank-based animal chess on a 7 by 9 board with rivers, dens, and traps is live. Challenge a friend or take on the Misty Jungle engine.':
    '按等級吃子的動物棋，7×9 棋盤，有河流、獸穴和陷阱，現已上線。可邀請好友，或挑戰 Misty Jungle 引擎。',
  'Every animal starts face-down on a 4 by 4 board and flips as you play. Challenge a friend or the engine.':
    '4×4 棋盤上所有動物開局均背面朝上，邊下邊翻。可邀請好友或與引擎對弈。',
  'The 7 by 7 reserve fight is live with no enemy-palace drops, a full rules page, and a 114-ply FSF sample game to study.':
    '7×7 的手牌之爭已上線：不可打入敵方九宮，附完整規則頁，以及一局 114 著的 FSF 範例對局可供研究。',
  'Crazyhouse under Fog of War is now live for invite games, with private hands, captured pieces entering reserve, and drops into the fog.':
    '迷霧下的瘋狂屋已開放邀請對局：手牌不公開，被吃的棋子進入手牌，並可打入迷霧之中。',
  'Crossroads Chess under Fog of War is now live for invite games, with hidden enemy pieces, no check warnings, and the far-rank Try.':
    '迷霧下的十字路口西洋棋已開放邀請對局：敵方棋子隱藏，沒有將軍提示，並保留衝到底線的「觸陣」勝法。',
  'Shogi under Fog of War is now live for invite games, with private hands, drops into the fog, and king capture wins.':
    '迷霧下的將棋已開放邀請對局：手牌不公開，可打入迷霧，擒王即勝。',
  'The original hidden-information chess: see only your own pieces, try moves through the umpire, and challenge a friend to a match.':
    '最早的隱藏資訊西洋棋：只看得見自己的棋子，透過裁判試著法，可邀請好友對局。',
  'Standard chess with a hidden starting arrangement: every piece but the king begins face-down and reveals its true identity the moment it moves. Challenge a friend to a match.':
    '開局擺法隱藏的西洋棋：除王以外的棋子開局均背面朝上，一走動就亮明真實身分。可邀請好友對局。',
  'Fog of War on the full 9 by 10 xiangqi board: each side sees only the points its pieces reach. Challenge a friend to a match.':
    '9×10 全盤象棋上的迷霧：每一方只看得見自己棋子能到達的點位。可邀請好友對局。',
  'Banqi on an 8 by 4 board: all 32 pieces start face-down and flip as you play. Challenge a friend to a match.':
    '8×4 棋盤上的暗棋：32 枚棋子開局均背面朝上，邊下邊翻。可邀請好友對局。',
  'Hidden-identity xiangqi: every non-general piece starts face-down and reveals as it moves. Take on PikaJieQi, our jieqi engine.':
    '隱藏身分的象棋：除將帥外的棋子開局均背面朝上，走動時翻開。可挑戰我們的揭棋引擎 PikaJieQi。',
  'A 6 by 8 chess-xiangqi variant with checkmate and king-race wins is now live on Mistboard.':
    '融合西洋棋與象棋的 6×8 變體已在 Mistboard 上線，可將死取勝，也可比拼王的衝刺。',
  'Fog of War chess is live on Mistboard, with private vision, no check warnings, and king capture wins.':
    '迷霧國際象棋已在 Mistboard 上線：視野不公開，沒有將軍提示，擒王即勝。',
  'Casual dark chess is open. Rated beta is coming.': '休閒迷霧棋已開放，等級分公測即將推出。',
  'A smaller Fog of War variant on a 7 by 7 xiangqi board, with Misty engine support.':
    '7×7 象棋棋盤上的小型迷霧變體，支援 Misty 引擎。',
  'Our Fog of War dark chess engine is now live to play.': '我們的迷霧國際象棋引擎現已開放對弈。',

  // ── CTA labels ──
  'Search the games': '檢索對局',
  'See the amounts': '查看贊助金額',
  'See the leaderboard': '查看排行榜',
  'Open volume one': '開啟第一卷',
  'Browse the studies': '瀏覽研習',
  'Find a game': '找一局棋',
  'Read the article': '閱讀文章',
  'Open the board': '開啟棋盤',
  'Browse studies': '瀏覽研習',
  'Watch now': '立即觀戰',
  'Start the course': '開始課程',
  'Solve puzzles': '做題',
  'Study the rules': '研讀規則',
  'Join the forum': '加入論壇',
  'Read rules': '閱讀規則',
  'Send feedback': '回報意見',
  'Play the engine': '與引擎對弈',
};

const ANNOUNCEMENT_DICTS: Record<AnnouncementLang, Record<string, string>> = {
  'zh-Hans': ZH_HANS,
  'zh-Hant': ZH_HANT,
};

function dictFor(locale: Locale): Record<string, string> | null {
  return locale === 'zh-Hans' || locale === 'zh-Hant' ? ANNOUNCEMENT_DICTS[locale] : null;
}

/** Translate one announcement string, falling back to the English source. */
export function localizeAnnouncementString(text: string, locale: Locale): string {
  return dictFor(locale)?.[text] ?? text;
}

/**
 * Localized copy of an announcement. English (or any locale without a
 * dictionary) returns the entry untouched, so callers can render the result
 * unconditionally.
 */
export function localizeAnnouncement(entry: Announcement, locale: Locale): Announcement {
  const dict = dictFor(locale);
  if (!dict) return entry;
  return {
    ...entry,
    headline: dict[entry.headline] ?? entry.headline,
    body: entry.body === undefined ? undefined : (dict[entry.body] ?? entry.body),
    cta: entry.cta === undefined ? undefined : (dict[entry.cta] ?? entry.cta),
  };
}

export function hasAnnouncementTranslation(lang: AnnouncementLang, text: string): boolean {
  return Object.hasOwn(ANNOUNCEMENT_DICTS[lang], text);
}

export function announcementTranslationKeys(lang: AnnouncementLang): string[] {
  return Object.keys(ANNOUNCEMENT_DICTS[lang]);
}
