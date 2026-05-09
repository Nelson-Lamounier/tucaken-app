'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  SkipForward,
  Loader2,
  Briefcase,
  GraduationCap,
  Wrench,
  Award,
} from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { adminKeys } from '@/lib/api/query-keys'
import {
  getUploadUrlFn,
  completeUploadFn,
  getImportStatusFn,
  listCareerEntriesFn,
  retryImportFn,
  updateCareerEntryFn,
} from '../../../../server/resume-imports'
import type { CareerEntry } from '../../../../server/resume-imports'
import { EnhanceRoleCard } from './EnhanceRoleCard'

type Phase =
  | 'idle'
  | 'requesting-url'
  | 'uploading'
  | 'processing'
  | 'review'
  | 'enhance'
  | 'saved'
  | 'error'

const TERMINAL_STATUSES = new Set(['ready_for_review', 'completed', 'failed'])

const STEP_LABELS: Record<string, string> = {
  parsing:          'Parsing document…',
  extracting_career: 'Extracting career history…',
  queued:           'Job queued…',
}

interface ImportCareerStepProps {
  readonly onNext: () => void
  readonly onSkip: () => void
}

export function ImportCareerStep({ onNext, onSkip }: ImportCareerStepProps) {
  const [phase, setPhase]       = useState<Phase>('idle')
  const [file, setFile]         = useState<File | null>(null)
  const [importId, setImportId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [dragOver, setDragOver] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const processingStartedAt = useRef<number | null>(null)
  const queryClient = useQueryClient()

  const PROCESSING_TIMEOUT_MS = 120_000 // 2 min — job crashes before touching DB on image errors

  const accept = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

  // ── Status polling — enabled once we have an importId and are processing ──
  const { data: importStatus } = useQuery({
    queryKey: adminKeys.resumeImports.status(importId ?? ''),
    queryFn:  () => getImportStatusFn({ data: importId! }),
    enabled:  !!importId && phase === 'processing',
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status && TERMINAL_STATUSES.has(status)) return false

      // Stop polling and surface timeout if job hasn't progressed — guards against
      // pods that crash before writing to DB (e.g. MODULE_NOT_FOUND at startup)
      if (processingStartedAt.current !== null) {
        const elapsed = Date.now() - processingStartedAt.current
        if (elapsed > PROCESSING_TIMEOUT_MS) return false
      }
      return 3000
    },
  })

  // ── Transition out of processing once extraction is done ──────────────────
  useEffect(() => {
    if (phase !== 'processing') return

    if (!importStatus) {
      // No data yet — check if we've been waiting too long (job likely dead)
      if (
        processingStartedAt.current !== null &&
        Date.now() - processingStartedAt.current > PROCESSING_TIMEOUT_MS
      ) {
        setErrorMsg('Processing timed out — the import job may have failed to start. Please retry.')
        setPhase('error')
      }
      return
    }

    if (importStatus.status === 'failed') {
      setErrorMsg(importStatus.statusMessage ?? 'Extraction failed — please try a different file.')
      setPhase('error')
    } else if (importStatus.status === 'ready_for_review' || importStatus.status === 'completed') {
      setPhase('review')
    } else if (
      processingStartedAt.current !== null &&
      Date.now() - processingStartedAt.current > PROCESSING_TIMEOUT_MS
    ) {
      setErrorMsg('Processing timed out — the import job may have failed to start. Please retry.')
      setPhase('error')
    }
  }, [importStatus?.status, phase])

  // ── Hard timeout timer — fires once polling stops due to timeout ──────────
  useEffect(() => {
    if (phase !== 'processing') return
    const timer = setTimeout(() => {
      setErrorMsg('Processing timed out — the import job may have failed to start. Please retry.')
      setPhase('error')
    }, PROCESSING_TIMEOUT_MS + 3000) // +3s grace for last poll to land
    return () => clearTimeout(timer)
  }, [phase])

  // ── Career entries — fetched once we reach 'review' ───────────────────────
  const { data: entries = [] } = useQuery<CareerEntry[]>({
    queryKey: adminKeys.resumeImports.entries(),
    queryFn:  () => listCareerEntriesFn({ data: {} }),
    enabled:  phase === 'review',
    staleTime: Infinity,
  })

  const { data: enhancedEntries = [] } = useQuery<CareerEntry[]>({
    queryKey: adminKeys.resumeImports.entries('enhance'),
    queryFn:  () => listCareerEntriesFn({ data: {} }),
    enabled:  phase === 'enhance',
    refetchInterval: (query) => {
      const all = query.state.data ?? []
      const experienceEntries = all.filter((e: CareerEntry) => e.entryType === 'experience')
      const allTerminal =
        experienceEntries.length > 0 &&
        experienceEntries.every((e: CareerEntry) =>
          ['complete', 'skipped', 'failed'].includes(e.enrichmentStatus),
        )
      return allTerminal ? false : 3_000
    },
  })

  // ── Upload flow ───────────────────────────────────────────────────────────
  async function handleFile(f: File) {
    const MAX_BYTES = 50 * 1024 * 1024
    if (f.size > MAX_BYTES) {
      setFile(f)
      setErrorMsg(`File is too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 50 MB.`)
      setPhase('error')
      return
    }

    setFile(f)
    setPhase('requesting-url')
    setErrorMsg('')

    try {
      // 1. Get presigned URL from admin-api
      const { importId: id, uploadUrl } = await getUploadUrlFn({
        data: {
          filename:      f.name,
          contentType:   f.type as 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileSizeBytes: f.size,
        },
      })
      setImportId(id)
      setPhase('uploading')

      // 2. PUT directly to S3 — presigned URL is self-authenticated, no bearer token
      const s3Response = await fetch(uploadUrl, {
        method: 'PUT',
        body:   f,
        headers: {
          'Content-Type':   f.type,
          'Content-Length': String(f.size),
        },
      })
      if (!s3Response.ok) {
        throw new Error(`S3 upload failed [${s3Response.status}]`)
      }

      // 3. Signal upload complete — dispatches K8s Job
      await completeUploadFn({ data: id })
      processingStartedAt.current = Date.now()
      setPhase('processing')
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      let msg = raw
      if (raw.startsWith('QUOTA_EXCEEDED')) {
        msg = 'You have reached the free-tier limit of 1 import per month. Upgrade to Pro for unlimited imports.'
      } else {
        // TanStack server functions propagate Zod errors as a JSON array string — parse into one line
        try {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0].message === 'string') {
            msg = parsed.map((e: { message: string }) => e.message).join('. ')
          }
        } catch {
          // not JSON — use raw message as-is
        }
      }
      setErrorMsg(msg)
      setPhase('error')
    }
  }

  async function handleRetry() {
    if (!importId) return
    setRetrying(true)
    try {
      await retryImportFn({ data: importId })
      setErrorMsg('')
      setRetrying(false)
      processingStartedAt.current = Date.now()
      setPhase('processing')
    } catch (err) {
      setRetrying(false)
      setErrorMsg(err instanceof Error ? err.message : 'Retry failed — please try again.')
    }
  }

  async function handleSaveEntry(id: string, highlights: string[]) {
    const entry = enhancedEntries.find((e) => e.id === id)
    if (!entry) return
    const rawData = { ...(entry.rawData as Record<string, unknown>), highlights }
    await updateCareerEntryFn({ data: { id, rawData } })
    await queryClient.invalidateQueries({ queryKey: adminKeys.resumeImports.entries() })
    await queryClient.invalidateQueries({ queryKey: adminKeys.resumeImports.entries('enhance') })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) void handleFile(f)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) void handleFile(f)
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const experienceEntries = entries.filter((e: CareerEntry) => e.entryType === 'experience')
  const educationEntries  = entries.filter((e: CareerEntry) => e.entryType === 'education')
  const skillEntries      = entries.filter((e: CareerEntry) => e.entryType === 'skill')
  const otherCount        = entries.filter((e: CareerEntry) =>
    !['experience', 'education', 'skill'].includes(e.entryType)
  ).length

  const processingLabel = importStatus?.currentStep
    ? STEP_LABELS[importStatus.currentStep] ?? `${importStatus.currentStep}…`
    : 'Processing resume…'

  // ── States ────────────────────────────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold text-zinc-100">Import your career history</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Upload your current resume. Tucaken extracts your employment history and education so
            your tailored resumes are grounded in real evidence.
          </p>
        </div>

        <div
          role="button"
          tabIndex={0}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          className={[
            'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-14 cursor-pointer transition-colors',
            dragOver
              ? 'border-indigo-500 bg-indigo-500/5'
              : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
          ].join(' ')}
        >
          <Upload className="h-8 w-8 text-zinc-500" />
          <div className="text-center">
            <p className="text-sm font-medium text-zinc-300">
              Drop your resume here or <span className="text-indigo-400">browse</span>
            </p>
            <p className="mt-1 text-xs text-zinc-600">PDF or DOCX · max 20 MB</p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={handleInputChange}
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-zinc-600">Step 1 is optional — you can import later from your profile.</p>
          <Button variant="ghost" onClick={onSkip} className="flex items-center gap-1.5 text-xs">
            <SkipForward className="h-3.5 w-3.5" />
            Skip for now
          </Button>
        </div>
      </div>
    )
  }

  if (phase === 'requesting-url' || phase === 'uploading' || phase === 'processing') {
    const label =
      phase === 'requesting-url' ? 'Preparing upload…'
      : phase === 'uploading'    ? `Uploading ${file?.name ?? 'file'}…`
      : processingLabel

    const progress =
      phase === 'requesting-url' ? 15
      : phase === 'uploading'    ? 45
      : importStatus?.status === 'parsing' ? 65
      : importStatus?.status === 'extracting_career' ? 80
      : 55

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold text-zinc-100">Import your career history</h3>
          <p className="mt-1 text-sm text-zinc-500">{label}</p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <FileText className="h-5 w-5 shrink-0 text-zinc-400" />
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-zinc-200">{file?.name}</p>
            <div className="mt-2 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <Loader2 className="h-4 w-4 shrink-0 text-indigo-400 animate-spin" />
        </div>
        <p className="text-xs text-zinc-600 text-center">
          {phase === 'processing'
            ? 'AI extraction takes 20–40 seconds. You can leave this page — we\'ll notify you when it\'s ready.'
            : 'Do not close this tab during upload.'}
        </p>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div>
            <p className="text-sm font-medium text-red-300">Import failed</p>
            <p className="mt-0.5 text-xs text-red-400/70">{errorMsg}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {importId ? (
            <Button
              variant="secondary"
              onClick={() => void handleRetry()}
              disabled={retrying}
              className="flex items-center gap-1.5"
            >
              {retrying && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {retrying ? 'Retrying…' : 'Retry'}
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => { setPhase('idle'); setFile(null); setImportId(null) }}
            >
              Try again
            </Button>
          )}
          <Button variant="ghost" onClick={onSkip}>Skip for now</Button>
        </div>
      </div>
    )
  }

  if (phase === 'saved') {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <CheckCircle2 className="h-10 w-10 text-emerald-400" />
        <p className="text-sm font-medium text-zinc-200">Career history imported</p>
        <p className="text-xs text-zinc-500">
          {experienceEntries.length} role{experienceEntries.length !== 1 ? 's' : ''} extracted.
          Enrichment continues in the background.
        </p>
      </div>
    )
  }

  if (phase === 'enhance') {
    const experienceEntries = enhancedEntries.filter(
      (e: CareerEntry) => e.entryType === 'experience',
    )
    const allTerminal = experienceEntries.every((e: CareerEntry) =>
      ['complete', 'skipped', 'failed'].includes(e.enrichmentStatus),
    )

    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold text-zinc-100">Enhance your experience</h3>
          <p className="mt-1 text-sm text-zinc-500">
            We researched each role online. Review the suggestions, edit your highlights,
            and save — or skip to keep them as extracted.
          </p>
          {!allTerminal && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-indigo-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Researching remaining roles…
            </p>
          )}
        </div>

        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {experienceEntries.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-zinc-500">
              No experience entries found.
            </div>
          ) : (
            experienceEntries.map((entry: CareerEntry) => (
              <EnhanceRoleCard
                key={entry.id}
                entry={entry}
                onSave={handleSaveEntry}
              />
            ))
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <Button
            variant="ghost"
            onClick={() => setPhase('review')}
            className="text-xs"
          >
            ← Back to review
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => { setPhase('saved'); setTimeout(onNext, 800) }}
              className="text-xs"
            >
              Skip enhancement
            </Button>
            <Button
              variant="primary"
              onClick={() => { setPhase('saved'); setTimeout(onNext, 800) }}
              className="flex items-center gap-1.5"
            >
              Save &amp; continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── review ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-zinc-100">Review extracted career history</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Tucaken extracted the following from your resume. You can edit individual entries later from your profile.
        </p>
      </div>

      <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">

        {/* Experience */}
        {experienceEntries.length > 0 && (
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <Briefcase className="h-3.5 w-3.5" />
              Experience ({experienceEntries.length})
            </h4>
            <div className="space-y-2">
              {experienceEntries.map((entry) => {
                const d = entry.rawData as { title?: string; company?: string; period?: string; highlights?: string[] }
                return (
                  <div key={entry.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-200 truncate">{d.title ?? '—'}</span>
                      <span className="shrink-0 text-xs text-zinc-500">{d.period ?? ''}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">{d.company ?? ''}</div>
                    {Array.isArray(d.highlights) && d.highlights.length > 0 && (
                      <ul className="mt-2 space-y-0.5 text-xs text-zinc-400 list-disc list-inside">
                        {d.highlights.slice(0, 2).map((h, i) => (
                          <li key={i} className="truncate">{h}</li>
                        ))}
                        {d.highlights.length > 2 && (
                          <li className="text-zinc-600">+{d.highlights.length - 2} more</li>
                        )}
                      </ul>
                    )}
                    {entry.enrichmentStatus === 'complete' && entry.enrichedData && (
                      <span className="mt-2 inline-block rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] text-indigo-400 ring-1 ring-inset ring-indigo-500/20">
                        AI enriched
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Education */}
        {educationEntries.length > 0 && (
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <GraduationCap className="h-3.5 w-3.5" />
              Education ({educationEntries.length})
            </h4>
            <div className="space-y-2">
              {educationEntries.map((entry) => {
                const d = entry.rawData as { degree?: string; institution?: string; period?: string }
                return (
                  <div key={entry.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-200 truncate">{d.degree ?? '—'}</span>
                      <span className="shrink-0 text-xs text-zinc-500">{d.period ?? ''}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">{d.institution ?? ''}</div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Skills */}
        {skillEntries.length > 0 && (
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <Wrench className="h-3.5 w-3.5" />
              Skills
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {skillEntries.flatMap((entry) => {
                const d = entry.rawData as { skills?: string[] }
                return d.skills ?? []
              }).slice(0, 20).map((skill, i) => (
                <span
                  key={i}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs text-zinc-300"
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Other entries summary */}
        {otherCount > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-600">
            <Award className="h-3.5 w-3.5" />
            {otherCount} additional entr{otherCount === 1 ? 'y' : 'ies'} extracted (certifications, projects, achievements)
          </div>
        )}

        {entries.length === 0 && (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-zinc-500">
            No entries extracted yet. Enrichment may still be running.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-white/10">
        <Button
          variant="ghost"
          onClick={() => { setPhase('idle'); setFile(null); setImportId(null) }}
          className="text-xs"
        >
          ← Re-upload
        </Button>
        <Button
          variant="primary"
          onClick={() => setPhase('enhance')}
          className="flex items-center gap-1.5"
        >
          Looks good
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
