import { useState, useCallback, useEffect, useRef } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Bot } from 'lucide-react'
import { usePublishDraft } from '../hooks/use-publish-draft'
import { useTopicCandidates } from '../hooks/use-topic-candidates'
import { usePipelineStatus } from '../hooks/use-pipeline-status'
import type { TopicCandidate } from '@/server/articles'
import { useToastStore } from '@/lib/stores/toast-store'
import { usePipelineNotificationsStore } from '@/lib/stores/pipeline-notifications-store'
import { AiArticlesList } from './AiArticlesList'
import { MultiColumnLayout } from '@/components/ui/MultiColumnLayout'
import { AIAgentDetailsPanel } from './AIAgentDetailsPanel'


import {
  type AgentMode,
  type DraftFile,
  PREVIEW_LINE_COUNT,
  MIN_PASTE_CONTENT_LENGTH,
  slugifyFilename,
} from './AIAgentTypes'

import { PipelineMode } from './PipelineMode'
import { AiArticleForm } from './AiArticleForm'

interface AIAgentContainerProps {
  initialMode?: AgentMode
  initialSlug?: string | null
}

export function AIAgentContainer({ initialMode = 'test', initialSlug = null }: AIAgentContainerProps) {
  const { addToast } = useToastStore()
  const addNotification = usePipelineNotificationsStore((s) => s.addNotification)
  const navigate = useNavigate()

  // ── Shared state ──────────────────────────────────────────────────────────
  const [mode, setMode] = useState<AgentMode>(initialMode)
  const [pipelineSlug, setPipelineSlug] = useState<string | null>(initialSlug)

  // ── Upload mode state ─────────────────────────────────────────────────────
  const [draft, setDraft] = useState<DraftFile | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  // ── Paste mode state ──────────────────────────────────────────────────────
  const [pasteContent, setPasteContent] = useState('')
  const [pasteFilename, setPasteFilename] = useState('')

  // ── Topic-discovery state (Gap 2) ─────────────────────────────────────────
  // The candidate the current draft was started from (null for a hand-written
  // draft or an uploaded file). Carries the structured brief on publish.
  const [selectedCandidate, setSelectedCandidate] = useState<TopicCandidate | null>(null)

  // ── TanStack Query hooks ──────────────────────────────────────────────────
  const publishMutation = usePublishDraft()
  const candidatesQuery = useTopicCandidates()
  const pipelineStatus = usePipelineStatus(mode === 'pipeline' ? pipelineSlug : null)
  const reviewNotifiedRef = useRef(false)
  const flaggedNotifiedRef = useRef(false)

  // Fire a persistent toast the first time this pipeline reaches 'review'.
  // The ref guards against re-firing on subsequent polls.
  useEffect(() => {
    if (
      pipelineStatus.data?.pipelineState === 'review' &&
      !reviewNotifiedRef.current
    ) {
      reviewNotifiedRef.current = true
      addToast(
        'info',
        `"${pipelineStatus.data.slug ?? pipelineSlug}" is ready for review — check the Articles list.`,
        10_000,
      )
    }
  }, [pipelineStatus.data?.pipelineState, pipelineStatus.data?.slug, pipelineSlug, addToast])

  // Fire a warning toast the first time this pipeline reaches 'flagged'.
  // QA agent scored below threshold — article needs revision before publishing.
  useEffect(() => {
    if (
      pipelineStatus.data?.pipelineState === 'flagged' &&
      !flaggedNotifiedRef.current
    ) {
      flaggedNotifiedRef.current = true
      addToast(
        'warning',
        `"${pipelineStatus.data.slug ?? pipelineSlug}" was flagged by QA — revise the draft and re-submit.`,
        12_000,
      )
    }
  }, [pipelineStatus.data?.pipelineState, pipelineStatus.data?.slug, pipelineSlug, addToast])

  // ── Derived values ────────────────────────────────────────────────────────
  const sanitisedFilename = slugifyFilename(pasteFilename)
  const pasteCharCount = pasteContent.length
  const isPasteReady =
    sanitisedFilename.length > 0 &&
    pasteContent.length >= MIN_PASTE_CONTENT_LENGTH

  // ── Mode subtitle ─────────────────────────────────────────────────────────
  const subtitle: Record<AgentMode, string> = {
    upload: 'Upload a Markdown draft to create an article',
    paste: 'Paste your Markdown content and generate an article',
    pipeline: `Tracking pipeline for "${pipelineSlug ?? '...'}"`,
    test: 'Create an Article',
  }

  // ── Upload handlers ───────────────────────────────────────────────────────
  const processFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      const lines = content.split('\n')
      const preview = lines.slice(0, PREVIEW_LINE_COUNT).join('\n')

      // File wins — clear paste state and any chosen topic so only one source is active
      setPasteContent('')
      setPasteFilename('')
      setSelectedCandidate(null)
      setDraft({
        name: file.name,
        content,
        size: file.size,
        preview: lines.length > PREVIEW_LINE_COUNT
          ? `${preview}\n...`
          : preview,
      })
      publishMutation.reset()
    }
    reader.readAsText(file)
  }, [publishMutation])

  const handleFileSelect = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) processFile(file)
    },
    [processFile],
  )

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => setIsDragOver(false), [])

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file && file.name.endsWith('.md')) processFile(file)
    },
    [processFile],
  )

  // ── Shared handlers ───────────────────────────────────────────────────────
  const backToMenu = useCallback(() => {
    navigate({ to: '/applications' })
  }, [navigate])

  const clearDraft = useCallback(() => {
    setDraft(null)
    setPasteContent('')
    setPasteFilename('')
    setSelectedCandidate(null)
    publishMutation.reset()
  }, [publishMutation])

  // Start a draft from a suggested topic: seed the filename + a short prompt
  // (problem/angle) that the pipeline treats as the author direction, and keep
  // the candidate so its structured brief (with verified metrics) rides the
  // publish. Paste wins, so any uploaded file is cleared.
  const handleSelectCandidate = useCallback((c: TopicCandidate) => {
    setDraft(null)
    setPasteFilename(c.title)
    const prompt = [c.problem, c.angle ? `Angle: ${c.angle}` : ''].filter(Boolean).join('\n\n')
    setPasteContent(prompt)
    setSelectedCandidate(c)
    publishMutation.reset()
  }, [publishMutation])

  const handlePublish = useCallback(() => {
    let fileName: string
    let content: string

    if (mode === 'paste' || (mode === 'test' && !draft && isPasteReady)) {
      if (!isPasteReady) return
      fileName = sanitisedFilename
      content = pasteContent
    } else {
      if (!draft) return
      fileName = draft.name
      content = draft.content
    }

    // Carry the chosen topic's structured brief (problem/angle + verified
    // metrics) only when the draft actually came from it (paste path). An
    // uploaded file clears selectedCandidate, so file drafts never carry a brief.
    const usingCandidate = selectedCandidate !== null && !draft
    const brief = usingCandidate
      ? {
          problem:         selectedCandidate.problem,
          angle:           selectedCandidate.angle ?? undefined,
          primaryKeyword:  selectedCandidate.primaryKeyword ?? undefined,
          verifiedMetrics: selectedCandidate.verifiedMetrics,
        }
      : undefined

    publishMutation.mutate(
      { fileName, content, brief, candidateId: usingCandidate ? selectedCandidate.id : undefined },
      {
        onSuccess: (data) => {
          if (data.success) {
            addToast('success', `Draft "${data.slug}" uploaded — pipeline triggered!`)
            addNotification({
              type: 'article',
              slug: data.slug,
              label: data.slug,
              status: 'running',
              link: `/ai-agent?mode=pipeline&slug=${encodeURIComponent(data.slug)}`,
            })
            setPipelineSlug(data.slug)
            setMode('pipeline')
            void navigate({ to: '/ai-agent', search: { mode: 'pipeline', slug: data.slug } })
          } else {
            addToast('error', data.message)
          }
        },
        onError: (err) => {
          addToast('error', err.message)
        },
      },
    )
  }, [mode, draft, pasteContent, sanitisedFilename, isPasteReady, selectedCandidate, publishMutation, addToast, addNotification, navigate])

  return (
    <div className="px-6 py-8 sm:px-8 lg:px-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-xl bg-linear-to-br shadow-lg">
            <Bot className="h-10 w-10 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-100">
              AI Agent
            </h1>
            <p className="text-sm text-zinc-500">
              {subtitle[mode]}
            </p>
          </div>
        </div>
      </div>


            {mode === 'test' && (
        <MultiColumnLayout secondaryColumn={<AIAgentDetailsPanel mode={mode} />}>
          <AiArticleForm
            draft={draft}
            isDragOver={isDragOver}
            isPending={publishMutation.isPending}
            candidates={candidatesQuery.data ?? []}
            selectedCandidateId={selectedCandidate?.id ?? null}
            onSelectCandidate={handleSelectCandidate}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onFileSelect={handleFileSelect}
            onClearDraft={clearDraft}
            onPublish={handlePublish}
            pasteFilename={pasteFilename}
            setPasteFilename={setPasteFilename}
            sanitisedFilename={sanitisedFilename}
            pasteContent={pasteContent}
            setPasteContent={setPasteContent}
            pasteCharCount={pasteCharCount}
            isPasteReady={isPasteReady}
          />
        </MultiColumnLayout>
      )}



      {mode === 'pipeline' && pipelineSlug && (
        <MultiColumnLayout
          secondaryColumn={
            <AIAgentDetailsPanel
              mode="pipeline"
              pipelineState={pipelineStatus.data?.pipelineState}
            />
          }
        >
          <PipelineMode
            pipelineSlug={pipelineSlug}
            backToMenu={backToMenu}
          />
        </MultiColumnLayout>
      )}

          <div className="mt-16 sm:mt-24 pt-10 border-t border-white/10">
            <AiArticlesList />
          </div>
    </div>
  )
}
