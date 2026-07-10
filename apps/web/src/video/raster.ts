// SVG → PNG for video frames. resvg does the rasterizing (same engine as the
// server's OG cards); before that, piece <image> hrefs are rewritten to data
// URIs because frames render outside any web server.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const dataUriCache = new Map<string, string>();

/** Rewrite `/piece-sets/...png?v=N` hrefs to base64 data URIs resolved against
 *  the app's public dir. Exported for tests (pure given a resolver). */
export function inlinePieceImages(
  svg: string,
  resolveFile: (publicPath: string) => Buffer = defaultResolver,
): string {
  return svg.replace(/href="(\/piece-sets\/[^"?]+)(?:\?[^"]*)?"/g, (_match, publicPath: string) => {
    let dataUri = dataUriCache.get(publicPath);
    if (!dataUri) {
      dataUri = `data:image/png;base64,${resolveFile(publicPath).toString('base64')}`;
      dataUriCache.set(publicPath, dataUri);
    }
    return `href="${dataUri}"`;
  });
}

function defaultResolver(publicPath: string): Buffer {
  const publicDir = path.resolve(import.meta.dirname, '../../public');
  return readFileSync(path.join(publicDir, `.${publicPath}`));
}

export function rasterizeSvg(svg: string, scale = 1): Buffer {
  const resvg = new Resvg(inlinePieceImages(svg), {
    // System fonts cover the CJK river label (this pipeline runs on the
    // recording machine, not in CI).
    font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica' },
    // Supersample: piece art is 1024px source; rasterizing the canvas at 2x
    // (4K frames) keeps it sharp where 1:1 1080p rendering visibly softened.
    ...(scale !== 1 ? { fitTo: { mode: 'zoom' as const, value: scale } } : {}),
  });
  return resvg.render().asPng();
}
