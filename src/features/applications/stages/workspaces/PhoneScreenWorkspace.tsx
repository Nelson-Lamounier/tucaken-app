'use client'

import { useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import type { ApplicationDetail, PhoneScreenTalkingPoint } from '@/lib/types/applications.types'
import { Card } from '@/components/ui/Card'
import { EvidenceDeck, type EvidenceCard } from '../components/EvidenceDeck'
import { SummaryGroup } from '../components/workspace-shell'
import { useStageDraftContext } from '../hooks/stage-draft-context'
import { interviewPrepToWorkspace, resolveStagePrep } from '../types/workspace'
import type { ChecklistEntry } from '../types/workspace'

interface PhoneScreenWorkspaceProps {
  readonly detail: ApplicationDetail
}

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

function Chips({ skills }: { readonly skills: readonly string[] }) {
  if (skills.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {skills.map(s => (
        <span key={s} className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20">
          {s}
        </span>
      ))}
    </div>
  )
}

export function TalkingPointsPanel({
  jdPoints,
  fallbackPoints,
}: {
  readonly jdPoints: readonly PhoneScreenTalkingPoint[]
  readonly fallbackPoints: readonly string[]
}) {
  const cards: EvidenceCard[] =
    jdPoints.length > 0
      ? jdPoints.map(tp => ({
          id: tp.point,
          title: tp.point,
          strength: 'strong' as const,
          backLabel: 'How to say it',
          hint: 'Flip to see your evidence',
          back: (
            <>
              <p>{tp.evidence}</p>
              <Chips skills={tp.matchedSkills ?? []} />
            </>
          ),
        }))
      : fallbackPoints.map(point => ({
          id: point,
          title: point,
          strength: 'strong' as const,
          backLabel: 'Verified strength',
          hint: 'Lead with this confidently',
          back: <p>A verified strength from your own work — lead with it confidently.</p>,
        }))

  return (
    <EvidenceDeck
      title="Your talking points"
      subtitle="Strengths to lead with, from your verified evidence. Tap a card to test your recall."
      cards={cards}
      emptyState={
        <Card className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Talking points appear once the Research Agent has analysed this application.
        </Card>
      }
    />
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

interface QuestionsToAskGroupProps {
  readonly questions: readonly ChecklistEntry[]
  readonly checkedItems: readonly string[]
  readonly onToggle: (id: string) => void
}

/** One selectable question — whole-card toggle, accent check when chosen. */
function SelectableQuestionCard({
  entry,
  checked,
  onToggle,
}: {
  readonly entry: ChecklistEntry
  readonly checked: boolean
  readonly onToggle: (id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(entry.id)}
      aria-pressed={checked}
      className={[
        'flex w-full items-start gap-3 rounded-md border p-3.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500',
        checked
          ? 'border-accent/40 bg-accent/5 ring-1 ring-inset ring-accent/30'
          : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-white/10 dark:bg-white/2 dark:hover:bg-white/5',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
          checked ? 'border-accent bg-accent text-white' : 'border-zinc-300 text-transparent dark:border-zinc-600',
        ].join(' ')}
      >
        <Check className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug text-zinc-900 dark:text-zinc-100">{entry.label}</span>
        {entry.rationale && (
          <span className="mt-1 block text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{entry.rationale}</span>
        )}
      </span>
    </button>
  )
}

/**
 * Questions to ask — a selectable card grid. Pick the few you'll actually ask;
 * a one-tap "Copy selected" puts them on the clipboard, ready for the call.
 */
function QuestionsToAskGroup({ questions, checkedItems, onToggle }: QuestionsToAskGroupProps) {
  const [copied, setCopied] = useState(false)
  const selected = questions.filter(q => checkedItems.includes(q.id))

  function copySelected() {
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
    if (!clip || selected.length === 0) return
    void clip.writeText(selected.map(q => `• ${q.label}`).join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <SummaryGroup
      id="questions-to-ask"
      title="Questions to ask"
      subtitle="Pick the two or three you'll actually ask — then copy them for the call."
      count={questions.length}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {selected.length > 0 ? `${selected.length} selected` : 'None selected yet'}
          </p>
          <button
            type="button"
            onClick={copySelected}
            disabled={selected.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/10 disabled:cursor-not-allowed disabled:text-zinc-400 disabled:hover:bg-transparent"
          >
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            {copied ? 'Copied' : 'Copy selected'}
          </button>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {questions.map(entry => (
            <SelectableQuestionCard
              key={entry.id}
              entry={entry}
              checked={checkedItems.includes(entry.id)}
              onToggle={onToggle}
            />
          ))}
        </div>
      </div>
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
  // Schedule & format is edited from the dashboard SchedulePanel; both share this
  // single stage-draft instance via the provider (see StageDraftProvider).
  const { draft, toggleChecked, patch } = useStageDraftContext()

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
      <TalkingPointsPanel jdPoints={jdPoints} fallbackPoints={talkingPoints} />

      <CompConversationGroup
        compScript={prep?.compScript}
        compTarget={draft.compTarget}
        onTargetChange={value => patch({ compTarget: value })}
      />

      {/* Coaching notes render as the page intro (StageCoachingNarrative), not here. */}

      <QuestionsToAskGroup questions={questions} checkedItems={draft.checkedItems} onToggle={toggleChecked} />
    </>
  )
}
