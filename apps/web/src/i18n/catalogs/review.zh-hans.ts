// Review zh-Hans translations. Shipped inside the lazy zh-Hans locale
// chunk (src/i18n/locales/zh-hans.ts). Never import this module statically from
// entry-reachable code: that puts the strings back in the entry chunk for
// every visitor. The type-only import keeps the compile-time key check
// without creating a runtime edge back to the English catalog.

import type { ReviewI18nKey } from './review.js';

export const ZH_HANS_REVIEW = {
  'replay.move': '回合',
  'replay.start': '开始',
  'replay.previous': '上一步',
  'replay.next': '下一步',
  'replay.red': '红方',
  'replay.black': '黑方',
  'replay.white': '白方',
  'watch.humanVsEngine': '人类对引擎',
  'watch.engineVsEngine': '引擎对引擎',
  'watch.humanVsHuman': '人类对人类',
  'watch.redWins': '红方获胜',
  'watch.blackWins': '黑方获胜',
  'watch.byReason': '原因：{reason}',
  'watch.plyCount': '{count} 手',
  'watch.plyProgress': '第 {current} / {total} 手',
  'watch.plyProgressResult': '第 {current} / {total} 手 - {result}',
  'watch.untimed': '不限时',
  'watch.truth': '真实局面',
  'watch.firstMove': '第一手',
  'watch.previousMove': '上一手',
  'watch.playPause': '播放 / 暂停',
  'watch.nextMove': '下一手',
  'watch.lastMove': '最后一手',
  'watch.flipBoards': '翻转棋盘',
  'watch.play': '播放',
  'watch.pause': '暂停',
  'watch.reveal': '揭示',
  'watch.hide': '隐藏',
  'watch.revealHiddenIdentities': '揭示隐藏身份',
  'watch.revealHiddenIdentitiesShortcut': '揭示隐藏身份（h）',
  'watch.gameLoadFailed': '无法加载这盘棋。',
} satisfies Partial<Record<ReviewI18nKey, string>>;
