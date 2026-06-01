import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ApplicationDetailContainer } from '@/features/applications/components/ApplicationDetailContainer'
import { STAGE_ORDER } from '@/features/applications/stages/types/stage'

const stageSearchSchema = z.object({
  /** Active Stage. Omitted → shell falls back to the application's Current Stage. */
  stage: z.enum(STAGE_ORDER).optional(),
})

export const Route = createFileRoute('/_dashboard/applications/$slug')({
  validateSearch: stageSearchSchema,
  component: ApplicationDetailRoute,
})

function ApplicationDetailRoute() {
  const { slug } = Route.useParams()
  const { stage } = Route.useSearch()

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <ApplicationDetailContainer slug={slug} activeStage={stage} />
    </div>
  )
}
