import { LEGAL } from '../config'
import type { LegalDoc, LegalSlug } from '../types'
import { LegalSection } from './LegalSection'

const DOC_LINKS: { slug: LegalSlug; label: string; href: string }[] = [
  { slug: 'terms', label: 'Terms & Conditions', href: '/terms' },
  { slug: 'privacy', label: 'Privacy Policy', href: '/privacy' },
  { slug: 'cookies', label: 'Cookie Policy', href: '/cookies' },
]

const linkClass = 'text-teal-600 underline hover:text-teal-500 dark:text-teal-400'

export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <main className="min-h-dvh bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="mx-auto w-[min(48rem,calc(100%-2rem))] py-16">
        <header className="mb-10">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">{doc.title}</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Last updated on {doc.lastUpdated}. Questions:{' '}
            <a className={linkClass} href={`mailto:${LEGAL.contactEmail}`}>
              {LEGAL.contactEmail}
            </a>
            .
          </p>
        </header>

        {doc.intro ? (
          <div className="mb-10 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{doc.intro}</div>
        ) : null}

        <nav aria-label="On this page" className="mb-10">
          <ul className="space-y-1 text-sm">
            {doc.sections.map((s) => (
              <li key={s.id}>
                <a className={linkClass} href={`#${s.id}`}>
                  {s.heading}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-10">
          {doc.sections.map((s) => (
            <LegalSection key={s.id} section={s} />
          ))}
        </div>

        <footer className="mt-16 border-t border-zinc-200 pt-6 text-sm dark:border-zinc-800">
          <ul className="flex flex-wrap gap-4">
            {DOC_LINKS.filter((l) => l.slug !== doc.slug).map((l) => (
              <li key={l.slug}>
                <a className={linkClass} href={l.href}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </footer>
      </div>
    </main>
  )
}
