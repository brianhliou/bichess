// Study chapter -> board dispatch. A study chapter is variant-generic below this
// line (the serialized tree carries UCIs only), but each variant needs its own
// tree-review stack to render and replay it, so this module is the fail-closed
// switch from a chapter's `variant` to that stack. Same shape as
// variant-analysis.ts: every case dynamic-imports its own review module so the
// study page does not ship five board stacks.
//
// Only variants with a DETERMINISTIC start position are here — that is what
// STUDY_ELIGIBLE_SPEC_IDS encodes. A hidden-deal variant (banqi, jieqi,
// jungle-flip) would need its deal persisted with the chapter; without it a saved
// line replays against a fresh deal and truncates to its legal prefix.

import type { StudyVariantId } from '../study-catalog.js';
import './../game-route.css';
import './../dark-xiangqi-postgame.css';
import type { TreeReviewConfig, TreeReviewHandle } from './tree-review.js';

/** The study page's slice of TreeReviewConfig: no `moves` (a study always seeds
 *  from `initialTree`), no whole-game `analysis` source, and a composition start
 *  given as a FEN string — resolving it to a truth state is the variant branch's
 *  job, since each variant's state type is its own and a shared one would have to
 *  be `unknown`. A FEN that no longer parses degrades to the standard start
 *  rather than blanking the page, the same posture the page takes toward a
 *  corrupt tree blob. */
export type StudyReviewConfig = Omit<
  TreeReviewConfig<never>,
  // `explorer` is variant-typed (its handlers carry the concrete Move/Arrow); a
  // never/unknown-typed one from this generic-erased config would not assign to
  // a concrete variant's mount. Dropped here because the variant branch builds
  // its own (xiangqi studies DO get the explorer, just not via this config).
  // The position hand-offs are Truth-typed too (they read the current node's
  // state); a study has no continue-elsewhere affordance, so they are dropped
  // rather than threaded through as `never`. `onLineChange` is Move-typed and
  // only the analysis surfaces mirror the line into the URL (a study chapter's
  // URL is the chapter, not the line).
  | 'moves'
  | 'root'
  | 'analysis'
  | 'decisions'
  | 'explorer'
  | 'analyseFromHere'
  | 'boardEditorHref'
  | 'onLineChange'
> & {
  /** SerializedTree.rootFen — the chapter's hand-set start, if it has one. */
  rootFen?: string;
};

export async function mountStudyReview(
  variant: StudyVariantId,
  root: HTMLElement,
  config: StudyReviewConfig,
): Promise<TreeReviewHandle> {
  const { rootFen, ...rest } = config;
  const base = { ...rest, moves: [], analysis: null };
  // `fen` is what the engine and the share surfaces read back, so it is always
  // the CANONICAL spelling the parser produced, never the raw stored string.

  switch (variant) {
    case 'xiangqi': {
      const [{ mountXiangqiReview }, { parseStandardXiangqiFen, standardXiangqiFen }] =
        await Promise.all([import('./xiangqi-review.js'), import('@mistboard/game')]);
      const parsed = rootFen ? parseStandardXiangqiFen(rootFen) : null;
      return mountXiangqiReview(root, {
        ...base,
        // The opening explorer IS on here (default). It was off until 2026-08-26
        // to leave the hand-specced study layout untouched; the call was made
        // when a study author reported the site had no game database, while the
        // 10k-game explorer sat one flag away from their board. The panel is
        // lazy and closed until opened, so the layout only changes for a reader
        // who asks for it.
        root: parsed?.ok
          ? { truth: parsed.state, fen: standardXiangqiFen(parsed.state) }
          : undefined,
      });
    }
    case 'jungle': {
      const [{ mountJungleReview }, { parseJungleFen, jungleStateToEngineFen }] = await Promise.all(
        [import('./jungle-review.js'), import('@mistboard/game')],
      );
      const parsed = rootFen ? parseJungleFen(rootFen) : null;
      return mountJungleReview(root, {
        ...base,
        root: parsed?.ok
          ? { truth: parsed.state, fen: jungleStateToEngineFen(parsed.state) }
          : undefined,
      });
    }
    case 'fortress-xiangqi': {
      const [
        { mountFortressXiangqiReview },
        { installFortressXiangqiBoardStyles },
        { parseFortressXiangqiFen, fortressXiangqiEngineFen },
      ] = await Promise.all([
        import('./fortress-xiangqi-review.js'),
        import('./../fortress-xiangqi-render.js'),
        import('@mistboard/game'),
      ]);
      // The board SVG's fills live in a page-level installed <style>, not the
      // imported CSS files — without the installer the board renders black.
      installFortressXiangqiBoardStyles();
      const parsed = rootFen ? parseFortressXiangqiFen(rootFen) : null;
      return mountFortressXiangqiReview(root, {
        ...base,
        root: parsed?.ok
          ? { truth: parsed.state, fen: fortressXiangqiEngineFen(parsed.state) }
          : undefined,
      });
    }
    case 'dark-xiangqi': {
      const [{ mountDarkXiangqiReview }, { parseStandardXiangqiFen, standardXiangqiFen }] =
        await Promise.all([import('./dark-xiangqi-review.js'), import('@mistboard/game')]);
      // Fog relaxes the legality bar: a general may stand en prise, because the
      // side that left it there could not see the threat.
      const parsed = rootFen
        ? parseStandardXiangqiFen(rootFen, 'fen-import', { allowExposedGeneral: true })
        : null;
      return mountDarkXiangqiReview(root, {
        ...base,
        root: parsed?.ok
          ? { truth: parsed.state, fen: standardXiangqiFen(parsed.state) }
          : undefined,
      });
    }
    case 'dark-chess': {
      const [{ mountDarkChessReview }, { parseDarkChessFen, darkChessFen }] = await Promise.all([
        import('./dark-chess-review.js'),
        import('@mistboard/game'),
      ]);
      const parsed = rootFen ? parseDarkChessFen(rootFen) : null;
      return mountDarkChessReview(root, {
        ...base,
        root: parsed?.ok ? { truth: parsed.state, fen: darkChessFen(parsed.state) } : undefined,
      });
    }
    default: {
      // Fail-closed: a new catalog member must get its own case, never another
      // variant's board.
      const exhaustive: never = variant;
      throw new Error(`unsupported study variant: ${String(exhaustive)}`);
    }
  }
}
