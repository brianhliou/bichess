// Fit a site-box body's rows to the body's height. For homepage widgets whose
// box height comes from the band they sit in (the forum box is the daily
// puzzle's height; Top studies spans the blog + video rows) rather than from
// their content: the row count is measured, not configured. Callers fetch more
// rows than the box can show and let fitRows() drop the ones that would clip.

/** Slack per row that the rows absorb by growing; past this the box is
 *  content-starved and keeps its slack instead of puffing each row up. */
export const fillSlackPerRow = 28;

/**
 * Whole rows only: a row cut mid-item reads as broken. Trimming leaves up to
 * one row of slack under the last row; when that slack is small enough to
 * spread (at most fillSlackPerRow per row) `fillClass` goes on the body and the
 * widget's CSS lets the rows grow to share it, so the last row lands on the
 * box's bottom edge. A content-starved box (two topics in a board-height box)
 * keeps its slack. The body's height is fixed by its box (flex child of a
 * fixed-height box), so neither trimming nor growth changes it. Unlaid-out
 * documents (tests, prerender) report clientHeight 0 and keep every row.
 */
export function fitRows(body: HTMLElement, rows: HTMLElement[], fillClass: string): void {
  body.classList.remove(fillClass);
  body.replaceChildren(...rows);
  const available = body.clientHeight;
  if (available <= 0) return;
  const top = body.getBoundingClientRect().top;
  let lastBottom = 0;
  while (body.childElementCount > 0) {
    const last = body.lastElementChild as HTMLElement;
    lastBottom = last.getBoundingClientRect().bottom - top;
    if (lastBottom <= available + 0.5 || body.childElementCount === 1) break;
    last.remove();
  }
  const slack = available - lastBottom;
  body.classList.toggle(fillClass, slack > 0 && slack <= body.childElementCount * fillSlackPerRow);
}

/** fitRows() now, and again whenever the body's height changes (the band
 *  re-laying out, a resize crossing the stacked breakpoint). Trimmed rows come
 *  back when the body grows: `rows` keeps every row, fitted or not. */
export function fitRowsToBody(body: HTMLElement, rows: HTMLElement[], fillClass: string): void {
  fitRows(body, rows, fillClass);
  if (typeof ResizeObserver === 'undefined') return;
  let fittedHeight = body.clientHeight;
  new ResizeObserver(() => {
    if (body.clientHeight === fittedHeight) return;
    fittedHeight = body.clientHeight;
    fitRows(body, rows, fillClass);
  }).observe(body);
}
