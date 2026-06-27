'use client'

import { CircleCheck, Circle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import type { KbStats } from '../lib/kb-stats'

interface Step {
  readonly label: string
  readonly done: boolean
  readonly detail: string
}

/** Onboarding nudge for the Health Rail. Every step's done-state is derived
 *  from real KbStats — no separate persistence. Distinct from the readiness
 *  *signals* (which grade quality); this grades *setup completeness*. */
export function KbSetupChecklist({ stats, hasProject }: { readonly stats: KbStats; readonly hasProject: boolean }) {
  const steps: Step[] = [
    {
      label: 'Connect a repository',
      done: stats.repoCount > 0,
      detail: stats.repoCount > 0 ? `${stats.repoCount} connected` : 'Index a GitHub repo',
    },
    {
      label: 'Upload a résumé',
      done: stats.importCount > 0,
      detail: stats.importCount > 0 ? `${stats.importCount} uploaded` : 'Seed your career data',
    },
    {
      label: 'Extract career data',
      done: stats.careerEntryCount > 0,
      detail: stats.careerEntryCount > 0 ? `${stats.careerEntryCount} entries` : 'Runs after an upload',
    },
    {
      label: 'Knowledge base ready',
      done: stats.isReady,
      detail: stats.isReady ? 'Agent has data to work with' : 'Complete a step above',
    },
    {
      label: 'Generate a project',
      done: hasProject,
      detail: hasProject ? 'Project ready to tailor' : 'Generate one from a repository',
    },
  ]
  const doneCount = steps.filter(s => s.done).length

  return (
    <Card as="section" className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-6 py-4 dark:border-white/5">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Setup</h3>
        <span className="text-[11px] font-medium tabular-nums text-zinc-500">{doneCount}/{steps.length}</span>
      </div>
      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-white/5">
        {steps.map(step => (
          <li key={step.label} className="flex items-start gap-3 px-6 py-3">
            {step.done
              ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
              : <Circle className="mt-0.5 size-4 shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden />}
            <div className="min-w-0">
              <p className={`text-sm font-medium ${step.done ? 'text-zinc-500 line-through dark:text-zinc-500' : 'text-zinc-800 dark:text-zinc-200'}`}>
                {step.label}
              </p>
              <p className="mt-0.5 text-[11px] text-zinc-500">{step.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
