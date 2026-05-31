'use client'

import { useMemo } from 'react'
import { CheckCircle2, Lightbulb } from 'lucide-react'
import type { ApplicationDetail } from '@/lib/types/applications.types'
import { Card } from '@/components/ui/Card'
import { ScheduleCard } from '../components/ScheduleCard'
import { SectionHeading } from '../components/SectionHeading'
import { ChecklistItem } from '../components/ChecklistItem'
import { useStageDraft } from '../hooks/useStageDraft'
import { interviewPrepToWorkspace } from '../types/workspace'
import type { ChecklistEntry } from '../types/workspace'

interface PhoneScreenWorkspaceProps {
  readonly detail: ApplicationDetail
}

/** Generic phone-screen expectations — not company-specific (no backend for
 *  that yet); honest, broadly-true content rather than fabricated specifics. */
const WHAT_TO_EXPECT: readonly string[] = [
  'A recruiter or hiring manager confirming your background and motivation.',
  'High-level walk-through of your most relevant experience.',
  'Logistics: timeline, compensation range, remote/onsite, visa.',
  'A short window at the end for your questions.',
]

/** Generic questions worth asking on a first call. */
const DEFAULT_QUESTIONS: readonly ChecklistEntry[] = [
  { id: 'q-team', label: 'What does the team look like and who would I work with?' },
  { id: 'q-success', label: 'What does success look like in the first 90 days?' },
  { id: 'q-process', label: 'What are the remaining interview stages and timeline?' },
  { id: 'q-challenges', label: "What's the biggest challenge the team is facing right now?" },
]

function dedupeQuestions(entries: readonly ChecklistEntry[]): ChecklistEntry[] {
  const seen = new Set<string>()
  const out: ChecklistEntry[] = []
  for (const e of entries) {
    const key = e.label.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

/**
 * Phone Screen workspace (Stage 2). Talking points are grounded in real
 * verified matches; "Questions to ask" merges the Coach Agent's real
 * questions with generic defaults. Comp market data has no backend yet —
 * the user's target is editable and persisted (ADR-0003).
 */
export function PhoneScreenWorkspace({ detail }: PhoneScreenWorkspaceProps) {
  const { draft, setSchedule, toggleChecked, patch } = useStageDraft(detail.slug, 'phone-screen')

  const talkingPoints = useMemo(
    () => (detail.research?.verifiedMatches ?? []).map(m => m.skill),
    [detail.research],
  )

  const questions = useMemo(() => {
    const coach = interviewPrepToWorkspace('phone-screen', detail.interviewPrep).questionsToAsk
    return dedupeQuestions([...coach, ...DEFAULT_QUESTIONS])
  }, [detail.interviewPrep])

  return (
    <div className="space-y-8">
      {/* Schedule */}
      <section className="space-y-3">
        <SectionHeading title="Schedule" />
        <ScheduleCard
          scheduleAt={draft.scheduleAt}
          formatNote={draft.formatNote}
          onChange={setSchedule}
          formatPlaceholder="e.g. 30 min · recruiter Jane Doe"
        />
      </section>

      {/* What to expect / Talking points */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <SectionHeading title="What to expect" />
          <ul className="mt-3 space-y-2">
            {WHAT_TO_EXPECT.map(item => (
              <li key={item} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <SectionHeading title="Your talking points" subtitle="Strengths to lead with, from your verified evidence." />
          {talkingPoints.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {talkingPoints.map(point => (
                <li key={point} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                  {point}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
              Talking points appear once the Research Agent has analysed this application.
            </p>
          )}
        </Card>
      </section>

      {/* Comp conversation */}
      <section className="space-y-3">
        <SectionHeading title="Comp conversation" />
        <Card className="space-y-4 p-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Market range for this role and location lands once comp data is wired up. Set your target now so
            you&apos;re ready if it comes up.
          </p>
          <div>
            <label htmlFor="comp-target" className="mb-1.5 block text-xs font-medium text-zinc-500">
              Your target
            </label>
            <input
              id="comp-target"
              type="text"
              value={draft.compTarget}
              onChange={e => patch({ compTarget: e.target.value })}
              placeholder="e.g. £95k base + equity"
              className="block w-full rounded-md border-0 bg-zinc-50 p-2 text-sm text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 focus:ring-2 focus:ring-inset focus:ring-teal-500 dark:bg-white/5 dark:text-white dark:ring-white/10"
            />
          </div>
          <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
            Suggested response: &ldquo;I&apos;m focused on finding the right fit. Based on the role and my
            experience I&apos;m targeting {draft.compTarget.trim() || '[your target]'} — is that in range?&rdquo;
          </p>
        </Card>
      </section>

      {/* Questions to ask */}
      <section className="space-y-3">
        <SectionHeading title="Questions to ask" subtitle="Tick the two or three you plan to ask." />
        <Card className="p-2">
          {questions.map(entry => (
            <ChecklistItem
              key={entry.id}
              entry={entry}
              checked={draft.checkedItems.includes(entry.id)}
              onToggle={toggleChecked}
            />
          ))}
        </Card>
      </section>
    </div>
  )
}
