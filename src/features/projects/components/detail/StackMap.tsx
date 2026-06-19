import { Layers } from 'lucide-react'
import {
  STACK_CATEGORY_LABELS,
  readVerifiedTech,
  type ProjectStackItem,
  type StackCategory,
  type VerifiedTech,
} from '../../lib/types'
import { EmptyHint, Section } from './Section'

const CATEGORY_ORDER: StackCategory[] = [
  'language',
  'framework',
  'database',
  'infrastructure',
  'observability',
  'ci_cd',
  'external_service',
]

/** The single best SBOM match for a stack item — prefer one carrying a version. */
function bestVerifiedTech(item: ProjectStackItem): VerifiedTech | null {
  const all = readVerifiedTech(item.source_signals)
  return all.find((t) => t.version != null) ?? all[0] ?? null
}

/** Tooltip text: justification plus the verified purl + declaration site. */
function pillTitle(item: ProjectStackItem, vt: VerifiedTech | null): string | undefined {
  const parts: string[] = []
  if (item.justification) parts.push(item.justification)
  if (vt?.purl) parts.push(vt.purl)
  if (vt?.path) parts.push(vt.line != null ? `${vt.path}:${vt.line}` : vt.path)
  return parts.length > 0 ? parts.join('\n') : undefined
}

export function StackMap({ items }: { readonly items: ProjectStackItem[] }) {
  return (
    <Section icon={Layers} title="Stack">
      {items.length === 0 ? (
        <EmptyHint>No stack items recorded yet.</EmptyHint>
      ) : (
        <div className="space-y-4">
          {CATEGORY_ORDER.map((category) => {
            const subset = items.filter((s) => s.category === category)
            if (subset.length === 0) return null
            return (
              <div key={category}>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  {STACK_CATEGORY_LABELS[category] ?? category}
                </h3>
                <ul className="flex flex-wrap gap-1.5">
                  {subset.map((item) => {
                    const vt = bestVerifiedTech(item)
                    return (
                      <li
                        key={item.id}
                        title={pillTitle(item, vt)}
                        className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-zinc-200 inset-ring inset-ring-white/10"
                      >
                        {item.name}
                        {vt?.version != null && (
                          <span
                            className="rounded-full bg-emerald-400/10 px-1.5 font-mono text-[10px] text-emerald-300"
                            title={vt.purl ?? undefined}
                          >
                            v{vt.version}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}
