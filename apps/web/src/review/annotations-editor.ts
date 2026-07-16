// Study annotation controls for the current tree node: a glyph (NAG) picker, a
// free-text comment box, and a clear-shapes button. Pure DOM + callbacks — it
// owns no tree state; xiangqi-review wires the callbacks to tree.annotateAt on the
// current path and calls setAnnotations() on every navigation to load the node's
// values. Shapes themselves are drawn on the board (right-drag); this panel only
// offers a clear-all for them.

import type { NodeAnnotations } from './game-tree.js';
import './annotations-editor.css';

/** The six standard move glyphs, in NAG code order. User-set here; kept distinct
 *  from the engine judgment glyph the move list derives from analysis. */
const GLYPHS: ReadonlyArray<{ code: number; label: string; title: string }> = [
  { code: 1, label: '!', title: 'Good move' },
  { code: 3, label: '!!', title: 'Brilliant move' },
  { code: 5, label: '!?', title: 'Interesting move' },
  { code: 6, label: '?!', title: 'Dubious move' },
  { code: 2, label: '?', title: 'Mistake' },
  { code: 4, label: '??', title: 'Blunder' },
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
  /** Set the current node's gamebook hint/deviation. Per keystroke; no re-render. */
  onGamebook?(patch: { hint?: string; deviation?: string }): void;
}

export interface AnnotationEditor {
  el: HTMLElement;
  /** Load a node's annotations into the controls (call on every navigation). */
  setAnnotations(annotations: NodeAnnotations | undefined): void;
}

export function createAnnotationEditor(opts: AnnotationEditorOptions): AnnotationEditor {
  const panel = document.createElement('section');
  panel.className = 'annotation-editor';

  const glyphRow = document.createElement('div');
  glyphRow.className = 'annotation-editor__glyphs';
  const glyphButtons = new Map<number, HTMLButtonElement>();
  for (const glyph of GLYPHS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'annotation-editor__glyph';
    button.textContent = glyph.label;
    button.title = glyph.title;
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
  clearShapes.title = 'Remove drawn arrows and circles from this move';
  clearShapes.addEventListener('click', () => opts.onClearShapes());
  glyphRow.append(clearShapes);

  const comment = document.createElement('textarea');
  comment.className = 'annotation-editor__comment';
  comment.rows = 2;
  comment.placeholder = 'Add a note on this move…';
  comment.addEventListener('input', () => opts.onComment(comment.value));

  panel.append(glyphRow, comment);

  // Gamebook (lesson) fields: hint (revealed on demand) + deviation (shown when the
  // learner leaves this line). Only rendered in lesson-authoring mode.
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
    panel.append(section);
  }

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
  return { el: panel, setAnnotations };
}
