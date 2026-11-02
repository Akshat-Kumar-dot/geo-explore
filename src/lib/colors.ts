/** Favourability ramp, taken from the approved design: teal → green → amber → red. */
export const RAMP: Array<[number, string]> = [
  [0.00, '#3f9bc1'],
  [0.22, '#53b7a4'],
  [0.48, '#a8cf45'],
  [0.72, '#f2bf39'],
  [1.00, '#e24d45'],
];

/** Model scores live in 0.55–0.95; stretch that across the full ramp. */
export const SCORE_MIN = 0.55;
export const SCORE_MAX = 0.95;

export const RAMP_CSS = `linear-gradient(90deg, ${RAMP.map(([t, c]) => `${c} ${t * 100}%`).join(', ')})`;

const hex = (c: string) => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
];

export function rampColor(t: number): string {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < RAMP.length; i++) {
    const [t1, c1] = RAMP[i];
    if (x <= t1) {
      const [t0, c0] = RAMP[i - 1];
      const f = (x - t0) / (t1 - t0 || 1);
      const a = hex(c0), b = hex(c1);
      const mix = a.map((v, k) => Math.round(v + (b[k] - v) * f));
      return `rgb(${mix.join(', ')})`;
    }
  }
  return RAMP[RAMP.length - 1][1];
}

export const scoreColor = (score: number) =>
  rampColor((score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN));

/** MapLibre interpolate stops for the same ramp, in score units. */
export const scoreRampExpression = () =>
  ['interpolate', ['linear'], ['get', 'score_mean'],
    ...RAMP.flatMap(([t, c]) => [SCORE_MIN + t * (SCORE_MAX - SCORE_MIN), c])];

/** Descriptive band for a model score. Ranking language only — never a grade. */
export function favourabilityBand(score: number): string {
  if (score >= 0.87) return 'Very high';
  if (score >= 0.78) return 'High';
  if (score >= 0.68) return 'Moderate';
  if (score >= 0.60) return 'Low';
  return 'Very low';
}

export const LAND_USE_COLORS: Record<string, string> = {
  clear: '#2f8d79',
  forest: '#2e7d52',
  protected: '#b8632a',
  settlement: '#8a5cc4',
  water: '#2b7fb8',
};

export const CONFIDENCE_COLORS: Record<string, string> = {
  high: '#1f7a4d',
  medium: '#b8842a',
  low: '#7a8698',
};

/** Risk shading for the mine table — muted, not alarmist. */
export function riskColor(p: number): { fg: string; bg: string } {
  if (p >= 0.7) return { fg: '#a4342b', bg: '#fbeceb' };
  if (p >= 0.45) return { fg: '#9a6a1c', bg: '#fdf4e3' };
  return { fg: '#1f6b4a', bg: '#ecf6f1' };
}
