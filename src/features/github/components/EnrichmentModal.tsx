import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { Button } from '@/components/ui/Button'

/**
 * Centred modal that captures the enrichment-tier choice (free vs premium) for
 * allowlisted test users. Shared by every flow that can start an ingestion run:
 * Re-sync / Rebuild of a connected repo AND the "Add" CTA on the repo picker.
 * The caller owns the open state and what to dispatch on choice; this component
 * only presents the two options (+ a destructive warning for full rebuilds).
 */
export function EnrichmentModal({
  open,
  forceReindex = false,
  onChoose,
  onClose,
}: {
  readonly open: boolean
  /** When true, shows the destructive full-rebuild warning. */
  readonly forceReindex?: boolean
  readonly onChoose: (choice: 'premium' | 'free') => void
  readonly onClose: () => void
}) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      {/* Backdrop */}
      <div aria-hidden="true" className="fixed inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-sm rounded-xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
          <DialogTitle className="text-base font-semibold text-zinc-100">
            Choose enrichment tier
          </DialogTitle>
          <p className="mt-1 text-xs text-zinc-500">
            Select the enrichment level for this sync run.
          </p>

          {forceReindex && (
            <p
              data-testid="rebuild-destructive-warning"
              className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400"
            >
              Full rebuild — re-indexes the entire repository from scratch, replacing all existing chunks.
            </p>
          )}

          <div className="mt-5 flex flex-col gap-3">
            {/* Premium option */}
            <button
              type="button"
              onClick={() => onChoose('premium')}
              className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-4 py-3 text-left transition-colors hover:bg-indigo-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <p className="text-sm font-medium text-zinc-100">Full enrichment (premium)</p>
              <p className="mt-0.5 text-xs text-zinc-400">
                RAG search + technologies + skill enrichment (Bedrock AI cost applies).
              </p>
            </button>

            {/* Free option */}
            <button
              type="button"
              onClick={() => onChoose('free')}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <p className="text-sm font-medium text-zinc-100">Free-tier sync</p>
              <p className="mt-0.5 text-xs text-zinc-400">
                Free: RAG search + technologies, no skill enrichment (no AI cost).
              </p>
            </button>
          </div>

          <div className="mt-5 flex justify-end">
            <Button variant="ghost" onClick={onClose} className="px-3 py-1.5 text-xs">
              Cancel
            </Button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
