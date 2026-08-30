// One home for "what does a PGN assessment NAG look like on screen".
//
// The vocabulary had three copies once and they drifted: the study rendered
// stored NAGs as '+/-' while the engine path rendered the same judgement as ±
// into the same slot. It now has one definition, imported by everything that
// decodes a NAG, and scripts/world-title-study.mjs holds the single inverse.
//
// This module deliberately imports nothing. The embed loads it through
// study-chapter-spec.ts and must not pull the review bundle in behind it.

/**
 * PGN's standard assessment NAGs, in the glyphs chess literature actually
 * prints: PLUS-MINUS for a clear advantage, PLUS ABOVE EQUALS for a slight one,
 * and a real MINUS SIGN (U+2212) in the decisive pair. The ASCII forms `+/-`
 * and `+=` are transliterations of these, not the notation itself.
 *
 * The same strings advantageSymbol() emits in review/engine/eval-format.ts,
 * because both reach the one assessment slot in the move tree.
 */
export const ASSESSMENT_GLYPH: Record<number, string> = {
  10: '=',
  13: '∞',
  14: '⩲',
  15: '⩱',
  16: '±',
  17: '∓',
  18: '+−',
  19: '−+',
};

/** True for the NAGs this module decodes, so callers can split a glyph list
 *  into "what the move was" and "what the position is". */
export function isAssessmentNag(code: number): boolean {
  return code >= 10 && code <= 19;
}
