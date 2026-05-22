import { Network } from 'lucide-react'
import type { ProjectArchitecture } from '../../lib/types'
import { ArchitectureDiagram } from '../ArchitectureDiagram'
import { EmptyHint, Section } from './Section'

export function Architecture({ architecture }: { readonly architecture: ProjectArchitecture | null }) {
  return (
    <Section icon={Network} title="Architecture">
      {architecture && architecture.diagram_source ? (
        <ArchitectureDiagram format={architecture.diagram_format} source={architecture.diagram_source} />
      ) : (
        <EmptyHint>No architecture diagram generated yet.</EmptyHint>
      )}
    </Section>
  )
}
