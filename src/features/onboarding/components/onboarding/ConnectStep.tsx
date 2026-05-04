// src/features/onboarding/components/ConnectStep.tsx
//
// Step 4 — Connect GitHub (featured large) + AWS / Figma "Coming soon".

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Github, Cloud, Figma, Check, Lock } from 'lucide-react'
import { COPY } from './content'
import { StepHeader } from './StepHeader'
import { StepFooter } from './StepFooter'
import { GitHubOAuthModal } from './GitHubOAuthModal'

interface Props {
  connected: boolean
  setConnected: (b: boolean) => void
  onConnectGithub: () => Promise<void> | void
  onNext: () => void
  onBack: () => void
}

export function ConnectStep({
  connected,
  setConnected,
  onConnectGithub,
  onNext,
  onBack,
}: Props) {
  const [oauthOpen, setOauthOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleAuthorize() {
    setBusy(true)
    try {
      await onConnectGithub()
      setConnected(true)
      setOauthOpen(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <StepHeader
        eyebrow={COPY.connect.eyebrow}
        title={COPY.connect.title}
        sub={COPY.connect.sub}
      />

      {/* Featured GitHub card */}
      <div
        className={[
          'rounded-xl border p-5 transition',
          connected
            ? 'border-teal-400/30 bg-teal-500/[0.04]'
            : 'border-white/10 bg-white/[0.02]',
        ].join(' ')}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-zinc-900 ring-1 ring-white/10">
              <Github className="size-6 text-zinc-100" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-100">GitHub</span>
                {connected ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-medium text-teal-200 ring-1 ring-teal-400/30">
                    <Check className="size-3" strokeWidth={3} /> Connected
                  </span>
                ) : (
                  <span className="rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                    Required
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                Index repos so resumes cite real commits and PRs. Tucaken installs as a GitHub App with
                read-only scopes.
              </p>
            </div>
          </div>
          {connected ? (
            <button
              type="button"
              onClick={() => setConnected(false)}
              className="text-[11px] text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
            >
              Disconnect
            </button>
          ) : (
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
              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/5 pt-4">
                {['tucaken-app', 'platform-infra', 'agentic-pipeline', 'next-portfolio'].map((repo, i) => (
                  <motion.span
                    key={repo}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 + i * 0.05 }}
                    className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 font-mono text-[10px] text-zinc-300"
                  >
                    {repo}
                  </motion.span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Coming-soon row */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <ComingSoonCard icon={<Cloud className="size-5 text-zinc-400" strokeWidth={1.75} />} label="AWS" sub="Pull deployment + infra notes" />
        <ComingSoonCard icon={<Figma className="size-5 text-zinc-400" strokeWidth={1.75} />} label="Figma" sub="Cite design work in your resume" />
      </div>

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
        onClose={() => (busy ? null : setOauthOpen(false))}
        onConfirm={handleAuthorize}
      />
    </div>
  )
}

function ComingSoonCard({
  icon,
  label,
  sub,
}: {
  icon: React.ReactNode
  label: string
  sub: string
}) {
  return (
    <div
      aria-disabled
      className="flex items-start gap-3 rounded-xl border border-dashed border-white/10 bg-white/[0.01] p-4 opacity-70"
    >
      <div className="grid size-10 shrink-0 place-items-center rounded-md bg-white/[0.02] ring-1 ring-white/10">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-300">{label}</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.02] px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
            <Lock className="size-2.5" /> Coming soon
          </span>
        </div>
        <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{sub}</p>
      </div>
    </div>
  )
}
