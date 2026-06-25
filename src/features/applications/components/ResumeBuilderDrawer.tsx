'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DashboardDrawer } from '@/components/ui/DashboardDrawer'
import { ResumeBuilderApp } from '@/features/resume-theme/app/main'
import {
  getState,
  setState,
  enterEphemeralMode,
  exitEphemeralMode,
  setView,
  type AppState,
} from '@/features/resume-theme/app/state'
import {
  mapApplicationToBuilderState,
  builderStateToResumeData,
  builderStateToCoverLetter,
} from '../utils/resume-adapters'
import { updateApplicationCoverLetterFn, updateApplicationResumeFn } from '@/server/applications'
import type { ResumeData } from '@/lib/resumes/resume-data'
import type { CoverLetter } from '@/lib/types/applications.types'
import { useToastStore } from '@/lib/stores/toast-store'
import { adminKeys } from '@/lib/api/query-keys'

interface ResumeBuilderDrawerProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly resume: ResumeData
  readonly coverLetter: CoverLetter | null
  readonly company: string
  readonly role: string
  readonly slug: string
  readonly initialView?: 'resume' | 'cover'
}

export function ResumeBuilderDrawer({
  isOpen,
  onClose,
  resume,
  coverLetter,
  company,
  role,
  slug,
  initialView = 'resume',
}: ResumeBuilderDrawerProps) {
  const queryClient = useQueryClient()
  const { addToast } = useToastStore()
  const [builderKey, setBuilderKey] = useState(0)
  const prevStateRef = useRef<AppState | null>(null)

  // Load builder state when the drawer opens.
  useEffect(() => {
    if (!isOpen) return
    // Capture the base state once per open session — not on every prop change,
    // or a parent re-render would overwrite it with the already-edited state.
    if (prevStateRef.current === null) {
      prevStateRef.current = getState()
      enterEphemeralMode()
    }
    setState(() => mapApplicationToBuilderState(resume, coverLetter, company, role))
    setView(initialView)
    setBuilderKey((k) => k + 1)
  }, [isOpen, resume, coverLetter, company, role, initialView])

  const restore = useCallback(() => {
    if (prevStateRef.current) {
      const prev = prevStateRef.current
      setState(() => prev)
      prevStateRef.current = null
    }
    exitEphemeralMode()
  }, [])

  // Restore state on unmount.
  useEffect(() => () => { restore() }, [restore])

  const handleClose = useCallback(() => {
    restore()
    onClose()
  }, [restore, onClose])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const state = getState()
      const resume = builderStateToResumeData(state) as unknown as Record<string, unknown>
      await updateApplicationResumeFn({ data: { slug, resume } })
      if (coverLetter) {
        const cl = builderStateToCoverLetter(state, coverLetter.signoff)
        await updateApplicationCoverLetterFn({
          data: { slug, coverLetter: { ...cl, paragraphs: [...cl.paragraphs] } },
        })
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.applications.all })
      void queryClient.invalidateQueries({ queryKey: adminKeys.applications.tailoredResumes })
      void queryClient.invalidateQueries({ queryKey: adminKeys.applications.detail(slug) })
      addToast('success', 'Saved.')
      handleClose()
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Save failed.'
      addToast('error', message)
    },
  })

  if (!isOpen) return null

  return (
    <DashboardDrawer
      isOpen={isOpen}
      onClose={handleClose}
      title="Edit Tailored Resume"
      description={`${company} — ${role}`}
      unstyledContent
      fullBleed
      modal={false}
    >
      <ResumeBuilderApp
        key={builderKey}
        onClose={handleClose}
        onSave={() => saveMutation.mutate()}
      />
    </DashboardDrawer>
  )
}
