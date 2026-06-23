/** @format */
import { isEnrichmentToggleAllowed } from './enrichment-toggle.js';

describe('isEnrichmentToggleAllowed', () => {
    const ORIG = process.env.ENRICHMENT_TOGGLE_EMAILS;
    afterEach(() => { process.env.ENRICHMENT_TOGGLE_EMAILS = ORIG; });

    it('allows an allowlisted email (case-insensitive)', () => {
        process.env.ENRICHMENT_TOGGLE_EMAILS = 'lamounier_88@hotmail.com';
        expect(isEnrichmentToggleAllowed('Lamounier_88@hotmail.com')).toBe(true);
    });

    it('denies a non-listed email and undefined', () => {
        process.env.ENRICHMENT_TOGGLE_EMAILS = 'lamounier_88@hotmail.com';
        expect(isEnrichmentToggleAllowed('someone@else.com')).toBe(false);
        expect(isEnrichmentToggleAllowed(undefined)).toBe(false);
    });

    it('allows the default email when the env is unset', () => {
        delete process.env.ENRICHMENT_TOGGLE_EMAILS;
        expect(isEnrichmentToggleAllowed('lamounier_88@hotmail.com')).toBe(true);
    });
});
