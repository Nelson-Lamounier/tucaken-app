'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { InterviewStage } from '@/lib/types/applications.types'
import { useStageDraft, type StageDraft } from './useStageDraft'

type StageDraftValue = ReturnType<typeof useStageDraft>

const StageDraftContext = createContext<StageDraftValue | null>(null)

interface StageDraftProviderProps {
  readonly slug: string
  readonly stage: InterviewStage
  readonly serverState?: Partial<StageDraft>
  readonly children: ReactNode
}

/**
 * Provides a single `useStageDraft` instance to everything inside it, so the
 * dashboard (e.g. the phone-screen Schedule panel) and the workspace can edit
 * the same persisted stage draft without two instances clobbering each other.
 */
export function StageDraftProvider({ slug, stage, serverState, children }: StageDraftProviderProps) {
  const value = useStageDraft(slug, stage, serverState)
  return <StageDraftContext.Provider value={value}>{children}</StageDraftContext.Provider>
}

export function useStageDraftContext(): StageDraftValue {
  const ctx = useContext(StageDraftContext)
  if (!ctx) throw new Error('useStageDraftContext must be used within a StageDraftProvider')
  return ctx
}
