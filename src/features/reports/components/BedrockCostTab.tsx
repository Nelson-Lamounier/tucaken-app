'use client'

import { useQuery } from '@tanstack/react-query'
import { bedrockUsageQueries } from '../queries'

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(4)}`
}

function pipelineBadgeClass(pipeline: string): string {
  if (pipeline === 'resume-import') return 'bg-violet-500/15 text-violet-300 ring-violet-400/25'
  if (pipeline === 'repo-sync')    return 'bg-sky-500/15 text-sky-300 ring-sky-400/25'
  return 'bg-zinc-500/15 text-zinc-300 ring-zinc-400/25'
}

export function BedrockCostTab() {
  const { data, isLoading } = useQuery(bedrockUsageQueries.summary())

  const totalCents  = data?.totalCents   ?? 0
  const byPipeline  = data?.byPipeline   ?? {}
  const rows        = data?.rows         ?? []

  const importCents = byPipeline['resume-import'] ?? 0
  const syncCents   = byPipeline['repo-sync']     ?? 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { name: 'Total Spend (MTD)',   value: isLoading ? '…' : formatCents(totalCents) },
          { name: 'Resume Import (MTD)', value: isLoading ? '…' : formatCents(importCents) },
          { name: 'Repo Sync (MTD)',     value: isLoading ? '…' : formatCents(syncCents) },
        ].map((s) => (
          <div key={s.name} className="rounded-xl border border-white/10 bg-white/4 p-4">
            <p className="text-xs text-zinc-500">{s.name}</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-100">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/10">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 text-left text-zinc-500">
                <th className="px-4 py-3 font-medium">Pipeline</th>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium text-right">Tokens In</th>
                <th className="px-4 py-3 font-medium text-right">Tokens Out</th>
                <th className="px-4 py-3 font-medium text-right">Cost</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-zinc-600">Loading…</td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-zinc-600">No invocations recorded yet</td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="text-zinc-300 hover:bg-white/2">
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${pipelineBadgeClass(row.pipeline)}`}>
                      {row.pipeline}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-[10px] text-zinc-400">
                    {row.modelId.split('/').pop() ?? row.modelId}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.inputTokens.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.outputTokens.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-emerald-300">{formatCents(row.totalCostCents)}</td>
                  <td className="max-w-32 truncate px-4 py-2 text-zinc-500">
                    {row.importId ?? row.repoName ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">
                    {new Date(row.invokedAt).toLocaleString('en-GB', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
