// src/features/account/billing/DetailsSection.tsx
//
// "Billing details" — billing email, tax ID, mailing address. Read-only
// summary that swaps to an inline edit form via the Edit details button.

import { useState, type ReactNode } from 'react'
import { Check, Edit2, X } from 'lucide-react'
import type { Billing } from '../types'
import { Card, Field, inputCls } from '../components/primitives'

interface Props {
  billing: Billing
  onUpdateBilling: (patch: Partial<Billing>) => void
}

interface DraftShape {
  billingEmail: string
  taxId: string
  line1: string
  line2?: string
  city: string
  state: string
  postal: string
  country: string
}

export function DetailsSection({ billing, onUpdateBilling }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<DraftShape>({
    billingEmail: billing.billingEmail,
    taxId: billing.taxId,
    ...billing.address,
  })

  function save() {
    const { billingEmail, taxId, ...address } = draft
    onUpdateBilling({ billingEmail, taxId, address })
    setEditing(false)
  }

  if (!editing) {
    return (
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-3 text-sm">
            <DetailRow
              label="Billing email"
              value={billing.billingEmail}
            />
            <DetailRow
              label="Tax ID"
              value={
                billing.taxId || (
                  <span className="text-zinc-600">Not set</span>
                )
              }
            />
            <DetailRow
              label="Address"
              value={
                <div className="text-zinc-300">
                  {billing.address.line1}
                  <br />
                  {billing.address.line2 && (
                    <>
                      {billing.address.line2}
                      <br />
                    </>
                  )}
                  {billing.address.city}, {billing.address.state}{' '}
                  {billing.address.postal}
                  <br />
                  {billing.address.country}
                </div>
              }
            />
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.04]"
          >
            <Edit2 className="size-3.5" /> Edit details
          </button>
        </div>
      </Card>
    )
  }

  const set = <K extends keyof DraftShape>(k: K, v: DraftShape[K]) =>
    setDraft((d) => ({ ...d, [k]: v }))

  return (
    <Card>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Billing email">
          <input
            value={draft.billingEmail}
            onChange={(e) => set('billingEmail', e.target.value)}
            className={inputCls()}
          />
        </Field>
        <Field label="Tax ID" hint="Optional">
          <input
            value={draft.taxId}
            onChange={(e) => set('taxId', e.target.value)}
            className={inputCls()}
            placeholder="e.g. EU-VAT"
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Address line 1">
            <input
              value={draft.line1}
              onChange={(e) => set('line1', e.target.value)}
              className={inputCls()}
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Address line 2" hint="Optional">
            <input
              value={draft.line2 || ''}
              onChange={(e) => set('line2', e.target.value)}
              className={inputCls()}
            />
          </Field>
        </div>
        <Field label="City">
          <input
            value={draft.city}
            onChange={(e) => set('city', e.target.value)}
            className={inputCls()}
          />
        </Field>
        <Field label="State / Region">
          <input
            value={draft.state}
            onChange={(e) => set('state', e.target.value)}
            className={inputCls()}
          />
        </Field>
        <Field label="Postal code">
          <input
            value={draft.postal}
            onChange={(e) => set('postal', e.target.value)}
            className={inputCls()}
          />
        </Field>
        <Field label="Country">
          <input
            value={draft.country}
            onChange={(e) => set('country', e.target.value)}
            className={inputCls()}
          />
        </Field>
      </div>
      <div className="mt-5 flex items-center justify-end gap-2 border-t border-white/5 pt-4">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/20"
        >
          <X className="size-3.5" /> Cancel
        </button>
        <button
          type="button"
          onClick={save}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-teal-500 px-4 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-teal-400"
        >
          <Check className="size-3.5" strokeWidth={2.5} /> Save details
        </button>
      </div>
    </Card>
  )
}

function DetailRow({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-4 text-xs">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="text-zinc-300">{value}</div>
    </div>
  )
}
