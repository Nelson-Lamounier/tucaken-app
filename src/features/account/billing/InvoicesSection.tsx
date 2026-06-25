// src/features/account/billing/InvoicesSection.tsx
//
// Live invoice history (most recent twelve) from Stripe. PDF links point at
// Stripe's hosted invoice_pdf. Older invoices live in the customer portal.

import { Download } from 'lucide-react'
import type { InvoiceView } from '../types'
import { Card, fmtDate, fmtMoney } from '../components/primitives'
import { useInvoices } from '../hooks/use-invoices'

const STATUS_CLS: Record<InvoiceView['status'], string> = {
  paid: 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/20',
  open: 'bg-amber-500/10 text-amber-200 ring-amber-400/20',
  draft: 'bg-zinc-500/10 text-zinc-300 ring-zinc-400/20',
  void: 'bg-zinc-500/10 text-zinc-400 ring-zinc-400/20',
  uncollectible: 'bg-red-500/10 text-red-300 ring-red-400/20',
}

export function InvoicesSection() {
  const { invoices, isLoading } = useInvoices()

  if (isLoading) {
    return (
      <Card>
        <div className="h-24 w-full animate-pulse rounded-md bg-white/[0.04]" />
      </Card>
    )
  }

  if (invoices.length === 0) {
    return (
      <Card>
        <p className="text-sm text-zinc-400">No invoices yet.</p>
      </Card>
    )
  }

  return (
    <Card className="!p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/5 bg-white/[0.015] text-left">
            <Th>Date</Th>
            <Th>Number</Th>
            <Th>Amount</Th>
            <Th>Status</Th>
            <th className="px-5 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv, i) => (
            <tr
              key={inv.id}
              className={i < invoices.length - 1 ? 'border-b border-white/[0.04]' : ''}
            >
              <td className="px-5 py-3 text-xs text-zinc-300 whitespace-nowrap">
                {fmtDate(inv.date)}
              </td>
              <td className="px-5 py-3 font-mono text-[11px] text-zinc-500 whitespace-nowrap">
                {inv.number ?? '—'}
              </td>
              <td className="px-5 py-3 font-mono text-xs tabular-nums text-zinc-200 whitespace-nowrap">
                {fmtMoney(inv.amount)}
              </td>
              <td className="px-5 py-3">
                <span
                  className={`whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ${STATUS_CLS[inv.status]}`}
                >
                  {inv.status}
                </span>
              </td>
              <td className="px-5 py-3 text-right">
                <InvoicePdfLink href={inv.invoicePdf} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

function InvoicePdfLink({ href }: { href: string | null }) {
  if (!href) {
    return <span className="text-[11px] text-zinc-600">—</span>
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-[11px] text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-100"
    >
      <Download className="size-3" /> PDF
    </a>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-2.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
      {children}
    </th>
  )
}
