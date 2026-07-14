/** @format */
import { describe, it, expect } from '@jest/globals';
import { classifyRate, FUNNEL_RANGES } from '../market-funnel-ranges.js';

describe('market-funnel-ranges', () => {
  it('classifies applied→phone-screen bands', () => {
    expect(classifyRate('applied_to_phone_screen', 0.3).band).toBe('above');
    expect(classifyRate('applied_to_phone_screen', 0.15).band).toBe('typical');
    expect(classifyRate('applied_to_phone_screen', 0.05).band).toBe('below');
  });

  it('context mentions the range + never crashes on unknown', () => {
    expect(classifyRate('applied_to_phone_screen', 0.3).context).toMatch(/12.*20/);
    expect(classifyRate('nonexistent', 0.5)).toEqual({ band: 'typical', context: '' });
  });

  it('exposes asOf + median', () => {
    expect(FUNNEL_RANGES.asOf).toBe('2026-Q2');
    expect(FUNNEL_RANGES.medianDaysToOffer).toBe(108);
  });
});
