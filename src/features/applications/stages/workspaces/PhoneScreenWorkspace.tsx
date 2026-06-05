'use client'

import { useMemo } from 'react'
import { CheckCircle2, Lightbulb } from 'lucide-react'
import type { ApplicationDetail, PhoneScreenTalkingPoint } from '@/lib/types/applications.types'
import { Card } from '@/components/ui/Card'
import { ScheduleCard } from '../components/ScheduleCard'
import { ChecklistItem } from '../components/ChecklistItem'
import { SummaryGroup, SummaryRow } from '../components/workspace-shell'
import { useStageDraft } from '../hooks/useStageDraft'
import { interviewPrepToWorkspace, resolveStagePrep } from '../types/workspace'
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

/** Career arc — phone-screen narrative from the Coach Agent. One row, full text in the rail. */
function CareerArcGroup({ summary }: { readonly summary: string }) {
  return (
    <SummaryGroup id="career-arc" title="Your career arc" subtitle="A tight narrative to open the call with.">
      <SummaryRow
        id="career-arc-summary"
        label="Career arc"
        detail={
          <Card className="p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              {summary}
            </p>
          </Card>
        }
      />
    </SummaryGroup>
  )
}

/** What to expect — single row whose detail is the full bulleted list. */
function WhatToExpectGroup() {
  return (
    <SummaryGroup id="what-to-expect" title="What to expect">
      <SummaryRow
        id="what-to-expect-list"
        label="What to expect"
        detail={
          <Card className="p-4">
            <ul className="space-y-2">
              {WHAT_TO_EXPECT.map(item => (
                <li key={item} className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-zinc-400" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        }
      />
    </SummaryGroup>
  )
}

/** Detail body for a JD-cross-referenced talking point. */
function TalkingPointDetail({ tp }: { readonly tp: PhoneScreenTalkingPoint }) {
  return (
    <Card className="space-y-1.5 p-4">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{tp.point}</p>
      {tp.evidence ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{tp.evidence}</p>
      ) : null}
    </Card>
  )
}

/** Talking points — one SummaryRow per point (Coach JD points preferred over raw verified matches). */
function TalkingPointsGroup({
  jdPoints,
  fallbackPoints,
}: {
  readonly jdPoints: readonly PhoneScreenTalkingPoint[]
  readonly fallbackPoints: readonly string[]
}) {
  return (
    <SummaryGroup
      id="talking-points"
      title="Your talking points"
      subtitle="Strengths to lead with, from your verified evidence."
    >
      {jdPoints.map(tp => (
        <SummaryRow
          key={tp.point}
          id={tp.point}
          label={tp.point}
          indicator={<Lightbulb className="size-4 shrink-0 text-accent" aria-hidden />}
          detail={<TalkingPointDetail tp={tp} />}
        />
      ))}
      {jdPoints.length === 0 &&
        fallbackPoints.map(point => (
          <SummaryRow
            key={point}
            id={point}
            label={point}
            indicator={<Lightbulb className="size-4 shrink-0 text-accent" aria-hidden />}
            detail={
              <Card className="p-4">
                <p className="text-sm text-zinc-700 dark:text-zinc-300">{point}</p>
              </Card>
            }
          />
        ))}
      {jdPoints.length === 0 && fallbackPoints.length === 0 && (
        <Card className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Talking points appear once the Research Agent has analysed this application.
        </Card>
      )}
    </SummaryGroup>
  )
}

interface CompScriptText {
  readonly targetEcho: string
  readonly marketContext: string | null
  readonly deflectTemplate: string
}

interface CompConversationGroupProps {
  readonly compScript: CompScriptText | undefined
  readonly compTarget: string
  readonly onTargetChange: (value: string) => void
}

/** Comp conversation — an editable, persisted control; rendered inline (not a row). */
function CompConversationGroup({ compScript, compTarget, onTargetChange }: CompConversationGroupProps) {
  const deflect =
    compScript?.deflectTemplate ??
    `I'm focused on finding the right fit. Based on the role and my experience I'm targeting ${compTarget.trim() || '[your target]'} — is that in range?`
  return (
    <SummaryGroup id="comp" title="Comp conversation">
      <Card className="space-y-4 p-4">
        {compScript ? (
          <>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{compScript.targetEcho}</p>
            {compScript.marketContext ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{compScript.marketContext}</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Market range for this role and location lands once comp data is wired up. Set your target now so
            you&apos;re ready if it comes up.
          </p>
        )}
        <div>
          <label htmlFor="comp-target" className="mb-1.5 block text-xs font-medium text-zinc-500">
            Your target
          </label>
          <input
            id="comp-target"
            type="text"
            value={compTarget}
            onChange={e => onTargetChange(e.target.value)}
            placeholder="e.g. £95k base + equity"
            className="block w-full rounded-md border-0 bg-zinc-50 p-2 text-sm text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 focus:ring-2 focus:ring-inset focus:ring-teal-500 dark:bg-white/5 dark:text-white dark:ring-white/10"
          />
        </div>
        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
          Suggested response: &ldquo;{deflect}&rdquo;
        </p>
      </Card>
    </SummaryGroup>
  )
}

/** Coaching notes — real, from the Coach Agent (when generated for this stage). */
function CoachingNotesGroup({ notes }: { readonly notes: string | undefined }) {
  return (
    <SummaryGroup id="coaching-notes" title="Coaching notes" subtitle="Stage-specific guidance from your interview coach.">
      <Card className="p-4">
        {notes ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {notes}
          </p>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No coaching generated for this stage yet. Generate interview prep to see tailored guidance here.
          </p>
        )}
      </Card>
    </SummaryGroup>
  )
}

interface QuestionsToAskGroupProps {
  readonly questions: readonly ChecklistEntry[]
  readonly checkedItems: readonly string[]
  readonly onToggle: (id: string) => void
}

/** Questions to ask — an action/checklist surface; rendered inline (not rows). */
function QuestionsToAskGroup({ questions, checkedItems, onToggle }: QuestionsToAskGroupProps) {
  return (
    <SummaryGroup id="questions-to-ask" title="Questions to ask" subtitle="Tick the two or three you plan to ask.">
      <Card className="p-2">
        {questions.map(entry => (
          <ChecklistItem
            key={entry.id}
            entry={entry}
            checked={checkedItems.includes(entry.id)}
            onToggle={onToggle}
          />
        ))}
      </Card>
    </SummaryGroup>
  )
}

/**
 * Phone Screen workspace (Stage 2). Talking points are grounded in real
 * verified matches; "Questions to ask" merges the Coach Agent's real
 * questions with generic defaults. Comp market data has no backend yet —
 * the user's target is editable and persisted (ADR-0003).
 *
 * Renders a fragment of SummaryGroups into the WorkspaceShell's left column.
 */
export function PhoneScreenWorkspace({ detail }: PhoneScreenWorkspaceProps) {
  const stageUserState = detail.stages?.['phone-screen']?.user_state as Partial<import('../hooks/useStageDraft').StageDraft> | undefined
  const { draft, setSchedule, toggleChecked, patch } = useStageDraft(detail.slug, 'phone-screen', stageUserState)

  const talkingPoints = useMemo(
    () => (detail.research?.verifiedMatches ?? []).map(m => m.skill),
    [detail.research],
  )

  const prep = useMemo(() => resolveStagePrep(detail, 'phone-screen'), [detail])

  const questions = useMemo(() => {
    const coach = interviewPrepToWorkspace('phone-screen', prep).questionsToAsk
    return dedupeQuestions([...coach, ...DEFAULT_QUESTIONS])
  }, [prep])

  const jdPoints = prep?.jdTalkingPoints ?? []

  return (
    <>
      <SummaryGroup id="schedule" title="Schedule & format">
        <ScheduleCard
          scheduleAt={draft.scheduleAt}
          formatNote={draft.formatNote}
          onChange={setSchedule}
          formatPlaceholder="e.g. 30 min · recruiter Jane Doe"
        />
      </SummaryGroup>

      {prep?.careerArcSummary ? <CareerArcGroup summary={prep.careerArcSummary} /> : null}

      <WhatToExpectGroup />

      <TalkingPointsGroup jdPoints={jdPoints} fallbackPoints={talkingPoints} />

      <CompConversationGroup
        compScript={prep?.compScript}
        compTarget={draft.compTarget}
        onTargetChange={value => patch({ compTarget: value })}
      />

      <CoachingNotesGroup notes={prep?.coachingNotes} />

      <QuestionsToAskGroup questions={questions} checkedItems={draft.checkedItems} onToggle={toggleChecked} />
    </>
  )
}
