import { useState, useEffect, useRef } from 'react'
import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { notifyError } from '@/lib/errors/notify'
import { useApplicationsTrigger } from '../hooks/use-applications-trigger'
import { usePipelineNotificationsStore } from '@/lib/stores/pipeline-notifications-store'
import { useProgressModalStore } from '@/lib/stores/progress-modal-store'
import type { InterviewStage } from '@/lib/types/applications.types'
import { MIN_JD_LENGTH } from './ApplicationTypes'
import { FormInput } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { ResumeMenuSelect } from './ResumeMenuSelect'
import { TierActions } from './TierActions'
import { adminKeys } from '@/lib/api/query-keys'
import { getMeFn } from '@/server/me'

function DraftSaver({ values }: { readonly values: Record<string, unknown> }) {
  useEffect(() => {
    localStorage.setItem('application-form-draft', JSON.stringify(values))
  }, [values])
  return null
}

/** Header copy that adapts to whether Tucaken builds from scratch or uses a selected resume. */
function getSubtitle(resumeId: string | null): string {
  if (resumeId === '') return 'No resume selected. Tucaken builds one from scratch as it analyses the job.'
  return 'Paste a job description to analyse against your selected resume.'
}

export interface NewAnalysisPanelProps {
  /** `null` = default not yet resolved; `''` = build from scratch; otherwise a resume id. */
  readonly resumeId: string | null
  readonly onResumeChange: (resumeId: string) => void
}

export function NewAnalysisPanel({ resumeId, onResumeChange }: NewAnalysisPanelProps) {
  const trigger = useApplicationsTrigger()
  const addNotification = usePipelineNotificationsStore((s) => s.addNotification)
  const openProgress = useProgressModalStore((s) => s.openProgress)

  const { data: me } = useQuery({ queryKey: adminKeys.me.detail(), queryFn: getMeFn })
  const abFreeTier = me?.abFreeTier ?? false
  const pendingMode = useRef<'free' | 'standard' | undefined>(undefined)

  const [initialDraft] = useState(() => {
    if (typeof window === 'undefined') return null
    const saved = localStorage.getItem('application-form-draft')
    if (!saved) return null
    try {
      return JSON.parse(saved)
    } catch {
      return null
    }
  })

  const form = useForm({
    defaultValues: {
      jobDescription: initialDraft?.jobDescription || '',
      targetCompany: initialDraft?.targetCompany || '',
      targetRole: initialDraft?.targetRole || '',
      interviewStage: (initialDraft?.interviewStage || 'applied') as InterviewStage,
      includeCoverLetter: initialDraft?.includeCoverLetter ?? true,
      testMode: false,
    },
    onSubmit: async ({ value }) => {
      if (value.testMode) {
        const mockCompany = value.targetCompany.trim()
        const mockRole = value.targetRole.trim()
        const mockSlug = `mock-${Date.now()}`
        localStorage.removeItem('application-form-draft')
        form.reset()
        openProgress({ slug: mockSlug, startedAt: Date.now() })
        // Register the run in the notification bell too (the mock detail endpoint
        // drives it running → ready, and renders at /applications/<mock-slug>).
        addNotification({
          type: 'application',
          slug: mockSlug,
          label: `${mockCompany} — ${mockRole} (test)`,
          status: 'running',
          link: `/applications/${encodeURIComponent(mockSlug)}`,
        })
        return
      }

      const company = value.targetCompany.trim()
      const role = value.targetRole.trim()

      trigger.mutate(
        {
          jobDescription: value.jobDescription,
          targetCompany: company,
          targetRole: role,
          interviewStage: value.interviewStage,
          resumeId: resumeId ?? '',
          includeCoverLetter: value.includeCoverLetter,
          ...(pendingMode.current ? { mode: pendingMode.current } : {}),
        },
        {
          onSuccess: (data) => {
            localStorage.removeItem('application-form-draft')
            form.reset()
            openProgress({
              slug: data.applicationId,
              pipelineRunId: data.pipelineRunId,
              startedAt: Date.now(),
            })
            addNotification({
              type: 'application',
              slug: data.applicationId,
              label: `${company} — ${role}`,
              status: 'running',
              link: `/applications/${encodeURIComponent(data.applicationId)}`,
              pipelineRunId: data.pipelineRunId,
            })
          },
        },
      )
    }
  })

  // Listen for external retry events
  useEffect(() => {
    const handleRetry = (e: Event) => {
      const customEvent = e as CustomEvent
      const { targetCompany, targetRole, interviewStage } = customEvent.detail
      if (targetCompany) form.setFieldValue('targetCompany', targetCompany)
      if (targetRole) form.setFieldValue('targetRole', targetRole)
      if (interviewStage) form.setFieldValue('interviewStage', interviewStage)
    }
    window.addEventListener('application-retry', handleRetry)
    return () => window.removeEventListener('application-retry', handleRetry)
  }, [form])

  // Surface trigger failures as a standardized error toast (server detail is
  // stripped by notifyError) with a Retry that re-submits the form.
  useEffect(() => {
    if (!trigger.error) return
    notifyError(trigger.error, 'analysis', { onRetry: () => void form.handleSubmit() })
  }, [trigger.error, form])

  return (
    <div className="mb-8 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/5 shadow-sm">
      <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-zinc-200 dark:border-white/10">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Analyse New Job Description
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {getSubtitle(resumeId)}
          </p>
        </div>
        <div className="flex-none">
          <ResumeMenuSelect resumeId={resumeId} onChange={onResumeChange} />
        </div>
      </div>

      <form
        className="p-6 sm:p-8"
        onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            form.handleSubmit()
          }}
        >
          <form.Subscribe
            selector={(state) => state.values}
            children={(values) => <DraftSaver values={values} />}
          />

          {/* Side-by-side: narrow target details (left) + wider job description (right) */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
            {/* Left column: target company + role stacked */}
            <div className="space-y-4 lg:col-span-1">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                  Target company & role
                </h3>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Company and role let Tucaken tailor your analysis and cover letter. Which are you targeting?
                </p>
              </div>
              <form.Field
                name="targetCompany"
                children={(field) => (
                  <FormInput
                    field={field}
                    label="Target Company"
                    placeholder="e.g. Revolut"
                  />
                )}
              />
              <form.Field
                name="targetRole"
                children={(field) => (
                  <FormInput
                    field={field}
                    label="Target Role"
                    placeholder="e.g. Senior DevOps Engineer"
                  />
                )}
              />
            </div>

            {/* Right column: job description (wider — 2/3) */}
            <div className="flex flex-col lg:col-span-2">
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="jobDescription" className="block text-sm/6 font-medium text-zinc-900 dark:text-white">
                  Job Description
                </label>
                <form.Subscribe
                  selector={(state) => state.values.jobDescription}
                  children={(jd) => (
                    <span
                      className={`text-xs ${
                        jd.length >= MIN_JD_LENGTH ? 'text-emerald-500' : 'text-zinc-500'
                      }`}
                    >
                      {jd.length} / {MIN_JD_LENGTH} characters minimum
                    </span>
                  )}
                />
              </div>
              <form.Field
                name="jobDescription"
                children={(field) => (
                  <textarea
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Paste the full job description: responsibilities, requirements, qualifications."
                    className="block h-full min-h-80 w-full flex-1 resize-y rounded-md border-0 bg-zinc-50 p-2 text-base/6 text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 focus:ring-2 focus:ring-inset focus:ring-teal-500 lg:min-h-96 dark:bg-white/5 dark:text-white dark:ring-white/10"
                  />
                )}
              />
            </div>
          </div>

          {/* Options row — bottom of the component */}
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2">
              <form.Field
                name="includeCoverLetter"
                children={(field) => (
                  <input
                    id={field.name}
                    name={field.name}
                    type="checkbox"
                    checked={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-800 text-indigo-600 focus:ring-indigo-500/20 focus:ring-offset-0 focus:ring-offset-white dark:focus:ring-offset-zinc-900"
                  />
                )}
              />
              <label htmlFor="includeCoverLetter" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Generate Cover Letter
              </label>
            </div>

            <div className="flex items-center gap-2">
              <form.Field
                name="testMode"
                children={(field) => (
                  <input
                    id={field.name}
                    name={field.name}
                    type="checkbox"
                    checked={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-800 text-emerald-500 focus:ring-emerald-500/20 focus:ring-offset-0 focus:ring-offset-white dark:focus:ring-offset-zinc-900"
                  />
                )}
              />
              <label htmlFor="testMode" className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                Run in Test Mode
              </label>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">mock data, skips the real run</span>
            </div>
          </div>

          {/* Errors surface as a standardized top-right toast (see notifyError). */}

          {/* Actions */}
          <form.Subscribe
            selector={(state) => [state.values.jobDescription, state.values.targetCompany, state.values.targetRole]}
            children={([jd, company, role]) => {
              const isValid =
                resumeId !== null &&
                jd.length >= MIN_JD_LENGTH &&
                company.trim().length > 0 &&
                role.trim().length > 0
              
              return (
                <div className="mt-5 flex items-center justify-between">
                  <p className="text-xs text-zinc-500">
                    {isValid
                      ? '✓ Ready to analyse'
                      : `Fill in company, role, and a job description (${MIN_JD_LENGTH}+ characters)`}
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => {
                        form.reset()
                        localStorage.removeItem('application-form-draft')
                      }}
                    >
                      Clear
                    </Button>
                    <TierActions
                      abFreeTier={abFreeTier}
                      isValid={isValid}
                      isPending={trigger.isPending}
                      onSubmit={(mode) => {
                        pendingMode.current = mode
                        form.handleSubmit()
                      }}
                    />
                  </div>
                </div>
              )
            }}
          />
        </form>
    </div>
  )
}
