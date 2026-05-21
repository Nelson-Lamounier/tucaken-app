export interface SectionProps {
  readonly icon?:    React.ComponentType<{ className?: string }>
  readonly title:    string
  readonly subtitle?: string
  readonly action?:  React.ReactNode
  readonly children: React.ReactNode
}

export function Section({ icon: Icon, title, subtitle, action, children }: SectionProps) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white/2 inset-ring inset-ring-white/10">
      <header className="flex items-start justify-between gap-3 border-b border-white/5 px-6 py-4">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && (
            <span className="flex size-6 items-center justify-center rounded-md bg-white/5 text-zinc-400 inset-ring inset-ring-white/10">
              <Icon className="size-3.5" />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="px-6 py-5">{children}</div>
    </section>
  )
}

export function EmptyHint({ children }: { readonly children: React.ReactNode }) {
  return <p className="text-xs italic text-zinc-500">{children}</p>
}
