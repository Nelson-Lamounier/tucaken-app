/** @format */
import { isFreeTierAllowed } from './ab-free-tier.js';

describe('isFreeTierAllowed', () => {
    const ORIG = process.env.AB_FREE_TIER_EMAILS;
    afterEach(() => { process.env.AB_FREE_TIER_EMAILS = ORIG; });

    it('allows an allowlisted email (case-insensitive, trimmed)', () => {
        process.env.AB_FREE_TIER_EMAILS = 'lamounier_88@hotmail.com, other@x.com';
        expect(isFreeTierAllowed('LAMOUNIER_88@hotmail.com')).toBe(true);
        expect(isFreeTierAllowed('  other@x.com ')).toBe(true);
    });
    it('denies a non-listed email, null, and empty/absent env', () => {
        process.env.AB_FREE_TIER_EMAILS = 'lamounier_88@hotmail.com';
        expect(isFreeTierAllowed('someone@else.com')).toBe(false);
        expect(isFreeTierAllowed(null)).toBe(false);
        process.env.AB_FREE_TIER_EMAILS = '';
        expect(isFreeTierAllowed('lamounier_88@hotmail.com')).toBe(false);
    });
});
