/** @format */
import { isFreeTierAllowed, resolveDispatchMode } from './ab-free-tier.js';

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

describe('resolveDispatchMode', () => {
    const ORIG = process.env.AB_FREE_TIER_EMAILS;
    beforeEach(() => { process.env.AB_FREE_TIER_EMAILS = 'lamounier_88@hotmail.com'; });
    afterEach(() => { process.env.AB_FREE_TIER_EMAILS = ORIG; });

    it('keeps free for an allowlisted user', () => {
        expect(resolveDispatchMode('free', 'lamounier_88@hotmail.com')).toEqual({ mode: 'free', downgraded: false });
    });
    it('downgrades free → standard for a non-allowlisted user', () => {
        expect(resolveDispatchMode('free', 'someone@else.com')).toEqual({ mode: 'standard', downgraded: true });
    });
    it('passes standard through unchanged regardless of allowlist', () => {
        expect(resolveDispatchMode('standard', 'someone@else.com')).toEqual({ mode: 'standard', downgraded: false });
        expect(resolveDispatchMode('', 'lamounier_88@hotmail.com')).toEqual({ mode: 'standard', downgraded: false });
    });
});
