// Start-position FEN, one entry point per variant.
//
// A study chapter (and, later, an analysis board) may be rooted at a hand-set
// position instead of the variant's standard start. The position travels as a
// FEN string, so every surface that offers the box needs two things: is this
// FEN legal for THIS variant, and what is its canonical spelling. Both live
// here, behind a fail-closed dispatch, so the study dialog, the chapter dialog,
// and anything added later cannot drift apart or silently accept a FEN the
// board could not replay.
//
// This module deliberately returns only STRINGS. Rebuilding the position into a
// variant state is the caller's job (review/study-review.ts does it per board),
// because each variant's state type is its own — a shared return type would have
// to be `unknown` and would lose exactly the safety the dispatch is for.
//
// Membership is not a product call: a variant is here once it HAS a parser. The
// hidden-deal variants (banqi, jieqi, jungle-flip) qualify through their DEALT
// FEN (dealt-fen.ts): the placement plus the unrevealed pool is a complete public
// description, and the hidden assignment under the face-down tiles is sampled
// ONCE here and pinned in the sixth field. So their canonical spelling is always
// the six-field dealt form, and a stored root replays the same deal every time.
// (Studies still pin their own eligibility list, STUDY_ELIGIBLE_SPEC_IDS, which
// does not follow this one.)

import { banqiStateToDealtFen, parseBanqiFen } from './banqi-fen.js';
import {
  BANQI_SPEC_ID,
  DARK_CHESS_SPEC_ID,
  DARK_XIANGQI_SPEC_ID,
  FORTRESS_XIANGQI_SPEC_ID,
  type GameSpecId,
  JIEQI_SPEC_ID,
  JUNGLE_FLIP_SPEC_ID,
  JUNGLE_SPEC_ID,
  XIANGQI_SPEC_ID,
} from './game-specs.js';
import { jieqiStateToDealtFen, parseJieqiFen } from './jieqi-fen.js';
import { jungleStateToEngineFen, parseJungleFen } from './jungle-fen.js';
import { jungleFlipStateToDealtFen, parseJungleFlipFen } from './jungle-flip-fen.js';
import { darkChessFen, parseDarkChessFen } from './variants.js';
import { fortressXiangqiEngineFen, parseFortressXiangqiFen } from './variants-fortress-xiangqi.js';
import { parseStandardXiangqiFen, standardXiangqiFen } from './xiangqi-position.js';

/** Specs whose start position can be given as a FEN. */
export const START_FEN_SPEC_IDS: readonly GameSpecId[] = [
  XIANGQI_SPEC_ID,
  JUNGLE_SPEC_ID,
  FORTRESS_XIANGQI_SPEC_ID,
  DARK_XIANGQI_SPEC_ID,
  DARK_CHESS_SPEC_ID,
  BANQI_SPEC_ID,
  JIEQI_SPEC_ID,
  JUNGLE_FLIP_SPEC_ID,
];

export function hasStartFen(spec: string): boolean {
  return (START_FEN_SPEC_IDS as readonly string[]).includes(spec);
}

export type NormalizeStartFenResult = { ok: true; fen: string } | { ok: false; error: string };

/** Validate a pasted start position and return its canonical spelling — the form
 *  the variant's own writer produces, so a stored rootFen always round-trips.
 *  Unknown or FEN-less specs are refused rather than defaulted. */
export function normalizeStartFen(spec: string, fen: string): NormalizeStartFenResult {
  switch (spec) {
    case XIANGQI_SPEC_ID: {
      const parsed = parseStandardXiangqiFen(fen);
      return parsed.ok ? { ok: true, fen: standardXiangqiFen(parsed.state) } : parsed;
    }
    case DARK_XIANGQI_SPEC_ID: {
      // Same board and same writer as standard xiangqi; only the legality bar
      // moves, because under fog a general may stand en prise.
      const parsed = parseStandardXiangqiFen(fen, 'fen-import', { allowExposedGeneral: true });
      return parsed.ok ? { ok: true, fen: standardXiangqiFen(parsed.state) } : parsed;
    }
    case JUNGLE_SPEC_ID: {
      const parsed = parseJungleFen(fen);
      return parsed.ok ? { ok: true, fen: jungleStateToEngineFen(parsed.state) } : parsed;
    }
    case FORTRESS_XIANGQI_SPEC_ID: {
      const parsed = parseFortressXiangqiFen(fen);
      return parsed.ok ? { ok: true, fen: fortressXiangqiEngineFen(parsed.state) } : parsed;
    }
    case DARK_CHESS_SPEC_ID: {
      const parsed = parseDarkChessFen(fen);
      return parsed.ok ? { ok: true, fen: darkChessFen(parsed.state) } : parsed;
    }
    // Hidden-deal variants: the canonical spelling is the six-field DEALT fen.
    // A public five-field paste samples its hidden identities here, once; the
    // dealt form then round-trips deterministically.
    case BANQI_SPEC_ID: {
      const parsed = parseBanqiFen(fen);
      return parsed.ok ? { ok: true, fen: banqiStateToDealtFen(parsed.state) } : parsed;
    }
    case JIEQI_SPEC_ID: {
      const parsed = parseJieqiFen(fen);
      return parsed.ok ? { ok: true, fen: jieqiStateToDealtFen(parsed.state) } : parsed;
    }
    case JUNGLE_FLIP_SPEC_ID: {
      const parsed = parseJungleFlipFen(fen);
      return parsed.ok ? { ok: true, fen: jungleFlipStateToDealtFen(parsed.state) } : parsed;
    }
    default:
      return { ok: false, error: 'That variant cannot start from a pasted position.' };
  }
}
