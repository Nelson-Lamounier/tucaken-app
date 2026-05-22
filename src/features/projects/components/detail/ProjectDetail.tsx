import { useQuery } from '@tanstack/react-query'
import { projectsQueries } from '../../server/queries'
import { Hero } from './Hero'
import { Pitch } from './Pitch'
import { Architecture } from './Architecture'
import { StackMap } from './StackMap'
import { DecisionLog } from './DecisionLog'
import { Highlights } from './Highlights'
import { Challenges } from './Challenges'
import { DepthMarkers } from './DepthMarkers'
import { ResumeBullets } from './ResumeBullets'
import { ShareCaseStudy } from './ShareCaseStudy'

export function ProjectDetail({ projectId }: { readonly projectId: string }) {
  const { data: project, isPending, isError, error } = useQuery(projectsQueries.detail(projectId))

  if (isPending) return <DetailSkeleton />
  if (isError) {
    return (
      <div className="rounded-2xl bg-rose-400/5 px-6 py-10 text-center inset-ring inset-ring-rose-400/30">
        <p className="text-sm font-medium text-rose-300">Couldn't load project</p>
        <p className="mt-1 text-xs text-rose-300/80">
          {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    )
  }
  if (!project) {
    return (
      <div className="rounded-2xl bg-white/2 px-6 py-10 text-center inset-ring inset-ring-white/10">
        <p className="text-sm text-zinc-400">Project not found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <Hero project={project} />
      <Pitch projectId={project.id} pitch={project.pitch} />
      <Architecture architecture={project.architecture} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <StackMap items={project.stack_items} />
        <DepthMarkers markers={project.depth_markers} />
      </div>
      <Highlights items={project.highlights} />
      <Challenges items={project.challenges} />
      <DecisionLog projectId={project.id} items={project.decisions} />
      <ResumeBullets angles={project.resume_bullets} />
      <ShareCaseStudy projectId={project.id} slug={project.slug} visibility={project.visibility} />
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading project detail">
      <div className="h-32 animate-pulse rounded-2xl bg-white/2 inset-ring inset-ring-white/10" />
      <div className="h-24 animate-pulse rounded-2xl bg-white/2 inset-ring inset-ring-white/10" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="h-48 animate-pulse rounded-2xl bg-white/2 inset-ring inset-ring-white/10" />
        <div className="h-48 animate-pulse rounded-2xl bg-white/2 inset-ring inset-ring-white/10" />
      </div>
    </div>
  )
}
