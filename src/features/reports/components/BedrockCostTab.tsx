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

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(4)}`
}

function pipelineBadgeClass(pipeline: string): string {
  if (pipeline === 'resume-import') return 'bg-violet-500/15 text-violet-300 ring-violet-400/25'
  if (pipeline === 'repo-sync')     return 'bg-sky-500/15 text-sky-300 ring-sky-400/25'
  if (pipeline === 'job-strategist') return 'bg-amber-500/15 text-amber-300 ring-amber-400/25'
  return 'bg-zinc-500/15 text-zinc-300 ring-zinc-400/25'
}

// repo-sync rows carry the raw syncType the worker computed. 'initial' is a
// repo's first ingest; everything else is a resync.
function syncKindLabel(kind: string | null): string {
  if (kind === 'initial') return 'Initial sync'
  if (kind === 'full_reindex') return 'Resync (full)'
  if (kind === 'incremental') return 'Resync (delta)'
  return 'Unclassified'
}

function userLabel(userId: string | null, email: string | null): string {
  if (email) return email
  if (userId) return userId
  return 'Unattributed'
}

function applicationLabel(row: ApplicationCostRow): string {
  if (row.company && row.role) return `${row.company} — ${row.role}`
  if (row.company) return row.company
  return row.applicationId
}

// ─── Shared card shell ────────────────────────────────────────────────────────

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-white/10">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="text-sm font-medium text-zinc-200">{title}</p>
        {subtitle ? <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p> : null}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-zinc-600">{label}</td>
    </tr>
  )
}

// ─── Breakdown tables ─────────────────────────────────────────────────────────

function UserCostTable({ rows, isLoading }: { rows: UserCostRow[]; isLoading: boolean }) {
  return (
    <SectionCard title="Cost by user" subtitle="Accurate monthly spend per user (SQL aggregate).">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10 text-left text-zinc-500">
            <th className="px-4 py-3 font-medium">User</th>
            <th className="px-4 py-3 font-medium text-right">Tokens In</th>
            <th className="px-4 py-3 font-medium text-right">Tokens Out</th>
            <th className="px-4 py-3 font-medium text-right">Calls</th>
            <th className="px-4 py-3 font-medium text-right">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/6">
          {isLoading && <EmptyRow colSpan={5} label="Loading…" />}
          {!isLoading && rows.length === 0 && <EmptyRow colSpan={5} label="No spend recorded yet" />}
          {rows.map((r) => (
            <tr key={r.userId ?? r.email ?? 'unattributed'} className="text-zinc-300 hover:bg-white/2">
              <td className="max-w-64 truncate px-4 py-2">{userLabel(r.userId, r.email)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{r.inputTokens.toLocaleString()}</td>
              <td className="px-4 py-2 text-right tabular-nums">{r.outputTokens.toLocaleString()}</td>
              <td className="px-4 py-2 text-right tabular-nums text-zinc-500">{r.invocations.toLocaleString()}</td>
              <td className="px-4 py-2 text-right tabular-nums text-emerald-300">{formatCents(r.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  )
}

function RepoCostTable({ rows, isLoading }: { rows: RepoCostRow[]; isLoading: boolean }) {
  return (
    <SectionCard title="Repository sync cost" subtitle="repo-sync spend per repository, split by initial sync vs resync.">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10 text-left text-zinc-500">
            <th className="px-4 py-3 font-medium">Repository</th>
            <th className="px-4 py-3 font-medium">Sync kind</th>
            <th className="px-4 py-3 font-medium text-right">Calls</th>
            <th className="px-4 py-3 font-medium text-right">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/6">
          {isLoading && <EmptyRow colSpan={4} label="Loading…" />}
          {!isLoading && rows.length === 0 && <EmptyRow colSpan={4} label="No repository syncs recorded yet" />}
          {rows.map((r) => (
            <tr key={`${r.repoName}:${r.syncKind ?? 'none'}`} className="text-zinc-300 hover:bg-white/2">
              <td className="max-w-64 truncate px-4 py-2 font-mono text-[10px] text-zinc-400">{r.repoName}</td>
              <td className="px-4 py-2 text-zinc-400">{syncKindLabel(r.syncKind)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-zinc-500">{r.invocations.toLocaleString()}</td>
              <td className="px-4 py-2 text-right tabular-nums text-emerald-300">{formatCents(r.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  )
}

function ApplicationCostTable({ rows, isLoading }: { rows: ApplicationCostRow[]; isLoading: boolean }) {
  return (
    <SectionCard title="Cost by job application" subtitle="job-strategist spend per application.">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10 text-left text-zinc-500">
            <th className="px-4 py-3 font-medium">Application</th>
            <th className="px-4 py-3 font-medium text-right">Calls</th>
            <th className="px-4 py-3 font-medium text-right">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/6">
          {isLoading && <EmptyRow colSpan={3} label="Loading…" />}
          {!isLoading && rows.length === 0 && <EmptyRow colSpan={3} label="No application spend recorded yet" />}
          {rows.map((r) => (
            <tr key={r.applicationId} className="text-zinc-300 hover:bg-white/2">
              <td className="max-w-72 truncate px-4 py-2">{applicationLabel(r)}</td>
              <td className="px-4 py-2 text-right tabular-nums text-zinc-500">{r.invocations.toLocaleString()}</td>
              <td className="px-4 py-2 text-right tabular-nums text-emerald-300">{formatCents(r.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  )
}

function ProjectCostTable({ rows, isLoading }: { rows: ProjectCostRow[]; isLoading: boolean }) {
  return (
    <SectionCard title="Cost by project" subtitle="project-case-study spend per project.">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10 text-left text-zinc-500">
            <th className="px-4 py-3 font-medium">Project</th>
            <th className="px-4 py-3 font-medium text-right">Calls</th>
            <th className="px-4 py-3 font-medium text-right">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/6">
          {isLoading && <EmptyRow colSpan={3} label="Loading…" />}
          {!isLoading && rows.length === 0 && <EmptyRow colSpan={3} label="No project spend recorded yet" />}
          {rows.map((r) => (
            <tr key={r.projectId} className="text-zinc-300 hover:bg-white/2">
              <td className="max-w-72 truncate px-4 py-2">{r.name ?? r.projectId}</td>
              <td className="px-4 py-2 text-right tabular-nums text-zinc-500">{r.invocations.toLocaleString()}</td>
              <td className="px-4 py-2 text-right tabular-nums text-emerald-300">{formatCents(r.totalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  )
}

function DetailTable({ rows, isLoading }: { rows: PromptInvocationRow[]; isLoading: boolean }) {
  return (
    <SectionCard title="Invocations" subtitle="Most recent 500 calls in the window.">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/10 text-left text-zinc-500">
            <th className="px-4 py-3 font-medium">User</th>
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
          {isLoading && <EmptyRow colSpan={8} label="Loading…" />}
          {!isLoading && rows.length === 0 && <EmptyRow colSpan={8} label="No invocations recorded yet" />}
          {rows.map((row) => (
            <tr key={row.id} className="text-zinc-300 hover:bg-white/2">
              <td className="max-w-40 truncate px-4 py-2 text-zinc-400">{userLabel(row.userId, row.email)}</td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${pipelineBadgeClass(row.pipeline)}`}>
                  {row.pipeline}
                </span>
              </td>
              <td className="px-4 py-2 font-mono text-[10px] text-zinc-400">{row.modelId.split('/').pop() ?? row.modelId}</td>
              <td className="px-4 py-2 text-right tabular-nums">{row.inputTokens.toLocaleString()}</td>
              <td className="px-4 py-2 text-right tabular-nums">{row.outputTokens.toLocaleString()}</td>
              <td className="px-4 py-2 text-right tabular-nums text-emerald-300">{formatCents(row.totalCostCents)}</td>
              <td className="max-w-32 truncate px-4 py-2 text-zinc-500">{row.importId ?? row.repoName ?? '—'}</td>
              <td className="px-4 py-2 text-zinc-500">
                {new Date(row.invokedAt).toLocaleString('en-GB', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  )
}

// ─── Tab ──────────────────────────────────────────────────────────────────────

export function BedrockCostTab() {
  // Unfiltered query: populates the user picker so its options never vanish
  // when a filter narrows the rest of the view.
  const allUsers = useQuery(bedrockUsageQueries.summary())
  const [userId, setUserId] = useState('')

  // When userId is '' this resolves to the same query key as allUsers above,
  // so TanStack Query dedupes them into a single request.
  const view = useQuery(bedrockUsageQueries.summary(undefined, userId || undefined))

  const isLoading = view.isLoading
  const data = view.data

  const totalCents = data?.totalCents ?? 0
  const byPipeline = data?.byPipeline ?? {}
  const importCents = byPipeline['resume-import'] ?? 0
  const syncCents = byPipeline['repo-sync'] ?? 0

  const userOptions = allUsers.data?.byUser ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid grow grid-cols-1 gap-4 sm:grid-cols-3">
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
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="cost-user-filter" className="text-xs text-zinc-500">Filter by user</label>
        <select
          id="cost-user-filter"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="rounded-md border border-white/10 bg-white/4 px-3 py-1.5 text-xs text-zinc-200"
        >
          <option value="">All users</option>
          {userOptions
            .filter((u) => u.userId)
            .map((u) => (
              <option key={u.userId} value={u.userId ?? ''}>{userLabel(u.userId, u.email)}</option>
            ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <UserCostTable rows={data?.byUser ?? []} isLoading={isLoading} />
        <RepoCostTable rows={data?.byRepo ?? []} isLoading={isLoading} />
        <ApplicationCostTable rows={data?.byApplication ?? []} isLoading={isLoading} />
        <ProjectCostTable rows={data?.byProject ?? []} isLoading={isLoading} />
      </div>

      <DetailTable rows={data?.rows ?? []} isLoading={isLoading} />
    </div>
  )
}
