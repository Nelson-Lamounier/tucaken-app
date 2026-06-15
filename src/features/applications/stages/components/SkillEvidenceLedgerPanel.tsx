import { Link2, GitBranch, FolderGit2, FileUser } from 'lucide-react'
import type { EvidenceStatus, SkillEvidenceEntry, SkillEvidenceLane } from '@/lib/types/applications.types'
import { tallyLedger, entryRetrievedRepos, LANE_LABEL, LANE_ORDER } from '../lib/evidence-quality'

/**
 * Skill Evidence Ledger — per-JD-tool proof from the user's own repos. One row
 * per tool: a status badge (verified / transferable / gap), the evidence prose,
 * the cited evidence files as GitHub blob links, and (transferable only) the
 * bridge narrative. Rows sort verified → transferable → gap. Renders nothing for
 * an empty ledger. Data: `detail.research.skillEvidenceLedger`.
 *
 * When `retrievalRepoCounts` is supplied (repo → retrieved-passage-count from
 * the same run's `kbRetrievalStats`), each row also shows whether its cited
 * repo surfaced in semantic retrieval — the structural↔semantic cross-check.
 */

const STATUS_ORDER: Record<EvidenceStatus, number> = {
  verified: 0,
  transferable: 1,
  gap: 2,
}

const STATUS_LABEL: Record<EvidenceStatus, string> = {
  verified: 'Verified',
  transferable: 'Transferable',
  gap: 'Gap',
}

const STATUS_BADGE: Record<EvidenceStatus, string> = {
  verified:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  transferable:
    'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  gap: 'border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-white/15 dark:bg-white/10 dark:text-zinc-300',
}

interface FileLink {
  readonly key: string
  readonly label: string
  readonly href?: string
}

/**
 * Build a GitHub blob link from an `owner/repo/rest…` path. Splits on the first
 * two slashes; anything that doesn't yield three parts is shown as plain text.
 */
function toFileLink(path: string, index: number): FileLink {
  const key = `${index}:${path}`
  const firstSlash = path.indexOf('/')
  if (firstSlash === -1) return { key, label: path }

  const secondSlash = path.indexOf('/', firstSlash + 1)
  if (secondSlash === -1) return { key, label: path }

  const owner = path.slice(0, firstSlash)
  const repo = path.slice(firstSlash + 1, secondSlash)
  const rest = path.slice(secondSlash + 1)
  if (owner.length === 0 || repo.length === 0 || rest.length === 0) {
    return { key, label: path }
  }

  return {
    key,
    label: path,
    href: `https://github.com/${owner}/${repo}/blob/HEAD/${rest}`,
  }
}

function EvidenceFiles({ files }: { readonly files: readonly string[] }) {
  if (files.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {files.map((file, index) => {
        const link = toFileLink(file, index)
        if (link.href) {
          return (
            <li key={link.key}>
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-accent underline-offset-2 hover:underline"
              >
                {link.label}
              </a>
            </li>
          )
        }
        return (
          <li key={link.key} className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {link.label}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * "Also retrieved" chip — shows that an entry's cited repo(s) surfaced in this
 * run's semantic retrieval, double-confirming the structural evidence. Sums the
 * retrieved passage counts across the entry's overlapping repos.
 */
function RetrievedChip({ entry, counts }: { readonly entry: SkillEvidenceEntry; readonly counts: Map<string, number> }) {
  const repos = entryRetrievedRepos(entry, counts)
  if (repos.length === 0) return null
  const passages = repos.reduce((n, r) => n + r.count, 0)
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
      title={`Also surfaced in semantic retrieval: ${repos.map((r) => `${r.repo} (${r.count})`).join(', ')}`}
    >
      <Link2 className="size-3" aria-hidden />
      also retrieved · {passages}
    </span>
  )
}

const LANE_ICON: Record<SkillEvidenceLane, React.ReactNode> = {
  repo: <GitBranch className="size-3" aria-hidden />,
  project: <FolderGit2 className="size-3" aria-hidden />,
  career: <FileUser className="size-3" aria-hidden />,
}

/** Source-lane chips (Repos / Projects / Résumé) for one entry. */
function LaneChips({ lanes }: { readonly lanes: readonly SkillEvidenceLane[] }) {
  if (lanes.length === 0) return null
  const ordered = LANE_ORDER.filter((l) => lanes.includes(l))
  return (
    <div className="flex flex-wrap gap-1.5">
      {ordered.map((lane) => (
        <span
          key={lane}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
        >
          {LANE_ICON[lane]}
          {LANE_LABEL[lane]}
        </span>
      ))}
    </div>
  )
}

function LedgerRow({ entry, counts }: { readonly entry: SkillEvidenceEntry; readonly counts: Map<string, number> }) {
  return (
    <li className="space-y-2 rounded-md border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-white/2">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {entry.tool}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {entry.status === 'verified' ? <RetrievedChip entry={entry} counts={counts} /> : null}
          <span
            className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[entry.status]}`}
          >
            {STATUS_LABEL[entry.status]}
          </span>
        </span>
      </div>

      {entry.evidence ? (
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{entry.evidence}</p>
      ) : null}

      {entry.sourceLanes && entry.sourceLanes.length > 0 ? <LaneChips lanes={entry.sourceLanes} /> : null}

      <EvidenceFiles files={entry.evidenceFiles} />

      {entry.status === 'transferable' && entry.transferableBridge ? (
        <p className="text-xs italic text-zinc-500 dark:text-zinc-400">{entry.transferableBridge}</p>
      ) : null}
    </li>
  )
}

/** Status-count summary line under the heading. */
function StatusTally({ ledger }: { readonly ledger: readonly SkillEvidenceEntry[] }) {
  const t = tallyLedger(ledger)
  const item = (dot: string, label: string, value: number) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${dot}`} aria-hidden />
      <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">{value}</span>
      <span className="text-zinc-400">{label}</span>
    </span>
  )
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {item('bg-emerald-500', 'verified', t.verified)}
      {item('bg-amber-500', 'transferable', t.transferable)}
      {item('bg-zinc-300 dark:bg-white/20', 'gap', t.gap)}
    </div>
  )
}

export function SkillEvidenceLedgerPanel({
  ledger,
  retrievalRepoCounts,
}: {
  readonly ledger: SkillEvidenceEntry[]
  /** repo → retrieved-passage-count from the same run's kbRetrievalStats. */
  readonly retrievalRepoCounts?: Map<string, number>
}) {
  if (ledger.length === 0) return null

  const rows = [...ledger].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
  const counts = retrievalRepoCounts ?? new Map<string, number>()

  return (
    <section className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50/50 p-5 dark:border-white/10 dark:bg-white/2">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Skill evidence — from your repos and experience
      </h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Each JD skill, grounded in your code where it exists and your career history where it doesn&apos;t.
      </p>
      <StatusTally ledger={ledger} />
      <ul className="space-y-2">
        {rows.map((entry) => (
          <LedgerRow key={entry.tool} entry={entry} counts={counts} />
        ))}
      </ul>
    </section>
  )
}
