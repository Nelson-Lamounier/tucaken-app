'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { bedrockUsageQueries } from '../queries'
import type {
  ApplicationCostRow,
  ProjectCostRow,
  PromptInvocationRow,
  RepoCostRow,
  UserCostRow,
} from '../../../server/bedrock-usage'

// ─── Formatting ─────────────────────────────────────────────────────────────

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function pipelineBadgeClass(pipeline: string): string {
  if (pipeline === 'resume-import')  return 'bg-violet-500/15 text-violet-300 ring-violet-400/25'
  if (pipeline === 'repo-sync')      return 'bg-sky-500/15 text-sky-300 ring-sky-400/25'
  if (pipeline === 'job-strategist') return 'bg-amber-500/15 text-amber-300 ring-amber-400/25'
  return 'bg-zinc-500/15 text-zinc-300 ring-zinc-400/25'
}

function syncKindLabel(kind: string | null): string {
  if (kind === 'initial')      return 'Initial sync'
  if (kind === 'full_reindex') return 'Resync (full)'
  if (kind === 'incremental')  return 'Resync (delta)'
  return 'Unclassified'
}

function userLabel(userId: string | null, email: string | null): string {
  return email ?? userId ?? 'Unattributed'
}

function applicationLabel(row: ApplicationCostRow): string {
  if (row.company && row.role) return `${row.company} — ${row.role}`
  return row.company ?? row.applicationId
}

// ─── Expanded per-user breakdown (lazy-fetched) ───────────────────────────────

function BreakdownSection({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">{title}</p>
      {children}
    </div>
  )
}

function PipelineList({ byPipeline }: Readonly<{ byPipeline: Record<string, number> }>) {
  const entries = Object.entries(byPipeline).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return <p className="text-xs text-zinc-600">No spend</p>
  return (
    <ul className="space-y-1">
      {entries.map(([pipeline, cents]) => (
        <li key={pipeline} className="flex items-center justify-between gap-3 text-xs">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${pipelineBadgeClass(pipeline)}`}>
            {pipeline}
          </span>
          <span className="tabular-nums text-emerald-300">{formatCents(cents)}</span>
        </li>
      ))}
    </ul>
  )
}

function RepoList({ rows }: Readonly<{ rows: RepoCostRow[] }>) {
  if (rows.length === 0) return <p className="text-xs text-zinc-600">No repository syncs</p>
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={`${r.repoName}:${r.syncKind ?? 'none'}`} className="flex items-center justify-between gap-3 text-xs">
          <span className="truncate font-mono text-[10px] text-zinc-400">{r.repoName}</span>
          <span className="shrink-0 text-zinc-500">{syncKindLabel(r.syncKind)}</span>
          <span className="shrink-0 tabular-nums text-emerald-300">{formatCents(r.totalCents)}</span>
        </li>
      ))}
    </ul>
  )
}

function NamedCostList({ rows, emptyLabel }: Readonly<{ rows: Array<{ key: string; label: string; totalCents: number }>; emptyLabel: string }>) {
  if (rows.length === 0) return <p className="text-xs text-zinc-600">{emptyLabel}</p>
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center justify-between gap-3 text-xs">
          <span className="truncate text-zinc-300">{r.label}</span>
          <span className="shrink-0 tabular-nums text-emerald-300">{formatCents(r.totalCents)}</span>
        </li>
      ))}
    </ul>
  )
}

function RecentInvocations({ rows }: Readonly<{ rows: PromptInvocationRow[] }>) {
  const recent = rows.slice(0, 10)
  if (recent.length === 0) return <p className="text-xs text-zinc-600">No invocations</p>
  return (
    <ul className="space-y-1">
      {recent.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-3 text-xs">
          <span className="flex items-center gap-2 truncate">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${pipelineBadgeClass(row.pipeline)}`}>
              {row.pipeline}
            </span>
            <span className="truncate font-mono text-[10px] text-zinc-500">{row.modelId.split('/').pop() ?? row.modelId}</span>
          </span>
          <span className="shrink-0 text-zinc-600">{formatDateTime(row.invokedAt)}</span>
          <span className="shrink-0 tabular-nums text-emerald-300">{formatCents(row.totalCostCents)}</span>
        </li>
      ))}
    </ul>
  )
}

function UserBreakdown({ userId }: Readonly<{ userId: string }>) {
  const { data, isLoading } = useQuery(bedrockUsageQueries.summary(undefined, userId))

  if (isLoading) return <p className="px-4 py-3 text-xs text-zinc-600">Loading breakdown…</p>

  const byPipeline = data?.byPipeline ?? {}
  const byRepo = data?.byRepo ?? []
  const projectRows = (data?.byProject ?? []).map((p: ProjectCostRow) => ({
    key: p.projectId, label: p.name ?? p.projectId, totalCents: p.totalCents,
  }))
  const applicationRows = (data?.byApplication ?? []).map((a) => ({
    key: a.applicationId, label: applicationLabel(a), totalCents: a.totalCents,
  }))

  return (
    <div className="grid grid-cols-1 gap-5 bg-white/2 px-4 py-4 md:grid-cols-2 lg:grid-cols-3">
      <BreakdownSection title="By pipeline"><PipelineList byPipeline={byPipeline} /></BreakdownSection>
      <BreakdownSection title="Repository sync"><RepoList rows={byRepo} /></BreakdownSection>
      <BreakdownSection title="Job applications"><NamedCostList rows={applicationRows} emptyLabel="No JD executions yet" /></BreakdownSection>
      <BreakdownSection title="Projects"><NamedCostList rows={projectRows} emptyLabel="No project case studies yet" /></BreakdownSection>
      <BreakdownSection title="Recent invocations"><RecentInvocations rows={data?.rows ?? []} /></BreakdownSection>
    </div>
  )
}

// ─── User row ─────────────────────────────────────────────────────────────────

function UserRow({ user, expanded, onToggle }: Readonly<{ user: UserCostRow; expanded: boolean; onToggle: () => void }>) {
  const id = user.userId ?? 'unattributed'
  return (
    <tbody className="border-b border-white/6">
      <tr className="text-zinc-300 hover:bg-white/2">
        <td className="px-4 py-2">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-2 text-left"
            aria-expanded={expanded}
          >
            <span className={`text-zinc-500 transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
            <span className="max-w-64 truncate">{userLabel(user.userId, user.email)}</span>
          </button>
        </td>
        <td className="px-4 py-2 text-zinc-500">{formatDateTime(user.lastInvokedAt)}</td>
        <td className="px-4 py-2 text-right tabular-nums text-zinc-500">{user.invocations.toLocaleString()}</td>
        <td className="px-4 py-2 text-right tabular-nums text-amber-300">{formatCents(user.jdCents)}</td>
        <td className="px-4 py-2 text-right tabular-nums text-zinc-400">
          {user.tailoredResumes} <span className="text-zinc-600">/ {user.importRuns}</span>
        </td>
        <td className="px-4 py-2 text-right tabular-nums font-medium text-emerald-300">{formatCents(user.totalCents)}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="p-0"><UserBreakdown userId={id} /></td>
        </tr>
      )}
    </tbody>
  )
}

// ─── Tab ──────────────────────────────────────────────────────────────────────

export function BedrockCostTab() {
  const { data, isLoading } = useQuery(bedrockUsageQueries.summary())
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)

  const totalCents = data?.totalCents ?? 0
  const byPipeline = data?.byPipeline ?? {}
  const users = data?.byUser ?? []

  const importCents = byPipeline['resume-import'] ?? 0
  const syncCents = byPipeline['repo-sync'] ?? 0

  return (
    <div className="space-y-6">
      {/* Combined totals across all users */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { name: 'Total Spend (MTD)',   value: isLoading ? '…' : formatCents(totalCents) },
          { name: 'Resume Import (MTD)', value: isLoading ? '…' : formatCents(importCents) },
          { name: 'Repo Sync (MTD)',     value: isLoading ? '…' : formatCents(syncCents) },
        ].map((s) => (
          <div key={s.name} className="rounded-md border border-white/10 bg-white/4 p-4">
            <p className="text-xs text-zinc-500">{s.name}</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-100">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-md border border-white/10">
        <div className="border-b border-white/10 px-4 py-3">
          <p className="text-sm font-medium text-zinc-200">Cost by user</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Click a user to expand: last execution, charges, and the per-pipeline / repo / project / application breakdown.
            Resumes column = tailored / imports.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10 text-left text-zinc-500">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Last execution</th>
                <th className="px-4 py-3 font-medium text-right">Calls</th>
                <th className="px-4 py-3 font-medium text-right">JD spend</th>
                <th className="px-4 py-3 font-medium text-right">Resumes</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
              </tr>
            </thead>
            {isLoading && (
              <tbody><tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-600">Loading…</td></tr></tbody>
            )}
            {!isLoading && users.length === 0 && (
              <tbody><tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-600">No spend recorded yet</td></tr></tbody>
            )}
            {users.map((user) => {
              const id = user.userId ?? 'unattributed'
              return (
                <UserRow
                  key={id}
                  user={user}
                  expanded={expandedUserId === id}
                  onToggle={() => setExpandedUserId((cur) => (cur === id ? null : id))}
                />
              )
            })}
          </table>
        </div>
      </div>
    </div>
  )
}
