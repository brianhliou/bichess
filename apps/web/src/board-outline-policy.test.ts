import { describe, expect, it } from 'vitest';
import { type Article, type ArticleBlock, articles, findArticle } from './articles-data.js';
import { mountBanqiReplay } from './banqi-replay.js';
import { mountJieqiReplay } from './jieqi-replay.js';

type SvgSample = { label: string; svg: string };

function renderSvg(svg: string | (() => string)): string {
  return typeof svg === 'function' ? svg() : svg;
}

function articleBlocks(article: Article): ArticleBlock[] {
  return [...(article.intro ?? []), ...article.sections.flatMap((section) => section.blocks ?? [])];
}

function articleSvgSamples(article: Article): SvgSample[] {
  const samples: SvgSample[] = [];
  if (article.thumbnail?.kind === 'svg') {
    samples.push({ label: `${article.slug}:thumbnail`, svg: renderSvg(article.thumbnail.svg) });
  }
  for (const [index, block] of articleBlocks(article).entries()) {
    if (block.kind === 'raw-svg') {
      samples.push({ label: `${article.slug}:raw-svg:${index}`, svg: renderSvg(block.svg) });
    } else if (block.kind === 'raw-svg-stepper') {
      for (const [step, entry] of block.steps.entries()) {
        samples.push({
          label: `${article.slug}:raw-svg-stepper:${index}:${step}`,
          svg: renderSvg(entry.svg),
        });
      }
    }
  }
  return samples;
}

function duplicatePerimeterOutlines(svg: string): string[] {
  const host = document.createElement('div');
  host.innerHTML = svg;
  const rects = [...host.querySelectorAll('rect')];
  const geometry = (rect: Element): string =>
    ['x', 'y', 'width', 'height', 'rx'].map((name) => rect.getAttribute(name) ?? '').join('|');
  const backgroundGeometry = new Set(
    rects.filter((rect) => rect.getAttribute('fill') !== 'none').map(geometry),
  );

  return rects
    .filter((rect) => {
      const stroke = rect.getAttribute('stroke');
      return (
        rect.getAttribute('fill') === 'none' &&
        stroke !== null &&
        stroke !== 'none' &&
        !rect.hasAttribute('stroke-dasharray') &&
        backgroundGeometry.has(geometry(rect))
      );
    })
    .map((rect) => rect.outerHTML);
}

function expectOutlineFree(sample: SvgSample): void {
  expect(duplicatePerimeterOutlines(sample.svg), sample.label).toEqual([]);
}

describe('board outer-outline policy', () => {
  it('keeps every Xiangqi-family article thumbnail and diagram outline-free', () => {
    const samples = articles
      .filter((article) => article.boardFamily === 'xiangqi')
      .flatMap(articleSvgSamples);
    expect(samples.length).toBeGreaterThan(0);
    for (const sample of samples) expectOutlineFree(sample);
  });

  it('keeps the Reveal and Flip Xiangqi replay widgets outline-free', () => {
    const reveal = findArticle('reveal-xiangqi');
    const flip = findArticle('flip-xiangqi');
    const revealBlock =
      reveal && articleBlocks(reveal).find((block) => block.kind === 'jieqi-replay');
    const flipBlock = flip && articleBlocks(flip).find((block) => block.kind === 'banqi-replay');
    if (!revealBlock || revealBlock.kind !== 'jieqi-replay')
      throw new Error('missing Reveal Xiangqi replay');
    if (!flipBlock || flipBlock.kind !== 'banqi-replay')
      throw new Error('missing Flip Xiangqi replay');

    const revealHost = document.createElement('div');
    const flipHost = document.createElement('div');
    const revealController = mountJieqiReplay(revealHost, revealBlock.spec);
    const flipController = mountBanqiReplay(flipHost, flipBlock.spec);

    expectOutlineFree({ label: 'reveal-xiangqi:replay', svg: revealHost.innerHTML });
    expectOutlineFree({ label: 'flip-xiangqi:replay', svg: flipHost.innerHTML });

    revealController.destroy();
    flipController.destroy();
  });
});
