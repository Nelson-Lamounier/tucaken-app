'use client'

import { useState, useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  SkipForward,
  Loader2,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/Button'
import { adminKeys } from '@/lib/api/query-keys'
import {
  getUploadUrlFn,
  completeUploadFn,
  getImportProgressFn,
  retryImportFn,
} from '@/server/resume-imports'
import type { ImportPhase } from '@/server/resume-imports'
import { StepHeader } from '@/features/onboarding/components/onboarding/StepHeader'
import { COPY } from '@/features/onboarding/components/onboarding/content'
import { FillText } from '@/components/ui/FillText'
import { Typewriter } from '@/components/ui/Typewriter'

type Phase =
  | 'idle'
  | 'requesting-url'
  | 'uploading'
  | 'processing'
  | 'complete'
  | 'error'

// Server owns terminal authority via progress.terminal — no client set needed.
const PHASE_LABELS: Record<ImportPhase, string> = {
  uploading:  'Job queued…',
  parsing:    'Parsing document…',
  extracting: 'Extracting career history…',
  analyzing:  'Analyzing your experience…',
  review:     'Ready for review',
  enriching:  'Enriching roles…',
  done:       'Complete',
  error:      'Failed',
}

// Progress-bar fill per phase (the processing screen only renders pre-review).
const PHASE_PROGRESS: Record<ImportPhase, number> = {
  uploading: 55, parsing: 65, extracting: 80, analyzing: 90,
  review: 100, enriching: 95, done: 100, error: 0,
}

// Progress-ring geometry: r=44 in a 96×96 viewBox.
const RING_RADIUS = 44
const RING_CIRC = 2 * Math.PI * RING_RADIUS

interface ImportCareerStepProps {
  readonly onNext: () => void
  readonly onSkip: () => void
  readonly onExtracted: (importId: string) => void
}

export function ImportCareerStep({ onNext, onSkip, onExtracted }: ImportCareerStepProps) {
  const [phase, setPhase]       = useState<Phase>('idle')
  const [file, setFile]         = useState<File | null>(null)
  const [importId, setImportId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [dragOver, setDragOver] = useState(false)
  const [retrying, setRetrying] = useState(false)
  // Idle upload UI reveals only after the StepHeader typewriter finishes.
  const [introDone, setIntroDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const accept = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

  // ── Server-driven progress ────────────────────────────────────────────────
  // The server owns cadence (retryAfterMs), terminal authority and timeout
  // semantics. No client-side timeout guesswork: a dead job stays non-terminal
  // and the server can widen retryAfterMs; the UI just honours what it's told.
  const { data: progress } = useQuery({
    queryKey: adminKeys.resumeImports.progress(importId ?? ''),
    queryFn:  () => getImportProgressFn({ data: importId as string }),
    enabled:  !!importId && phase === 'processing',
    refetchIntervalInBackground: true,
    refetchInterval: (query) => {
      const p = query.state.data
      if (!p || p.terminal) return false
      return p.retryAfterMs
    },
  })

  // ── Transition out of processing from the server's progress signal ────────
  useEffect(() => {
    if (phase !== 'processing' || !progress) return
    if (progress.error) {
      setErrorMsg(progress.error.message || 'Extraction failed — please try a different file.')
      setPhase('error')
    } else if (progress.terminal && importId) {
      // terminal && no error ⇒ ready_for_review / completed
      onExtracted(importId)
      setPhase('complete')
    }
  }, [progress?.status, progress?.terminal, phase, importId, onExtracted])

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
      setPhase('processing')
    } catch (err) {
      setRetrying(false)
      setErrorMsg(err instanceof Error ? err.message : 'Retry failed — please try again.')
    }
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

  const processingLabel = progress?.phase
    ? PHASE_LABELS[progress.phase]
    : 'Processing resume…'

  // ── States ────────────────────────────────────────────────────────────────

  if (phase === 'idle') {
    return (
      <div className="space-y-6">
        <StepHeader
          eyebrow={COPY.resume.eyebrow}
          title={COPY.resume.title}
          sub={COPY.resume.sub}
          typewriter
          onTypingComplete={() => setIntroDone(true)}
        />

        <AnimatePresence>
          {introDone && (
            <motion.div
              key="resume-body"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              style={{ willChange: 'transform, opacity' }}
              className="space-y-6"
            >
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
                  <p className="mt-1 text-xs text-zinc-600">PDF or DOCX · max 50 MB</p>
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  if (phase === 'requesting-url' || phase === 'uploading' || phase === 'processing') {
    let label: string
    if (phase === 'requesting-url') label = 'Preparing upload…'
    else if (phase === 'uploading') label = `Uploading ${file?.name ?? 'file'}…`
    else label = processingLabel

    let progressPct: number
    if (phase === 'requesting-url') progressPct = 15
    else if (phase === 'uploading') progressPct = 45
    else progressPct = progress?.phase ? PHASE_PROGRESS[progress.phase] : 55

    return (
      <div className="space-y-8">
        <Typewriter
          // Static key: types once when the processing screen mounts,
          // matching the Step 1–5 StepHeader typewriter treatment.
          key="import-title"
          as="h3"
          text="Import your career history"
          className="text-3xl font-bold leading-[1.1] text-zinc-50 md:text-4xl"
          speed={45}
          cursor={false}
        />

        {/* Processing status — the leading element of this screen */}
        <FillText
          as="p"
          text={label}
          className="text-lg font-semibold leading-snug md:text-xl"
          baseClassName="text-zinc-700"
          fillClassName="text-indigo-300"
          duration={1.6}
        />

        {/* Document card — narrower + taller, vertical layout. The circular
            gradient ring assembles as the processing stages advance. */}
        <div className="mx-auto flex w-full max-w-[16rem] flex-col items-center gap-6 px-6 py-12">
          <div className="relative h-28 w-28">
            {/* Rotating conic-gradient glow — conveys live processing. */}
            <motion.div
              aria-hidden
              className="absolute inset-0 rounded-full opacity-70 blur-[2px]"
              style={{
                willChange: 'transform',
                background:
                  'conic-gradient(from 0deg, transparent 0deg, rgba(20,184,166,0.55) 110deg, rgba(16,185,129,0.55) 230deg, transparent 360deg)',
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 6, ease: 'linear', repeat: Infinity }}
            />

            {/* Stage-driven progress ring. */}
            <svg viewBox="0 0 96 96" className="absolute inset-0 h-full w-full -rotate-90">
              <defs>
                <linearGradient id="proc-ring" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#2dd4bf" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
              </defs>
              <circle
                cx="48"
                cy="48"
                r={RING_RADIUS}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="4"
              />
              <motion.circle
                cx="48"
                cy="48"
                r={RING_RADIUS}
                fill="none"
                stroke="url(#proc-ring)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={RING_CIRC}
                initial={false}
                animate={{ strokeDashoffset: RING_CIRC * (1 - progressPct / 100) }}
                transition={{ type: 'spring', bounce: 0.2, visualDuration: 0.6 }}
              />
            </svg>

            {/* Document icon, centred inside the ring. */}
            <div className="absolute inset-0 flex items-center justify-center">
              <FileText className="h-9 w-9 text-teal-300" />
            </div>
          </div>

          <p className="w-full truncate text-center text-sm font-medium text-zinc-200">{file?.name}</p>
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

  // phase === 'complete' — ring filled, brief beat, then advance.
  return <CompleteScreen fileName={file?.name} onDone={onNext} />
}

function CompleteScreen({
  fileName,
  onDone,
}: {
  readonly fileName?: string
  readonly onDone: () => void
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 900)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="space-y-8">
      <h3 className="text-3xl font-bold leading-[1.1] text-zinc-50 md:text-4xl">
        Import your career history
      </h3>
      <p className="text-lg font-semibold leading-snug text-emerald-300 md:text-xl">
        Career history extracted
      </p>

      <div className="mx-auto flex w-full max-w-[16rem] flex-col items-center gap-6 px-6 py-12">
        <div className="relative h-28 w-28">
          <svg viewBox="0 0 96 96" className="absolute inset-0 h-full w-full -rotate-90">
            <defs>
              <linearGradient id="proc-ring-done" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#2dd4bf" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>
            <circle
              cx="48"
              cy="48"
              r={RING_RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="4"
            />
            <motion.circle
              cx="48"
              cy="48"
              r={RING_RADIUS}
              fill="none"
              stroke="url(#proc-ring-done)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={RING_CIRC}
              initial={{ strokeDashoffset: RING_CIRC }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ type: 'spring', bounce: 0.2, visualDuration: 0.6 }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-400" />
          </div>
        </div>

        {fileName && (
          <p className="w-full truncate text-center text-sm font-medium text-zinc-200">{fileName}</p>
        )}
      </div>
    </div>
  )
}
