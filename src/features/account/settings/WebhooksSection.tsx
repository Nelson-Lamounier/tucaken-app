// src/features/account/settings/WebhooksSection.tsx
//
// Outbound webhooks. Each row shows URL, event chips, active/paused state,
// last-delivery timestamp; pause/resume + delete actions.

import { Plus, Trash2, Zap } from 'lucide-react'
import type { Webhook } from '../types'
import { Card, timeAgo } from '../components/primitives'

interface Props {
  webhooks: Webhook[]
  onChange: (next: Webhook[]) => void
}

export function WebhooksSection({ webhooks, onChange }: Props) {
  function toggleActive(id: string) {
    onChange(webhooks.map((w) => (w.id === id ? { ...w, active: !w.active } : w)))
  }
  function deleteWebhook(id: string) {
    onChange(webhooks.filter((w) => w.id !== id))
  }

  return (
    <Card>
      <div className="space-y-3">
        {webhooks.map((wh, i) => (
          <div
            key={wh.id}
            className={[
              'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
              i < webhooks.length - 1 ? 'border-b border-white/[0.04] pb-3' : '',
            ].join(' ')}
          >
            <div className="flex min-w-0 items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.04] ring-1 ring-white/5">
                <Zap className="size-4 text-zinc-300" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-xs text-zinc-100">{wh.url}</span>
                  <span
                    className={[
                      'whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9px] font-medium ring-1',
                      wh.active
                        ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-400/20'
                        : 'bg-zinc-500/10 text-zinc-500 ring-white/10',
                    ].join(' ')}
                  >
                    {wh.active ? 'Active' : 'Paused'}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {wh.events.map((e) => (
                    <span
                      key={e}
                      className="whitespace-nowrap rounded-full bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] text-zinc-400 ring-1 ring-white/5"
                    >
                      {e}
                    </span>
                  ))}
                </div>
                <div className="mt-1 text-[10px] text-zinc-600">
                  Last delivery {timeAgo(wh.lastDeliveryAt)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => toggleActive(wh.id)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-200"
              >
                {wh.active ? 'Pause' : 'Resume'}
              </button>
              <button
                type="button"
                onClick={() => deleteWebhook(wh.id)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium text-zinc-400 transition hover:bg-rose-500/10 hover:text-rose-300"
              >
                <Trash2 className="size-3.5" /> Delete
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="mt-1 inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-dashed border-white/15 bg-white/[0.01] px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-white/25 hover:bg-white/[0.03]"
        >
          <Plus className="size-3.5" /> Add webhook
        </button>
      </div>
    </Card>
  )
}
