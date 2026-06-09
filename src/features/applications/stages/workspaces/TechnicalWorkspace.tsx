'use client'

import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'motion/react'
import { ExternalLink, FolderOpen, RotateCw, CheckCircle2, CircleSlash } from 'lucide-react'
import type { ApplicationDetail } from '@/lib/types/applications.types'
import { TONE, type Tone } from '@/components/ui/tone'
import { Card } from '@/components/ui/Card'
import { EvidenceDeck, type EvidenceCard } from '../components/EvidenceDeck'
import { CoachingGuidance } from '../components/CoachingSections'
import { parseCoachingSections } from '../lib/coaching-sections'
import { SummaryGroup, SummaryRow, RailField, RailBullets, RailRichText } from '../components/workspace-shell'
import { researchToTopics, resolveStagePrep, type EvidenceStrength } from '../types/workspace'
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

/** Back face of a DSA card when your code shows the pattern — the real-work signal line. */
function DsaEvidenceLine({ evidence }: { readonly evidence: DsaRealWorkTopic }) {
  const sample = evidence.samples[0]
  const signalPhrase = SIGNAL_PHRASE[evidence.signals[0] ?? ''] ?? 'shows real-work DSA'
  return (
    <p className="text-xs text-emerald-700 dark:text-emerald-400">
      Your {sample ? <span className="font-mono">{sample.repo}/{sample.file}:{sample.line}</span> : 'code'} {signalPhrase}{' '}
      <span className="text-zinc-400 dark:text-zinc-500">
        (in {evidence.matchCount} place{evidence.matchCount > 1 ? 's' : ''})
      </span>
    </p>
  )
}

/**
 * A DSA topic flip card: topic + evidence/confidence on the front, the real-work
 * evidence (or practice guidance) on the back. Coloured by whether your code
 * shows the pattern — green = real-work signal, red = no code evidence. Tap to flip.
 */
function DsaFlipCard({ topic, evidence }: { readonly topic: DsaCalibratedTopic; readonly evidence: DsaRealWorkTopic | undefined }) {
  const reduce = useReducedMotion()
  const [flipped, setFlipped] = useState(false)
  const hasEvidence = Boolean(evidence)
  const tone: Tone = hasEvidence ? 'good' : 'bad'
  const border = hasEvidence ? STRENGTH_BORDER.strong : STRENGTH_BORDER.none
  const EvidenceIcon = hasEvidence ? CheckCircle2 : CircleSlash
  const evidenceLabel = hasEvidence ? 'Real-work signal' : 'No code evidence'
  const backLabel = hasEvidence ? 'Evidence in your work' : 'How to prepare'
  const frontHint = hasEvidence ? 'Flip to see your evidence' : 'Flip to see how to prepare'

  return (
    <button
      type="button"
      onClick={() => setFlipped(prev => !prev)}
      aria-pressed={flipped}
      className="h-44 w-full rounded-md text-left perspective-distant focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500"
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: 'preserve-3d', willChange: 'transform' }}
        initial={false}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={reduce ? { duration: 0 } : TOPIC_FLIP_SPRING}
      >
        {/* Front — an at-a-glance evidence icon, the topic, and its role relevance */}
        <div className={`${TOPIC_FACE} bg-white dark:bg-white/2 ${border}`}>
          <div className="flex items-center justify-between">
            <EvidenceIcon className={`size-5 ${TONE[tone].dot}`} role="img" aria-label={evidenceLabel} />
            <RotateCw className="size-3.5 text-zinc-300 dark:text-zinc-600" aria-hidden />
          </div>
          <p className="mt-3 flex-1 text-base font-semibold leading-snug tracking-tight text-zinc-900 dark:text-zinc-100">{topic.displayName}</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-zinc-400">{CONFIDENCE_LABEL(topic.confidence)}</span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">{frontHint}</span>
          </div>
        </div>

        {/* Back — rationale + the evidence in your code (or how to prepare) */}
        <div className={`${TOPIC_FACE} transform-[rotateY(180deg)] bg-zinc-50 dark:bg-white/5 ${border}`}>
          <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase ${TONE[tone].text}`}>
            <EvidenceIcon className="size-3.5" aria-hidden />
            {backLabel}
          </span>
          <div className="mt-1.5 flex-1 space-y-1.5 overflow-y-auto">
            <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">{topic.rationale}</p>
            {evidence ? (
              <DsaEvidenceLine evidence={evidence} />
            ) : (
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                Not assessed from your code — practice on LeetCode / NeetCode before this round.
              </p>
            )}
          </div>
          <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400">
            <RotateCw className="size-3" aria-hidden /> Flip back
          </span>
        </div>
      </motion.div>
    </button>
  )
}

/** 🟡 Secondary block — evidence topics NOT in the calibrated list. */
function ExtraEvidenceList({ topics }: { readonly topics: readonly DsaRealWorkTopic[] }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">Other real-work DSA signals</h4>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Your code shows these patterns; this role didn&apos;t emphasise them.
        </p>
      </div>
      <ol className="space-y-3">
        {topics.map((ev, i) => {
          const sample = ev.samples[0]
          const signalPhrase = SIGNAL_PHRASE[ev.signals[0] ?? ''] ?? 'shows real-work DSA'
          return (
            <li
              key={ev.canonicalName}
              className="flex gap-3 rounded-md bg-amber-50/60 p-4 ring-1 ring-inset ring-amber-200/70 dark:bg-amber-500/5 dark:ring-amber-500/20"
            >
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-[11px] font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-sm leading-snug text-amber-800 dark:text-amber-300">{signalPhrase}</p>
                {sample && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-500">
                    <span className="font-mono">{sample.repo}/{sample.file}:{sample.line}</span>
                    <span className="text-zinc-400 dark:text-zinc-600"> · {ev.matchCount} place{ev.matchCount > 1 ? 's' : ''}</span>
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** Inline DevOps card: topic-group badge + name + the "You declared …" receipt.
 *  Rendered inline (no rail toggle) — these are read-only evidence receipts. */
function DevopsTopicCard({ topic }: { readonly topic: DevopsTopicEvidence }) {
  const s = topic.samples[0]
  const ghUrl = s ? `https://github.com/${s.repo}/blob/HEAD/${s.file}#L${s.line}` : undefined
  return (
    <li className="rounded-md bg-white p-4 ring-1 ring-zinc-200 shadow-sm dark:bg-white/2 dark:ring-0 dark:inset-ring dark:inset-ring-white/10 dark:shadow-none">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-500/20">
          {topic.topicGroup}
        </span>
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{topic.displayName}</h4>
      </div>
      {s && (
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          You declared{' '}
          {ghUrl ? (
            <a
              href={ghUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-mono font-medium text-accent underline underline-offset-2 hover:opacity-80"
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
    </li>
  )
}

type EvidenceTopicRow = ReturnType<typeof researchToTopics>[number]

const TOPIC_FLIP_SPRING = { type: 'spring', visualDuration: 0.45, bounce: 0.18 } as const
const TOPIC_FACE = 'absolute inset-0 flex flex-col rounded-md border p-4 [backface-visibility:hidden] [-webkit-backface-visibility:hidden]'

/** Strength → card border. Mirrors EvidenceIndicator's mapping. */
const STRENGTH_BORDER: Record<EvidenceStrength, string> = {
  strong:   'border-emerald-200 dark:border-emerald-500/30',
  moderate: 'border-amber-200 dark:border-amber-500/30',
  none:     'border-red-200 dark:border-red-500/30',
}

function topicCard(topic: EvidenceTopicRow): EvidenceCard {
  const isGap = topic.strength === 'none'
  return {
    id: topic.id,
    title: topic.title,
    strength: topic.strength,
    backLabel: isGap ? 'Addressing the gap' : 'Evidence in your work',
    hint: isGap ? 'Flip to see how to address it' : 'Flip to see your evidence',
    back: <p>{isGap ? (topic.beHonest ?? topic.summary) : topic.summary}</p>,
  }
}

function TopicsPanel({ topics }: { readonly topics: readonly EvidenceTopicRow[] }) {
  return (
    <EvidenceDeck
      title="Topics likely to come up"
      subtitle="Grounded in the evidence found across your work for this role. Tap a card to reveal the evidence."
      cards={topics.map(topicCard)}
      emptyState={
        <Card className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No analysis yet — topics appear once the Research Agent has run for this application.
        </Card>
      }
    />
  )
}

interface DsaGroupProps {
  readonly detail: ApplicationDetail
  readonly dsaCalibration: DsaTopicCalibration | undefined
  readonly evidenceByTopic: ReadonlyMap<string, DsaRealWorkTopic>
  readonly extraEvidenceTopics: readonly DsaRealWorkTopic[]
  readonly matchesRole: boolean
}

/** Section B — DSA / Coding. Inline flip-card deck coloured by real-work evidence. */
function DsaPanel({
  detail,
  dsaCalibration,
  evidenceByTopic,
  extraEvidenceTopics,
  matchesRole,
}: DsaGroupProps) {
  const likelyTopics = dsaCalibration?.likelyTopics ?? []
  return (
    <section className="space-y-3 rounded-md border border-zinc-200 bg-zinc-50/50 p-4 dark:border-white/10 dark:bg-white/2">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">DSA / Coding</h3>
          {matchesRole && (
            <span className="inline-flex rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent ring-1 ring-inset ring-accent/20">
              Matches this role
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Topics calibrated for this role, coloured by whether your code shows the pattern. Tap a card to reveal the detail.
        </p>
      </div>

      {/* Narrow-coverage honesty banner — ALWAYS shown when Section B renders */}
      <div className="rounded-md bg-blue-50 px-4 py-3 text-sm text-blue-800 ring-1 ring-zinc-200 shadow-sm dark:bg-blue-500/10 dark:text-blue-300 dark:ring-0 dark:inset-ring dark:inset-ring-white/10 dark:shadow-none">
        Real-work detection covers a limited pattern set (graphs, heaps, trees/tries,
        memoization, custom sort). No green badge ≠ you can&apos;t do it — most DSA practice
        happens off-GitHub. We point you to LeetCode/NeetCode; we don&apos;t drill.
      </div>

      {/* Practical-coding note */}
      {detail.technicalRoundType === 'practical' && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          This company favours practical coding over algorithm puzzles — focus on shipping clean,
          working code.
        </p>
      )}

      {/* Primary topic deck — calibrated topics as 🟢/🔴 flip cards */}
      {likelyTopics.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {likelyTopics.map(topic => (
            <DsaFlipCard key={topic.canonicalName} topic={topic} evidence={evidenceByTopic.get(topic.canonicalName)} />
          ))}
        </div>
      ) : (
        <Card className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          This role likely has no DSA round — focus on system design / practical work.
        </Card>
      )}

      {/* 🟡 Secondary block — evidence topics NOT in calibrated list */}
      {extraEvidenceTopics.length > 0 && <ExtraEvidenceList topics={extraEvidenceTopics} />}

      {/* Honesty footnote */}
      {dsaCalibration?.honestyNote && (
        <p className="text-xs text-zinc-400 dark:text-zinc-500">{dsaCalibration.honestyNote}</p>
      )}
    </section>
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
            <>
              <RailField label="Why it matters">{item.rationale}</RailField>
              {item.suggestedResources && item.suggestedResources.length > 0 && (
                <RailField label="Resources">
                  <RailBullets items={item.suggestedResources} />
                </RailField>
              )}
            </>
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
      count={questions.length}
    >
      {questions.map(q => (
        <SummaryRow
          key={q.question}
          id={q.question}
          label={q.question}
          detail={
            <>
              <RailField label="Answer framework">
                <RailRichText text={q.answerFramework} />
              </RailField>
              <RailField label="Bridge strategy">
                <div className="rounded-md bg-accent/5 px-4 py-3 ring-1 ring-inset ring-accent/15">
                  <RailRichText text={q.bridgeStrategy} />
                </div>
              </RailField>
            </>
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
      count={topics.length}
    >
      {matchesRole && (
        <span className="inline-flex rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent ring-1 ring-inset ring-accent/20">
          Matches this role
        </span>
      )}
      <div className="rounded-md bg-blue-50/60 px-4 py-3 text-sm leading-relaxed text-zinc-600 ring-1 ring-inset ring-blue-200/70 dark:bg-blue-500/5 dark:text-zinc-400 dark:ring-blue-500/20">
        The infrastructure artifacts your repos declare, with receipts — what you can speak to,
        not a competence score. Depth assessment is coming.
      </div>
      <ol className="space-y-3">
        {topics.map(topic => (
          <DevopsTopicCard key={topic.canonicalTopicName} topic={topic} />
        ))}
      </ol>
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
    coachingSections: parseCoachingSections(prep?.coachingNotes),
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

/** Coach-generated technical questions — one clickable row per question; the
 *  approach + key points open in the detail rail (mirrors Difficult questions). */
function TechnicalQuestionsGroup({ questions }: { readonly questions: readonly InterviewQuestion[] }) {
  return (
    <SummaryGroup id="technical-questions" title="Likely technical questions" subtitle="Role-tailored by your interview coach." count={questions.length}>
      {questions.map(q => (
        <SummaryRow
          key={q.question}
          id={q.question}
          label={q.question}
          detail={
            <>
              {q.answerFramework && (
                <RailField label="Approach">
                  <RailRichText text={q.answerFramework} />
                </RailField>
              )}
              {q.keyPoints.length > 0 && (
                <RailField label="Key points">
                  <RailBullets items={q.keyPoints} />
                </RailField>
              )}
            </>
          }
        />
      ))}
    </SummaryGroup>
  )
}

/** Questions to ask the interviewer — from the coach. A numbered card per
 *  question: the question to ask, then why it lands. rounded-md, roomy. */
function QuestionsToAskGroup({ questions }: { readonly questions: readonly QuestionToAsk[] }) {
  return (
    <SummaryGroup id="questions-to-ask" title="Questions to ask" subtitle="Thoughtful questions for the interviewer." count={questions.length}>
      <ol className="space-y-3">
        {questions.map((q, i) => (
          <li
            key={q.question}
            className="rounded-md bg-white p-4 ring-1 ring-zinc-200 shadow-sm dark:bg-white/2 dark:ring-0 dark:inset-ring dark:inset-ring-white/10 dark:shadow-none"
          >
            <div className="flex items-start gap-3">
              <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/12 text-[11px] font-semibold tabular-nums text-accent">
                {i + 1}
              </span>
              <p className="min-w-0 flex-1 text-[15px] font-semibold leading-relaxed text-pretty text-zinc-900 dark:text-zinc-100">
                {q.question}
              </p>
            </div>
            <div className="mt-3 space-y-1 border-t border-zinc-100 pt-3 dark:border-white/5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">Why ask it</p>
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{q.rationale}</p>
            </div>
          </li>
        ))}
      </ol>
    </SummaryGroup>
  )
}

/** Coach prep supplements (technical questions, questions-to-ask) — grouped to keep the workspace simple. */
function TechnicalCoachSupplements({ data }: { readonly data: ReturnType<typeof useTechnicalWorkspaceData> }) {
  return (
    <>
      {data.showTechnicalQuestions && <TechnicalQuestionsGroup questions={data.technicalQuestions} />}
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
  const data = useTechnicalWorkspaceData(detail)

  return (
    <>
      {/* Role focus — shown only when pillarClassification present AND primaryPillar !== 'swe-general' */}
      {data.showRoleFocus && data.pc && (
        <SummaryGroup id="role-focus" title="Role focus">
          <RoleFocusCard pc={data.pc} />
        </SummaryGroup>
      )}

      {/* Schedule & format is edited from the dashboard SchedulePanel (shared draft
          via StageDraftProvider); coaching notes are surfaced there too. */}
      <TopicsPanel topics={data.topics} />

      {data.showDsaSection && (
        <DsaPanel
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

      {/* Coaching guidance — positioning lives above the dashboards; these are the
          remaining coach sections, split into focused collapsible groups. */}
      <CoachingGuidance sections={data.coachingSections} appKey={{ slug: detail.slug, stage: 'technical' }} />

      {data.showDevops && (
        <DevopsGroup topics={data.devopsEvidence} matchesRole={data.focusPillars.has('devops-sre-platform')} />
      )}

      <PracticeGroup />
    </>
  )
}
