import type {
  XiangqiColor,
  XiangqiGameState,
  XiangqiMove,
  XiangqiPiece,
  XiangqiPieceRole,
  XiangqiPuzzle,
} from '@mistboard/game';
import type { XiangqiPuzzleEditorialCandidate } from './persistence-xiangqi-puzzle-mining.js';

export const XIANGQI_EDITORIAL_RANKING_VERSION = 'editorial-lenses-v2';

const MATERIAL_CP: Readonly<Record<XiangqiPieceRole, number>> = {
  general: 20_000,
  chariot: 900,
  cannon: 450,
  horse: 450,
  elephant: 200,
  advisor: 200,
  soldier: 100,
};

export type XiangqiEditorialMaterialSignals = {
  solverColor: XiangqiColor;
  quietFirstMove: boolean;
  immediateRecapture: boolean;
  materialConcededCp: number;
  materialWonCp: number;
  netMaterialCp: number;
  maxMaterialDeficitCp: number;
  maxLocalConcessionCp: number;
  concededRoles: XiangqiPieceRole[];
  wonRoles: XiangqiPieceRole[];
  concessionEvents: XiangqiEditorialMaterialConcessionEvent[];
};

export type XiangqiEditorialMaterialConcessionEvent = {
  solutionPly: number;
  capturedRole: XiangqiPieceRole;
  capturedValueCp: number;
  capturedSquare: string;
  capturedJustMovedPiece: boolean;
  precedingSolverMove: XiangqiMove;
  precedingSolverMoveQuiet: boolean;
  precedingCapturedRole: XiangqiPieceRole | null;
  precedingCapturedValueCp: number;
  localExchangeCp: number;
  localConcessionCp: number;
};

export type XiangqiEditorialCandidateSignals = {
  candidateId: string;
  cohort: XiangqiPuzzleEditorialCandidate['cohort'];
  selectionIndex: number;
  postBlunderPly: number;
  positionDuplicateCount: number;
  swingCp: number | null;
  mateScaleSwing: boolean;
  verifyBestCp: number | null;
  verifySecondCp: number | null;
  verifyGapCp: number | null;
  auditMinGapCp: number | null;
  auditMinGapWinrate: number | null;
  auditUniquenessReasons: string[];
  solutionPlies: number | null;
  solverPlies: number | null;
  goal: string | null;
  themes: string[];
  material: XiangqiEditorialMaterialSignals | null;
  materialConcessionMotifKey: string | null;
  materialConcessionMotifCount: number;
  latestReviewVerdict: string | null;
};

export type XiangqiEditorialRankingLens =
  | 'material-concession'
  | 'forcing-depth'
  | 'source-swing'
  | 'audit-margin';

export type XiangqiEditorialReviewPacket = {
  rankingVersion: typeof XIANGQI_EDITORIAL_RANKING_VERSION;
  candidates: Array<
    XiangqiPuzzleEditorialCandidate & {
      signals: XiangqiEditorialCandidateSignals;
      ranks: Record<XiangqiEditorialRankingLens, number>;
    }
  >;
  rankings: Record<XiangqiEditorialRankingLens, string[]>;
};

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asPuzzle(value: unknown): XiangqiPuzzle | null {
  if (!isRecord(value) || !isRecord(value.initial) || !Array.isArray(value.solution)) return null;
  if (!isRecord(value.initial.board) || !isRecord(value.initial.status)) return null;
  if (value.initial.status.type !== 'playing') return null;
  return value as XiangqiPuzzle;
}

function auditMinimum(evidence: Record<string, unknown> | undefined, key: string): number | null {
  const plies = evidence?.plies;
  if (!Array.isArray(plies)) return null;
  const values = plies
    .map((ply) => (isRecord(ply) ? finiteNumber(ply[key]) : null))
    .filter((value): value is number => value !== null);
  return values.length > 0 ? Math.min(...values) : null;
}

function auditReasons(evidence: Record<string, unknown> | undefined): string[] {
  const plies = evidence?.plies;
  if (!Array.isArray(plies)) return [];
  return plies.flatMap((ply) =>
    isRecord(ply) && typeof ply.uniquenessReason === 'string' ? [ply.uniquenessReason] : [],
  );
}

function materialSignals(puzzle: XiangqiPuzzle): XiangqiEditorialMaterialSignals | null {
  if (puzzle.initial.status.type !== 'playing') return null;
  const solverColor = puzzle.initial.status.turn;
  const board = { ...puzzle.initial.board } as XiangqiGameState['board'];
  const concededRoles: XiangqiPieceRole[] = [];
  const wonRoles: XiangqiPieceRole[] = [];
  const concessionEvents: XiangqiEditorialMaterialConcessionEvent[] = [];
  let materialConcededCp = 0;
  let materialWonCp = 0;
  let runningNetCp = 0;
  let maxMaterialDeficitCp = 0;
  let quietFirstMove = true;
  let immediateRecapture = false;
  let precedingSolverMove: XiangqiMove | null = null;
  let precedingSolverCapture: XiangqiPiece | null = null;

  for (let ply = 0; ply < puzzle.solution.length; ply += 1) {
    const move = puzzle.solution[ply] as XiangqiMove;
    const moving = board[move.from] as XiangqiPiece | undefined;
    if (!moving) return null;
    const captured = board[move.to] as XiangqiPiece | undefined;
    if (ply === 0) quietFirstMove = captured === undefined;
    if (captured) {
      const value = MATERIAL_CP[captured.role];
      if (captured.color === solverColor) {
        materialConcededCp += value;
        runningNetCp -= value;
        concededRoles.push(captured.role);
        const capturedJustMovedPiece = move.to === precedingSolverMove?.to;
        if (ply === 1 && capturedJustMovedPiece) immediateRecapture = true;
        if (precedingSolverMove) {
          const precedingCapturedValueCp = precedingSolverCapture
            ? MATERIAL_CP[precedingSolverCapture.role]
            : 0;
          const localExchangeCp = precedingCapturedValueCp - value;
          concessionEvents.push({
            solutionPly: ply,
            capturedRole: captured.role,
            capturedValueCp: value,
            capturedSquare: move.to,
            capturedJustMovedPiece,
            precedingSolverMove,
            precedingSolverMoveQuiet: precedingSolverCapture === null,
            precedingCapturedRole: precedingSolverCapture?.role ?? null,
            precedingCapturedValueCp,
            localExchangeCp,
            localConcessionCp: Math.max(0, -localExchangeCp),
          });
        }
      } else {
        materialWonCp += value;
        runningNetCp += value;
        wonRoles.push(captured.role);
      }
      maxMaterialDeficitCp = Math.max(maxMaterialDeficitCp, -runningNetCp);
    }
    delete board[move.from];
    board[move.to] = moving;
    if (ply % 2 === 0) {
      precedingSolverMove = move;
      precedingSolverCapture = captured ?? null;
    }
  }

  return {
    solverColor,
    quietFirstMove,
    immediateRecapture,
    materialConcededCp,
    materialWonCp,
    netMaterialCp: materialWonCp - materialConcededCp,
    maxMaterialDeficitCp,
    maxLocalConcessionCp: Math.max(0, ...concessionEvents.map((event) => event.localConcessionCp)),
    concededRoles,
    wonRoles,
    concessionEvents,
  };
}

function materialConcessionMotifKey(
  material: XiangqiEditorialMaterialSignals | null,
  goal: string | null,
  solverPlies: number | null,
): string | null {
  const events = material?.concessionEvents.filter((event) => event.localConcessionCp > 0) ?? [];
  if (events.length === 0) return null;
  const eventKeys = events.map(
    (event) =>
      `${event.precedingCapturedRole ?? 'quiet'}>${event.capturedRole}:` +
      `${event.capturedJustMovedPiece ? 'offered' : 'other'}:${event.localConcessionCp}`,
  );
  return `${goal ?? 'unknown'}|solver-plies:${solverPlies ?? 'unknown'}|${eventKeys.join(',')}`;
}

export function xiangqiEditorialCandidateSignals(
  entry: XiangqiPuzzleEditorialCandidate,
): XiangqiEditorialCandidateSignals {
  const puzzle = asPuzzle(entry.candidate.puzzleData);
  const swingCp = finiteNumber(entry.candidate.scanEvidence.swingCp);
  const verifyBestCp = finiteNumber(entry.verifyJudgment?.evidence.verifyBestCp);
  const verifySecondCp = finiteNumber(entry.verifyJudgment?.evidence.verifySecondCp);
  const solutionPlies = puzzle?.solution.length ?? null;
  const goal =
    puzzle && isRecord(puzzle.goal) && typeof puzzle.goal.type === 'string'
      ? puzzle.goal.type
      : null;
  const themes = puzzle ? [...puzzle.themes] : [];
  const solverPlies = solutionPlies === null ? null : Math.ceil(solutionPlies / 2);
  const material = puzzle ? materialSignals(puzzle) : null;
  return {
    candidateId: entry.candidate.id,
    cohort: entry.cohort,
    selectionIndex: entry.selectionIndex,
    postBlunderPly: entry.candidate.postBlunderPly,
    positionDuplicateCount: entry.positionDuplicateCount,
    swingCp,
    mateScaleSwing: swingCp !== null && Math.abs(swingCp) >= 29_000,
    verifyBestCp,
    verifySecondCp,
    verifyGapCp:
      verifyBestCp !== null && verifySecondCp !== null ? verifyBestCp - verifySecondCp : null,
    auditMinGapCp: auditMinimum(entry.auditJudgment?.evidence, 'gapCp'),
    auditMinGapWinrate: auditMinimum(entry.auditJudgment?.evidence, 'gapWinrate'),
    auditUniquenessReasons: auditReasons(entry.auditJudgment?.evidence),
    solutionPlies,
    solverPlies,
    goal,
    themes,
    material,
    materialConcessionMotifKey: materialConcessionMotifKey(material, goal, solverPlies),
    materialConcessionMotifCount: 1,
    latestReviewVerdict: entry.latestReview?.verdict ?? null,
  };
}

function descending(left: number | null | undefined, right: number | null | undefined): number {
  return (right ?? Number.NEGATIVE_INFINITY) - (left ?? Number.NEGATIVE_INFINITY);
}

function commonCompare(
  left: XiangqiEditorialCandidateSignals,
  right: XiangqiEditorialCandidateSignals,
): number {
  return (
    left.positionDuplicateCount - right.positionDuplicateCount ||
    left.candidateId.localeCompare(right.candidateId)
  );
}

const LENS_COMPARATORS: Record<
  XiangqiEditorialRankingLens,
  (left: XiangqiEditorialCandidateSignals, right: XiangqiEditorialCandidateSignals) => number
> = {
  'material-concession': (left, right) =>
    descending(left.material?.maxLocalConcessionCp, right.material?.maxLocalConcessionCp) ||
    descending(left.material?.materialConcededCp, right.material?.materialConcededCp) ||
    descending(left.material?.maxMaterialDeficitCp, right.material?.maxMaterialDeficitCp) ||
    descending(left.solverPlies, right.solverPlies) ||
    descending(left.swingCp, right.swingCp) ||
    commonCompare(left, right),
  'forcing-depth': (left, right) =>
    descending(left.solverPlies, right.solverPlies) ||
    descending(left.swingCp, right.swingCp) ||
    descending(left.auditMinGapWinrate, right.auditMinGapWinrate) ||
    commonCompare(left, right),
  'source-swing': (left, right) =>
    descending(left.swingCp, right.swingCp) ||
    descending(left.solverPlies, right.solverPlies) ||
    commonCompare(left, right),
  'audit-margin': (left, right) =>
    descending(left.auditMinGapWinrate, right.auditMinGapWinrate) ||
    descending(left.auditMinGapCp, right.auditMinGapCp) ||
    descending(left.solverPlies, right.solverPlies) ||
    commonCompare(left, right),
};

export function buildXiangqiEditorialReviewPacket(
  entries: readonly XiangqiPuzzleEditorialCandidate[],
): XiangqiEditorialReviewPacket {
  const initial = entries.map((entry) => ({
    entry,
    signals: xiangqiEditorialCandidateSignals(entry),
  }));
  const motifCounts = new Map<string, number>();
  for (const { signals } of initial) {
    if (!signals.materialConcessionMotifKey) continue;
    motifCounts.set(
      signals.materialConcessionMotifKey,
      (motifCounts.get(signals.materialConcessionMotifKey) ?? 0) + 1,
    );
  }
  const enriched = initial.map(({ entry, signals }) => ({
    entry,
    signals: {
      ...signals,
      materialConcessionMotifCount: signals.materialConcessionMotifKey
        ? (motifCounts.get(signals.materialConcessionMotifKey) ?? 1)
        : 1,
    },
  }));
  const lenses = Object.keys(LENS_COMPARATORS) as XiangqiEditorialRankingLens[];
  const rankings = Object.fromEntries(
    lenses.map((lens) => [
      lens,
      [...enriched]
        .sort((left, right) => LENS_COMPARATORS[lens](left.signals, right.signals))
        .map(({ signals }) => signals.candidateId),
    ]),
  ) as Record<XiangqiEditorialRankingLens, string[]>;
  const rankMaps = Object.fromEntries(
    lenses.map((lens) => [
      lens,
      new Map(rankings[lens].map((candidateId, index) => [candidateId, index + 1])),
    ]),
  ) as Record<XiangqiEditorialRankingLens, Map<string, number>>;

  return {
    rankingVersion: XIANGQI_EDITORIAL_RANKING_VERSION,
    candidates: enriched.map(({ entry, signals }) => ({
      ...entry,
      signals,
      ranks: Object.fromEntries(
        lenses.map((lens) => [lens, rankMaps[lens].get(signals.candidateId) as number]),
      ) as Record<XiangqiEditorialRankingLens, number>,
    })),
    rankings,
  };
}
