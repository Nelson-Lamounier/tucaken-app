import { Layers } from 'lucide-react'
import {
  STACK_CATEGORY_LABELS,
  type ProjectStackItem,
  type StackCategory,
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
                  {subset.map((item) => (
                    <li
                      key={item.id}
                      title={item.justification ?? undefined}
                      className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-zinc-200 inset-ring inset-ring-white/10"
                    >
                      {item.name}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}
