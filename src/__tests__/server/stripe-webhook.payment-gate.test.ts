import { describe, it, expect } from 'vitest';
import { shouldGrantFromCheckout } from '../../server/stripe-webhook';

const base = { payment_status: 'paid', status: 'complete' } as const;

describe('shouldGrantFromCheckout', () => {
    it('grants only when payment_status is paid and session complete', () => {
        expect(shouldGrantFromCheckout({ ...base })).toBe(true);
    });
    it('refuses when payment is unpaid or no_payment_required', () => {
        expect(shouldGrantFromCheckout({ ...base, payment_status: 'unpaid' })).toBe(false);
        expect(shouldGrantFromCheckout({ ...base, payment_status: 'no_payment_required' })).toBe(false);
    });
    it('refuses when the session is not complete', () => {
        expect(shouldGrantFromCheckout({ ...base, status: 'open' })).toBe(false);
    });
});
