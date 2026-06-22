/** @format */
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export interface TierActionsProps {
    /** When true, show the two-variant A/B buttons; otherwise the single default button. */
    readonly abFreeTier: boolean
    readonly isValid: boolean
    readonly isPending: boolean
    /** Called with the chosen mode; `undefined` for the default (non-A/B) button. */
    readonly onSubmit: (mode: 'free' | 'standard' | undefined) => void
}

export function TierActions({ abFreeTier, isValid, isPending, onSubmit }: TierActionsProps) {
    const disabled = !isValid || isPending
    if (!abFreeTier) {
        return (
            <Button
                variant="primary"
                type="button"
                disabled={disabled}
                className="gap-2"
                onClick={() => onSubmit(undefined)}
            >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {isPending ? 'Analysing…' : 'Start Analysis'}
            </Button>
        )
    }
    return (
        <div className="flex gap-3">
            <Button
                variant="ghost"
                type="button"
                disabled={disabled}
                className="gap-2"
                onClick={() => onSubmit('free')}
            >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Generate — Free tier
            </Button>
            <Button
                variant="primary"
                type="button"
                disabled={disabled}
                className="gap-2"
                onClick={() => onSubmit('standard')}
            >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Generate — Paid tier
            </Button>
        </div>
    )
}
