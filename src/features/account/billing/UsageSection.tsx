// src/features/account/billing/UsageSection.tsx
//
// Four-up grid of progress bars (resumes / articles / repos / storage) for
// the current billing period. Bar turns amber at 80%.

import type { Billing } from '../types'
import { Card } from '../components/primitives'

interface Props {
  billing: Billing
}

export function UsageSection({ billing }: Props) {
  const u = billing.usage
  const items: Array<{
    key: string
    label: string
    used: number
    included: number
    unit: string
    format?: (n: number) => string
  }> = [
    { key: 'resumes',  label: 'Resumes generated',  ...u.resumes },
    { key: 'articles', label: 'Articles generated', ...u.articles },
    { key: 'repos',    label: 'GitHub repos synced', ...u.repos },
    {
      key: 'storage',
      label: 'Storage',
      ...u.storage,
      format: (n: number) => `${n.toFixed(2)} GB`,
    },
  ]

  return (
    <Card>
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
        {items.map((it) => {
          const pct = Math.min(
            100,
            Math.round((it.used / it.included) * 100),
          )
          const near = pct >= 80
          const fmt = it.format ?? ((n: number) => String(n))
          return (
            <div key={it.key}>
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-zinc-200">
                  {it.label}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-zinc-500">
                  <span className={near ? 'text-amber-300' : 'text-zinc-300'}>
                    {fmt(it.used)}
                  </span>{' '}
                  / {fmt(it.included)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
                <div
                  className={[
                    'h-full rounded-full transition-all',
                    near ? 'bg-amber-400/80' : 'bg-teal-400/80',
                  ].join(' ')}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-zinc-600">{it.unit}</p>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
