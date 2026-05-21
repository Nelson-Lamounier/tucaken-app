import { FileText } from 'lucide-react'
import { EmptyHint, Section } from './Section'

export function Pitch({ pitch }: { readonly pitch: string | null }) {
  return (
    <Section icon={FileText} title="Pitch">
      {pitch ? (
        <p className="text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap">{pitch}</p>
      ) : (
        <EmptyHint>Pitch hasn't been generated yet.</EmptyHint>
      )}
    </Section>
  )
}
