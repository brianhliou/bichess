// Study annotation controls for the current tree node: a glyph (NAG) picker, a
// free-text comment box, and a clear-shapes button. Pure DOM + callbacks — it
// owns no tree state; xiangqi-review wires the callbacks to tree.annotateAt on the
// current path and calls setAnnotations() on every navigation to load the node's
// values. Shapes themselves are drawn on the board (right-drag); this panel only
// offers a clear-all for them.

import { t } from '../i18n/catalog.js';
import type { ReviewI18nKey } from '../i18n/catalogs/review.js';
import type { NodeAnnotations } from './game-tree.js';
import './annotations-editor.css';

/** The six standard move glyphs, in NAG code order. User-set here; kept distinct
 *  from the engine judgment glyph the move list derives from analysis. */
const GLYPHS: ReadonlyArray<{ code: number; label: string; titleKey: ReviewI18nKey }> = [
  { code: 1, label: '!', titleKey: 'annotate.goodMove' },
  { code: 3, label: '!!', titleKey: 'annotate.brilliantMove' },
  { code: 5, label: '!?', titleKey: 'annotate.interestingMove' },
  { code: 6, label: '?!', titleKey: 'annotate.dubiousMove' },
  { code: 2, label: '?', titleKey: 'annotate.mistake' },
  { code: 4, label: '??', titleKey: 'annotate.blunder' },
];

export interface AnnotationEditorOptions {
  /** Toggle a glyph on the current node; `null` clears it. */
  onGlyph(code: number | null): void;
  /** Set (or clear, when empty) the current node's comment. Fires per keystroke —
   *  the handler must NOT re-render the board (it would drop the caret). */
  onComment(text: string): void;
  /** Remove all drawn shapes from the current node. */
  onClearShapes(): void;
  /** Gamebook (lesson) authoring: show hint + deviation fields for the current node. */
  gamebook?: boolean;
  /** Study-level lesson controls (enable/disable + preview), shown above the
   *  per-position hint fields. Supplying this keeps Lesson discoverable even
   *  before the current chapter has gamebook mode enabled. */
  lessonControls?: HTMLElement;
  /** Practice-mode dock (flag + goal + preview), the sibling of lessonControls. */
  practiceControls?: HTMLElement;
  /** Set the current node's gamebook hint/deviation. Per keystroke; no re-render. */
  onGamebook?(patch: { hint?: string; deviation?: string }): void;
}

export interface AnnotationEditor {
  el: HTMLElement;
  /** Tool bodies for the study's under-board authoring dock. */
  tabs: Array<{ id: string; label: string; body: HTMLElement }>;
  /** Load a node's annotations into the controls (call on every navigation). */
  setAnnotations(annotations: NodeAnnotations | undefined): void;
}

export function createAnnotationEditor(opts: AnnotationEditorOptions): AnnotationEditor {
  const panel = document.createElement('section');
  panel.className = 'annotation-editor';

  const glyphPanel = document.createElement('section');
  glyphPanel.className = 'annotation-editor annotation-editor--glyphs';
  const glyphRow = document.createElement('div');
  glyphRow.className = 'annotation-editor__glyphs';
  const glyphButtons = new Map<number, HTMLButtonElement>();
  for (const glyph of GLYPHS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'annotation-editor__glyph';
    button.textContent = glyph.label;
    button.title = t(glyph.titleKey);
    button.addEventListener('click', () => {
      const active = button.classList.contains('annotation-editor__glyph--active');
      opts.onGlyph(active ? null : glyph.code);
    });
    glyphButtons.set(glyph.code, button);
    glyphRow.append(button);
  }

  const clearShapes = document.createElement('button');
  clearShapes.type = 'button';
  clearShapes.className = 'annotation-editor__clear-shapes';
  clearShapes.textContent = 'Clear shapes';
  clearShapes.title = t('annotate.clearShapes');
  clearShapes.addEventListener('click', () => opts.onClearShapes());
  glyphRow.append(clearShapes);

  glyphPanel.append(glyphRow);

  const commentPanel = document.createElement('section');
  commentPanel.className = 'annotation-editor annotation-editor--comment';
  const comment = document.createElement('textarea');
  comment.className = 'annotation-editor__comment';
  comment.rows = 2;
  comment.placeholder = 'Add a note on this move…';
  comment.addEventListener('input', () => opts.onComment(comment.value));

  commentPanel.append(comment);
  panel.append(commentPanel, glyphPanel);

  // Gamebook (lesson) fields: hint (revealed on demand) + deviation (shown when the
  // learner leaves this line). Only rendered in lesson-authoring mode.
  const lessonPanel = document.createElement('section');
  lessonPanel.className = 'annotation-editor annotation-editor--lesson';
  if (opts.lessonControls) lessonPanel.append(opts.lessonControls);
  if (opts.practiceControls) lessonPanel.append(opts.practiceControls);
  let hint: HTMLTextAreaElement | null = null;
  let deviation: HTMLTextAreaElement | null = null;
  if (opts.gamebook) {
    hint = document.createElement('textarea');
    hint.className = 'annotation-editor__gamebook-field';
    hint.rows = 2;
    hint.placeholder = 'Hint (revealed on demand)…';
    deviation = document.createElement('textarea');
    deviation.className = 'annotation-editor__gamebook-field';
    deviation.rows = 2;
    deviation.placeholder = 'If they play a wrong move…';
    const emit = (): void =>
      opts.onGamebook?.({ hint: hint?.value ?? '', deviation: deviation?.value ?? '' });
    hint.addEventListener('input', emit);
    deviation.addEventListener('input', emit);
    const section = document.createElement('div');
    section.className = 'annotation-editor__gamebook';
    section.append(hint, deviation);
    lessonPanel.append(section);
  }
  if (lessonPanel.childElementCount > 0) panel.append(lessonPanel);

  function setAnnotations(annotations: NodeAnnotations | undefined): void {
    const active = annotations?.glyphs?.[0];
    for (const [code, button] of glyphButtons) {
      button.classList.toggle('annotation-editor__glyph--active', code === active);
    }
    const text = annotations?.comments?.[0]?.text ?? '';
    if (comment.value !== text) comment.value = text;
    clearShapes.disabled = !annotations?.shapes?.length;
    if (hint) {
      const value = annotations?.gamebook?.hint ?? '';
      if (hint.value !== value) hint.value = value;
    }
    if (deviation) {
      const value = annotations?.gamebook?.deviation ?? '';
      if (deviation.value !== value) deviation.value = value;
    }
  }

  setAnnotations(undefined);
  const tabs = [
    { id: 'comment', label: t('annotate.comment'), body: commentPanel },
    { id: 'glyphs', label: t('annotate.glyphs'), body: glyphPanel },
  ];
  if (lessonPanel.childElementCount > 0) {
    tabs.push({ id: 'lesson', label: t('annotate.lesson'), body: lessonPanel });
  }
  return { el: panel, tabs, setAnnotations };
}
