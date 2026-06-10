import { TriangleAlert } from 'lucide-react'
import type { ProjectChallenge } from '../../lib/types'
import { EmptyHint, Section } from './Section'

export function Challenges({ items }: { readonly items: ProjectChallenge[] }) {
  return (
    <Section icon={TriangleAlert} title="Challenges">
      {items.length === 0 ? (
        <EmptyHint>No challenges extracted yet.</EmptyHint>
      ) : (
        <ol className="space-y-4">
          {items.map((c) => (
            <li
              key={c.id}
              className="rounded-md bg-white/2 px-4 py-3 inset-ring inset-ring-white/10"
            >
              <p className="text-sm font-medium text-zinc-100">{c.problem}</p>
              {c.solution && (
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                  <span className="font-semibold text-zinc-300">Solution: </span>
                  {c.solution}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </Section>
  )
}
