/**
 * Company Problem panel — surfaces `research.companyProblem`: a 1-3 sentence
 * synthesis of the core business problem the role exists to solve. Frames the
 * tailored résumé + cover letter as the answer to it. Renders nothing when the
 * problem string is empty/whitespace. Data: `detail.research.companyProblem`.
 */
export function CompanyProblemPanel({ problem }: { readonly problem: string }) {
  if (problem.trim().length === 0) return null

  return (
    <section className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50/50 p-5 dark:border-white/10 dark:bg-white/2">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        The problem this role solves
      </h3>
      <p className="text-sm leading-7 text-zinc-700 dark:text-zinc-200">{problem}</p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Your résumé + cover letter are positioned to solve this.
      </p>
    </section>
  )
}
