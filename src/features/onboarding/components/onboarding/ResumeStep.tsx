// src/features/onboarding/components/ResumeStep.tsx
//
// Step 3 — drag-or-pick a PDF/DOCX resume. Server returns a parsed
// summary (roles / education / skills counts) which we animate in.

import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { FileText, Upload } from 'lucide-react'
import { COPY } from './content'
import { resumeFileSchema } from './validation'
import type { ResumeSummary } from './types'
import { StepHeader } from './StepHeader'
import { StepFooter } from './StepFooter'

interface Props {
  initialFileName?: string
  initialSummary?: ResumeSummary
  /** Live status message from the pipeline (currentStep from the K8s Job). */
  statusMessage?: string
  onUpload: (file: File) => Promise<ResumeSummary>
  onNext: () => void
  onSkip: () => void
  onBack: () => void
}

export function ResumeStep({
  initialFileName,
  initialSummary,
  statusMessage,
  onUpload,
  onNext,
  onSkip,
  onBack,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | undefined>(initialFileName)
  const [summary, setSummary] = useState<ResumeSummary | undefined>(initialSummary)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  async function handleFile(file: File) {
    const parsed = resumeFileSchema.safeParse(file)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid file.')
      return
    }
    setError(null)
    setBusy(true)
    setFileName(file.name)
    try {
      const result = await onUpload(file)
      if (result.roles === 0 && result.education === 0 && result.skills === 0) {
        setError('Resume uploaded but no content could be extracted. Try a different file or ensure it contains readable text.')
        setFileName(undefined)
      } else {
        setSummary(result)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not parse that file.')
      setFileName(undefined)
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setFileName(undefined)
    setSummary(undefined)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="flex h-full flex-col">
      <StepHeader
        eyebrow={COPY.resume.eyebrow}
        title={COPY.resume.title}
        sub={COPY.resume.sub}
      />

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
        }}
      />

      {!fileName ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const f = e.dataTransfer.files?.[0]
            if (f) handleFile(f)
          }}
          className={[
            'group flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 transition',
            dragOver
              ? 'border-teal-400/60 bg-teal-500/[0.06]'
              : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
          ].join(' ')}
        >
          <div className="grid size-12 place-items-center rounded-full bg-teal-500/10 text-teal-300 ring-1 ring-teal-400/20">
            <Upload className="size-5" strokeWidth={1.75} />
          </div>
          <div className="text-center">
            <div className="text-sm font-medium text-zinc-100">Drop your resume here</div>
            <div className="mt-1 text-xs text-zinc-500">or click to browse · PDF or Word</div>
          </div>
        </button>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-md bg-teal-500/10 text-teal-300 ring-1 ring-teal-400/20">
              <FileText className="size-5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-zinc-100">{fileName}</div>
              <div className="mt-0.5 text-[11px] text-zinc-500">
                {busy ? (statusMessage ?? 'Uploading…') : summary ? 'Parsed and ready.' : 'Awaiting result…'}
              </div>
            </div>
            <button
              type="button"
              onClick={reset}
              className="text-[11px] text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
            >
              Re-upload
            </button>
          </div>

          <AnimatePresence>
            {summary && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                {(summary.roles === 0 || summary.education === 0 || summary.skills === 0) && (
                  <p className="mt-3 text-[11px] text-amber-400/80">
                    Some sections returned 0 — the file may be image-based or partially readable. You can continue or re-upload a text-based PDF.
                  </p>
                )}
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    { label: 'Roles', count: summary.roles },
                    { label: 'Education', count: summary.education },
                    { label: 'Skills', count: summary.skills },
                  ].map((s, i) => (
                    <motion.div
                      key={s.label}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.08 }}
                      className={[
                        'rounded-lg border p-3',
                        s.count === 0
                          ? 'border-amber-500/20 bg-amber-500/4'
                          : 'border-white/10 bg-white/2',
                      ].join(' ')}
                    >
                      <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                        {s.label}
                      </div>
                      <div className={[
                        'mt-1 text-xl font-semibold tabular-nums',
                        s.count === 0 ? 'text-amber-400' : 'text-zinc-100',
                      ].join(' ')}>
                        {s.count}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}

      <div className="mt-auto">
        <StepFooter
          onBack={onBack}
          skipNote={COPY.resume.skipNote}
          onSkip={onSkip}
          onNext={onNext}
          nextDisabled={busy}
          nextLabel={busy ? 'Parsing…' : 'Next'}
        />
      </div>
    </div>
  )
}
