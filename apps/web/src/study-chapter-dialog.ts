// The "New chapter" dialog: name, a source tab strip, then the source's own
// controls.
//
// Shape follows lichess's chapterNewForm (name on top, `tabs-horiz` strip, one
// submit). PGN import lives here as a TAB rather than as its own dialog and its
// own rail button: both create chapters, so splitting them into two entry points
// puts the same decision in two places and leaves the rail a stack of buttons.
// Our tabs are Empty / Position / PGN; lichess also has a board editor and a
// game-URL importer, neither of which we have yet.

import { t } from './i18n/catalog.js';
import type { SerializedTree } from './review/tree-serialize.js';
import { importXiangqiPgnChapters, type XiangqiPgnChapter } from './review/xiangqi-pgn-chapter.js';

type TabId = 'empty' | 'position' | 'pgn';

const PGN_ACCEPT = '.pgn,.txt,application/x-chess-pgn,text/plain';
// One study's worth. A bigger paste is a corpus import and belongs in the admin
// importer, not a browser dialog.
const MAX_BYTES = 4 * 1024 * 1024;

export interface ChapterDialogHost {
  defaultName: string;
  /** Whether the study's variant can start from a hand-set position. */
  composable: boolean;
  /** Whether the study's variant has a PGN reader. */
  importable: boolean;
  /** Canonicalize a pasted start position, or explain why it will not parse. */
  normalizeFen(raw: string): { ok: true; fen: string } | { ok: false; error: string };
  /** Create one chapter. Resolves to an error message, or null on success. */
  createChapter(name: string, rootFen?: string, root?: SerializedTree): Promise<string | null>;
}

export function openChapterDialog(host: ChapterDialogHost): void {
  document.querySelector<HTMLDialogElement>('dialog[data-add-chapter]')?.remove();

  const dialog = document.createElement('dialog');
  dialog.dataset.addChapter = '';
  dialog.className = 'study-create-dialog study-chapter-dialog';

  const heading = document.createElement('h2');
  heading.className = 'study-create-dialog__title';
  heading.textContent = t('study.newChapter');

  const form = document.createElement('form');
  form.className = 'study-create-dialog__form';

  // --- name ------------------------------------------------------------------
  const nameField = document.createElement('label');
  nameField.className = 'study-create-dialog__field';
  const nameLabel = document.createElement('span');
  nameLabel.className = 'study-create-dialog__label';
  nameLabel.textContent = t('study.fieldName');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'study-create-dialog__control';
  nameInput.maxLength = 80;
  nameInput.value = host.defaultName;
  nameInput.setAttribute('aria-label', t('study.chapterNameAria'));
  nameField.append(nameLabel, nameInput);

  // --- tab strip --------------------------------------------------------------
  const tabs: Array<{ id: TabId; label: string }> = [{ id: 'empty', label: 'Empty' }];
  if (host.composable) tabs.push({ id: 'position', label: 'Position' });
  if (host.importable) tabs.push({ id: 'pgn', label: 'PGN' });

  const strip = document.createElement('div');
  strip.className = 'study-chapter-dialog__tabs';
  strip.setAttribute('role', 'tablist');
  const tabButtons = new Map<TabId, HTMLButtonElement>();
  for (const tab of tabs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'study-chapter-dialog__tab';
    button.textContent = tab.label;
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => select(tab.id));
    tabButtons.set(tab.id, button);
    strip.append(button);
  }

  // --- panels -----------------------------------------------------------------
  const emptyPanel = document.createElement('p');
  emptyPanel.className = 'study-chapter-dialog__hint';
  emptyPanel.textContent = 'Starts from the opening position, ready to play moves on.';

  const positionPanel = document.createElement('div');
  positionPanel.className = 'study-chapter-dialog__panel';
  const fenInput = document.createElement('input');
  fenInput.type = 'text';
  fenInput.className = 'study-create-dialog__control';
  fenInput.placeholder = t('study.startFenPlaceholder');
  fenInput.setAttribute('aria-label', t('study.startFenAria'));
  const fenHint = document.createElement('p');
  fenHint.className = 'study-chapter-dialog__hint';
  fenHint.textContent = 'Paste a FEN to start from a composed or mid-game position.';
  positionPanel.append(fenInput, fenHint);

  const pgnPanel = document.createElement('div');
  pgnPanel.className = 'study-chapter-dialog__panel';
  const area = document.createElement('textarea');
  area.className = 'study-create-dialog__control study-chapter-dialog__pgn';
  area.rows = 9;
  area.placeholder = '[Event "..."]\n\n1. C2.5 C8.5 2. H2+3';
  area.setAttribute('aria-label', 'PGN text');
  const pgnHint = document.createElement('p');
  pgnHint.className = 'study-chapter-dialog__hint';
  pgnHint.textContent =
    'Coordinates, WXF and Chinese notation all read. Each game in the file becomes its own chapter.';
  // A bare file input is browser chrome and looks it. Hide it behind a label
  // styled as our own button, which is also the whole drop target.
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = PGN_ACCEPT;
  file.className = 'study-chapter-dialog__file-input';
  file.id = 'chapter-pgn-file';
  const filePick = document.createElement('label');
  filePick.className = 'study-chapter-dialog__file';
  filePick.htmlFor = file.id;
  filePick.textContent = 'Choose a .pgn file';
  pgnPanel.append(area, pgnHint, filePick, file);

  const feedback = document.createElement('p');
  feedback.className = 'study-create-dialog__error';

  // --- actions ----------------------------------------------------------------
  const actions = document.createElement('div');
  actions.className = 'study-create-dialog__actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'study-create-dialog__cancel';
  cancel.textContent = t('study.cancel');
  cancel.addEventListener('click', () => dialog.close('cancel'));
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'study-create-dialog__start';
  actions.append(cancel, submit);

  let active: TabId = 'empty';
  const submitLabel = (): string => {
    if (active !== 'pgn') return t('study.add');
    const count = countGames(area.value);
    return count > 1 ? `Import ${count} games` : 'Import';
  };
  const refreshSubmit = (): void => {
    submit.textContent = submitLabel();
  };
  function select(id: TabId): void {
    active = id;
    for (const [tabId, button] of tabButtons) {
      button.classList.toggle('is-active', tabId === id);
      button.setAttribute('aria-selected', String(tabId === id));
    }
    emptyPanel.hidden = id !== 'empty';
    positionPanel.hidden = id !== 'position';
    pgnPanel.hidden = id !== 'pgn';
    // The PGN panel needs a readable line length; the other two do not, and a
    // dialog that stays wide for a single FEN field looks empty.
    dialog.classList.toggle('study-chapter-dialog--wide', id === 'pgn');
    feedback.textContent = '';
    refreshSubmit();
  }
  area.addEventListener('input', refreshSubmit);

  const readFile = (chosen: File | undefined): void => {
    if (!chosen) return;
    if (chosen.size > MAX_BYTES) {
      feedback.textContent = 'That file is larger than 4 MB. Split it and import in parts.';
      return;
    }
    chosen
      .text()
      .then((text) => {
        area.value = text;
        filePick.textContent = chosen.name;
        feedback.textContent = '';
        refreshSubmit();
      })
      .catch(() => {
        feedback.textContent = 'That file could not be read.';
      });
  };
  file.addEventListener('change', () => readFile(file.files?.[0]));

  // Drop anywhere on the dialog: the textarea is the obvious target and the
  // file button is a small one.
  dialog.addEventListener('dragover', (event) => {
    if (active !== 'pgn') return;
    event.preventDefault();
    dialog.classList.add('study-chapter-dialog--drop');
  });
  dialog.addEventListener('dragleave', () => dialog.classList.remove('study-chapter-dialog--drop'));
  dialog.addEventListener('drop', (event) => {
    dialog.classList.remove('study-chapter-dialog--drop');
    if (active !== 'pgn') return;
    event.preventDefault();
    readFile(event.dataTransfer?.files?.[0]);
  });

  form.append(nameField);
  if (tabs.length > 1) form.append(strip);
  form.append(emptyPanel, positionPanel, pgnPanel, feedback, actions);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    feedback.textContent = '';
    const name = nameInput.value.trim();
    const restore = (): void => {
      submit.disabled = false;
      refreshSubmit();
    };

    if (active === 'pgn') {
      const parsed = importXiangqiPgnChapters(area.value.trim());
      if (parsed.chapters.length === 0) {
        feedback.textContent = parsed.skipped[0]?.reason ?? 'Paste a game or choose a file first.';
        return;
      }
      submit.disabled = true;
      void runImport(host, parsed.chapters, submit, feedback)
        .then((failed) => (failed === 0 ? dialog.close('create') : restore()))
        .catch(() => {
          feedback.textContent = t('study.requestFailed');
          restore();
        });
      return;
    }

    let rootFen: string | undefined;
    if (active === 'position') {
      const raw = fenInput.value.trim();
      if (raw) {
        // Store the CANONICAL spelling, not what was pasted: the board replays
        // the stored string, so one position must have one stored form.
        const normalized = host.normalizeFen(raw);
        if (!normalized.ok) {
          feedback.textContent = normalized.error;
          return;
        }
        rootFen = normalized.fen;
      }
    }
    submit.disabled = true;
    submit.textContent = 'Adding…';
    void host
      .createChapter(name, rootFen)
      .then((error) => {
        if (!error) {
          dialog.close('create');
          return;
        }
        feedback.textContent = error;
        restore();
      })
      .catch(() => {
        feedback.textContent = t('study.requestFailed');
        restore();
      });
  });

  dialog.append(heading, form);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('cancel');
  });
  dialog.addEventListener('close', () => dialog.remove());

  document.body.append(dialog);
  select('empty');
  dialog.showModal();
  nameInput.focus();
  nameInput.select();
}

/** Cheap game count for the submit label. Counts tag blocks, falling back to
 *  one game for a bare movetext paste with no tags at all. */
function countGames(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const events = trimmed.match(/^\s*\[Event\s+"/gm)?.length ?? 0;
  return events > 0 ? events : 1;
}

// Chapters are created one request at a time: the study's own create path
// enforces ordering and version bumps, and a partial import that says "6 of 9"
// is more use than one that rolls the whole file back.
async function runImport(
  host: ChapterDialogHost,
  chapters: readonly XiangqiPgnChapter[],
  submit: HTMLButtonElement,
  feedback: HTMLElement,
): Promise<number> {
  let done = 0;
  let failed = 0;
  let lastError: string | null = null;
  for (const chapter of chapters) {
    submit.textContent = `Importing ${done + failed + 1}/${chapters.length}…`;
    const error = await host.createChapter(chapter.name, undefined, chapter.root);
    if (error) {
      failed += 1;
      lastError = error;
    } else done += 1;
  }
  if (failed > 0) {
    feedback.textContent = `Imported ${done} of ${chapters.length}. ${lastError ?? ''}`.trim();
  }
  return failed;
}
