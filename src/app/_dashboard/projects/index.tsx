import { createFileRoute } from '@tanstack/react-router'
import { DashboardPage } from '@/components/layouts/DashboardPage'
import { ProjectsIndex } from '@/features/projects/components/index/ProjectsIndex'
import { ProjectsHeaderActions } from '@/features/projects/components/index/ProjectsHeaderActions'

export const Route = createFileRoute('/_dashboard/projects/')({
  component: ProjectsPage,
})

function ProjectsPage() {
  return (
    <DashboardPage
      title="Projects"
      description="Case studies generated from your real GitHub work."
      actions={<ProjectsHeaderActions />}
    >
      <ProjectsIndex />
    </DashboardPage>
  )
}
