import { describe, expect, it } from 'vitest';
import { ANALYSIS_VARIANTS, analysisVariantFromPath } from '../analysis-catalog.js';
import { editorVariantFromPath } from './editor-catalog.js';

describe('editorVariantFromPath', () => {
  it('opens the flagship on the bare path', () => {
    expect(editorVariantFromPath('/editor')).toBe('xiangqi');
  });

  it('opens every catalog variant by slug', () => {
    for (const variant of ANALYSIS_VARIANTS) {
      expect(editorVariantFromPath(`/editor/${variant.id}`)).toBe(variant.id);
    }
  });

  it('is null for unknown slugs and near misses (the caller 404s)', () => {
    for (const path of [
      '/editor/',
      '/editor/chess',
      '/editor/xiangqi/extra',
      '/editor/Xiangqi',
      '/editors',
      '/analysis/xiangqi',
      '/',
    ]) {
      expect(editorVariantFromPath(path), path).toBeNull();
    }
  });

  it('mirrors the analysis catalog exactly', () => {
    for (const variant of ANALYSIS_VARIANTS) {
      expect(editorVariantFromPath(`/editor/${variant.id}`)).toBe(
        analysisVariantFromPath(`/analysis/${variant.id}`),
      );
    }
  });
});
