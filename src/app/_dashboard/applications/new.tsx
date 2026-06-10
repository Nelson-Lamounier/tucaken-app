import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { NewAnalysisPanel } from '@/features/applications/components/NewAnalysisPanel'
import { resumeVersionsQueryOptions } from '@/features/applications/hooks/use-resume-versions'
import { DashboardPage } from '@/components/layouts/DashboardPage'

export const Route = createFileRoute('/_dashboard/applications/new')({
  // Prefetch the resume list so the picker resolves on first render (no skeleton flash).
  // Return void — the SSR-query integration dehydrates the cache; returning the
  // data as loader output would double-serialize it and break deserialization.
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(resumeVersionsQueryOptions())
  },
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
