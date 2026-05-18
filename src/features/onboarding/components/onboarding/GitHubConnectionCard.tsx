// src/features/onboarding/components/onboarding/GitHubConnectionCard.tsx
//
// Shared GitHub identity card used by Step 4 (Connect) and Step 5 (Repos)
// so the connected presentation is identical across the onboarding flow.
// Animated gradient border + dark flowing inner gradient when connected.

import type { ReactNode } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { Github, Check, Loader2 } from 'lucide-react'
import type { GitHubInstallation } from '@/lib/types/github.types'

// Flowing gradient-border animation.
const FLOW_CLASS = 'bg-[length:200%_200%]'
const flowAnim = { backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }
const FLOW_TRANSITION = { repeat: Infinity, duration: 6, ease: 'linear' as const }

interface Props {
  readonly connected: boolean
  readonly installation?: GitHubInstallation | null
  readonly isLoading?: boolean
  /** Right-side node (e.g. Connect button) — typically only when not connected. */
  readonly action?: ReactNode
  /** Expandable note rendered under the identity row when connected. */
  readonly footer?: ReactNode
}

export function GitHubConnectionCard({
  connected,
  installation,
  isLoading,
  action,
  footer,
}: Props) {
  const reduce = useReducedMotion()

  return (
    <motion.div
      className={[
        'rounded-xl bg-linear-to-r p-px',
        FLOW_CLASS,
        connected
          ? 'from-teal-400/80 via-emerald-400/50 to-cyan-400/80'
          : 'from-teal-400/50 via-emerald-400/25 to-cyan-400/50',
      ].join(' ')}
      animate={reduce ? undefined : flowAnim}
      transition={reduce ? undefined : FLOW_TRANSITION}
    >
      <motion.div
        className={[
          'rounded-[11px] p-5',
          connected
            ? `bg-linear-to-br from-teal-950 via-zinc-950 to-black ${FLOW_CLASS}`
            : 'bg-zinc-950',
        ].join(' ')}
        style={connected ? { willChange: 'background-position' } : undefined}
        animate={connected && !reduce ? flowAnim : undefined}
        transition={connected && !reduce ? FLOW_TRANSITION : undefined}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            {connected && installation?.accountAvatarUrl ? (
              <img
                src={installation.accountAvatarUrl}
                alt={installation.accountLogin}
                className="size-12 shrink-0 rounded-lg border border-white/10 object-cover"
              />
            ) : (
              <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-zinc-900 ring-1 ring-white/10">
                <Github className="size-6 text-zinc-100" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={[
                  'text-sm font-semibold',
                  connected ? 'text-teal-50' : 'text-zinc-100',
                ].join(' ')}>
                  {connected ? installation?.accountLogin : 'GitHub'}
                </span>
                {connected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-medium text-teal-200 ring-1 ring-teal-400/30">
                    <Check className="size-3" strokeWidth={3} /> Connected
                  </span>
                ) : (
                  <span className="rounded-full border border-white/10 bg-white/2 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                    Required
                  </span>
                )}
              </div>
              <p className={[
                'mt-1 text-xs leading-relaxed',
                connected ? 'text-teal-100/90' : 'text-zinc-400',
              ].join(' ')}>
                {connected
                  ? `${installation?.repositoryCount ?? 0} repositories accessible via GitHub App`
                  : 'Index repos so resumes cite real commits and PRs. Tucaken installs as a GitHub App with read-only scopes.'}
              </p>
            </div>
          </div>

          {isLoading && <Loader2 className="size-4 animate-spin text-zinc-500" />}
          {!isLoading && !connected && action}
        </div>

        <AnimatePresence>
          {connected && footer && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              {footer}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
