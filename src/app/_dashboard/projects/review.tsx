import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { DashboardPage } from '@/components/layouts/DashboardPage'
import { ProjectReviewStep } from '@/features/projects/components/review/ProjectReviewStep'
import { projectsQueries } from '@/features/projects/server/queries'

export const Route = createFileRoute('/_dashboard/projects/review')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(projectsQueries.proposals())
  },
  component: ProjectReviewPage,
})

function ProjectReviewPage() {
  const navigate = useNavigate()
  return (
    <DashboardPage
      title="Review projects"
      description="Confirm the project groupings Tucaken detected from your repositories."
    >
      <ProjectReviewStep onComplete={() => void navigate({ to: '/projects' })} />
    </DashboardPage>
  )
}
