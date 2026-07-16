// Shared score formatting for the engine panel and the on-board eval bar, so the
// number and the gauge always agree. All inputs are from Red's POV (positive =
// Red better), matching how the review board normalises engine scores.

export function formatEval(cp: number | null, mate: number | null): string {
  if (mate != null) return `${mate > 0 ? '#' : '-#'}${Math.abs(mate)}`;
  if (cp == null) return '–';
  // The server encodes an already-checkmated position (mate 0) as a decisive
  // ±30000cp — render it as the checkmate it is, not as "+300.0".
  if (Math.abs(cp) >= 30000) return cp > 0 ? '#' : '-#';
  const v = cp / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}

// Rough logistic map from centipawns to Red win probability, for the gauge fill.
// The scale constant is a display heuristic, not a calibrated model.
export function winProbRed(cp: number | null, mate: number | null): number {
  if (mate != null) return mate > 0 ? 1 : 0;
  if (cp == null) return 0.5;
  return 1 / (1 + Math.exp(-cp / 320));
}
