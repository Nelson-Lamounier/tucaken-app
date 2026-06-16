/**
 * @format
 * Pure formatters for the admin Cost tab.
 *
 * `prompt_invocations.total_cost_cents` is stored in CENTS (fractional, sub-cent
 * precision per migration 013). `formatCents` is the single place that converts
 * cents → a 2-dp dollar string, so a stored cents value is never rendered as if
 * it were dollars (e.g. 5183.31 cents → "$51.83", not "$5183.31").
 */

/** Format a CENTS amount as a 2-decimal dollar string. */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/** Format an ISO timestamp for the Cost tab; em dash when absent. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}
