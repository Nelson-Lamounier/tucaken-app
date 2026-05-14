'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

import {
  CheckCircle,
  Plus,
  FileText,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getResumesFn,
  setActiveResumeFn,
  deleteResumeFn,
  getResumeFn,
  createResumeFn,
} from '@/server/resumes'
import { getTailoredResumesFn } from '@/server/applications'
import type { TailoredResumeSummary } from '@/server/applications'
import type { ResumeSummary } from '@/server/resumes'
import type { ResumeData } from '@/lib/resumes/resume-data'
import { useToastStore } from '@/lib/stores/toast-store'
import { adminKeys } from '@/lib/api/query-keys'

import { Link } from '@tanstack/react-router'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Button } from '@/components/ui/Button'
import { DashboardDrawer } from '@/components/ui/DashboardDrawer'
import DropDownOptions from '@/components/ui/DropDownOptions'
import { ResumeBuilderApp } from '@/features/resume-theme/app/main'
import {
  getState,
  setState,
  enterEphemeralMode,
  exitEphemeralMode,
  type AppState,
} from '@/features/resume-theme/app/state'
import { mapApplicationToBuilderState } from '@/features/applications/utils/resume-adapters'

export function ResumesDisplayer() {
  const { addToast } = useToastStore()
  const queryClient = useQueryClient()

  const { data: resumes = [], isLoading, error: queryError, refetch } = useQuery({
    queryKey: adminKeys.resumes.list(),
    queryFn: () => getResumesFn(),
  })

  const { data: tailoredResumes = [] } = useQuery({
    queryKey: [...adminKeys.applications.all, 'tailored-resumes'],
    queryFn: () => getTailoredResumesFn(),
  })

  // Builder drawer state
  const [isBuilderOpen, setIsBuilderOpen] = useState(false)
  const [builderKey, setBuilderKey] = useState(0)
  const prevStateRef = useRef<AppState | null>(null)

  // For manually-created resumes: fetch detail on demand then seed builder
  const [pendingResumeId, setPendingResumeId] = useState<string | null>(null)
  const { data: pendingResumeDetail } = useQuery({
    queryKey: adminKeys.resumes.detail(pendingResumeId ?? ''),
    queryFn: () => getResumeFn({ data: pendingResumeId! }),
    enabled: !!pendingResumeId,
  })

  useEffect(() => {
    if (!pendingResumeId || !pendingResumeDetail) return
    prevStateRef.current = getState()
    enterEphemeralMode()
    try {
      setState(() =>
        mapApplicationToBuilderState(
          pendingResumeDetail.data as unknown as ResumeData,
          null,
          '',
          '',
        ),
      )
    } catch {
      exitEphemeralMode()
      prevStateRef.current = null
      setPendingResumeId(null)
      addToast('error', 'Failed to load resume into editor.')
      return
    }
    setBuilderKey((k) => k + 1)
    setIsBuilderOpen(true)
    setPendingResumeId(null)
  }, [pendingResumeDetail, pendingResumeId, addToast])

  const handleOpenBuilderForTailored = useCallback((tr: TailoredResumeSummary) => {
    prevStateRef.current = getState()
    enterEphemeralMode()
    try {
      setState(() =>
        mapApplicationToBuilderState(
          tr.data as unknown as ResumeData,
          null,
          tr.targetCompany,
          tr.targetRole,
        ),
      )
    } catch {
      exitEphemeralMode()
      prevStateRef.current = null
      addToast('error', 'Failed to load resume into editor.')
      return
    }
    setBuilderKey((k) => k + 1)
    setIsBuilderOpen(true)
  }, [addToast])

  const handleCloseBuilder = useCallback(() => {
    setIsBuilderOpen(false)
    if (prevStateRef.current) {
      setState(() => prevStateRef.current!)
      prevStateRef.current = null
    }
    exitEphemeralMode()
  }, [])

  useEffect(() => {
    return () => {
      if (prevStateRef.current) {
        setState(() => prevStateRef.current!)
        prevStateRef.current = null
        exitEphemeralMode()
      }
    }
  }, [])

  const activateMutation = useMutation({
    mutationFn: (id: string) => setActiveResumeFn({ data: id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.resumes.all })
      addToast('success', 'Resume published successfully.')
    },
    onError: (err: Error) => addToast('error', err.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteResumeFn({ data: id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.resumes.all })
      addToast('success', 'Resume deleted successfully.')
    },
    onError: (err: Error) => addToast('error', err.message),
  })

  const publishTailoredMutation = useMutation({
    mutationFn: async (tr: TailoredResumeSummary) => {
      const created = await createResumeFn({
        data: {
          label: `${tr.targetCompany} — ${tr.targetRole}`,
          data: tr.data as unknown as Record<string, unknown>,
        },
      })
      await setActiveResumeFn({ data: created.resumeId })
      return created
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.resumes.all })
      addToast('success', 'Resume published successfully.')
    },
    onError: (err: Error) => addToast('error', err.message),
  })

  const error = queryError?.message ?? null
  const activeResume = resumes.find((r: ResumeSummary) => r.isActive)
  const inactiveResumes = resumes.filter((r: ResumeSummary) => !r.isActive)

  function handleActivate(resumeId: string): void {
    activateMutation.mutate(resumeId)
  }

  function handleDelete(resumeId: string, label: string): void {
    const confirmed = globalThis.window.confirm(
      `Are you sure you want to delete "${label}"?\n\nThis action cannot be undone.`,
    )
    if (!confirmed) return
    deleteMutation.mutate(resumeId)
  }

  function renderActions(resume: ResumeSummary) {
    return (
      <DropDownOptions
        label={resume.isActive ? 'Published' : 'Actions'}
        disabled={activateMutation.isPending || deleteMutation.isPending}
        onEdit={() => setPendingResumeId(resume.resumeId)}
        onPublish={!resume.isActive ? () => handleActivate(resume.resumeId) : undefined}
        onDelete={!resume.isActive ? () => handleDelete(resume.resumeId, resume.label) : undefined}
      />
    )
  }

  if (isLoading) {
    return <div className="text-zinc-400 py-10 text-center text-sm">Loading resumes...</div>
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-6 text-center text-red-400">
        <p className="text-sm">{error}</p>
        <Button variant="secondary" size="sm" onClick={() => refetch()} className="mt-4">
          Retry
        </Button>
      </div>
    )
  }

  if (resumes.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-zinc-800 p-12 text-center text-zinc-400">
        <FileText className="mx-auto size-12 opacity-50" />
        <h3 className="mt-4 text-sm font-semibold text-zinc-200">No resumes yet</h3>
        <p className="mt-2 text-xs">Create your first role-tailored resume to get started.</p>
        <Link
          to="/resumes/new"
          className="mt-6 inline-flex items-center justify-center gap-2 px-3 py-1 text-xs font-medium text-white bg-teal-600 rounded hover:bg-teal-500 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500"
        >
          <Plus className="size-4" />
          Create Resume
        </Link>
      </div>
    )
  }

  return (
    <div className="mt-8 space-y-12">
      {/* Header actions */}
      <div className="flex justify-end">
        <Link
          to="/resumes/new"
          className="inline-flex items-center justify-center gap-2 px-3 py-1 text-xs font-medium text-white bg-teal-600 rounded hover:bg-teal-500 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal-500"
        >
          <Plus className="size-4" />
          New Resume
        </Link>
      </div>

      {/* Active Resume */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-teal-500">
          <CheckCircle className="size-4" />
          Currently Published
        </h2>
        {activeResume ? (
          <SectionHeader
            title={`${activeResume.label} (Active)`}
            description={`Last updated: ${new Date(activeResume.updatedAt).toLocaleDateString('en-GB')}`}
            action={renderActions(activeResume)}
          />
        ) : (
          <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-500">
            <strong>No active resume.</strong> None of your resume versions are currently published.
          </div>
        )}
      </section>

      {/* Inactive Versions */}
      {inactiveResumes.length > 0 && (
        <section>
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-zinc-400">
            Other Versions ({inactiveResumes.length})
          </h2>
          <div className="space-y-4">
            {inactiveResumes.map((resume) => (
              <SectionHeader
                key={resume.resumeId}
                title={resume.label}
                description={`Updated: ${new Date(resume.updatedAt).toLocaleDateString('en-GB')}`}
                action={renderActions(resume)}
              />
            ))}
          </div>
        </section>
      )}

      {/* AI-Generated Tailored Resumes */}
      {tailoredResumes.length > 0 && (
        <section>
          <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-indigo-400">
            AI-Generated Tailored Resumes ({tailoredResumes.length})
          </h2>
          <div className="space-y-4">
            {tailoredResumes.map((tr) => (
              <SectionHeader
                key={tr.slug}
                title={`${tr.targetCompany} — ${tr.targetRole}`}
                description={`Generated: ${new Date(tr.updatedAt).toLocaleDateString('en-GB')}`}
                action={
                  <DropDownOptions
                    label="Actions"
                    disabled={publishTailoredMutation.isPending}
                    onEdit={() => handleOpenBuilderForTailored(tr)}
                    onPublish={() => publishTailoredMutation.mutate(tr)}
                  />
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Resume Builder Drawer */}
      <DashboardDrawer
        isOpen={isBuilderOpen}
        onClose={handleCloseBuilder}
        title="Edit Resume"
        unstyledContent
        fullBleed
      >
        {isBuilderOpen && (
          <ResumeBuilderApp key={builderKey} onClose={handleCloseBuilder} />
        )}
      </DashboardDrawer>
    </div>
  )
}
