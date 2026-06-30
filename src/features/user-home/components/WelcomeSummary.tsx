import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import type { DashboardSummary, SummaryAction } from '../lib/dashboard-summary'

const LINK_CLASS = 'inline-flex items-center gap-1 pt-1 text-sm font-medium text-accent hover:underline'

/** Renders the action as a correctly-typed router Link, mapping the small
 *  target enum to a known route so we never pass a raw string to `to`. */
function ActionLink({ action }: { readonly action: SummaryAction }) {
  if (action.target === 'connect-repo') {
    return (
      <Link to="/settings/github" search={{ tab: 'repositories' }} className={LINK_CLASS}>
        {action.label} <ArrowRight className="size-4" aria-hidden />
      </Link>
    )
  }
  if (action.target === 'upload-resume') {
    return (
      <Link to="/settings/github" search={{ tab: 'resumes' }} className={LINK_CLASS}>
        {action.label} <ArrowRight className="size-4" aria-hidden />
      </Link>
    )
  }
  return (
    <Link to="/projects" className={LINK_CLASS}>
      {action.label} <ArrowRight className="size-4" aria-hidden />
    </Link>
  )
}

/**
 * Personalised greeting + smart summary. Deliberately chrome-less — no card,
 * border or background — so it reads as part of the page rather than a panel.
 */
export function WelcomeSummary({ summary }: { readonly summary: DashboardSummary }) {
  return (
    <section className="space-y-1">
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{summary.greeting}</h2>
      <p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-300">{summary.summary}</p>
      {summary.action ? <ActionLink action={summary.action} /> : null}
    </section>
  )
}
