import { describe, expect, it, vi } from 'vitest';
import type { SerializedTree } from './review/tree-serialize.js';
import {
  buildStudyRail,
  clearTreeAnnotations,
  keepTreeMainline,
  moveChapterId,
  openStudySaveRecoveryDialog,
} from './study-controls.js';

const tree: SerializedTree = {
  version: 1,
  rootFen: 'root position',
  root: {
    annotations: { comments: [{ text: 'Introduction' }] },
    children: [
      {
        uci: 'a1a2',
        annotations: { glyphs: [1] },
        children: [
          {
            uci: 'a8a7',
            annotations: { shapes: [{ kind: 'circle', orig: 'a7', brush: 'green' }] },
            children: [],
          },
          { uci: 'b8b7', children: [] },
        ],
      },
      { uci: 'b1b2', annotations: { comments: [{ text: 'Sideline' }] }, children: [] },
    ],
  },
};

describe('study creator tree actions', () => {
  it('clears every annotation without changing the move tree or root position', () => {
    const cleared = clearTreeAnnotations(tree);

    expect(cleared.rootFen).toBe('root position');
    expect(cleared.root.annotations).toBeUndefined();
    expect(cleared.root.children[0]?.annotations).toBeUndefined();
    expect(cleared.root.children[0]?.children[0]?.annotations).toBeUndefined();
    expect(cleared.root.children.map((node) => node.uci)).toEqual(['a1a2', 'b1b2']);
    expect(tree.root.annotations).toBeDefined();
  });

  it('keeps children[0] as the main line at every branch', () => {
    const mainline = keepTreeMainline(tree);

    expect(mainline.root.children.map((node) => node.uci)).toEqual(['a1a2']);
    expect(mainline.root.children[0]?.children.map((node) => node.uci)).toEqual(['a8a7']);
    expect(mainline.root.children[0]?.annotations?.glyphs).toEqual([1]);
    expect(tree.root.children).toHaveLength(2);
  });
});

describe('study chapter rail', () => {
  it('moves chapters without mutating the source order', () => {
    const ids = ['one', 'two', 'three'];
    expect(moveChapterId(ids, 'one', 2)).toEqual(['two', 'three', 'one']);
    expect(moveChapterId(ids, 'three', -4)).toEqual(['three', 'one', 'two']);
    expect(moveChapterId(ids, 'missing', 1)).toEqual(ids);
    expect(ids).toEqual(['one', 'two', 'three']);
  });

  it('keeps owner settings contextual and routes chapter actions', () => {
    const onSwitch = vi.fn();
    const onAdd = vi.fn();
    const onOpenStudySettings = vi.fn();
    const onOpenChapterSettings = vi.fn();
    const onReorder = vi.fn(async () => null);
    const rail = buildStudyRail(
      {
        id: 'study-1',
        name: 'Cannon manual',
        description: '',
        visibility: 'private',
        isOwner: true,
        featuredAt: null,
        canFeature: false,
      },
      [
        { id: 'one', name: 'Central cannon', gamebook: false, orientation: 'red' },
        { id: 'two', name: 'Wing attack', gamebook: true, orientation: 'red' },
      ],
      'one',
      document.createElement('span'),
      {
        onSwitch,
        onAdd,
        chapterHref: (id) => `/study/study-1/${id}`,
        onReorder,
        onToggleFeatured: vi.fn(async () => null),
        onOpenStudySettings,
        onOpenChapterSettings,
      },
    );

    expect(rail.querySelector('.study-chapters__head')?.textContent).toContain('2 Chapters');
    expect(rail.querySelectorAll('.study-chapters__row')).toHaveLength(2);
    expect(rail.querySelectorAll('.study-chapters__chapter-settings')).toHaveLength(2);
    expect(rail.querySelector('.study-chapters__row.is-active')).not.toBeNull();

    rail.querySelector<HTMLButtonElement>('.study-chapters__settings')?.click();
    const links = rail.querySelectorAll<HTMLAnchorElement>('.study-chapters__link');
    expect(links[1]?.getAttribute('href')).toBe('/study/study-1/two');
    links[1]?.click();
    rail.querySelectorAll<HTMLButtonElement>('.study-chapters__chapter-settings')[1]?.click();
    rail
      .querySelectorAll<HTMLButtonElement>('.study-chapters__drag')[0]
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    rail.querySelector<HTMLButtonElement>('.study-chapters__add')?.click();

    expect(onOpenStudySettings).toHaveBeenCalledOnce();
    expect(onSwitch).toHaveBeenCalledWith('two');
    expect(onOpenChapterSettings).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'two', name: 'Wing attack' }),
    );
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onReorder).toHaveBeenCalledWith(['two', 'one']);
  });

  it('shows readers the same chapter navigation without owner controls', () => {
    const rail = buildStudyRail(
      {
        id: 'study-1',
        name: 'Cannon manual',
        description: '',
        visibility: 'public',
        isOwner: false,
        featuredAt: null,
        canFeature: false,
      },
      [{ id: 'one', name: 'Central cannon', gamebook: false, orientation: 'red' }],
      'one',
      document.createElement('span'),
      {
        onSwitch: vi.fn(),
        onAdd: vi.fn(),
        chapterHref: (id) => `/study/study-1/${id}`,
        onReorder: vi.fn(async () => null),
        onToggleFeatured: vi.fn(async () => null),
        onOpenStudySettings: vi.fn(),
        onOpenChapterSettings: vi.fn(),
      },
    );

    expect(rail.querySelector('.study-chapters__settings')).toBeNull();
    expect(rail.querySelector('.study-chapters__chapter-settings')).toBeNull();
    expect(rail.querySelector('.study-chapters__drag')).toBeNull();
    expect(rail.querySelector('.study-chapters__add')).toBeNull();
  });
});

describe('study save recovery', () => {
  it('requires an explicit choice before replacing either chapter copy', async () => {
    const onKeepLocal = vi.fn(async () => true);
    const onUseServer = vi.fn();

    openStudySaveRecoveryDialog({ onKeepLocal, onUseServer });
    const dialog = document.querySelector<HTMLDialogElement>(
      'dialog[data-study-dialog="save-recovery"]',
    );
    expect(dialog?.textContent).toContain('Your local edits are safe on this device.');
    expect(dialog?.textContent).toContain('Keep my draft');
    expect(dialog?.textContent).toContain('Use server copy');

    [...(dialog?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
      .find((button) => button.textContent === 'Keep my draft')
      ?.click();
    await vi.waitFor(() => expect(onKeepLocal).toHaveBeenCalledOnce());
    expect(onUseServer).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(dialog?.isConnected).toBe(false));
  });
});
