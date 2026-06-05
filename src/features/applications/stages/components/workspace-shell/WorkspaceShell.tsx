'use client'

import type { ReactNode } from 'react'
import type { ApplicationDetail, InterviewStage } from '@/lib/types/applications.types'
import { DetailRailProvider } from './selection'
import { DetailRail } from './DetailRail'

interface WorkspaceShellProps {
  readonly detail: ApplicationDetail
  readonly activeStage: InterviewStage
  /** Initial selected row id from the `?focus` param. */
  readonly focus?: string
  /** Mirror selection back to the URL. */
  readonly onFocusChange?: (id: string | null) => void
  /** Summary groups for the active workspace. */
  readonly children: ReactNode
}

/**
 * Master–detail layout for a stage workspace: a scannable left summary column
 * and a sticky, tabbed right rail (Detail · Notes · Timeline).
 * See docs/superpowers/specs/2026-06-04-applications-workspace-master-detail-design.md
 */
export function WorkspaceShell({ detail, activeStage, focus, onFocusChange, children }: WorkspaceShellProps) {
  return (
    <DetailRailProvider initialFocus={focus} onFocusChange={onFocusChange}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-6">{children}</div>
        <div className="w-full lg:sticky lg:top-6 lg:w-auto">
          <DetailRail detail={detail} activeStage={activeStage} />
        </div>
      </div>
    </DetailRailProvider>
  )
}
