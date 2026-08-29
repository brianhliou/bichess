import { afterEach, describe, expect, it, vi } from 'vitest';
import { embedStudyRouteFromPath } from './embed-route.js';
import { mountEmbedStudy } from './embed-study-page.js';

const CHAPTER = {
  id: 'Ue0EgpS7',
  name: '1956 · The first national championship',
  orientation: 'red',
  tags: { red: 'Li Yiting', black: 'Yang Guanlin', event: '1956', result: '1-0' },
  root: {
    root: {
      children: [
        { uci: 'h3e3', annotations: { glyphs: [6] }, children: [{ uci: 'h8e8' }] },
        { uci: 'b1c3' },
      ],
    },
  },
};

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('embedStudyRouteFromPath', () => {
  it('matches a study chapter path and nothing else', () => {
    expect(embedStudyRouteFromPath('/embed/study/abc/def')).toEqual({
      studyId: 'abc',
      chapterId: 'def',
    });
    expect(embedStudyRouteFromPath('/embed/study/abc/def/')).not.toBeNull();
    for (const bad of ['/embed/study/abc', '/embed/study', '/study/abc/def', '/embed/game/a/b']) {
      expect(embedStudyRouteFromPath(bad), bad).toBeNull();
    }
  });

  it('refuses ids that are not id-shaped', () => {
    // The route is frameable by anyone, so its inputs are hostile by default.
    expect(embedStudyRouteFromPath('/embed/study/../../etc/passwd')).toBeNull();
    expect(embedStudyRouteFromPath('/embed/study/a b/c')).toBeNull();
  });
});

describe('mountEmbedStudy', () => {
  it('renders the chapter as a board with a link back to the source', async () => {
    stubFetch(200, { study: { id: 's' }, chapters: [CHAPTER] });
    const root = document.createElement('div');
    document.body.append(root);
    await mountEmbedStudy(root, { studyId: 's', chapterId: 'Ue0EgpS7' });

    expect(root.querySelector('.xq-replay')).not.toBeNull();
    expect(root.querySelector('svg')).not.toBeNull();
    const credit = root.querySelector<HTMLAnchorElement>('.embed-credit');
    expect(credit?.getAttribute('href')).toBe('/study/s/Ue0EgpS7');
    // It opens out of the frame it is living in.
    expect(credit?.getAttribute('target')).toBe('_blank');
    expect(credit?.getAttribute('rel')).toBe('noopener');
    root.remove();
  });

  it('says a private or missing study is unavailable rather than looking broken', async () => {
    stubFetch(404, { error: 'not_found' });
    const root = document.createElement('div');
    await mountEmbedStudy(root, { studyId: 's', chapterId: 'c' });
    expect(root.textContent).toContain('not available');
    expect(root.querySelector('.xq-replay')).toBeNull();
  });

  it('handles a chapter that is not in the study', async () => {
    stubFetch(200, { study: { id: 's' }, chapters: [CHAPTER] });
    const root = document.createElement('div');
    await mountEmbedStudy(root, { studyId: 's', chapterId: 'nope' });
    expect(root.textContent).toContain('chapter is not available');
  });

  it('handles a chapter with no moves', async () => {
    stubFetch(200, {
      study: { id: 's' },
      chapters: [{ id: 'empty', name: 'Empty', root: { root: { children: [] } } }],
    });
    const root = document.createElement('div');
    await mountEmbedStudy(root, { studyId: 's', chapterId: 'empty' });
    expect(root.textContent).toContain('no moves');
  });

  it('does not throw when the network fails', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });
    const root = document.createElement('div');
    await expect(mountEmbedStudy(root, { studyId: 's', chapterId: 'c' })).resolves.toBeUndefined();
    expect(root.textContent).toContain('could not be loaded');
  });
});
