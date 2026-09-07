// Chinese for the generated per-move comments the annotated-game studies write.
//
// Extracted because two programs build annotated xiangqi studies and only one of
// them translated: seed-xiangqi-champions-study.ts wrote every judgment comment
// with a zh-Hans/zh-Hant overlay, and scripts/world-title-study.mjs -- the same
// comments, generated from the same analysis, for the sibling study -- wrote the
// English and nothing else. Fifty-two comments in `Every Xiangqi World Champion`
// rendered in English on a Chinese page while the identical sentence in `Every
// Xiangqi Champion` rendered in Chinese. Two builders of the same content need
// one dictionary, and a test that says they agree.
//
// Translating these is safe in a way translating the chapter blurbs is not: they
// are TEMPLATES. The variable part is a number and a judgment word, the fixed
// part says the same thing every time, and nothing here is prose that needs a
// reader who can check it.
//
// The English sentence itself, and the parser for it, live in
// packages/game/src/xiangqi-judgment-comment.ts -- the web replay renderer needs
// those too, and cannot import from apps/server.
import type { XiangqiJudgment } from '@mistboard/game';

export type JudgmentLang = 'zh-Hans' | 'zh-Hant';

export const JUDGMENT_LANGS: readonly JudgmentLang[] = ['zh-Hans', 'zh-Hant'];

type Localized = Record<JudgmentLang, string>;

const JUDGMENT_ZH: Record<string, Localized> = {
  blunder: { 'zh-Hans': '漏着', 'zh-Hant': '漏著' },
  mistake: { 'zh-Hans': '错着', 'zh-Hant': '錯著' },
  inaccuracy: { 'zh-Hans': '不精确', 'zh-Hant': '不精確' },
};

/** 'mate in 4' is the one eval that is English words rather than a number, so it
 *  is the one that has to be translated rather than passed through. */
function evalTextZh(evalText: string, lang: JudgmentLang): string {
  const mate = /^mate in (\d+)$/i.exec(evalText);
  if (!mate) return evalText;
  return lang === 'zh-Hans' ? `${mate[1]} 步杀` : `${mate[1]} 步殺`;
}

export function judgmentCommentZh(
  { judgment, lost, evalText, hasLine }: XiangqiJudgment,
  lang: JudgmentLang,
): string {
  const label = JUDGMENT_ZH[judgment]?.[lang] ?? judgment;
  const scored = evalTextZh(evalText, lang);
  const evalPart = scored
    ? lang === 'zh-Hans'
      ? `，此后形势 ${scored}`
      : `，此後形勢 ${scored}`
    : '';
  const linePart = hasLine
    ? lang === 'zh-Hans'
      ? '。引擎推荐的着法见旁支。'
      : '。引擎推薦的著法見旁支。'
    : '。';
  return lang === 'zh-Hans'
    ? `${label}：胜率损失 ${lost} 个百分点${evalPart}${linePart}`
    : `${label}：勝率損失 ${lost} 個百分點${evalPart}${linePart}`;
}

export function praiseCommentZh(glyph: string, sacrifice: number, lang: JudgmentLang): string {
  if (glyph === '!!') {
    return lang === 'zh-Hans'
      ? `妙手：弃子 ${sacrifice}，引擎自身的变化确认这一子确实不能收回。`
      : `妙手：棄子 ${sacrifice}，引擎自身的變化確認這一子確實不能收回。`;
  }
  return lang === 'zh-Hans'
    ? '佳着：唯一能抓住对手上一手错误的着法，其余任何走法至少差一个错着。'
    : '佳著：唯一能抓住對手上一手錯誤的著法，其餘任何走法至少差一個錯著。';
}

/** The overlay for one judgment comment, in the shape study-i18n.ts reads off a
 *  tree node's comment. */
export function judgmentCommentI18n(judgment: XiangqiJudgment): Record<JudgmentLang, string> {
  return {
    'zh-Hans': judgmentCommentZh(judgment, 'zh-Hans'),
    'zh-Hant': judgmentCommentZh(judgment, 'zh-Hant'),
  };
}
