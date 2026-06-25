import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ApplicationDetailContainer } from '@/features/applications/components/ApplicationDetailContainer'
import { STAGE_ORDER } from '@/features/applications/stages/types/stage'

const stageSearchSchema = z.object({
  /** Active Stage. Omitted → shell falls back to the application's Current Stage. */
  stage: z.enum(STAGE_ORDER).optional(),
  /** Selected summary-row id within the active workspace (master–detail focus). */
  focus: z.string().optional(),
})

export const Route = createFileRoute('/_dashboard/applications/$slug')({
  validateSearch: stageSearchSchema,
  // Opt out of the AppLayout <main> padding shell so this page is full-bleed.
  staticData: { disableMainWrapper: true },
  component: ApplicationDetailRoute,
})

function ApplicationDetailRoute() {
  const { slug } = Route.useParams()
  const { stage, focus } = Route.useSearch()
  const { me } = Route.useRouteContext()

  const viewer = me
    ? { id: me.id, email: me.email, role: me.plan.role, tier: me.plan.effectivePlan }
    : null

  return (
    <ApplicationDetailContainer
      slug={slug}
      activeStage={stage}
      focus={focus}
      viewerEmail={me?.email}
      viewer={viewer}
    />
  )
}
