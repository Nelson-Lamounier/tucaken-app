import type { EvidenceStatus, SkillEvidenceEntry } from '@/lib/types/applications.types'

/**
 * Skill Evidence Ledger — per-JD-tool proof from the user's own repos. One row
 * per tool: a status badge (verified / transferable / gap), the evidence prose,
 * the cited evidence files as GitHub blob links, and (transferable only) the
 * bridge narrative. Rows sort verified → transferable → gap. Renders nothing for
 * an empty ledger. Data: `detail.research.skillEvidenceLedger`.
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

function LedgerRow({ entry }: { readonly entry: SkillEvidenceEntry }) {
  return (
    <li className="space-y-2 rounded-md border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-white/2">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {entry.tool}
        </span>
        <span
          className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[entry.status]}`}
        >
          {STATUS_LABEL[entry.status]}
        </span>
      </div>

      {entry.evidence ? (
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{entry.evidence}</p>
      ) : null}

      <EvidenceFiles files={entry.evidenceFiles} />

      {entry.status === 'transferable' && entry.transferableBridge ? (
        <p className="text-xs italic text-zinc-500 dark:text-zinc-400">{entry.transferableBridge}</p>
      ) : null}
    </li>
  )
}

export function SkillEvidenceLedgerPanel({ ledger }: { readonly ledger: SkillEvidenceEntry[] }) {
  if (ledger.length === 0) return null

  const rows = [...ledger].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])

  return (
    <section className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50/50 p-5 dark:border-white/10 dark:bg-white/2">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        Skill evidence — what your repos prove
      </h3>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Each JD tool, checked against your own code.
      </p>
      <ul className="space-y-2">
        {rows.map((entry) => (
          <LedgerRow key={entry.tool} entry={entry} />
        ))}
      </ul>
    </section>
  )
}
