// src/features/home/lib/PipelineCards.tsx
// Foreground floating status cards. Float via CSS keyframes (off main
// thread); distinct durations + delays so cards never sync.

const CARDS = [
  { label: 'Lead Qualified', dot: 'bg-teal-400', pos: 'left-0 top-4', dur: '5s', delay: '0s' },
  { label: 'Call Initiated', dot: 'bg-cyan-400', pos: 'right-2 top-16', dur: '6s', delay: '0.6s' },
  { label: 'Resume Grounded', dot: 'bg-emerald-400', pos: 'left-10 bottom-6', dur: '7s', delay: '1.1s' },
] as const

export function CardLayer({ reduce }: { reduce: boolean }) {
  return (
    <div className="absolute inset-0">
      {CARDS.map((c) => (
        <div
          key={c.label}
          className={`${reduce ? '' : 'card-float-anim'} absolute ${c.pos} rounded-lg border border-white/10 bg-zinc-900/80 px-3 py-2 backdrop-blur-md`}
          style={{
            willChange: reduce ? 'auto' : 'transform',
            animationName: reduce ? undefined : 'card-float',
            animationDuration: c.dur,
            animationDelay: c.delay,
            animationIterationCount: 'infinite',
            animationTimingFunction: 'ease-in-out',
          }}
        >
          <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${c.dot} shadow-[0_0_8px_currentColor]`} />
          <span className="font-mono text-[11px] text-zinc-200">{c.label}</span>
        </div>
      ))}
    </div>
  )
}
