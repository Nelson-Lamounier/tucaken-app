/** @format */
import { toPublicTierConfig, DEFAULT_TIER_CONFIG } from '../../billing/tier-config-shape.js';

describe('toPublicTierConfig', () => {
  const pub = toPublicTierConfig(DEFAULT_TIER_CONFIG);

  it('keeps display fields and tier order', () => {
    expect(pub.tiers.map((t) => t.id)).toEqual(['free', 'pro', 'premium']);

    const pro = pub.tiers.find((t) => t.id === 'pro');
    const defPro = DEFAULT_TIER_CONFIG.tiers.find((t) => t.id === 'pro');
    if (!pro || !defPro) throw new Error('pro tier missing from config');

    expect(pro.name).toBe(defPro.name);
    expect(pro.priceMonthly).toBe(defPro.priceMonthly);
    expect(pro.features).toEqual(defPro.features);
  });

  it('omits entitlements and Stripe price IDs', () => {
    for (const t of pub.tiers) {
      expect(t).not.toHaveProperty('entitlements');
      expect(t).not.toHaveProperty('stripePriceIdMonthly');
    }
  });
});
