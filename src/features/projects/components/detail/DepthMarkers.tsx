import { CheckCircle2, CircleDashed, Cog, FileCheck2, FlaskConical, Rocket, ScrollText } from 'lucide-react'
import type { ProjectDepthMarkers } from '../../lib/types'
import { EmptyHint, Section } from './Section'

export function DepthMarkers({ markers }: { readonly markers: ProjectDepthMarkers | null }) {
  return (
    <Section icon={FileCheck2} title="Depth markers" subtitle="Signals scraped from the repo">
      {markers === null ? (
        <EmptyHint>Depth analysis hasn't run yet.</EmptyHint>
      ) : (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Marker
            icon={FlaskConical}
            label="Tests"
            present={markers.has_tests}
            detail={markers.test_coverage_signal}
          />
          <Marker
            icon={Cog}
            label="CI"
            present={markers.has_ci}
            detail={markers.ci_maturity.replace(/_/g, ' ')}
          />
          <Marker
            icon={ScrollText}
            label="Docs"
            present={markers.documentation_density !== 'none'}
            detail={markers.documentation_density.replace(/_/g, ' ')}
          />
          <Marker
            icon={Rocket}
            label="Deployed"
            present={markers.has_deployment_evidence}
            detail={markers.deployment_url ?? (markers.has_deployment_evidence ? 'evidence found' : 'not detected')}
          />
        </dl>
      )}
    </Section>
  )
}

interface MarkerProps {
  readonly icon:    React.ComponentType<{ className?: string }>
  readonly label:   string
  readonly present: boolean
  readonly detail:  string
}

function Marker({ icon: Icon, label, present, detail }: MarkerProps) {
  return (
    <div className="flex items-start gap-3 rounded-md bg-white/2 px-4 py-3 inset-ring inset-ring-white/10">
      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-md ${
          present
            ? 'bg-teal-400/10 text-teal-300 inset-ring inset-ring-teal-400/30'
            : 'bg-white/5 text-zinc-500 inset-ring inset-ring-white/10'
        }`}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium text-zinc-200">{label}</p>
          {present
            ? <CheckCircle2 className="size-3 text-teal-400" />
            : <CircleDashed className="size-3 text-zinc-600" />}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-zinc-500" title={detail}>{detail}</p>
      </div>
    </div>
  )
}
