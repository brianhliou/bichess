// Prose extraction shared by the translation-coverage test and the
// i18n:coverage reporter. Only strings a reader sees as natural-language copy
// are treated as translatable. Board labels baked into specs and generated SVG,
// and code-block payloads, are deliberately excluded as a separate, known
// localization gap.
import type { Article, ArticleBlock, ArticleSection } from './articles-data.js';

export type Prose = { path: string; text: string };

function decodeSvgText(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

// Every English source string that the article translator can consume. This
// is broader than prose coverage: raw SVG renderers localize their text/title/
// desc nodes separately, so those generated labels are live dictionary keys
// even though they are intentionally excluded from prose-completeness counts.
export function articleTranslationSourceStrings(sourceArticles: readonly Article[]): Set<string> {
  const strings = new Set<string>();
  const collect = (value: unknown, key?: string): void => {
    if (typeof value === 'string') {
      strings.add(value);
      for (const match of value.matchAll(/<(text|title|desc)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
        const visible = decodeSvgText(match[2].replace(/<[^>]+>/g, '')).trim();
        if (visible) strings.add(visible);
      }
      return;
    }
    if (typeof value === 'function') {
      if (key === 'svg') collect((value as () => string)(), key);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) collect(item);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [childKey, item] of Object.entries(value)) collect(item, childKey);
    }
  };
  for (const article of sourceArticles) collect(article);
  return strings;
}

function caption(block: { caption?: string }): string[] {
  return block.caption ? [block.caption] : [];
}

// Stepper step narratives that are pure move notation ("1. c1→b2", "R@c3",
// "d3→d1+") are language-neutral and excluded from translation coverage, the
// same way board labels baked into specs are. Real narrative ("Starting
// position", explanatory text) never contains a move arrow or drop marker.
function isMoveNotation(text: string): boolean {
  return /[→@]/.test(text);
}

// Each block kind declares the prose it contributes. The mapped type is
// exhaustive over ArticleBlock['kind'], so adding a new block kind is a compile
// error here until someone decides what prose (if any) it carries.
const BLOCK_PROSE: {
  [K in ArticleBlock['kind']]: (block: Extract<ArticleBlock, { kind: K }>) => string[];
} = {
  paragraph: (b) => [b.text],
  'sub-heading': (b) => [b.text],
  cta: (b) => b.buttons.map((button) => button.label),
  'static-boards': caption,
  interactive: caption,
  'live-boards': caption,
  'raw-svg': caption,
  'raw-svg-stepper': (b) => [
    ...caption(b),
    ...b.steps.flatMap((step) => {
      const n = step.narrative;
      return n && !isMoveNotation(n) ? [n] : [];
    }),
  ],
  'xq-replay': caption,
  'mxq-replay': caption,
  'drop-mini-xiangqi-replay': caption,
  'fortress-xiangqi-replay': caption,
  'shogi-replay': caption,
  'chess-replay': caption,
  'crossroads-replay': caption,
  'jieqi-replay': caption,
  'banqi-replay': caption,
  'jungle-replay': caption,
  'jungle-flip-replay': caption,
  code: caption,
};

function blockProse(block: ArticleBlock, path: string): Prose[] {
  const extract = BLOCK_PROSE[block.kind] as (b: ArticleBlock) => string[];
  return extract(block).map((text, i) => ({ path: `${path}.${block.kind}[${i}]`, text }));
}

function sectionProse(section: ArticleSection, path: string): Prose[] {
  const out: Prose[] = [{ path: `${path}.heading`, text: section.heading }];
  (section.paragraphs ?? []).forEach((p, i) => {
    out.push({ path: `${path}.paragraphs[${i}]`, text: p });
  });
  (section.blocks ?? []).forEach((b, i) => {
    out.push(...blockProse(b, `${path}.blocks[${i}]`));
  });
  return out;
}

// Every natural-language string an article contributes, each with a dotted path
// for diagnostics. Order is stable: title, summary, tldr, intro, then sections.
export function articleProse(article: Article): Prose[] {
  const out: Prose[] = [
    { path: 'title', text: article.title },
    { path: 'summary', text: article.summary },
  ];
  (article.tldr ?? []).forEach((t, i) => {
    out.push({ path: `tldr[${i}]`, text: t });
  });
  (article.intro ?? []).forEach((b, i) => {
    out.push(...blockProse(b, `intro[${i}]`));
  });
  article.sections.forEach((s, i) => {
    out.push(...sectionProse(s, `sections[${i}]`));
  });
  return out;
}
