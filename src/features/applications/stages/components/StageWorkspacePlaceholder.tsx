import { Hammer } from 'lucide-react'
import type { InterviewStage } from '@/lib/types/applications.types'
import { STAGE_LABELS } from '../../components/ApplicationTypes'

/**
 * Honest "not built yet" state for stages whose workspace ships in a later PR.
 * No feature flag gates the shell (flags were removed repo-wide); instead each
 * unbuilt Active Stage renders this until its workspace lands. See
 * src/features/applications/CONTEXT.md and the PR-sequencing decision.
 */
export function StageWorkspacePlaceholder({ stage }: { readonly stage: InterviewStage }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-16 text-center dark:border-white/10 dark:bg-white/2">
      <span className="mb-4 flex size-12 items-center justify-center rounded-xl bg-zinc-100 dark:bg-white/5">
        <Hammer className="size-6 text-zinc-400" aria-hidden />
      </span>
      <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        {STAGE_LABELS[stage]} workspace
      </h3>
      <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        This stage&apos;s prep workspace is coming in a follow-on update. You can
        still navigate stages and advance the application.
      </p>
    </div>
  )
}
