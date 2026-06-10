import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { NewAnalysisPanel } from '@/features/applications/components/NewAnalysisPanel'
import { DashboardPage } from '@/components/layouts/DashboardPage'

export const Route = createFileRoute('/_dashboard/applications/new')({
  // Resume list is fetched client-side via useResumeVersions — auth + serialization
  // are reliable there. (A loader prefetch crashed under SSR for this endpoint.)
  component: ApplicationsNewRoute,
})

function ApplicationsNewRoute() {
  // `null` until ResumeMenuSelect resolves the default (active resume / most recent / scratch).
  const [resumeId, setResumeId] = useState<string | null>(null)

  return (
    <DashboardPage
      title="Resume Analysis"
      description="Create a new resume analysis."
    >
      <NewAnalysisPanel resumeId={resumeId} onResumeChange={setResumeId} />
    </DashboardPage>
  )
}
