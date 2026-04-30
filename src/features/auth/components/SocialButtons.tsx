"use client"
// src/features/auth/components/SocialButtons.tsx
import { motion } from 'motion/react'
import { Github } from 'lucide-react'

interface SocialButtonsProps {
  onGoogle: () => void | Promise<void>
  onGithub: () => void | Promise<void>
  loading?: 'google' | 'github' | null
}

export function GoogleIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.31 0-6-2.74-6-6.2s2.69-6.2 6-6.2c1.88 0 3.14.8 3.86 1.49l2.63-2.54C16.83 3.16 14.66 2.2 12 2.2 6.92 2.2 2.8 6.32 2.8 11.4S6.92 20.6 12 20.6c6.92 0 9.2-4.86 9.2-7.39 0-.5-.05-.88-.12-1.27H12z"
      />
      <path
        fill="#FBBC05"
        d="M3.88 7.36l3.2 2.34C7.95 7.84 9.84 6.5 12 6.5c1.88 0 3.14.8 3.86 1.49l2.63-2.54C16.83 3.16 14.66 2.2 12 2.2 8.36 2.2 5.22 4.27 3.88 7.36z"
      />
      <path
        fill="#34A853"
        d="M12 20.6c2.6 0 4.78-.86 6.38-2.34l-3.04-2.5c-.84.58-1.96 1-3.34 1-2.57 0-4.75-1.74-5.53-4.08l-3.18 2.46C4.62 18.46 8.04 20.6 12 20.6z"
      />
      <path
        fill="#4285F4"
        d="M21.08 11.94c0-.5-.05-.88-.12-1.27H12v3.9h5.5c-.22 1.27-1.4 3.1-3.16 3.95l3.04 2.5c1.85-1.71 3.7-4.27 3.7-9.08z"
      />
    </svg>
  )
}

export function SocialButtons({ onGoogle, onGithub, loading }: SocialButtonsProps) {
  const Btn = ({
    onClick,
    icon,
    label,
    busy,
  }: {
    onClick: () => void | Promise<void>
    icon: React.ReactNode
    label: string
    busy: boolean
  }) => (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      disabled={busy}
      className={[
        'group relative flex h-11 flex-1 items-center justify-center gap-2 overflow-hidden',
        'rounded-xl border border-zinc-200/80 bg-white/70 text-sm font-medium text-zinc-700',
        'backdrop-blur-md transition-colors hover:bg-white',
        'dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10',
        'disabled:opacity-60',
      ].join(' ')}
      style={{ willChange: 'transform' }}
    >
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-teal-400/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      {busy ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-teal-500" />
      ) : (
        icon
      )}
      <span className="relative">{label}</span>
    </motion.button>
  )

  return (
    <div className="flex gap-2">
      <Btn onClick={onGoogle} icon={<GoogleIcon />} label="Google" busy={loading === 'google'} />
      <Btn onClick={onGithub} icon={<Github className="h-4 w-4" />} label="GitHub" busy={loading === 'github'} />
    </div>
  )
}

export function SocialDivider() {
  return (
    <div className="relative flex items-center py-1">
      <div className="h-px flex-1 bg-zinc-200/70 dark:bg-white/10" />
      <span className="px-3 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        or continue with email
      </span>
      <div className="h-px flex-1 bg-zinc-200/70 dark:bg-white/10" />
    </div>
  )
}
