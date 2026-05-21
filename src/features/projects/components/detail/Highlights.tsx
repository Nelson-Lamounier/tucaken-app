import { Sparkles } from 'lucide-react'
import type { ProjectHighlight } from '../../lib/types'
import { EmptyHint, Section } from './Section'

export function Highlights({ items }: { readonly items: ProjectHighlight[] }) {
  return (
    <Section icon={Sparkles} title="Highlights">
      {items.length === 0 ? (
        <EmptyHint>No highlights extracted yet.</EmptyHint>
      ) : (
        <ul className="space-y-3">
          {items.map((h) => (
            <li
              key={h.id}
              className="rounded-xl bg-white/2 px-4 py-3 inset-ring inset-ring-white/10"
            >
              <p className="text-sm font-medium text-zinc-100">{h.title}</p>
              {h.description && (
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">{h.description}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
