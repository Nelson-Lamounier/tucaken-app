'use client'
import { X, Zap } from 'lucide-react'

interface UpgradeLimitBannerProps {
  readonly onDismiss: () => void
}

export function UpgradeLimitBanner({ onDismiss }: UpgradeLimitBannerProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-200">Monthly ingestion limit reached</p>
        <p className="mt-0.5 text-xs text-amber-400/80">
          You've used all 3 free syncs this month. Upgrade to Pro for unlimited repository indexing
          and priority support.
        </p>
        <a
          href="/settings/billing"
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90"
        >
          <Zap className="h-3 w-3" />
          Subscribe to Pro
        </a>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        className="shrink-0 rounded p-0.5 text-amber-400/60 transition-colors hover:text-amber-300"
        onClick={onDismiss}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
