// src/features/onboarding/hooks/useOnboardingState.ts
//
// Local state for the first-run onboarding wizard. Steps advance
// in order; we expose imperative helpers (next/back/skip/jump) plus
// the data captured along the way.

import { useCallback, useState } from 'react'
import type { OnboardingData, ResumeSummary, StepId } from './types'
import { STEPS } from './types'

const STEP_INDEX: Record<StepId, number> = {
  welcome:   0,
  portfolio: 1,
  resume:    2,
  connect:   3,
  done:      4,
}

const ID_BY_INDEX: StepId[] = STEPS.map((s) => s.id)

export function useOnboardingState(initialStepIndex = 0) {
  const [stepIndex, setStepIndex] = useState(() =>
    Math.min(Math.max(initialStepIndex, 0), ID_BY_INDEX.length - 1),
  )
  const [data, setData] = useState<OnboardingData>({ githubConnected: false })

  const stepId = ID_BY_INDEX[stepIndex]

  const next = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, ID_BY_INDEX.length - 1))
  }, [])

  const back = useCallback(() => {
    setStepIndex((i) => Math.max(i - 1, 0))
  }, [])

  const jumpTo = useCallback((id: StepId) => {
    setStepIndex(STEP_INDEX[id])
  }, [])

  const setPortfolioUrl = useCallback((url: string) => {
    setData((d) => ({ ...d, portfolioUrl: url }))
  }, [])

  const setResume = useCallback((fileName: string, summary: ResumeSummary) => {
    setData((d) => ({ ...d, resume: { fileName, summary } }))
  }, [])

  const setGithubConnected = useCallback((connected: boolean) => {
    setData((d) => ({ ...d, githubConnected: connected }))
  }, [])

  return {
    stepIndex,
    stepId,
    data,
    next,
    back,
    jumpTo,
    setPortfolioUrl,
    setResume,
    setGithubConnected,
  }
}
