// src/features/onboarding/components/StepHeader.tsx
//
// Eyebrow + title + sub block used at the top of every onboarding step.

interface Props {
  eyebrow?: string
  title: string
  sub?: string
}

export function StepHeader({ eyebrow, title, sub }: Props) {
  return (
    <div className="mb-6">
      {eyebrow && (
        <div className="mb-2 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[10px] font-medium tracking-wide text-zinc-400">
          {eyebrow}
        </div>
      )}
      <h1 className="text-balance text-2xl font-semibold leading-[1.15] text-zinc-50 md:text-3xl">
        {title}
      </h1>
      {sub && (
        <p className="mt-3 max-w-[58ch] text-pretty text-sm leading-relaxed text-zinc-400">
          {sub}
        </p>
      )}
    </div>
  )
}
