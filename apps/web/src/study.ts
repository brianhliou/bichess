// Study viewer/editor (/study/:id). Fetches a persisted study, rebuilds each
// chapter's tree from its serialized blob, and mounts the shared xiangqi review
// surface. Chapters show as tabs; switching re-mounts the review for that chapter.
// For the owner, tree edits autosave (debounced) through the version-guarded chapter
// PATCH, and the owner can add/delete chapters. Non-owners get a read/explore view.
// S3 of the study track (multi-chapter); single chapter was S2.

import './game-shell.css';
import './live-xiangqi.css';
import './xiangqi-postgame.css';
import './study.css';
import type { SerializedTree } from './review/tree-serialize.js';
import { mountXiangqiGamebook } from './review/xiangqi-gamebook.js';
import { mountXiangqiReview, type XiangqiReviewHandle } from './review/xiangqi-review.js';
import { buildNav } from './site-shell.js';

type StudyVisibility = 'private' | 'unlisted' | 'public';

type StudyDto = {
  id: string;
  name: string;
  description: string;
  visibility: StudyVisibility;
  isOwner: boolean;
  likeCount: number;
  likedByViewer: boolean;
};

type ChapterDto = {
  id: string;
  name: string;
  variant: string;
  orientation: string;
  root: SerializedTree;
  version: number;
  gamebook: boolean;
};

type LoadResult =
  | { ok: true; study: StudyDto; chapters: ChapterDto[] }
  | { ok: false; status: number };

const EMPTY_TREE: SerializedTree = { version: 1, root: { children: [] } };

export function mountStudy(root: HTMLElement, studyId: string): void {
  root.classList.add('landing-page', 'xiangqi-postgame-route');
  root.replaceChildren(buildNav(), notice('Loading study'));
  void loadStudy(studyId)
    .then((result) => {
      if (result.ok) renderStudy(root, result.study, result.chapters);
      else renderError(root, result.status);
    })
    .catch(() => renderError(root, 0));
}

async function loadStudy(studyId: string): Promise<LoadResult> {
  const response = await fetch(`/api/studies/${encodeURIComponent(studyId)}`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) return { ok: false, status: response.status };
  const body = (await response.json()) as { study: StudyDto; chapters: ChapterDto[] };
  return { ok: true, study: body.study, chapters: body.chapters };
}

function renderStudy(root: HTMLElement, study: StudyDto, chapters: ChapterDto[]): void {
  if (chapters.length === 0) {
    renderError(root, 415);
    return;
  }
  let activeId = chapters[0]!.id;

  const switchTo = (id: string): void => {
    // No-op when already active — otherwise a double-click (two clicks) would
    // re-render and detach the tab label before its dblclick-to-rename fires.
    if (id === activeId) return;
    activeId = id;
    renderActive();
  };

  const addChapter = async (): Promise<void> => {
    const response = await fetch(`/api/studies/${study.id}/chapters`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `Chapter ${chapters.length + 1}`,
        variant: 'xiangqi',
        root: EMPTY_TREE,
      }),
    });
    if (!response.ok) return;
    const { chapter } = (await response.json()) as { chapter: ChapterDto };
    chapters.push(chapter);
    switchTo(chapter.id);
  };

  const removeChapter = async (id: string): Promise<void> => {
    const response = await fetch(`/api/studies/${study.id}/chapters/${id}`, { method: 'DELETE' });
    if (!response.ok) return; // 409 last_chapter is silently a no-op (button is hidden anyway)
    const index = chapters.findIndex((chapter) => chapter.id === id);
    if (index >= 0) chapters.splice(index, 1);
    if (activeId === id) activeId = chapters[0]?.id ?? activeId;
    renderActive();
  };

  // Owner-only: whether the owner is previewing (test-playing) the active gamebook
  // chapter instead of authoring it.
  let previewMode = false;

  const setGamebook = async (chapterId: string, on: boolean): Promise<void> => {
    const chapter = chapters.find((entry) => entry.id === chapterId);
    if (!chapter) return;
    const response = await fetch(`/api/studies/${study.id}/chapters/${chapterId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gamebook: on }),
    });
    if (!response.ok) return;
    chapter.gamebook = on;
    if (!on) previewMode = false;
    renderActive();
  };

  const setPreview = (on: boolean): void => {
    previewMode = on;
    renderActive();
  };

  const renameStudy = async (name: string): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === study.name) return;
    const response = await fetch(`/api/studies/${study.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    });
    if (response.ok) {
      study.name = trimmed;
      renderActive();
    }
  };

  const renameChapter = async (id: string, name: string): Promise<void> => {
    const trimmed = name.trim();
    const chapter = chapters.find((entry) => entry.id === id);
    if (chapter && trimmed && trimmed !== chapter.name) {
      const response = await fetch(`/api/studies/${study.id}/chapters/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (response.ok) chapter.name = trimmed;
    }
    // Always re-render so an in-tab edit input is restored (commit or cancel).
    renderActive();
  };

  function renderActive(): void {
    const chapter = chapters.find((entry) => entry.id === activeId) ?? chapters[0];
    if (chapter?.variant !== 'xiangqi') {
      renderError(root, 415);
      return;
    }
    activeId = chapter.id;

    const chapterActions: ChapterActions = {
      onSwitch: switchTo,
      onAdd: addChapter,
      onRemove: removeChapter,
      onRename: study.isOwner ? (id, name) => void renameChapter(id, name) : undefined,
    };
    const owner: OwnerControls | undefined = study.isOwner
      ? {
          gamebook: chapter.gamebook,
          preview: previewMode,
          onToggleGamebook: (on) => void setGamebook(chapter.id, on),
          onTogglePreview: setPreview,
          onRenameStudy: (name) => void renameStudy(name),
        }
      : undefined;

    root.replaceChildren(buildNav());

    // A gamebook chapter is played (guess-the-move) by viewers and by the owner in
    // preview; the owner authors it in the review board otherwise.
    if (chapter.gamebook && (!study.isOwner || previewMode)) {
      mountXiangqiGamebook(root, {
        tree: chapter.root,
        orientation: chapter.orientation === 'black' ? 'black' : 'red',
        title: study.name,
        summary: chapter.name,
        aside: buildActions(study, chapters, activeId, statusSpan(), chapterActions, owner),
      });
      return;
    }

    let version = chapter.version;
    let handle: XiangqiReviewHandle | null = null;
    const status = statusSpan();

    const save = debounce(() => {
      if (!handle) return;
      status.textContent = 'Saving…';
      status.dataset.state = 'saving';
      const tree = handle.serialize();
      void fetch(`/api/studies/${study.id}/chapters/${chapter.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ root: tree, baseVersion: version }),
      })
        .then(async (response) => {
          if (response.ok) {
            const body = (await response.json()) as { chapter: { version: number } };
            version = body.chapter.version;
            chapter.version = version;
            setStatus(status, 'saved', 'Saved');
            return;
          }
          if (response.status === 409) {
            setStatus(status, 'conflict', 'Edited in another tab — reload to continue');
            return;
          }
          setStatus(status, 'error', 'Save failed');
        })
        .catch(() => setStatus(status, 'error', 'Save failed'));
    }, 700);

    handle = mountXiangqiReview(root, {
      pageClassName: 'xiangqi-review',
      ariaLabel: 'Study',
      eyebrow: study.isOwner ? 'Your study' : 'Study',
      title: study.name,
      summary:
        study.description || (study.isOwner ? 'Draw, comment, and branch — edits autosave.' : ''),
      boardAriaLabel: 'Xiangqi board',
      actions: buildActions(study, chapters, activeId, status, chapterActions, owner),
      gamebookEditing: chapter.gamebook && study.isOwner,
      annotationEditing: study.isOwner,
      initialTree: chapter.root,
      onChange: study.isOwner
        ? () => {
            // Keep the in-memory chapter tree fresh so switching tabs never drops an
            // edit that has not been flushed to the server yet.
            if (handle) chapter.root = handle.serialize();
            status.textContent = 'Editing…';
            status.dataset.state = 'dirty';
            save();
          }
        : undefined,
      moves: [],
      analysis: null,
    });
  }

  renderActive();
}

type ChapterActions = {
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  /** Owner-only: double-click a tab to rename it. Absent for viewers. */
  onRename?: (id: string, name: string) => void;
};

type OwnerControls = {
  gamebook: boolean;
  preview: boolean;
  onToggleGamebook: (on: boolean) => void;
  onTogglePreview: (on: boolean) => void;
  onRenameStudy: (name: string) => void;
};

function statusSpan(): HTMLElement {
  const status = document.createElement('span');
  status.className = 'study-actions__status';
  return status;
}

function buildActions(
  study: StudyDto,
  chapters: ChapterDto[],
  activeId: string,
  status: HTMLElement,
  chapterActions: ChapterActions,
  owner?: OwnerControls,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'study-actions';

  wrap.append(chapterTabs(study, chapters, activeId, chapterActions));

  if (owner) {
    wrap.append(studyNameControl(study, owner.onRenameStudy));
    const active = chapters.find((entry) => entry.id === activeId);
    if (active && chapterActions.onRename) {
      wrap.append(chapterNameControl(active, chapterActions.onRename));
    }
    wrap.append(lessonControls(owner));
    wrap.append(visibilityControl(study));
    wrap.append(status);
  }
  wrap.append(copyLinkButton());
  if (study.visibility === 'public') wrap.append(likeButton(study));
  return wrap;
}

function likeButton(study: StudyDto): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'study-actions__like';
  const render = (): void => {
    button.classList.toggle('is-liked', study.likedByViewer);
    button.textContent = `${study.likedByViewer ? '♥' : '♡'} ${study.likeCount}`;
    button.setAttribute('aria-pressed', String(study.likedByViewer));
    button.setAttribute('aria-label', `${study.likedByViewer ? 'Unlike' : 'Like'} this study`);
  };
  render();
  button.addEventListener('click', () => {
    button.disabled = true;
    void fetch(`/api/studies/${encodeURIComponent(study.id)}/like`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ liked: !study.likedByViewer }),
    })
      .then(async (response) => {
        if (response.status === 401) {
          button.title = 'Sign in to like studies';
          return;
        }
        if (!response.ok) return;
        const state = (await response.json()) as { likeCount: number; likedByViewer: boolean };
        study.likeCount = state.likeCount;
        study.likedByViewer = state.likedByViewer;
        render();
      })
      .finally(() => {
        button.disabled = false;
      });
  });
  return button;
}

function studyNameControl(study: StudyDto, onRename: (name: string) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'study-actions__row';
  const label = document.createElement('span');
  label.className = 'study-actions__label';
  label.textContent = 'Name';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'study-actions__name';
  input.value = study.name;
  input.maxLength = 100;
  input.setAttribute('aria-label', 'Study name');
  input.addEventListener('change', () => onRename(input.value));
  row.append(label, input);
  return row;
}

function lessonControls(owner: OwnerControls): HTMLElement {
  const row = document.createElement('div');
  row.className = 'study-actions__row';
  const label = document.createElement('span');
  label.className = 'study-actions__label';
  label.textContent = 'Lesson';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = owner.gamebook
    ? 'study-actions__vis study-actions__vis--active'
    : 'study-actions__vis';
  toggle.textContent = owner.gamebook ? 'On' : 'Off';
  toggle.addEventListener('click', () => owner.onToggleGamebook(!owner.gamebook));
  row.append(label, toggle);
  if (owner.gamebook) {
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'study-actions__copy';
    preview.textContent = owner.preview ? 'Back to editing' : 'Preview';
    preview.addEventListener('click', () => owner.onTogglePreview(!owner.preview));
    row.append(preview);
  }
  return row;
}

function chapterTabs(
  study: StudyDto,
  chapters: ChapterDto[],
  activeId: string,
  actions: ChapterActions,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'study-actions__chapters';
  for (const chapter of chapters) {
    const tab = document.createElement('div');
    tab.className = 'study-actions__chapter';
    if (chapter.id === activeId) tab.classList.add('study-actions__chapter--active');
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'study-actions__chapter-label';
    label.textContent = chapter.name;
    label.addEventListener('click', () => actions.onSwitch(chapter.id));
    tab.append(label);
    // Owners can delete any chapter but the last (server enforces; hide when one).
    if (study.isOwner && chapters.length > 1) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'study-actions__chapter-del';
      del.textContent = '×';
      del.title = 'Delete chapter';
      del.addEventListener('click', () => actions.onRemove(chapter.id));
      tab.append(del);
    }
    row.append(tab);
  }
  if (study.isOwner) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'study-actions__chapter-add';
    add.textContent = '+ Chapter';
    add.addEventListener('click', () => actions.onAdd());
    row.append(add);
  }
  return row;
}

function chapterNameControl(
  chapter: ChapterDto,
  onRename: (id: string, name: string) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'study-actions__row';
  const label = document.createElement('span');
  label.className = 'study-actions__label';
  label.textContent = 'Chapter';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'study-actions__name';
  input.value = chapter.name;
  input.maxLength = 80;
  input.setAttribute('aria-label', 'Chapter name');
  input.addEventListener('change', () => onRename(chapter.id, input.value));
  row.append(label, input);
  return row;
}

function visibilityControl(study: StudyDto): HTMLElement {
  const visibility = document.createElement('div');
  visibility.className = 'study-actions__visibility';
  let current = study.visibility;
  const options: StudyVisibility[] = ['private', 'unlisted', 'public'];
  const buttons = new Map<StudyVisibility, HTMLButtonElement>();
  const paint = (): void => {
    for (const [value, button] of buttons) {
      button.classList.toggle('study-actions__vis--active', value === current);
    }
  };
  for (const value of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'study-actions__vis';
    button.textContent = value;
    button.addEventListener('click', () => {
      const previous = current;
      current = value;
      study.visibility = value;
      paint();
      void fetch(`/api/studies/${study.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visibility: value }),
      }).then((response) => {
        if (!response.ok) {
          current = previous;
          study.visibility = previous;
          paint();
        }
      });
    });
    buttons.set(value, button);
    visibility.append(button);
  }
  paint();
  return labelled('Visibility', visibility);
}

function copyLinkButton(): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'study-actions__copy';
  button.textContent = 'Copy link';
  button.addEventListener('click', () => {
    void navigator.clipboard?.writeText(window.location.href).then(
      () => {
        button.textContent = 'Copied';
        window.setTimeout(() => {
          button.textContent = 'Copy link';
        }, 1500);
      },
      () => {},
    );
  });
  return button;
}

function labelled(label: string, control: HTMLElement): HTMLElement {
  const row = document.createElement('div');
  row.className = 'study-actions__row';
  const span = document.createElement('span');
  span.className = 'study-actions__label';
  span.textContent = label;
  row.append(span, control);
  return row;
}

function setStatus(el: HTMLElement, state: string, text: string): void {
  el.dataset.state = state;
  el.textContent = text;
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

function notice(text: string): HTMLElement {
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__notice';
  const heading = document.createElement('h1');
  heading.textContent = text;
  shell.append(heading);
  return shell;
}

function renderError(root: HTMLElement, status: number): void {
  const shell = document.createElement('main');
  shell.className = 'dxq-postgame__error';
  const title = document.createElement('h1');
  title.textContent = status === 404 ? 'Study not found' : 'Study unavailable';
  const body = document.createElement('p');
  body.textContent =
    status === 404
      ? 'This study is private or does not exist.'
      : status === 415
        ? 'This study uses a variant that is not supported yet.'
        : 'The study could not be loaded.';
  shell.append(title, body);
  root.replaceChildren(buildNav(), shell);
}
