// src/features/onboarding/components/GitHubOAuthModal.tsx
//
// Mock OAuth modal — in production replace `onConfirm` with the real
// `goSocial('GitHub')` redirect from src/server/auth.ts. We keep the
// modal here so the UX (scopes list + "what we read" copy) stays in
// the onboarding feature.

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, Github } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void> | void
}

export function GitHubOAuthModal({ open, onClose, onConfirm }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="oauth-modal-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, y: 8, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, y: 8, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="relative w-full max-w-sm rounded-xl border border-white/10 bg-zinc-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 rounded-md p-1 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>

            <div className="mb-4 grid size-12 place-items-center rounded-full bg-zinc-900 ring-1 ring-white/10">
              <Github className="size-6 text-zinc-100" />
            </div>

            <h3 id="oauth-modal-title" className="mb-1 text-sm font-semibold text-zinc-100">
              Authorize Tucaken
            </h3>
            <p className="mb-5 text-xs leading-relaxed text-zinc-400">
              Tucaken would like to access your repositories to ground resumes in real commit
              history. You can revoke access anytime in GitHub settings.
            </p>

            <ul className="mb-5 space-y-1.5 text-xs">
              <Scope label="Read repository metadata + README" />
              <Scope label="Read commit messages and PR titles" />
              <Scope label="No write access · no source code stored" />
            </ul>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onConfirm}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-900 transition hover:bg-white"
              >
                Authorize on GitHub
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-4 py-2 text-[11px] text-zinc-500 transition hover:text-zinc-300"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Scope({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-2 text-zinc-400">
      <span className="size-1.5 rounded-full bg-teal-400" />
      {label}
    </li>
  )
}
