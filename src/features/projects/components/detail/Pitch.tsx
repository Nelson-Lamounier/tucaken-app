import { FileText } from 'lucide-react'
import { Section } from './Section'
import { InlineText } from './InlineText'
import { usePatchProject } from '../../server/mutations'

export interface PitchProps {
  readonly projectId: string
  readonly pitch:     string | null
}

export function Pitch({ projectId, pitch }: PitchProps) {
  const patch = usePatchProject(projectId)
  return (
    <Section icon={FileText} title="Pitch">
      <InlineText
        value={pitch}
        multiline
        placeholder="Click to write the project pitch…"
        ariaLabel="project pitch"
        onSave={(next) => patch.mutate({ pitch: next })}
      />
      {patch.isError && (
        <p className="mt-2 text-xs text-rose-300">
          {patch.error instanceof Error ? patch.error.message : 'Update failed — change reverted'}
        </p>
      )}
    </Section>
  )
}
