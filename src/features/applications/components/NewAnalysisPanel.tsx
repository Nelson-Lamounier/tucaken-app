import { useState, useEffect } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { useForm } from '@tanstack/react-form'
import { useApplicationsTrigger } from '../hooks/use-applications-trigger'
import { usePipelineNotificationsStore } from '@/lib/stores/pipeline-notifications-store'
import type { InterviewStage } from '@/lib/types/applications.types'
import { MIN_JD_LENGTH } from './ApplicationTypes'
import { FormInput } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { ProgressBars } from './ProgressBars'
import { ResumeMenuSelect } from './ResumeMenuSelect'

function DraftSaver({ values }: { readonly values: Record<string, unknown> }) {
  useEffect(() => {
    localStorage.setItem('application-form-draft', JSON.stringify(values))
  }, [values])
  return null
}

/** Header copy that adapts to whether the agent builds from scratch or uses a selected resume. */
function getSubtitle(resumeId: string | null): string {
  if (resumeId === '') return 'The agent will build your resume from scratch.'
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
  const [submittedSlug, setSubmittedSlug] = useState<string | null>(null)
  const [submittedRunId, setSubmittedRunId] = useState<string | null>(null)

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
        localStorage.removeItem('application-form-draft')
        form.reset()
        setSubmittedSlug(`mock-${Date.now()}`)
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
        },
        {
          onSuccess: (data) => {
            localStorage.removeItem('application-form-draft')
            form.reset()
            setSubmittedSlug(data.applicationId)
            setSubmittedRunId(data.pipelineRunId)
            addNotification({
              type: 'application',
              slug: data.applicationId,
              label: `${company} — ${role}`,
              status: 'running',
              link: `/applications/${encodeURIComponent(data.applicationId)}`,
            })
            // Navigation is handed off to ProgressBars via submittedSlug
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

  if (submittedSlug) {
    return (
      <div className="mb-8 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/5 shadow-sm">
        <ProgressBars slug={submittedSlug} pipelineRunId={submittedRunId ?? undefined} />
      </div>
    )
  }

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
        className="px-6 pb-6 pt-5"
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

          {/* Side-by-side: target details + options (left), job description (right) */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Left column: target details + options */}
            <div className="space-y-4">
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

              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1">
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
                    Run in Test Mode (Mock API)
                  </label>
                </div>
              </div>
            </div>

            {/* Right column: job description */}
            <div className="flex flex-col">
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
                      {jd.length} / {MIN_JD_LENGTH} min characters
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
                    placeholder="Paste the full job description here. Include responsibilities, requirements, qualifications, and any other relevant details…"
                    className="block h-full min-h-64 w-full flex-1 resize-y rounded-md border-0 bg-zinc-50 p-2 text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 focus:ring-2 focus:ring-inset focus:ring-teal-500 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:ring-white/10"
                  />
                )}
              />
            </div>
          </div>

          {/* Error */}
          {trigger.error && (
            <div className="mt-4 flex flex-col gap-2 rounded-lg bg-red-50 text-red-700 border border-red-600/20 dark:bg-red-500/10 dark:text-red-500 dark:border-red-500/20 px-4 py-3 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Analysis trigger failed
              </div>
              <p className="text-red-600 dark:text-red-400 whitespace-pre-wrap break-words">{trigger.error.message}</p>
            </div>
          )}

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
                      : 'Fill in company, role, and a job description (min 50 chars)'}
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
                    <Button
                      variant="primary"
                      type="submit"
                      disabled={!isValid || trigger.isPending}
                      className="gap-2"
                    >
                      {trigger.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      {trigger.isPending ? 'Analysing…' : 'Start Analysis'}
                    </Button>
                  </div>
                </div>
              )
            }}
          />
        </form>
    </div>
  )
}
