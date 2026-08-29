// Rasterise an inline SVG figure to a PNG the reader can save and post.
//
// The figure's colours come from CSS: custom properties on :root plus class
// rules in articles.css. None of that survives serialisation, so a naive
// XMLSerializer round-trip produces a black-on-transparent shape. Every painted
// property is copied onto the clone as an inline attribute first, read from a
// copy attached to the live document so the same stylesheet actually applies.

/** Properties that decide what a shape looks like once the stylesheet is gone. */
const PAINTED = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'text-anchor',
  'font-variant-numeric',
] as const;

const EXPORT_SCALE = 2;

/**
 * `getComputedStyle` only resolves rules for elements in a document, and the
 * pattern/defs subtree is not rendered where it sits. Attaching an off-screen
 * copy means every node, defs included, resolves against the real stylesheet.
 */
function inlineComputedPaint(source: SVGSVGElement): SVGSVGElement {
  const holder = document.createElement('div');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:absolute;left:-99999px;top:0;width:1200px;';
  const clone = source.cloneNode(true) as SVGSVGElement;
  holder.append(clone);
  document.body.append(holder);
  try {
    const sourceNodes = [source, ...source.querySelectorAll('*')];
    const cloneNodes = [clone, ...clone.querySelectorAll('*')];
    cloneNodes.forEach((node, i) => {
      const model = sourceNodes[i] ?? node;
      // Read from the ORIGINAL where it exists: it is the one in the article,
      // laid out and themed. The clone is the write target.
      const computed = getComputedStyle(model as Element);
      for (const prop of PAINTED) {
        const value = computed.getPropertyValue(prop);
        if (value && value !== 'none' && value !== 'normal') {
          (node as SVGElement).setAttribute(prop, value.trim());
        }
      }
      node.removeAttribute('class');
    });
  } finally {
    holder.remove();
  }
  return clone;
}

function viewportOf(svg: SVGSVGElement): { width: number; height: number } {
  const viewBox = svg
    .getAttribute('viewBox')
    ?.split(/[\s,]+/)
    .map(Number);
  if (viewBox?.length === 4 && viewBox.every((n) => Number.isFinite(n))) {
    return { width: viewBox[2] as number, height: viewBox[3] as number };
  }
  const box = svg.getBoundingClientRect();
  return { width: box.width || 1200, height: box.height || 700 };
}

/**
 * Draw the figure to a PNG blob. `background` is painted first: a transparent
 * PNG of light-grey text is invisible on every surface people paste into.
 */
export async function figureToPngBlob(
  svg: SVGSVGElement,
  background: string,
): Promise<Blob | null> {
  const { width, height } = viewportOf(svg);
  const clone = inlineComputedPaint(svg);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const markup = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('figure did not rasterise'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * EXPORT_SCALE);
    canvas.height = Math.round(height * EXPORT_SCALE);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * An opaque ground for the exported PNG. `document.body` is transparent on this
 * site (the page paints its gradient higher up), so reading its
 * background-color yields rgba(0,0,0,0) and the fill silently does nothing,
 * leaving a transparent PNG that vanishes on any dark surface it is pasted
 * onto. The --site-bg token is what the page actually resolves to.
 */
export function resolveExportBackground(): string {
  const root = document.documentElement;
  const token = getComputedStyle(root).getPropertyValue('--site-bg').trim();
  if (token) return token;
  for (const el of [root, document.body]) {
    const value = getComputedStyle(el).backgroundColor;
    if (value && !/rgba?\([^)]*,\s*0\s*\)$/.test(value) && value !== 'transparent') return value;
  }
  return '#ffffff';
}

/** Turn a caption into a filename stem. */
export function fileStem(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'mistboard-figure';
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking synchronously can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
