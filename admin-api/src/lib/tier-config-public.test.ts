/** @format */
import { toPublicTierConfig, DEFAULT_TIER_CONFIG } from './tier-config-shape.js';

describe('toPublicTierConfig', () => {
  const pub = toPublicTierConfig(DEFAULT_TIER_CONFIG);

  it('keeps display fields and tier order', () => {
    expect(pub.tiers.map((t) => t.id)).toEqual(['free', 'pro', 'premium']);
    expect(pub.tiers[1].name).toBe(DEFAULT_TIER_CONFIG.tiers[1].name);
    expect(pub.tiers[1].priceMonthly).toBe(DEFAULT_TIER_CONFIG.tiers[1].priceMonthly);
    expect(pub.tiers[1].features).toEqual(DEFAULT_TIER_CONFIG.tiers[1].features);
  });

  it('omits entitlements and Stripe price IDs', () => {
    for (const t of pub.tiers) {
      expect(t).not.toHaveProperty('entitlements');
      expect(t).not.toHaveProperty('stripePriceIdMonthly');
    }
  });
});
