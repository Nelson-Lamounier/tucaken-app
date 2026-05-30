/** Semantic tones for KB dashboard surfaces. Components reference meaning
 *  (good / warn / bad / muted / accent), never raw palette colours. Every entry
 *  carries light + dark variants so it renders in both next-themes modes. */
export type Tone = 'good' | 'warn' | 'bad' | 'muted' | 'accent'

interface ToneStyle {
  /** chip / pill surface: bg + text + inset-ring, both modes */
  chip: string
  /** standalone text colour, both modes */
  text: string
  /** dot / icon tint, both modes */
  dot: string
}

export const TONE: Record<Tone, ToneStyle> = {
  good: {
    chip: 'bg-emerald-50 text-emerald-700 inset-ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-400 dark:inset-ring-emerald-400/20',
    text: 'text-emerald-600 dark:text-emerald-400',
    dot:  'text-emerald-500 dark:text-emerald-400',
  },
  warn: {
    chip: 'bg-amber-50 text-amber-800 inset-ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-300 dark:inset-ring-amber-400/20',
    text: 'text-amber-700 dark:text-amber-300',
    dot:  'text-amber-500 dark:text-amber-400',
  },
  bad: {
    chip: 'bg-red-50 text-red-700 inset-ring-red-600/20 dark:bg-red-400/10 dark:text-red-400 dark:inset-ring-red-400/20',
    text: 'text-red-600 dark:text-red-400',
    dot:  'text-red-500 dark:text-red-400',
  },
  muted: {
    chip: 'bg-zinc-50 text-zinc-600 inset-ring-zinc-500/15 dark:bg-white/5 dark:text-zinc-400 dark:inset-ring-white/10',
    text: 'text-zinc-600 dark:text-zinc-400',
    dot:  'text-zinc-400 dark:text-zinc-500',
  },
  accent: {
    chip: 'bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-accent inset-ring-[color-mix(in_oklab,var(--accent)_30%,transparent)]',
    text: 'text-accent',
    dot:  'text-accent',
  },
}

/** Quality-score (0–1) → bar fill colour. Shared by repo cards and gauges. */
export function scoreColor(score: number): string {
  if (score >= 0.7) return 'bg-teal-500 dark:bg-teal-400'
  if (score >= 0.4) return 'bg-amber-500 dark:bg-amber-400'
  return 'bg-red-500 dark:bg-red-400'
}
