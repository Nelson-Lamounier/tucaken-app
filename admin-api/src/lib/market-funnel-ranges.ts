/**
 * @format
 * 2026 job-market typical-range config for honestly framing application
 * funnel conversion rates. Used to classify a user's per-transition rate
 * against research-grounded industry bands so the UI can give honest context
 * (above / typical / below) instead of bare percentages.
 *
 * Sources: Pin 2026 recruitment funnel; Huntr Q1 2026 (108-day median);
 * onehour interview-rate stats; ApplyPass 57k interviews.
 */

export interface FunnelRange {
  typicalLow: number;
  typicalHigh: number;
  strongLow?: number;
}

export const FUNNEL_RANGES = {
  asOf: '2026-Q2',
  medianDaysToOffer: 108,
  transitions: {
    applied_to_phone_screen: { typicalLow: 0.12, typicalHigh: 0.2, strongLow: 0.18 },
    phone_screen_to_technical: { typicalLow: 0.3, typicalHigh: 0.5, strongLow: 0.4 },
    technical_to_offer: { typicalLow: 0.15, typicalHigh: 0.33 },
    offer_to_accept: { typicalLow: 0.7, typicalHigh: 0.85 },
  } as Record<string, FunnelRange>,
} as const;

export type RateBand = 'above' | 'typical' | 'below';

/** Render a 0..1 fraction as a whole-number percent (e.g. 0.12 → '12'). */
function pct(fraction: number): string {
  return String(Math.round(fraction * 100));
}

/**
 * Classify a per-transition conversion `rate` (0..1) against the 2026 typical
 * band for that transition and return an honest, range-aware context sentence.
 * Unknown transitions return band 'typical' with an empty context (no crash).
 */
export function classifyRate(
  transition: string,
  rate: number,
): { band: RateBand; context: string } {
  const range = FUNNEL_RANGES.transitions[transition];
  if (!range) {
    return { band: 'typical', context: '' };
  }

  const low = pct(range.typicalLow);
  const high = pct(range.typicalHigh);

  if (rate > range.typicalHigh) {
    return {
      band: 'above',
      context: `above the typical ${low}–${high}% — your applications are getting attention`,
    };
  }
  if (rate < range.typicalLow) {
    return {
      band: 'below',
      context: `below the typical ${low}–${high}% — a focus area`,
    };
  }
  return { band: 'typical', context: `within the typical ${low}–${high}% range` };
}
