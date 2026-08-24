// Shared localized chrome for the article replay steppers (the banqi/jungle
// steppers carry their own richer tables with flip vocabulary; everything else
// uses this one). Copy rides per stepper family: the intro line names who moves
// first and the mover labels match that family's sides.
import type { ArticleLang } from './article-i18n.js';

export type ReplayStepperFamily = 'xiangqi' | 'chess' | 'shogi' | 'crossroads' | 'jieqi';

export type ReplayStepperCopy = {
  firstRole: string;
  secondRole: string;
  firstMove: string;
  previousMove: string;
  nextMove: string;
  lastMove: string;
  sliderLabel: string;
  start: string;
  intro: string;
  movePrefix: (moveNumber: number) => string;
  first: string;
  second: string;
  /** Suffix for the hand/reserve strip label ("Red reserve", "Sente hand"). */
  pocket: string;
  noPieces: string;
};

type FamilyStrings = { intro: string; first: string; second: string; pocket: string };

const COMMON: Record<
  ArticleLang | 'en',
  Omit<ReplayStepperCopy, keyof FamilyStrings | 'firstRole' | 'secondRole'>
> = {
  en: {
    firstMove: 'First move',
    previousMove: 'Previous move',
    nextMove: 'Next move',
    lastMove: 'Last move',
    sliderLabel: 'Move',
    start: 'Start',
    movePrefix: (moveNumber) => `Move ${moveNumber}`,
    noPieces: 'No pieces',
  },
  'zh-Hans': {
    firstMove: '第一步',
    previousMove: '上一步',
    nextMove: '下一步',
    lastMove: '最后一步',
    sliderLabel: '着法',
    start: '开始',
    movePrefix: (moveNumber) => `第 ${moveNumber} 回合`,
    noPieces: '无持子',
  },
  'zh-Hant': {
    firstMove: '第一步',
    previousMove: '上一步',
    nextMove: '下一步',
    lastMove: '最後一步',
    sliderLabel: '著法',
    start: '開始',
    movePrefix: (moveNumber) => `第 ${moveNumber} 回合`,
    noPieces: '無持子',
  },
};

const FAMILIES: Record<ReplayStepperFamily, Record<ArticleLang | 'en', FamilyStrings>> = {
  xiangqi: {
    en: {
      intro: 'Step through the moves. Red moves first.',
      first: 'Red',
      second: 'Black',
      pocket: ' reserve',
    },
    'zh-Hans': {
      intro: '逐步回放这盘棋。红方先走。',
      first: '红方',
      second: '黑方',
      pocket: '手牌',
    },
    'zh-Hant': {
      intro: '逐步回放這盤棋。紅方先走。',
      first: '紅方',
      second: '黑方',
      pocket: '手牌',
    },
  },
  chess: {
    en: {
      intro: 'Step through the moves. White moves first.',
      first: 'White',
      second: 'Black',
      pocket: ' reserve',
    },
    'zh-Hans': {
      intro: '逐步回放这盘棋。白方先走。',
      first: '白方',
      second: '黑方',
      pocket: '手牌',
    },
    'zh-Hant': {
      intro: '逐步回放這盤棋。白方先走。',
      first: '白方',
      second: '黑方',
      pocket: '手牌',
    },
  },
  shogi: {
    en: {
      intro: 'Step through the moves. Sente moves first.',
      first: 'Sente',
      second: 'Gote',
      pocket: ' hand',
    },
    'zh-Hans': {
      intro: '逐步回放这盘棋。先手先走。',
      first: '先手',
      second: '后手',
      pocket: '手牌',
    },
    'zh-Hant': {
      intro: '逐步回放這盤棋。先手先走。',
      first: '先手',
      second: '後手',
      pocket: '手牌',
    },
  },
  crossroads: {
    en: {
      intro: 'Step through the game. White moves first.',
      first: 'White',
      second: 'Red',
      pocket: ' reserve',
    },
    'zh-Hans': {
      intro: '逐步回放这盘棋。白方先走。',
      first: '白方',
      second: '红方',
      pocket: '手牌',
    },
    'zh-Hant': {
      intro: '逐步回放這盤棋。白方先走。',
      first: '白方',
      second: '紅方',
      pocket: '手牌',
    },
  },
  jieqi: {
    en: {
      intro: 'Step through the game. Red moves first; dark pieces flip as they move.',
      first: 'Red',
      second: 'Black',
      pocket: ' reserve',
    },
    'zh-Hans': {
      intro: '逐步回放这盘棋。红方先走；暗子走动时翻开亮明身份。',
      first: '红方',
      second: '黑方',
      pocket: '手牌',
    },
    'zh-Hant': {
      intro: '逐步回放這盤棋。紅方先走；暗子走動時翻開亮明身分。',
      first: '紅方',
      second: '黑方',
      pocket: '手牌',
    },
  },
};

export function replayStepperCopy(
  lang: ArticleLang | undefined,
  family: ReplayStepperFamily,
): ReplayStepperCopy {
  const key = lang ?? 'en';
  const strings = FAMILIES[family][key];
  return {
    ...COMMON[key],
    ...strings,
    firstRole: ` (${strings.first})`,
    secondRole: ` (${strings.second})`,
  };
}
