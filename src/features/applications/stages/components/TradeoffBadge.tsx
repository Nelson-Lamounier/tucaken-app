import { GitCompareArrows } from 'lucide-react'

/**
 * A small badge naming an architectural decision the user actually made,
 * phrased as "chose X over Y" — so they recognize their own reasoning at a
 * glance. See the Tradeoff term in src/features/applications/CONTEXT.md.
 */
export function TradeoffBadge({ label }: { readonly label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] px-2 py-1 text-xs font-medium text-accent inset-ring inset-ring-[color-mix(in_oklab,var(--accent)_25%,transparent)]">
      <GitCompareArrows className="size-3.5" aria-hidden />
      {label}
    </span>
  )
}
