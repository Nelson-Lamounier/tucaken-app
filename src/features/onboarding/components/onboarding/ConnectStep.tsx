// src/features/onboarding/components/ConnectStep.tsx
//
// Step 4 — Connect GitHub (featured large) + AWS / Figma "Coming soon".
// "Connect GitHub" redirects to the GitHub App install URL (same flow as
// Settings → GitHub). onConnectGithub is a sync redirect — no await needed.

import { useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'

// Flowing gradient-border animation shared by the cards below.
const FLOW_CLASS = 'bg-[length:200%_200%]'
const flowAnim = {
  backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
}
const FLOW_TRANSITION = {
  repeat: Infinity,
  duration: 6,
  ease: 'linear' as const,
}
import { Github, Cloud, Figma, Check, Lock, Loader2 } from 'lucide-react'
import { COPY } from './content'
import { StepHeader } from './StepHeader'
import { StepFooter } from './StepFooter'
import { GitHubOAuthModal } from './GitHubOAuthModal'
import type { GitHubInstallation } from '@/lib/types/github.types'

interface Props {
  readonly installation?: GitHubInstallation | null
  readonly isLoadingInstallation?: boolean
  readonly onConnectGithub: () => void
  readonly onNext: () => void
  readonly onBack: () => void
}

export function ConnectStep({
  installation,
  isLoadingInstallation,
  onConnectGithub,
  onNext,
  onBack,
}: Props) {
  const [oauthOpen, setOauthOpen] = useState(false)
  // Body reveals only after the StepHeader typewriter finishes.
  const [introDone, setIntroDone] = useState(false)
  const reduce = useReducedMotion()

  const connected = !!installation

  function handleAuthorize() {
    setOauthOpen(false)
    onConnectGithub()
  }

  return (
    <div className="flex flex-1 flex-col">
      <StepHeader
        eyebrow={COPY.connect.eyebrow}
        title={COPY.connect.title}
        sub={COPY.connect.sub}
        typewriter
        onTypingComplete={() => setIntroDone(true)}
      />

      <AnimatePresence>
        {introDone && (
          <motion.div
            key="connect-body"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: 'transform, opacity' }}
            className="mt-6"
          >
      {/* Featured GitHub card — animated gradient border */}
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
      <div
        className={[
          'rounded-[11px] p-5',
          connected ? 'bg-teal-500/4' : 'bg-zinc-950',
        ].join(' ')}
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
                  connected ? 'text-zinc-900' : 'text-zinc-100',
                ].join(' ')}>
                  {connected ? installation?.accountLogin : 'GitHub'}
                </span>
                {connected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/25 px-2 py-0.5 text-[10px] font-semibold text-teal-950 ring-1 ring-teal-700/30">
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
                connected ? 'text-zinc-800' : 'text-zinc-400',
              ].join(' ')}>
                {connected
                  ? `${installation?.repositoryCount ?? 0} repositories accessible via GitHub App`
                  : 'Index repos so resumes cite real commits and PRs. Tucaken installs as a GitHub App with read-only scopes.'}
              </p>
            </div>
          </div>

          {isLoadingInstallation && <Loader2 className="size-4 animate-spin text-zinc-500" />}
          {!isLoadingInstallation && !connected && (
            <button
              type="button"
              onClick={() => setOauthOpen(true)}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-zinc-100 px-3.5 py-1.5 text-xs font-semibold text-zinc-900 transition hover:bg-white"
            >
              <Github className="size-3.5" />
              Connect GitHub
            </button>
          )}
        </div>

        <AnimatePresence>
          {connected && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 border-t border-zinc-900/15 pt-4 text-xs text-zinc-800">
                Repositories visible in{' '}
                <span className="font-medium text-zinc-900">Settings → GitHub</span>.
                Tucaken will index them in the background.
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </motion.div>

      {/* Coming-soon row */}
      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
        <ComingSoonCard
          icon={<Cloud className="size-5 text-zinc-400" strokeWidth={1.75} />}
          label="AWS"
          sub="Pull deployment + infra notes"
        />
        <ComingSoonCard
          icon={<Figma className="size-5 text-zinc-400" strokeWidth={1.75} />}
          label="Figma"
          sub="Cite design work in your resume"
        />
      </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-auto">
        <StepFooter
          onBack={onBack}
          onNext={onNext}
          nextDisabled={!connected}
          nextLabel="Finish setup"
        />
      </div>

      <GitHubOAuthModal
        open={oauthOpen}
        onClose={() => setOauthOpen(false)}
        onConfirm={handleAuthorize}
      />
    </div>
  )
}

interface ComingSoonCardProps {
  readonly icon: React.ReactNode
  readonly label: string
  readonly sub: string
}

function ComingSoonCard({ icon, label, sub }: ComingSoonCardProps) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      aria-disabled
      className={`rounded-xl bg-linear-to-r from-teal-400/50 via-emerald-400/25 to-cyan-400/50 p-px opacity-70 ${FLOW_CLASS}`}
      animate={reduce ? undefined : flowAnim}
      transition={reduce ? undefined : FLOW_TRANSITION}
    >
    <div className="flex items-start gap-3 rounded-[11px] bg-zinc-950 p-4">
      <div className="grid size-10 shrink-0 place-items-center rounded-md bg-white/2 ring-1 ring-white/10">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-300">{label}</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/2 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
            <Lock className="size-2.5" /> Coming soon
          </span>
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{sub}</p>
      </div>
    </div>
    </motion.div>
  )
}
