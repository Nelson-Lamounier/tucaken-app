'use client'

import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { Link } from '@tanstack/react-router'
import { Check, ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { findTier } from '@/features/billing/catalog'

/** Paid tiers a checkout link can target (mirrors the /checkout/$tier route). */
type PaidTier = 'pro' | 'premium'

/** The user's current effective plan (from me.plan.effectivePlan). */
type EffectivePlan = 'free' | 'trial' | 'pro'

/** Which paid tiers to offer given the current plan — a Pro user only needs
 *  Premium; free/trial users see both. */
function upgradeTiersFor(plan: EffectivePlan): PaidTier[] {
  return plan === 'pro' ? ['premium'] : ['pro', 'premium']
}

interface UpgradePlanModalProps {
  readonly open: boolean
  /** The limit detail from the backend, e.g. "Your plan allows 1 repository.". */
  readonly message?: string | null
  readonly currentPlan: EffectivePlan
  readonly onClose: () => void
}

/**
 * Centred modal shown when a connect-repo action is blocked by the plan's repo
 * (or monthly-quota) limit. Explains the limit using the backend's own message
 * and offers the relevant paid tiers, each linking straight to Stripe checkout.
 * Matches the EnrichmentModal / ProjectIntentModal dialog pattern.
 */
export function UpgradePlanModal({ open, message, currentPlan, onClose }: UpgradePlanModalProps) {
  const tiers = upgradeTiersFor(currentPlan)

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div aria-hidden="true" className="fixed inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-lg rounded-xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold text-zinc-100">
                You&apos;ve reached your plan limit
              </DialogTitle>
              <p className="mt-1 text-sm text-zinc-400">
                {message ?? 'Upgrade to connect more repositories and unlock more of Tucaken.'}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {tiers.map((id) => {
              const tier = findTier(id)
              if (!tier) return null
              return (
                <div
                  key={id}
                  className={`flex flex-col rounded-md border p-4 ${
                    tier.highlighted ? 'border-accent/40 bg-accent/5' : 'border-white/10 bg-white/5'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-zinc-100">{tier.name}</span>
                    <span className="text-xs text-zinc-400">
                      <span className="text-sm font-semibold text-zinc-100">${tier.priceMonthly}</span>/mo
                    </span>
                  </div>
                  <ul className="mt-3 flex-1 space-y-1.5">
                    {tier.features.slice(0, 3).map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-xs text-zinc-300">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/checkout/$tier"
                    params={{ tier: id }}
                    onClick={onClose}
                    className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                  >
                    {tier.cta} <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </div>
              )
            })}
          </div>

          <div className="mt-5 flex justify-end">
            <Button variant="ghost" onClick={onClose} className="px-3 py-1.5 text-xs">
              Maybe later
            </Button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
