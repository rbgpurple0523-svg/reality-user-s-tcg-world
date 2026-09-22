export const SCORE_GAUGE_REFERENCE_SCORE = 10000;
export const SCORE_GAUGE_MID_SCORE = 5000;

export function normalizeScoreForGauge(score: number): number {
  return Math.max(0, Number.isFinite(score) ? score : 0);
}

export function getScoreGaugeHeightRatio(score: number): number {
  return normalizeScoreForGauge(score) / SCORE_GAUGE_REFERENCE_SCORE;
}

export function getScoreGaugeTrackRatio(score: number): number {
  return Math.min(1, getScoreGaugeHeightRatio(score));
}

export function getScoreGaugeOverflowRatio(score: number): number {
  return Math.max(0, getScoreGaugeHeightRatio(score) - 1);
}
