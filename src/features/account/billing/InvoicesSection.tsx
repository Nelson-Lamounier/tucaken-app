// src/features/account/billing/InvoicesSection.tsx
//
// Invoice history table. Most recent twelve are shown; older are accessed
// via the Stripe portal (link not wired here).

import { Download } from 'lucide-react'
import type { Billing } from '../types'
import { Card, fmtDate, fmtMoney } from '../components/primitives'

interface Props {
  billing: Billing
}

export function InvoicesSection({ billing }: Props) {
  const invoices = billing.invoices
  return (
    <Card className="!p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5 bg-white/[0.015] text-left">
            <th className="px-5 py-2.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Date
            </th>
            <th className="px-5 py-2.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Number
            </th>
            <th className="px-5 py-2.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Amount
            </th>
            <th className="px-5 py-2.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Status
            </th>
            <th className="px-5 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv, i) => (
            <tr
              key={inv.id}
              className={
                i < invoices.length - 1
                  ? 'border-b border-white/[0.04]'
                  : ''
              }
            >
              <td className="px-5 py-3 text-xs text-zinc-300 whitespace-nowrap">
                {fmtDate(inv.date)}
              </td>
              <td className="px-5 py-3 font-mono text-[11px] text-zinc-500 whitespace-nowrap">
                {inv.number}
              </td>
              <td className="px-5 py-3 font-mono text-xs tabular-nums text-zinc-200 whitespace-nowrap">
                {fmtMoney(inv.amount)}
              </td>
              <td className="px-5 py-3">
                <span className="whitespace-nowrap rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-400/20">
                  {inv.status}
                </span>
              </td>
              <td className="px-5 py-3 text-right">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-[11px] text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-100"
                >
                  <Download className="size-3" /> PDF
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
