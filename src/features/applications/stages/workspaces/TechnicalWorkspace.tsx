'use client'

import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { ExternalLink, FolderOpen } from 'lucide-react'
import type { ApplicationDetail } from '@/lib/types/applications.types'
import { Card } from '@/components/ui/Card'
import { ScheduleCard } from '../components/ScheduleCard'
import { SectionHeading } from '../components/SectionHeading'
import { TopicCard } from '../components/TopicCard'
import { useStageDraft } from '../hooks/useStageDraft'
import { researchToTopics, resolveStagePrep } from '../types/workspace'

const PRIORITY_BADGE: Record<string, string> = {
  high:   'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300',
  medium: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300',
  low:    'bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-white/5 dark:text-zinc-400',
}
const priorityBadge = (p: string): string => PRIORITY_BADGE[p] ?? PRIORITY_BADGE.low

const CONFIDENCE_LABEL = (confidence: number): string => {
  if (confidence >= 0.66) return 'High relevance'
  if (confidence >= 0.33) return 'Medium relevance'
  return 'Low relevance'
}

const CONFIDENCE_BADGE: Record<string, string> = {
  high:   'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300',
  medium: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300',
  low:    'bg-zinc-100 text-zinc-600 ring-zinc-500/20 dark:bg-white/5 dark:text-zinc-400',
}
const confidenceBadge = (confidence: number): string => {
  if (confidence >= 0.66) return CONFIDENCE_BADGE.high
  if (confidence >= 0.33) return CONFIDENCE_BADGE.medium
  return CONFIDENCE_BADGE.low
}

/** Round types that should show the DSA / Coding section */
const DSA_ROUND_TYPES = new Set<ApplicationDetail['technicalRoundType']>(['dsa', 'mixed', 'practical'])

/**
 * Honest, specific phrases for each detector signal.
 * The phrasing is import/type-grounded — it describes what the code *does*,
 * not a mastery claim.
 */
const SIGNAL_PHRASE: Record<string, string> = {
  networkx_import: 'imports networkx (graph algorithms)',
  heap:            'uses a heap / priority queue',
  tree_type:       'defines a tree/trie type',
  memoization:     'uses memoization (@lru_cache/@cache)',
  comparator:      'uses a custom sort comparator',
}

interface TechnicalWorkspaceProps {
  readonly detail: ApplicationDetail
}

/**
 * Technical-round workspace (Stage 3). Topics are grounded in real Research
 * Agent evidence (verified/partial/gap matches). Project deep-links per topic
 * await the topic→project backend linkage (ADR-0003).
 *
 * Section B adds DSA / Coding calibration (honest gaps, no fake GitHub evidence).
 * DSA v1: external pointers, not in-product practice.
 */
export function TechnicalWorkspace({ detail }: TechnicalWorkspaceProps) {
  const stageUserState = detail.stages?.['technical']?.user_state as Partial<import('../hooks/useStageDraft').StageDraft> | undefined
  const { draft, setSchedule } = useStageDraft(detail.slug, 'technical', stageUserState)

  const topics = useMemo(() => researchToTopics(detail.research), [detail.research])
  const prep = useMemo(() => resolveStagePrep(detail, 'technical'), [detail])

  const showDsaSection = !detail.technicalRoundType || DSA_ROUND_TYPES.has(detail.technicalRoundType)
  const dsaCalibration = detail.research?.dsaTopicCalibration

  // Real-work evidence map: canonicalName → DsaRealWorkTopic (fail-open: absent = no evidence)
  const evidenceByTopic = useMemo(
    () => new Map((detail.dsaRealWork ?? []).map(e => [e.canonicalName, e])),
    [detail.dsaRealWork],
  )

  // Topics with evidence that are NOT in the calibrated list → yellow secondary block
  const calibratedNames = useMemo(
    () => new Set((dsaCalibration?.likelyTopics ?? []).map(t => t.canonicalName)),
    [dsaCalibration],
  )
  const extraEvidenceTopics = useMemo(
    () => (detail.dsaRealWork ?? []).filter(e => !calibratedNames.has(e.canonicalName)),
    [detail.dsaRealWork, calibratedNames],
  )

  return (
    <div className="space-y-8">
      {/* Schedule + format */}
      <section className="space-y-3">
        <SectionHeading title="Schedule &amp; format" />
        <ScheduleCard
          scheduleAt={draft.scheduleAt}
          formatNote={draft.formatNote}
          onChange={setSchedule}
          formatPlaceholder="e.g. 30m coding + 30m systems discussion"
        />
      </section>

      {/* Topics likely to come up — grounded in real research evidence */}
      <section className="space-y-3">
        <SectionHeading
          title="Topics likely to come up"
          subtitle="Grounded in the evidence found across your work for this role."
        />
        {topics.length > 0 ? (
          <div className="space-y-3">
            {topics.map(topic => (
              <TopicCard key={topic.id} topic={topic} />
            ))}
          </div>
        ) : (
          <Card className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No analysis yet — topics appear once the Research Agent has run for this application.
          </Card>
        )}
      </section>

      {/* Section B — DSA / Coding (calibration + real-work evidence badges) */}
      {showDsaSection && (
        <section className="space-y-3" aria-label="DSA / Coding section">
          <SectionHeading
            title="DSA / Coding"
            subtitle="Topic calibration for this role."
          />

          {/* Narrow-coverage honesty banner — ALWAYS shown when Section B renders */}
          <Card className="border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
            Real-work detection covers a limited pattern set (graphs, heaps, trees/tries,
            memoization, custom sort). No green badge ≠ you can&apos;t do it — most DSA practice
            happens off-GitHub.
          </Card>

          {/* Calibration honesty banner */}
          <Card className="border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
            We calibrate which DSA topics matter for this role and flag gaps. DSA practice happens
            off-GitHub — we point you to LeetCode/NeetCode; we don&apos;t drill.
          </Card>

          {/* Practical-coding note */}
          {detail.technicalRoundType === 'practical' && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              This company favours practical coding over algorithm puzzles — focus on shipping clean,
              working code.
            </p>
          )}

          {/* Primary topic cards — calibrated topics with 🟢/🔴 treatment */}
          {dsaCalibration && dsaCalibration.likelyTopics.length > 0 ? (
            <div className="space-y-3">
              {dsaCalibration.likelyTopics.map(topic => {
                const ev = evidenceByTopic.get(topic.canonicalName)
                const sample = ev?.samples[0]
                const signalKey = ev?.signals[0] ?? ''
                const signalPhrase = SIGNAL_PHRASE[signalKey] ?? 'shows real-work DSA'
                const ghUrl = sample
                  ? `https://github.com/${sample.repo}/blob/HEAD/${sample.file}#L${sample.line}`
                  : undefined

                if (ev) {
                  // 🟢 — calibrated AND has real-work evidence (an evidence row exists).
                  // The file:line sample is shown when present; a row without a sample still
                  // earns green (degraded) rather than silently dropping to the 🔴 path.
                  return (
                    <Card key={topic.canonicalName} className="space-y-2 border-emerald-200 p-4 dark:border-emerald-500/20">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20">
                          Real-work signal
                        </span>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${confidenceBadge(topic.confidence)}`}
                        >
                          {CONFIDENCE_LABEL(topic.confidence)}
                        </span>
                        <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">
                          {topic.displayName}
                        </h4>
                      </div>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">{topic.rationale}</p>
                      {/* Green evidence line: repo/file:line (when sampled) + signal phrase */}
                      <p className="text-xs text-emerald-700 dark:text-emerald-400">
                        Your{' '}
                        {sample && ghUrl ? (
                          <>
                            <a
                              href={ghUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 font-mono font-medium underline underline-offset-2 hover:text-emerald-600"
                            >
                              {sample.repo}/{sample.file}:{sample.line}{' '}
                              <ExternalLink className="size-3" aria-hidden />
                            </a>{' '}
                          </>
                        ) : sample ? (
                          <span className="font-mono">{sample.repo}/{sample.file}:{sample.line} </span>
                        ) : (
                          <>code </>
                        )}
                        {signalPhrase}{' '}
                        <span className="text-zinc-400 dark:text-zinc-500">
                          (in {ev.matchCount} place{ev.matchCount > 1 ? 's' : ''})
                        </span>
                      </p>
                      {/* Import-grounded caveat — honesty constraint */}
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">
                        import/type-grounded — concrete work to talk to, not a mastery score.
                      </p>
                    </Card>
                  )
                }

                // 🔴 — calibrated, no evidence — v1 treatment unchanged
                return (
                  <Card key={topic.canonicalName} className="space-y-2 p-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${confidenceBadge(topic.confidence)}`}
                      >
                        {CONFIDENCE_LABEL(topic.confidence)}
                      </span>
                      <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">
                        {topic.displayName}
                      </h4>
                    </div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">{topic.rationale}</p>
                    {/* DSA v1: external pointers, not in-product practice */}
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                      Not assessed from your code — practice on{' '}
                      <a
                        href="https://leetcode.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 font-medium underline underline-offset-2 hover:text-zinc-600 dark:hover:text-zinc-300"
                      >
                        LeetCode <ExternalLink className="size-3" aria-hidden />
                      </a>
                      {' '}or{' '}
                      <a
                        href="https://neetcode.io"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 font-medium underline underline-offset-2 hover:text-zinc-600 dark:hover:text-zinc-300"
                      >
                        NeetCode <ExternalLink className="size-3" aria-hidden />
                      </a>
                      {' '}before this round.
                    </p>
                  </Card>
                )
              })}
            </div>
          ) : (
            <Card className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              This role likely has no DSA round — focus on system design / practical work.
            </Card>
          )}

          {/* 🟡 Secondary block — evidence topics NOT in calibrated list */}
          {extraEvidenceTopics.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                Other real-work DSA signals
              </h4>
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                Your code shows these patterns; this role didn&apos;t emphasise them.
              </p>
              {extraEvidenceTopics.map(ev => {
                const sample = ev.samples[0]
                const signalKey = ev.signals[0] ?? ''
                const signalPhrase = SIGNAL_PHRASE[signalKey] ?? 'shows real-work DSA'
                return (
                  <Card key={ev.canonicalName} className="space-y-1.5 border-amber-200 p-3 dark:border-amber-500/20">
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {signalPhrase}
                      {sample && (
                        <span className="ml-1 font-mono text-zinc-400 dark:text-zinc-500">
                          ({sample.repo}/{sample.file}:{sample.line})
                        </span>
                      )}
                      {' '}
                      <span className="text-zinc-400 dark:text-zinc-500">
                        — {ev.matchCount} place{ev.matchCount > 1 ? 's' : ''}
                      </span>
                    </p>
                  </Card>
                )
              })}
            </div>
          )}

          {/* Honesty footnote */}
          {dsaCalibration?.honestyNote && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500">{dsaCalibration.honestyNote}</p>
          )}
        </section>
      )}

      {/* Project reference sheet — linkage backend pending */}
      <section className="space-y-3">
        <SectionHeading
          title="Your project reference sheet"
          subtitle="The projects you&apos;re most likely to reference."
        />
        <Card className="flex flex-col items-center gap-3 px-4 py-8 text-center">
          <FolderOpen className="size-6 text-zinc-400" aria-hidden />
          <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
            Ranked project references land once topic-to-project linking ships. For now, browse your
            case-studies directly.
          </p>
          <Link to="/projects" className="text-sm font-medium text-accent hover:underline">
            Open your projects
          </Link>
        </Card>
      </section>

      {/* Technical prep checklist — real, from the Coach Agent */}
      <section className="space-y-3">
        <SectionHeading
          title="Technical prep checklist"
          subtitle="What to revise before the round, prioritised for this role."
        />
        {prep && prep.technicalPrepChecklist.length > 0 ? (
          <div className="space-y-3">
            {prep.technicalPrepChecklist.map(item => (
              <Card key={item.topic} className="space-y-1.5 p-4">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${priorityBadge(item.priority)}`}>
                    {item.priority}
                  </span>
                  <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">{item.topic}</h4>
                </div>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{item.rationale}</p>
                {item.resources.length > 0 && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-500">
                    Resources: {item.resources.join(', ')}
                  </p>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Card className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            No coaching generated for this stage yet. Generate interview prep to see a tailored checklist.
          </Card>
        )}
      </section>

      {/* Difficult questions — gap-bridging guidance from the Coach Agent */}
      {prep && prep.difficultQuestions.length > 0 && (
        <section className="space-y-3">
          <SectionHeading
            title="Difficult questions"
            subtitle="How to bridge honestly from a gap to an adjacent strength."
          />
          <div className="space-y-3">
            {prep.difficultQuestions.map(q => (
              <Card key={q.question} className="space-y-1.5 p-4">
                <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">{q.question}</h4>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{q.answerFramework}</p>
                <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
                  Bridge: {q.bridgeStrategy}
                </p>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Practice — DSA v1: external pointers, not in-product practice */}
      <section className="space-y-3">
        <SectionHeading title="Practice" />
        <div className="flex flex-wrap gap-3">
          <a
            href="https://leetcode.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            Practice on LeetCode
            <ExternalLink className="size-4 text-accent" aria-hidden />
          </a>
          <a
            href="https://neetcode.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            Practice on NeetCode
            <ExternalLink className="size-4 text-accent" aria-hidden />
          </a>
        </div>
      </section>
    </div>
  )
}
