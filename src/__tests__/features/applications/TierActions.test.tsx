/**
 * @vitest-environment happy-dom
 * @format
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TierActions } from '@/features/applications/components/TierActions';

describe('TierActions', () => {
    it('shows a single Start Analysis button when abFreeTier is false', () => {
        const onSubmit = vi.fn();
        render(<TierActions abFreeTier={false} isValid={true} isPending={false} onSubmit={onSubmit} />);
        expect(screen.getByRole('button', { name: /start analysis/i })).toBeTruthy();
        expect(screen.queryByRole('button', { name: /free tier/i })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /start analysis/i }));
        expect(onSubmit).toHaveBeenCalledWith(undefined);
    });

    it('shows two tier buttons when abFreeTier is true and dispatches the right mode', () => {
        const onSubmit = vi.fn();
        render(<TierActions abFreeTier={true} isValid={true} isPending={false} onSubmit={onSubmit} />);
        fireEvent.click(screen.getByRole('button', { name: /free tier/i }));
        expect(onSubmit).toHaveBeenCalledWith('free');
        fireEvent.click(screen.getByRole('button', { name: /paid tier/i }));
        expect(onSubmit).toHaveBeenCalledWith('standard');
    });

    it('disables actions when invalid or pending', () => {
        const onSubmit = vi.fn();
        render(<TierActions abFreeTier={true} isValid={false} isPending={false} onSubmit={onSubmit} />);
        for (const b of screen.getAllByRole('button')) {
            expect((b as HTMLButtonElement).disabled).toBe(true);
        }
    });
});
