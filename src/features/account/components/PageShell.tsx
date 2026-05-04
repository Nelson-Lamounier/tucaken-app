// src/features/account/components/PageShell.tsx
//
// Generic single-page anchored layout shared by Billing and Settings.
// - Scrollable content on the left.
// - Sticky right-side ToC that highlights the section currently in view
//   (IntersectionObserver) and scrolls smoothly when clicked.
// - Renders WITHOUT a left nav — the host AppLayout supplies its own.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PageNavSection } from '../types'

interface PageShellProps {
  eyebrow?: string
  title: string
  sub?: string
  sections: PageNavSection[]
  children: ReactNode
}

export function PageShell({
  eyebrow,
  title,
  sub,
  sections,
  children,
}: PageShellProps) {
  const [active, setActive] = useState<string>(sections[0]?.id)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )
        if (visible[0]) setActive(visible[0].target.id)
      },
      { root, rootMargin: '-20% 0px -60% 0px', threshold: 0 },
    )
    sections.forEach((s) => {
      const el = root.querySelector(`#${s.id}`)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [sections])

  function scrollTo(id: string) {
    const root = scrollRef.current
    if (!root) return
    const el = root.querySelector<HTMLElement>(`#${id}`)
    if (el) root.scrollTo({ top: el.offsetTop - 24, behavior: 'smooth' })
  }

  return (
    <div ref={scrollRef} className="h-screen overflow-y-auto">
      <div className="mx-auto flex max-w-6xl gap-12 px-8 py-12 lg:px-12">
        <main className="min-w-0 flex-1">
          <header className="mb-10 border-b border-white/5 pb-8">
            {eyebrow && (
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-400">
                {eyebrow}
              </div>
            )}
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
              {title}
            </h1>
            {sub && (
              <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-zinc-400">
                {sub}
              </p>
            )}
          </header>
          <div className="space-y-16 pb-32">{children}</div>
        </main>

        <aside className="sticky top-12 hidden h-fit w-52 shrink-0 lg:block">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            On this page
          </div>
          <nav className="space-y-0.5">
            {sections.map((s) => {
              const Icon = s.icon
              const isActive = active === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollTo(s.id)}
                  className={[
                    'group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition',
                    isActive
                      ? 'bg-white/[0.04] text-zinc-100'
                      : 'text-zinc-500 hover:bg-white/[0.02] hover:text-zinc-300',
                  ].join(' ')}
                >
                  <Icon
                    className={[
                      'size-3.5 shrink-0 transition',
                      isActive
                        ? 'text-teal-300'
                        : 'text-zinc-600 group-hover:text-zinc-400',
                    ].join(' ')}
                  />
                  <span className="whitespace-nowrap">{s.label}</span>
                </button>
              )
            })}
          </nav>
        </aside>
      </div>
    </div>
  )
}

// ---- PageSection -----------------------------------------------------------
// Wraps each anchor target. Uses scroll-mt-12 so the smooth-scroll lands
// below the page's top padding.

export function PageSection({
  id,
  label,
  sub,
  action,
  children,
}: {
  id: string
  label: string
  sub?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-12 space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">{label}</h2>
          {sub && (
            <p className="mt-1 max-w-[60ch] text-pretty text-xs leading-relaxed text-zinc-400">
              {sub}
            </p>
          )}
        </div>
        {action}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  )
}
