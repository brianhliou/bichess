// Click-to-expand for article figures. A chart sized for a 700px prose column
// is legible but not readable: the champions timeline packs 22 rows and 70
// years into that width. Expanding it is the difference between "there is a
// shape here" and being able to find a year.
//
// Inline SVG rather than a raster, so the expanded copy is the same nodes at a
// bigger size and stays sharp at any viewport. The source figure is cloned, not
// moved: moving it would strip the article of its figure while open, and the
// diagram trackers (piece-set repaint) hold references to the original.

import { figureToPngBlob, fileStem, resolveExportBackground, saveBlob } from './figure-export.js';

const OVERLAY_ID = 'article-figure-lightbox';

type OpenState = {
  overlay: HTMLElement;
  restoreFocusTo: HTMLElement;
  previousOverflow: string;
};

let open: OpenState | null = null;

function close(): void {
  if (!open) return;
  const { overlay, restoreFocusTo, previousOverflow } = open;
  open = null;
  overlay.remove();
  document.body.style.overflow = previousOverflow;
  restoreFocusTo.focus({ preventScroll: true });
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && open) {
    event.preventDefault();
    close();
  }
}

/**
 * `returnFocusTo` is passed explicitly rather than read from
 * `document.activeElement`: a button does not reliably take focus when clicked
 * (and never does for a synthetic click), so reading it there sends focus to
 * the body on close and drops a keyboard user back at the top of the page.
 */
function openWith(source: HTMLElement, label: string, returnFocusTo: HTMLElement): void {
  // Reopening without closing would leak the scroll lock's saved value.
  if (open) close();

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'figure-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', label);

  const stage = document.createElement('div');
  stage.className = 'figure-lightbox-stage';

  const bar = document.createElement('div');
  bar.className = 'figure-lightbox-bar';

  const download = document.createElement('button');
  download.type = 'button';
  download.className = 'figure-lightbox-download';
  download.textContent = 'Download PNG';
  download.addEventListener('click', async () => {
    const svg = art.querySelector('svg');
    if (!svg) return;
    download.disabled = true;
    const wasLabelled = download.textContent;
    try {
      // The PNG is pasted onto surfaces we do not control, so it gets an opaque
      // ground rather than the page's transparent one.
      const blob = await figureToPngBlob(svg, resolveExportBackground());
      if (blob) saveBlob(blob, `${fileStem(label)}.png`);
      else download.textContent = 'Could not export';
    } catch {
      download.textContent = 'Could not export';
    } finally {
      download.disabled = false;
      window.setTimeout(() => {
        download.textContent = wasLabelled;
      }, 2500);
    }
  });

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'figure-lightbox-close';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.textContent = '×';
  bar.append(download, closeButton);

  const art = document.createElement('div');
  art.className = 'figure-lightbox-art';
  const clone = source.cloneNode(true) as HTMLElement;
  // The clone is decoration; the original in the article keeps the label.
  clone.removeAttribute('id');
  art.append(clone);

  stage.append(bar, art);
  overlay.append(stage);

  // Backdrop and stage padding both close; the artwork itself does not, so a
  // click that lands on the diagram is not a mis-close.
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target === stage) close();
  });
  closeButton.addEventListener('click', close);

  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.append(overlay);
  open = { overlay, restoreFocusTo: returnFocusTo, previousOverflow };
  closeButton.focus({ preventScroll: true });
}

/**
 * Make a figure expandable. The trigger is a button wrapping the artwork so it
 * is reachable by keyboard and announced as an action, rather than a click
 * handler on a div that only a mouse can find.
 */
export function makeFigureZoomable(figure: HTMLElement, label: string): void {
  const art = figure.querySelector<HTMLElement>('svg');
  if (!art) return;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'figure-zoom-trigger';
  trigger.setAttribute('aria-label', `${label} (expand)`);

  // Label comes from CSS ::after, not a text node: a text node here selects and
  // copies together with the figcaption below it.
  const hint = document.createElement('span');
  hint.className = 'figure-zoom-hint';
  hint.setAttribute('aria-hidden', 'true');

  art.replaceWith(trigger);
  trigger.append(art, hint);
  trigger.addEventListener('click', () => openWith(art, label, trigger));

  figure.classList.add('article-figure-zoomable');
}

// One listener for the document, not one per figure.
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', onKeydown);
}
