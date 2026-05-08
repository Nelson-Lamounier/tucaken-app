import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { motion } from 'motion/react'
import { AlertTriangle } from 'lucide-react'
import { OnboardingShell } from '@/features/onboarding/components/onboarding/OnboardingShell'
import {
  getUploadUrlFn,
  completeUploadFn,
  getImportStatusFn,
  listCareerEntriesFn,
} from '@/server/resume-imports'
import { getMeFn } from '@/server/me'
import type { ResumeSummary } from '@/features/onboarding/components/onboarding/types'

export const Route = createFileRoute('/onboarding')({
  beforeLoad: async ({ context }) => {
    if (!context.auth.user) throw redirect({ to: '/sign-in' })
  },
  loader: async () => {
    try {
      await getMeFn()
      return { provisioningReady: true as const }
    } catch {
      return { provisioningReady: false as const }
    }
  },
  component: OnboardingPage,
})

const POLL_INTERVAL_MS = 2_500
const POLL_TIMEOUT_MS  = 3 * 60 * 1_000

async function ensureProvisioned(): Promise<void> {
  const MAX_ATTEMPTS = 4
  const BACKOFF_MS   = [1_000, 2_000, 4_000]
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    try {
      await getMeFn()
      return
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Auth errors are not transient — bail immediately
      if (msg.includes('401') || msg.includes('403') || msg.includes('No session')) throw e
      if (i < BACKOFF_MS.length) {
        await new Promise<void>((r) => setTimeout(r, BACKOFF_MS[i]))
      }
    }
  }
  throw new Error('Account setup is still completing — please wait a moment and try again')
}

async function uploadResume(
  file: File,
  onProgress?: (step: string) => void,
): Promise<ResumeSummary> {
  const contentType = file.type as
    | 'application/pdf'
    | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

  if (
    contentType !== 'application/pdf' &&
    contentType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    throw new Error('Only PDF and Word (.docx) files are supported')
  }

  onProgress?.('Preparing upload…')

  // Ensure the user row exists in RDS before calling any resume-import endpoint.
  // Retries up to 4× with backoff in case admin-api was transiently unavailable
  // when the page loaded (503 is swallowed in beforeLoad to avoid a hard crash).
  await ensureProvisioned()

  const { importId, uploadUrl } = await getUploadUrlFn({
    data: { filename: file.name, contentType, fileSizeBytes: file.size },
  })

  onProgress?.('Uploading file…')
  const s3Res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': contentType },
  })
  if (!s3Res.ok) throw new Error('File upload failed — please try again')

  onProgress?.('Starting extraction…')
  await completeUploadFn({ data: importId })

  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS))
    const record = await getImportStatusFn({ data: importId })
    if (record.currentStep) onProgress?.(record.currentStep)
    if (record.status === 'failed') {
      throw new Error(
        record.errorCode
          ? `Processing failed: ${record.errorCode}`
          : 'Resume processing failed — please try again',
      )
    }
    if (record.status === 'ready_for_review' || record.status === 'completed') break
  }

  onProgress?.('Counting extracted entries…')
  const entries = await listCareerEntriesFn({ data: {} })
  const roles     = entries.filter((e) => e.entryType === 'experience').length
  const education = entries.filter((e) => e.entryType === 'education').length
  const skills    = entries.filter((e) => e.entryType === 'skill').length

  return { roles, education, skills }
}

function OnboardingPage() {
  const navigate = useNavigate()
  const { provisioningReady } = Route.useLoaderData()
  return (
    <div className="relative">
      {!provisioningReady && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed inset-x-0 top-0 z-50 flex items-center gap-3 border-b border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-400 backdrop-blur-sm"
          style={{ willChange: 'transform, opacity' }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Backend service is temporarily unavailable — resume upload may not work yet.
            Refresh to retry once the service recovers.
          </span>
        </motion.div>
      )}
      <OnboardingShell
        onUploadResume={uploadResume}
        onComplete={async () => {
          await navigate({ to: '/overview' })
        }}
      />
    </div>
  )
}
