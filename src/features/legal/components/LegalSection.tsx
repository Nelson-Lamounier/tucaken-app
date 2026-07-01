import type { LegalSection as LegalSectionData } from '../types'

export function LegalSection({ section }: { section: LegalSectionData }) {
  return (
    <section id={section.id} aria-labelledby={`${section.id}-heading`} className="scroll-mt-24">
      <h2 id={`${section.id}-heading`} className="font-heading text-xl font-semibold">
        {section.heading}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
        {section.body}
      </div>
    </section>
  )
}
