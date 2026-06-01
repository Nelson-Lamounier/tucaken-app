import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * Retired hub route (ADR-0002). Interview prep is now per-application inside
 * the stage-workspace shell at /applications/$slug?stage=…. This redirect
 * keeps old bookmarks working — pick an application from the list, then prep
 * lives in its stage workspaces.
 */
export const Route = createFileRoute('/_dashboard/applications/interview-prep')({
  beforeLoad: () => {
    throw redirect({ to: '/applications/list' })
  },
})
