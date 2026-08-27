// The /editor/<variant> route parser. The board editor covers exactly the
// analysis catalog (every variant with a standalone analysis board can be set
// up here and handed to it), so this mirrors analysisVariantFromPath: bare
// /editor opens the flagship, a known slug opens that variant, anything else is
// null and the caller 404s. Imported by main.ts route matching: keep it tiny.

import { ANALYSIS_VARIANTS, type AnalysisVariantId } from '../analysis-catalog.js';

export function editorVariantFromPath(path: string): AnalysisVariantId | null {
  if (path === '/editor') return 'xiangqi';
  const match = /^\/editor\/([a-z0-9-]+)$/.exec(path);
  if (!match) return null;
  const slug = match[1];
  return ANALYSIS_VARIANTS.some((variant) => variant.id === slug)
    ? (slug as AnalysisVariantId)
    : null;
}
