// Review zh-Hant translations. Shipped inside the lazy zh-Hant locale
// chunk (src/i18n/locales/zh-hant.ts). Never import this module statically from
// entry-reachable code: that puts the strings back in the entry chunk for
// every visitor. The type-only import keeps the compile-time key check
// without creating a runtime edge back to the English catalog.

import type { ReviewI18nKey } from './review.js';

export const ZH_HANT_REVIEW = {
  'replay.move': '回合',
  'replay.start': '開始',
  'replay.previous': '上一步',
  'replay.next': '下一步',
  'replay.red': '紅方',
  'replay.black': '黑方',
  'replay.white': '白方',
  'watch.humanVsEngine': '人類對引擎',
  'watch.engineVsEngine': '引擎對引擎',
  'watch.humanVsHuman': '人類對人類',
  'watch.redWins': '紅方獲勝',
  'watch.blackWins': '黑方獲勝',
  'watch.byReason': '原因：{reason}',
  'watch.plyCount': '{count} 手',
  'watch.plyProgress': '第 {current} / {total} 手',
  'watch.plyProgressResult': '第 {current} / {total} 手 - {result}',
  'watch.untimed': '不限時',
  'watch.truth': '真實局面',
  'watch.firstMove': '第一手',
  'watch.previousMove': '上一手',
  'watch.playPause': '播放 / 暫停',
  'watch.nextMove': '下一手',
  'watch.lastMove': '最後一手',
  'watch.flipBoards': '翻轉棋盤',
  'watch.play': '播放',
  'watch.pause': '暫停',
  'watch.reveal': '揭示',
  'watch.hide': '隱藏',
  'watch.revealHiddenIdentities': '揭示隱藏身分',
  'watch.revealHiddenIdentitiesShortcut': '揭示隱藏身分（h）',
  'watch.gameLoadFailed': '無法載入這盤棋。',
} satisfies Partial<Record<ReviewI18nKey, string>>;
