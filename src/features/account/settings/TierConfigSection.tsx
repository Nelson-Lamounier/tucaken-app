// src/features/account/settings/TierConfigSection.tsx
//
// Admin-only section for editing subscription tier configuration.
// Gated by me.plan.role === 'admin' in SettingsPage — this component
// assumes it is only mounted for admins.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, Field, Toggle, inputCls } from '../components/primitives'
import {
  getTierConfigFn,
  listStripePricesFn,
  updateTierConfigFn,
} from '@/server/tier-config'
import { adminKeys } from '@/lib/api/query-keys'
import { notifyError, notifySuccess } from '@/lib/errors/notify'
import type { TierConfig, TierConfigEntry, TierEntitlements } from '@/features/billing/tier-config'

// ---- Types -----------------------------------------------------------------

type StripePrice = {
  id: string
  nickname: string | null
  productName: string | null
}

// ---- ConfirmDialog ---------------------------------------------------------

function ConfirmDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="rounded-md border border-white/10 bg-zinc-900/80 p-4">
      <p className="text-sm text-zinc-200">
        Entitlement changes affect live user quotas immediately. Save these tier settings?
      </p>
      <p className="mt-1 text-xs text-amber-400">
        This action cannot be undone without a manual rollback.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 hover:bg-teal-500 transition"
          disabled={pending}
          onClick={onConfirm}
        >
          Confirm save
        </button>
        <button
          type="button"
          className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/[0.08] transition"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ---- PriceSelect -----------------------------------------------------------

function PriceSelect({
  value,
  prices,
  onChange,
}: {
  value: string | null
  prices: StripePrice[]
  onChange: (v: string) => void
}) {
  if (prices.length === 0) {
    return (
      <input
        className={inputCls()}
        value={value ?? ''}
        placeholder="price_..."
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }
  return (
    <select
      className={inputCls()}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="" disabled>
        Select a Stripe price…
      </option>
      {prices.map((p) => (
        <option key={p.id} value={p.id}>
          {p.productName ?? p.nickname ?? p.id}
        </option>
      ))}
    </select>
  )
}

// ---- EntitlementField ------------------------------------------------------

function EntitlementField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
}) {
  const unlimited = value === null
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          className={inputCls()}
          type="number"
          min={0}
          disabled={unlimited}
          value={unlimited ? '' : value}
          onChange={(e) => onChange(Number.parseInt(e.target.value, 10) || 0)}
        />
        <div className="flex shrink-0 items-center gap-1.5">
          <Toggle
            checked={unlimited}
            onChange={(on) => onChange(on ? null : 0)}
            label={`${label} unlimited`}
          />
          <span className="text-xs text-zinc-500">Unlimited</span>
        </div>
      </div>
    </Field>
  )
}

// ---- TierCard --------------------------------------------------------------

function TierCard({
  entry,
  prices,
  onChange,
}: {
  entry: TierConfigEntry
  prices: StripePrice[]
  onChange: (patch: Partial<TierConfigEntry>) => void
}) {
  function patchEntitlements(patch: Partial<TierEntitlements>) {
    onChange({ entitlements: { ...entry.entitlements, ...patch } })
  }

  const enrichmentValue = entry.entitlements.enrichment === 'full' ? 'full' : 'tier1'

  return (
    <Card>
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Name">
          <input
            className={inputCls()}
            value={entry.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </Field>
        <Field label="CTA label">
          <input
            className={inputCls()}
            value={entry.cta}
            onChange={(e) => onChange({ cta: e.target.value })}
          />
        </Field>
        <Field label="Monthly price (EUR)">
          <input
            className={inputCls()}
            type="number"
            min={0}
            value={entry.priceMonthly}
            onChange={(e) =>
              onChange({ priceMonthly: Number.parseInt(e.target.value, 10) || 0 })
            }
          />
        </Field>
        <Field label="Annual price (EUR)">
          <input
            className={inputCls()}
            type="number"
            min={0}
            value={entry.priceAnnual}
            onChange={(e) =>
              onChange({ priceAnnual: Number.parseInt(e.target.value, 10) || 0 })
            }
          />
        </Field>
      </div>

      {entry.free ? null : (
        <div className="mb-4">
          <Field label="Stripe price (monthly)">
            <PriceSelect
              value={entry.stripePriceIdMonthly}
              prices={prices}
              onChange={(v) => onChange({ stripePriceIdMonthly: v })}
            />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <EntitlementField
          label="Repositories"
          value={entry.entitlements.repos}
          onChange={(v) => patchEntitlements({ repos: v })}
        />
        <EntitlementField
          label="Projects"
          value={entry.entitlements.projects}
          onChange={(v) => patchEntitlements({ projects: v })}
        />
        <EntitlementField
          label="Resumes / month"
          value={entry.entitlements.resumesPerMonth}
          onChange={(v) => patchEntitlements({ resumesPerMonth: v })}
        />
        <EntitlementField
          label="Ingestion jobs / month"
          value={entry.entitlements.ingestionJobsPerMonth}
          onChange={(v) => patchEntitlements({ ingestionJobsPerMonth: v })}
        />
        <Field label="Enrichment depth">
          <select
            className={inputCls()}
            value={enrichmentValue}
            onChange={(e) =>
              patchEntitlements({
                enrichment: e.target.value === 'full' ? 'full' : 'tier1',
              })
            }
          >
            <option value="tier1">Tier 1</option>
            <option value="full">Full</option>
          </select>
        </Field>
      </div>
    </Card>
  )
}

// ---- TierConfigSection (main export) ---------------------------------------

export function TierConfigSection() {
  const qc = useQueryClient()
  const cfgQuery = useQuery({ queryKey: ['tier-config'], queryFn: getTierConfigFn })
  const pricesQuery = useQuery({
    queryKey: ['stripe-prices'],
    queryFn: listStripePricesFn,
  })
  const [draft, setDraft] = useState<TierConfig | null>(null)
  const [confirming, setConfirming] = useState(false)

  const save = useMutation({
    mutationFn: (cfg: TierConfig) => updateTierConfigFn({ data: cfg }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tier-config'] })
      void qc.invalidateQueries({ queryKey: adminKeys.me.detail() })
      setDraft(null)
      setConfirming(false)
      notifySuccess('Tiers saved', 'Subscription tier configuration updated.')
    },
    onError: (err) => {
      setConfirming(false)
      notifyError(err, 'generic')
    },
  })

  if (cfgQuery.isLoading) {
    return (
      <Card>
        <p className="text-sm text-zinc-400">Loading tiers…</p>
      </Card>
    )
  }

  if (cfgQuery.isError || !cfgQuery.data) {
    return (
      <Card>
        <p className="text-sm text-rose-400">Could not load tier configuration.</p>
      </Card>
    )
  }

  const config = draft ?? cfgQuery.data

  function patchTier(id: string, patch: Partial<TierConfigEntry>) {
    setDraft({
      tiers: config.tiers.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })
  }

  return (
    <div className="space-y-4">
      {config.tiers.map((entry) => (
        <TierCard
          key={entry.id}
          entry={entry}
          prices={pricesQuery.data ?? []}
          onChange={(patch) => patchTier(entry.id, patch)}
        />
      ))}

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-teal-500 transition"
          disabled={!draft || save.isPending}
          onClick={() => setConfirming(true)}
        >
          Save tiers
        </button>
        {save.isError ? (
          <span className="text-sm text-rose-400">Save failed. Please try again.</span>
        ) : null}
      </div>

      {confirming ? (
        <ConfirmDialog
          pending={save.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() => save.mutate(config)}
        />
      ) : null}
    </div>
  )
}
