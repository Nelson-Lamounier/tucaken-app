'use client'

import { motion } from 'motion/react'
import { Database, FileText, GitBranch, Gauge, AlertTriangle } from 'lucide-react'
import type { KbHealth, KbTechnology } from '@/lib/types/kb.types'
import type { KbRetrievalStats } from '@/lib/types/applications.types'

// ── Verdict ───────────────────────────────────────────────────────────────────

type Verdict = { label: string; tone: string; dot: string }

/** Map a run's max cosine + passage count to a health verdict. */
function retrievalVerdict(stats: KbRetrievalStats): Verdict {
  if (stats.passageCount === 0) {
    return { label: 'No relevant evidence', tone: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' }
  }
  if (stats.maxCosine >= 0.4) {
    return { label: 'Strong match', tone: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' }
  }
  if (stats.maxCosine >= 0.25) {
    return { label: 'Moderate match', tone: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' }
  }
  return { label: 'Weak match', tone: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' }
}

// Visual full-scale for cosine bars — real portfolio↔JD cosine tops out ~0.5.
const COSINE_SCALE = 0.6
const pct = (cosine: number) => `${Math.min(100, Math.max(0, (cosine / COSINE_SCALE) * 100)).toFixed(1)}%`

// ── Sub-components ──────────────────────────────────────────────────────────────

function StatTile({ icon, label, value }: { readonly icon: React.ReactNode; readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
      <span className="text-accent">{icon}</span>
      <div className="min-w-0">
        <div className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{value}</div>
        <div className="truncate text-[11px] font-medium uppercase tracking-wide text-zinc-400">{label}</div>
      </div>
    </div>
  )
}

/** Horizontal bar with the floor marked — used for the cosine gauge. */
function CosineBar({ cosine, floor, label }: { readonly cosine: number; readonly floor: number; readonly label: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
        <span className="font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-200">{cosine.toFixed(3)}</span>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
        <motion.div
          className="h-full rounded-full bg-accent"
          initial={{ width: 0 }}
          animate={{ width: pct(cosine) }}
          transition={{ type: 'spring', visualDuration: 0.5, bounce: 0.1 }}
          style={{ willChange: 'transform' }}
        />
        {/* Floor marker */}
        <span
          className="absolute top-[-2px] h-3 w-px bg-zinc-400 dark:bg-zinc-500"
          style={{ left: pct(floor) }}
          aria-hidden
        />
      </div>
    </div>
  )
}

/** Top technologies as occurrence-weighted chips (from technology_evidence). */
function TechChips({ technologies }: { readonly technologies: readonly KbTechnology[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {technologies.map(t => (
        <span
          key={`${t.name}-${t.ecosystem ?? ''}`}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
        >
          {t.name}
          <span className="text-[10px] tabular-nums text-zinc-400">{t.occurrences}</span>
        </span>
      ))}
    </div>
  )
}

/** Repo composition bars (chunks per repo). */
function RepoBars({ repos, total }: { readonly repos: readonly { repo: string; chunks: number; files: number }[]; readonly total: number }) {
  return (
    <ul className="space-y-2">
      {repos.map(r => (
        <li key={r.repo}>
          <div className="mb-0.5 flex items-baseline justify-between gap-2">
            <span className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-200">{r.repo}</span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">
              {r.chunks} chunks · {r.files} files
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
            <motion.div
              className="h-full rounded-full bg-accent/70"
              initial={{ width: 0 }}
              animate={{ width: `${total > 0 ? (r.chunks / total) * 100 : 0}%` }}
              transition={{ type: 'spring', visualDuration: 0.5, bounce: 0.1 }}
              style={{ willChange: 'transform' }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Per-repo retrieved-passage bars (from kbRetrievalStats.repoBreakdown). */
function RetrievalRepoBars({ repos }: { readonly repos: readonly { readonly repo: string; readonly count: number }[] }) {
  const total = repos.reduce((n, r) => n + r.count, 0)
  return (
    <ul className="space-y-2">
      {repos.map(r => (
        <li key={r.repo}>
          <div className="mb-0.5 flex items-baseline justify-between gap-2">
            <span className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-200">{r.repo}</span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">{r.count} passages</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
            <motion.div
              className="h-full rounded-full bg-accent/70"
              initial={{ width: 0 }}
              animate={{ width: `${total > 0 ? (r.count / total) * 100 : 0}%` }}
              transition={{ type: 'spring', visualDuration: 0.5, bounce: 0.1 }}
              style={{ willChange: 'transform' }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Retrieval-health block (per research run). */
function RetrievalSection({ stats }: { readonly stats: KbRetrievalStats }) {
  const verdict = retrievalVerdict(stats)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          <Gauge className="size-4 text-accent" aria-hidden /> Retrieval relevance
        </h3>
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${verdict.tone}`}>
          <span className={`size-2 rounded-full ${verdict.dot}`} aria-hidden />
          {verdict.label}
        </span>
      </div>

      {stats.passageCount === 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          No portfolio passages cleared the relevance floor ({stats.floor.toFixed(2)}). The agent had no
          grounded evidence for this role — coaching falls back to gaps only.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <StatTile icon={<FileText className="size-4" />} label="Passages above floor" value={String(stats.passageCount)} />
            <StatTile icon={<Gauge className="size-4" />} label={`Floor`} value={stats.floor.toFixed(2)} />
          </div>
          <div className="space-y-3">
            <CosineBar cosine={stats.maxCosine} floor={stats.floor} label="Best match (cosine)" />
            <CosineBar cosine={stats.medianCosine} floor={stats.floor} label="Median match (cosine)" />
          </div>
          {stats.repoBreakdown.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Retrieved from</div>
              <RetrievalRepoBars repos={stats.repoBreakdown} />
            </div>
          )}
          {stats.topSources.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Top sources</div>
              <ul className="space-y-1">
                {stats.topSources.map(s => (
                  <li key={s.source} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate font-mono text-zinc-600 dark:text-zinc-300">{s.source}</span>
                    <span className="shrink-0 font-mono tabular-nums text-zinc-400">{s.cosine.toFixed(3)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Panel ───────────────────────────────────────────────────────────────────────

interface KnowledgeBaseHealthPanelProps {
  readonly kb?: KbHealth
  readonly retrieval?: KbRetrievalStats
  readonly loading?: boolean
  /** Compact card (retrieval-only) — for embedding inside a workspace. */
  readonly compact?: boolean
  readonly className?: string
}

/**
 * "Knowledge Base — data health at a glance." Composition (chunks/files/repos)
 * + per-run retrieval relevance. `compact` renders the retrieval block alone for
 * embedding in the Applied workspace; the full panel adds the composition view.
 */
export function KnowledgeBaseHealthPanel({ kb, retrieval, loading, compact, className }: KnowledgeBaseHealthPanelProps) {
  const shell = `rounded-md border border-zinc-200 bg-zinc-50/50 p-5 dark:border-white/10 dark:bg-white/2 ${className ?? ''}`

  if (compact) {
    return (
      <section className={shell}>
        <header className="mb-3 flex items-center gap-2">
          <Database className="size-4 text-accent" aria-hidden />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Knowledge Base health</h2>
        </header>
        {retrieval ? (
          <RetrievalSection stats={retrieval} />
        ) : (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Retrieval health appears after the next analysis run for this application.
          </p>
        )}
      </section>
    )
  }

  return (
    <section className={shell}>
      <header className="mb-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          <Database className="size-5 text-accent" aria-hidden /> Knowledge Base
        </h2>
        <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">Your AI agent&apos;s data health at a glance.</p>
      </header>

      {loading && (
        <div className="space-y-3" aria-hidden>
          <div className="h-16 animate-pulse rounded-md bg-zinc-100 dark:bg-white/5" />
          <div className="h-2 w-3/4 animate-pulse rounded-full bg-zinc-100 dark:bg-white/5" />
          <div className="h-2 w-1/2 animate-pulse rounded-full bg-zinc-100 dark:bg-white/5" />
        </div>
      )}

      {!loading && kb && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2">
            <StatTile icon={<FileText className="size-4" />} label="Chunks" value={kb.totalChunks.toLocaleString()} />
            <StatTile icon={<Database className="size-4" />} label="Files" value={kb.totalFiles.toLocaleString()} />
            <StatTile icon={<GitBranch className="size-4" />} label="Repos" value={String(kb.repoCount)} />
          </div>
          {kb.repos.length > 0 && (
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Indexed repositories</div>
              <RepoBars repos={kb.repos} total={kb.totalChunks} />
            </div>
          )}
          {kb.technologies && kb.technologies.length > 0 && (
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                Top technologies{kb.technologyCount ? <span className="ml-1 text-zinc-300 dark:text-zinc-600">· {kb.technologyCount} shown</span> : null}
              </div>
              <TechChips technologies={kb.technologies} />
            </div>
          )}
        </div>
      )}

      {!loading && !kb && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No indexed repositories yet. Connect a repo in Settings to seed your knowledge base.
        </p>
      )}

      {retrieval && (
        <div className="mt-5 border-t border-zinc-200 pt-5 dark:border-white/10">
          <RetrievalSection stats={retrieval} />
        </div>
      )}
    </section>
  )
}
