/** Section title + optional subtitle, shared across stage workspaces. */
export function SectionHeading({ title, subtitle }: { readonly title: string; readonly subtitle?: string }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      {subtitle && <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
    </div>
  )
}
