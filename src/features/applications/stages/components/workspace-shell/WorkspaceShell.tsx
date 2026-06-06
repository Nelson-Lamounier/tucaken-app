'use client'

import type { ReactNode } from 'react'
import type { ApplicationDetail, InterviewStage } from '@/lib/types/applications.types'
import { DetailRailProvider } from './selection'
import { DetailRailDrawer } from './DetailRail'
import { SummaryOrderProvider } from './summary-order'

interface WorkspaceShellProps {
  readonly detail: ApplicationDetail
  readonly activeStage: InterviewStage
  /** Initial selected row id from the `?focus` param. */
  readonly focus?: string
  /** Mirror selection back to the URL. */
  readonly onFocusChange?: (id: string | null) => void
  /** When true, only the first summary group starts open (rest collapsed). */
  readonly initialCollapse?: boolean
  /** Summary groups for the active workspace. */
  readonly children: ReactNode
}

/**
 * Master–detail layout for a stage workspace: a scannable left summary column
 * and a sticky, tabbed right rail (Detail · Notes · Timeline).
 * See docs/superpowers/specs/2026-06-04-applications-workspace-master-detail-design.md
 */
export function WorkspaceShell({
  detail,
  activeStage,
  focus,
  onFocusChange,
  initialCollapse = false,
  children,
}: WorkspaceShellProps) {
  // Keyed by stage so the "first group open" registry resets on each stage.
  const summaryColumn = initialCollapse ? (
    <SummaryOrderProvider key={activeStage}>{children}</SummaryOrderProvider>
  ) : (
    children
  )
  return (
    <DetailRailProvider initialFocus={focus} onFocusChange={onFocusChange}>
      <div className="space-y-6">{summaryColumn}</div>
      <DetailRailDrawer detail={detail} />
    </DetailRailProvider>
  )
}
