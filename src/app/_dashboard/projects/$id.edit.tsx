import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { DashboardPage } from '@/components/layouts/DashboardPage'
import { ProjectEditor } from '@/features/projects/components/editor/ProjectEditor'
import { projectsQueries } from '@/features/projects/server/queries'

export const Route = createFileRoute('/_dashboard/projects/$id/edit')({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(projectsQueries.detail(params.id))
  },
  component: ProjectEditorPage,
})

function ProjectEditorPage() {
  const { id } = Route.useParams()
  return (
    <DashboardPage
      title="Edit project"
      description="Reorganise components — split into a new project or merge others in."
    >
      <Link
        to="/projects/$id"
        params={{ id }}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200"
      >
        <ArrowLeft className="size-3.5" />
        Back to project
      </Link>
      <ProjectEditor projectId={id} />
    </DashboardPage>
  )
}
