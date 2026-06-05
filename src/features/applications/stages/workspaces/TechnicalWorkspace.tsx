'use client'

import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { ExternalLink, FolderOpen } from 'lucide-react'
import type { ApplicationDetail } from '@/lib/types/applications.types'
import { Card } from '@/components/ui/Card'
import { ScheduleCard } from '../components/ScheduleCard'
import { TopicCard } from '../components/TopicCard'
import { EvidenceIndicator } from '../components/EvidenceIndicator'
import { SummaryGroup, SummaryRow } from '../components/workspace-shell'
import { useStageDraft } from '../hooks/useStageDraft'
import { researchToTopics, resolveStagePrep } from '../types/workspace'
import type {
  DsaRealWorkTopic,
  DsaTopicCalibration,
  PillarClassification,
  DevopsTopicEvidence,
  InterviewQuestion,
  QuestionToAsk,
} from '@/lib/types/applications.types'

type DsaCalibratedTopic = DsaTopicCalibration['likelyTopics'][number]

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

const PILLAR_LABEL: Record<string, string> = {
  'swe-general':           'General Software',
  'swe-dsa':               'Algorithms / DSA',
  'devops-sre-platform':   'DevOps / Platform',
  'ai-engineering':        'AI Engineering',
}

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

/** Role-focus context card — only the caller decides when to render it. */
function RoleFocusCard({ pc }: { readonly pc: PillarClassification }) {
  const pillars = [pc.primaryPillar, ...pc.secondaryPillars]
  return (
    <Card className="space-y-1.5 border-accent/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Role focus</span>
        {pillars.map(p => (
          <span key={p} className="inline-flex rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent ring-1 ring-inset ring-accent/20">
            {PILLAR_LABEL[p] ?? p}
          </span>
        ))}
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Inferred from the JD{pc.jdEvidenceTokens.length > 0 ? `: "${pc.jdEvidenceTokens.join('", "')}"` : ''}. {pc.classificationNote}
      </p>
    </Card>
  )
}

/** Per-topic DSA detail body: green (evidence) or red (no evidence). */
function DsaTopicDetail({
  topic,
  evidence,
}: {
  readonly topic: DsaCalibratedTopic
  readonly evidence: DsaRealWorkTopic | undefined
}) {
  if (evidence) {
    const sample = evidence.samples[0]
    const signalKey = evidence.signals[0] ?? ''
    const signalPhrase = SIGNAL_PHRASE[signalKey] ?? 'shows real-work DSA'
    const ghUrl = sample
      ? `https://github.com/${sample.repo}/blob/HEAD/${sample.file}#L${sample.line}`
      : undefined
    return (
      <Card className="space-y-2 border-emerald-200 p-4 dark:border-emerald-500/20">
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
          <DsaEvidenceSample sample={sample} ghUrl={ghUrl} />
          {signalPhrase}{' '}
          <span className="text-zinc-400 dark:text-zinc-500">
            (in {evidence.matchCount} place{evidence.matchCount > 1 ? 's' : ''})
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
    <Card className="space-y-2 p-4">
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
}

type DsaSample = DsaRealWorkTopic['samples'][number]

/** The repo/file:line fragment of the green evidence line. */
function DsaEvidenceSample({
  sample,
  ghUrl,
}: {
  readonly sample: DsaSample | undefined
  readonly ghUrl: string | undefined
}) {
  if (sample && ghUrl) {
    return (
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
    )
  }
  if (sample) {
    return <span className="font-mono">{sample.repo}/{sample.file}:{sample.line} </span>
  }
  return <>code </>
}

/** 🟡 Secondary block — evidence topics NOT in the calibrated list. */
function ExtraEvidenceList({ topics }: { readonly topics: readonly DsaRealWorkTopic[] }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
        Other real-work DSA signals
      </h4>
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        Your code shows these patterns; this role didn&apos;t emphasise them.
      </p>
      {topics.map(ev => {
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
  )
}

/** Per-topic DevOps detail body: the "You declared …" receipts line. */
function DevopsTopicDetail({ topic }: { readonly topic: DevopsTopicEvidence }) {
  const s = topic.samples[0]
  const ghUrl = s ? `https://github.com/${s.repo}/blob/HEAD/${s.file}#L${s.line}` : undefined
  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/20">
          {topic.topicGroup}
        </span>
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">{topic.displayName}</h4>
      </div>
      {s && (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          You declared{' '}
          {ghUrl ? (
            <a
              href={ghUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-mono font-medium underline underline-offset-2 hover:text-blue-600"
            >
              {s.repo}/{s.file}:{s.line} <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : (
            <span className="font-mono">{s.repo}/{s.file}:{s.line}</span>
          )}{' '}
          (<span className="font-mono">{s.rawName}</span>)
          {topic.artifactCount > 1 && (
            <span className="text-zinc-400 dark:text-zinc-500"> · {topic.artifactCount} artifacts</span>
          )}
        </p>
      )}
    </Card>
  )
}

type EvidenceTopicRow = ReturnType<typeof researchToTopics>[number]

/** Topics likely to come up — one SummaryRow per evidence topic. */
function TopicsGroup({ topics }: { readonly topics: readonly EvidenceTopicRow[] }) {
  return (
    <SummaryGroup
      id="topics"
      title="Topics likely to come up"
      subtitle="Grounded in the evidence found across your work for this role."
      count={topics.length}
    >
      {topics.length === 0 && (
        <Card className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No analysis yet — topics appear once the Research Agent has run for this application.
        </Card>
      )}
      {topics.map(topic => (
        <SummaryRow
          key={topic.id}
          id={topic.id}
          label={topic.title}
          indicator={<EvidenceIndicator strength={topic.strength} />}
          detail={<TopicCard topic={topic} />}
        />
      ))}
    </SummaryGroup>
  )
}

interface DsaGroupProps {
  readonly detail: ApplicationDetail
  readonly dsaCalibration: DsaTopicCalibration | undefined
  readonly evidenceByTopic: ReadonlyMap<string, DsaRealWorkTopic>
  readonly extraEvidenceTopics: readonly DsaRealWorkTopic[]
  readonly matchesRole: boolean
}

/** Section B — DSA / Coding (calibration + real-work evidence badges). */
function DsaGroup({
  detail,
  dsaCalibration,
  evidenceByTopic,
  extraEvidenceTopics,
  matchesRole,
}: DsaGroupProps) {
  const likelyTopics = dsaCalibration?.likelyTopics ?? []
  return (
    <SummaryGroup id="dsa" title="DSA / Coding" subtitle="Topic calibration for this role.">
      {matchesRole && (
        <span className="inline-flex rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent ring-1 ring-inset ring-accent/20">
          Matches this role
        </span>
      )}

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

      {/* Primary topic rows — calibrated topics with 🟢/🔴 treatment */}
      {likelyTopics.length === 0 && (
        <Card className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          This role likely has no DSA round — focus on system design / practical work.
        </Card>
      )}
      {likelyTopics.map(topic => (
        <SummaryRow
          key={topic.canonicalName}
          id={topic.canonicalName}
          label={topic.displayName}
          indicator={
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${confidenceBadge(topic.confidence)}`}
            >
              {CONFIDENCE_LABEL(topic.confidence)}
            </span>
          }
          detail={<DsaTopicDetail topic={topic} evidence={evidenceByTopic.get(topic.canonicalName)} />}
        />
      ))}

      {/* 🟡 Secondary block — evidence topics NOT in calibrated list */}
      {extraEvidenceTopics.length > 0 && <ExtraEvidenceList topics={extraEvidenceTopics} />}

      {/* Honesty footnote */}
      {dsaCalibration?.honestyNote && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">{dsaCalibration.honestyNote}</p>
      )}
    </SummaryGroup>
  )
}

type PrepChecklistItem = NonNullable<ReturnType<typeof resolveStagePrep>>['technicalPrepChecklist'][number]

/** Technical prep checklist — one SummaryRow per checklist item. */
function PrepChecklistGroup({ items }: { readonly items: readonly PrepChecklistItem[] }) {
  return (
    <SummaryGroup
      id="prep-checklist"
      title="Technical prep checklist"
      subtitle="What to revise before the round, prioritised for this role."
      count={items.length}
    >
      {items.length === 0 && (
        <Card className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No coaching generated for this stage yet. Generate interview prep to see a tailored checklist.
        </Card>
      )}
      {items.map(item => (
        <SummaryRow
          key={item.topic}
          id={item.topic}
          label={item.topic}
          indicator={
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${priorityBadge(item.priority)}`}>
              {item.priority}
            </span>
          }
          detail={
            <Card className="space-y-1.5 p-4">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{item.rationale}</p>
              {item.suggestedResources && item.suggestedResources.length > 0 && (
                <p className="text-xs text-zinc-500 dark:text-zinc-500">
                  Resources: {item.suggestedResources.join(', ')}
                </p>
              )}
            </Card>
          }
        />
      ))}
    </SummaryGroup>
  )
}

type DifficultQuestion = NonNullable<ReturnType<typeof resolveStagePrep>>['difficultQuestions'][number]

/** Difficult questions — gap-bridging guidance from the Coach Agent. */
function DifficultQuestionsGroup({ questions }: { readonly questions: readonly DifficultQuestion[] }) {
  return (
    <SummaryGroup
      id="difficult-questions"
      title="Difficult questions"
      subtitle="How to bridge honestly from a gap to an adjacent strength."
    >
      {questions.map(q => (
        <SummaryRow
          key={q.question}
          id={q.question}
          label={q.question}
          detail={
            <Card className="space-y-1.5 p-4">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{q.answerFramework}</p>
              <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
                Bridge: {q.bridgeStrategy}
              </p>
            </Card>
          }
        />
      ))}
    </SummaryGroup>
  )
}

/** DevOps / Infrastructure — evidence-driven; Tier-1 "you declared X"; no competence claim. */
function DevopsGroup({
  topics,
  matchesRole,
}: {
  readonly topics: readonly DevopsTopicEvidence[]
  readonly matchesRole: boolean
}) {
  return (
    <SummaryGroup
      id="devops"
      title="DevOps / Infrastructure"
      subtitle="The infrastructure artifacts your repos declare, with receipts."
    >
      {matchesRole && (
        <span className="inline-flex rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent ring-1 ring-inset ring-accent/20">
          Matches this role
        </span>
      )}
      <Card className="border-blue-200 p-4 text-sm text-zinc-600 dark:border-blue-500/20 dark:text-zinc-400">
        The infrastructure artifacts your repos declare, with receipts — what you can speak to,
        not a competence score. Depth assessment is coming.
      </Card>
      {topics.map(topic => (
        <SummaryRow
          key={topic.canonicalTopicName}
          id={topic.canonicalTopicName}
          label={topic.displayName}
          indicator={
            <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/20">
              {topic.topicGroup}
            </span>
          }
          detail={<DevopsTopicDetail topic={topic} />}
        />
      ))}
    </SummaryGroup>
  )
}

/** Practice — DSA v1: external pointers, not in-product practice. */
function PracticeGroup() {
  return (
    <SummaryGroup id="practice" title="Practice">
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
    </SummaryGroup>
  )
}

/** Project reference sheet — placeholder until topic→project linkage ships. */
function ProjectReferenceGroup() {
  return (
    <SummaryGroup id="project-reference" title="Your project reference sheet" subtitle="The projects you&apos;re most likely to reference.">
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
    </SummaryGroup>
  )
}

interface TechnicalWorkspaceProps {
  readonly detail: ApplicationDetail
}

/** Build the pillar focus Set (primary + secondary) for the role. */
function pillarSet(pc: PillarClassification | undefined): ReadonlySet<string> {
  if (!pc) return new Set()
  return new Set([pc.primaryPillar, ...pc.secondaryPillars])
}

/** Map calibration → real-work evidence (fail-open: absent = no evidence). */
function buildEvidenceMap(real: readonly DsaRealWorkTopic[]): ReadonlyMap<string, DsaRealWorkTopic> {
  return new Map(real.map(e => [e.canonicalName, e]))
}

/** Memoised derivations for the technical workspace. */
function useTechnicalWorkspaceData(detail: ApplicationDetail) {
  const topics = useMemo(() => researchToTopics(detail.research), [detail.research])
  const prep = useMemo(() => resolveStagePrep(detail, 'technical'), [detail])

  const dsaCalibration = detail.research?.dsaTopicCalibration
  const pc = detail.research?.pillarClassification
  const realWork = detail.dsaRealWork ?? []

  const focusPillars = useMemo(() => pillarSet(pc), [pc])
  const evidenceByTopic = useMemo(() => buildEvidenceMap(realWork), [realWork])

  // Topics with evidence that are NOT in the calibrated list → yellow secondary block
  const calibratedNames = useMemo(
    () => new Set((dsaCalibration?.likelyTopics ?? []).map(t => t.canonicalName)),
    [dsaCalibration],
  )
  const extraEvidenceTopics = useMemo(
    () => realWork.filter(e => !calibratedNames.has(e.canonicalName)),
    [realWork, calibratedNames],
  )

  const devopsEvidence = detail.devopsEvidence ?? []
  const checklist = prep?.technicalPrepChecklist ?? []
  const difficultQuestions = prep?.difficultQuestions ?? []

  return {
    topics,
    dsaCalibration,
    pc,
    focusPillars,
    evidenceByTopic,
    extraEvidenceTopics,
    devopsEvidence,
    checklist,
    difficultQuestions,
    showDsaSection: showDsaSectionFor(detail.technicalRoundType),
    showRoleFocus: roleFocusVisible(pc),
    showDevops: devopsEvidence.length > 0,
    showDifficult: difficultQuestions.length > 0,
    ...coachPrepFields(prep),
  }
}

/** Coach prep fields (questions/notes) — extracted to keep useTechnicalWorkspaceData under the complexity cap. */
function coachPrepFields(prep: ReturnType<typeof resolveStagePrep>) {
  const technicalQuestions = prep?.technicalQuestions ?? []
  const questionsToAsk = prep?.questionsToAsk ?? []
  return {
    technicalQuestions,
    questionsToAsk,
    coachingNotes: prep?.coachingNotes,
    showTechnicalQuestions: technicalQuestions.length > 0,
    showQuestionsToAsk: questionsToAsk.length > 0,
  }
}

/** Whether the DSA / Coding section applies to this round type. */
function showDsaSectionFor(roundType: ApplicationDetail['technicalRoundType']): boolean {
  if (!roundType) return true
  return DSA_ROUND_TYPES.has(roundType)
}

/** Role focus shows only when classified to a non-general primary pillar. */
function roleFocusVisible(pc: PillarClassification | undefined): boolean {
  if (!pc) return false
  return pc.primaryPillar !== 'swe-general'
}

/** Coach-generated technical questions — role-tailored, with approach + key points. */
function TechnicalQuestionsGroup({ questions }: { readonly questions: readonly InterviewQuestion[] }) {
  return (
    <SummaryGroup id="technical-questions" title="Likely technical questions" subtitle="Role-tailored by your interview coach.">
      <div className="space-y-2">
        {questions.map((q, i) => (
          <Card key={i} className="space-y-2 p-4">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{q.question}</p>
            {q.answerFramework && <p className="text-xs text-zinc-500 dark:text-zinc-400">Approach: {q.answerFramework}</p>}
            {q.keyPoints.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                {q.keyPoints.map((p, j) => (
                  <li key={j}>{p}</li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </SummaryGroup>
  )
}

/** Questions to ask the interviewer — from the coach. */
function QuestionsToAskGroup({ questions }: { readonly questions: readonly QuestionToAsk[] }) {
  return (
    <SummaryGroup id="questions-to-ask" title="Questions to ask" subtitle="Thoughtful questions for the interviewer.">
      <div className="space-y-2">
        {questions.map((q, i) => (
          <Card key={i} className="space-y-1 p-3">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{q.question}</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{q.rationale}</p>
          </Card>
        ))}
      </div>
    </SummaryGroup>
  )
}

/** Coaching notes — free-text stage guidance from the Coach Agent. */
function TechnicalCoachingNotesGroup({ notes }: { readonly notes: string }) {
  return (
    <SummaryGroup id="coaching-notes" title="Coaching notes" subtitle="Stage-specific guidance from your interview coach.">
      <Card className="p-4">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">{notes}</p>
      </Card>
    </SummaryGroup>
  )
}

/** Coach prep supplements (technical questions, notes, questions-to-ask) — grouped to keep the workspace simple. */
function TechnicalCoachSupplements({ data }: { readonly data: ReturnType<typeof useTechnicalWorkspaceData> }) {
  return (
    <>
      {data.showTechnicalQuestions && <TechnicalQuestionsGroup questions={data.technicalQuestions} />}
      {data.coachingNotes && <TechnicalCoachingNotesGroup notes={data.coachingNotes} />}
      {data.showQuestionsToAsk && <QuestionsToAskGroup questions={data.questionsToAsk} />}
    </>
  )
}

/**
 * Technical-round workspace (Stage 3). Topics are grounded in real Research
 * Agent evidence (verified/partial/gap matches). Project deep-links per topic
 * await the topic→project backend linkage (ADR-0003).
 *
 * Section B adds DSA / Coding calibration (honest gaps, no fake GitHub evidence).
 * DSA v1: external pointers, not in-product practice.
 *
 * Renders a fragment of SummaryGroups into the WorkspaceShell's left column.
 */
export function TechnicalWorkspace({ detail }: TechnicalWorkspaceProps) {
  const stageUserState = detail.stages?.['technical']?.user_state as Partial<import('../hooks/useStageDraft').StageDraft> | undefined
  const { draft, setSchedule } = useStageDraft(detail.slug, 'technical', stageUserState)

  const data = useTechnicalWorkspaceData(detail)

  return (
    <>
      {/* Role focus — shown only when pillarClassification present AND primaryPillar !== 'swe-general' */}
      {data.showRoleFocus && data.pc && (
        <SummaryGroup id="role-focus" title="Role focus">
          <RoleFocusCard pc={data.pc} />
        </SummaryGroup>
      )}

      {/* Schedule + format — primary editable control, rendered inline */}
      <SummaryGroup id="schedule" title="Schedule & format">
        <ScheduleCard
          scheduleAt={draft.scheduleAt}
          formatNote={draft.formatNote}
          onChange={setSchedule}
          formatPlaceholder="e.g. 30m coding + 30m systems discussion"
        />
      </SummaryGroup>

      <TopicsGroup topics={data.topics} />

      {data.showDsaSection && (
        <DsaGroup
          detail={detail}
          dsaCalibration={data.dsaCalibration}
          evidenceByTopic={data.evidenceByTopic}
          extraEvidenceTopics={data.extraEvidenceTopics}
          matchesRole={data.focusPillars.has('swe-dsa')}
        />
      )}

      <ProjectReferenceGroup />

      <PrepChecklistGroup items={data.checklist} />

      {data.showDifficult && <DifficultQuestionsGroup questions={data.difficultQuestions} />}

      <TechnicalCoachSupplements data={data} />

      {data.showDevops && (
        <DevopsGroup topics={data.devopsEvidence} matchesRole={data.focusPillars.has('devops-sre-platform')} />
      )}

      <PracticeGroup />
    </>
  )
}
