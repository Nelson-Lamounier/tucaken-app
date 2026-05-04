// src/features/account/settings/TokensSection.tsx
//
// API tokens — list with reveal/copy/revoke, plus a create flow.
// Revealed tokens are shown for the lifetime of the page only; in production
// only the prefix + last4 should ever come back from the server.

import { useState } from 'react'
import {
  Check,
  Copy,
  Cpu,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import type { ApiToken } from '../types'
import {
  Card,
  Field,
  fmtDate,
  inputCls,
  timeAgo,
} from '../components/primitives'

interface Props {
  tokens: ApiToken[]
  onChange: (next: ApiToken[]) => void
}

export function TokensSection({ tokens, onChange }: Props) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')

  function deleteToken(id: string) {
    onChange(tokens.filter((t) => t.id !== id))
  }
  function createToken() {
    if (!draftName.trim()) return
    const last4 = Array.from(crypto.getRandomValues(new Uint8Array(3)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 4)
    const newToken: ApiToken = {
      id: `tok_live_${crypto.randomUUID()}`,
      name: draftName.trim(),
      last4,
      scopes: ['read'],
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    }
    onChange([newToken, ...tokens])
    setRevealed((r) => ({ ...r, [newToken.id]: true }))
    setDraftName('')
    setCreating(false)
  }

  return (
    <div className="space-y-3">
      <Card>
        <div className="space-y-3">
          {tokens.map((t, i) => (
            <div
              key={t.id}
              className={[
                'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
                i < tokens.length - 1 ? 'border-b border-white/[0.04] pb-3' : '',
              ].join(' ')}
            >
              <div className="flex items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.04] ring-1 ring-white/5">
                  <Cpu className="size-4 text-zinc-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-100">{t.name}</span>
                    {t.scopes.map((s) => (
                      <span key={s} className="whitespace-nowrap rounded-full bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-medium text-zinc-400 ring-1 ring-white/5">
                        {s}
                      </span>
                    ))}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                    <span>
                      tuc_
                      {revealed[t.id]
                        ? `live_sk_xKp9Q3mNvR8wB${t.last4}`
                        : `••••••••••••${t.last4}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRevealed((r) => ({ ...r, [t.id]: !r[t.id] }))}
                      className="rounded p-0.5 text-zinc-600 transition hover:bg-white/[0.04] hover:text-zinc-300"
                    >
                      {revealed[t.id] ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                    </button>
                    <button
                      type="button"
                      className="rounded p-0.5 text-zinc-600 transition hover:bg-white/[0.04] hover:text-zinc-300"
                    >
                      <Copy className="size-3" />
                    </button>
                  </div>
                  <div className="mt-1 text-[10px] text-zinc-600">
                    Created {fmtDate(t.createdAt)} · Last used {timeAgo(t.lastUsedAt)}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => deleteToken(t.id)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium text-zinc-400 transition hover:bg-rose-500/10 hover:text-rose-300"
              >
                <Trash2 className="size-3.5" /> Revoke
              </button>
            </div>
          ))}
          {tokens.length === 0 && (
            <p className="py-4 text-center text-xs text-zinc-500">No tokens yet.</p>
          )}
        </div>
      </Card>

      {!creating ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-dashed border-white/15 bg-white/[0.01] px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-white/25 hover:bg-white/[0.03]"
        >
          <Plus className="size-3.5" /> Create new token
        </button>
      ) : (
        <Card>
          <Field label="Token name" hint="A label only you'll see">
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createToken()}
              className={inputCls()}
              placeholder="e.g. Personal CLI"
            />
          </Field>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCreating(false)
                setDraftName('')
              }}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-white/20"
            >
              <X className="size-3.5" /> Cancel
            </button>
            <button
              type="button"
              onClick={createToken}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-teal-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-teal-400"
            >
              <Check className="size-3.5" strokeWidth={2.5} /> Create token
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}
