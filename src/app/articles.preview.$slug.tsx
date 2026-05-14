"use client"
import { useState } from 'react'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { ArrowLeftIcon, ChevronDoubleRightIcon, ChevronDoubleLeftIcon } from '@heroicons/react/20/solid'
import { useArticleContent, useArticleMetadata, useArticleVersions } from '@/hooks/use-admin-articles'
import { MdxPreview } from '@/features/articles/components/MdxPreview'
import { ArticlePreviewMeta } from '@/features/articles/components/ArticlePreviewMeta'

export const Route = createFileRoute('/articles/preview/$slug')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.user) {
      throw redirect({ to: '/sign-in', search: { callbackUrl: location.href } })
    }
  },
  component: ArticlePreviewPage,
})

const STATUS_CLASS: Record<string, string> = {
  draft:      'bg-amber-900/30 text-amber-300 ring-1 ring-amber-500/30',
  published:  'bg-teal-900/30 text-teal-300 ring-1 ring-teal-500/30',
  flagged:    'bg-orange-900/30 text-orange-300 ring-1 ring-orange-500/30',
  review:     'bg-blue-900/30 text-blue-300 ring-1 ring-blue-500/30',
  rejected:   'bg-red-900/30 text-red-300 ring-1 ring-red-500/30',
  processing: 'bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700',
}

function ArticlePreviewPage() {
  const { slug } = Route.useParams()
  const router = useRouter()
  const [panelOpen, setPanelOpen] = useState(true)

  const { data: contentData, isLoading: contentLoading } = useArticleContent(slug)
  const { data: metadata, isLoading: metaLoading } = useArticleMetadata(slug)
  const { data: versionData, isLoading: versionsLoading } = useArticleVersions(slug)

  const title = metadata?.title ?? slug
  const status = metadata?.status ?? 'draft'

  function handleBack() {
    router.history.back()
  }

  function renderContent() {
    if (contentLoading) {
      return (
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-2/3 rounded bg-zinc-800" />
          <div className="h-4 w-full rounded bg-zinc-800" />
          <div className="h-4 w-5/6 rounded bg-zinc-800" />
          <div className="h-4 w-4/5 rounded bg-zinc-800" />
        </div>
      )
    }
    if (contentData === null) {
      return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-8 py-12 text-center">
          <p className="text-sm font-medium text-zinc-300">Content not found</p>
          <p className="mt-1 text-xs text-zinc-500">
            No S3 content exists yet for <code className="font-mono text-zinc-400">{slug}</code>.
            The article may still be in an early pipeline stage.
          </p>
        </div>
      )
    }
    return <MdxPreview content={contentData?.content ?? ''} />
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-950/95 px-4 py-2.5 backdrop-blur">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Back
        </button>

        <div className="h-4 w-px bg-zinc-800" />

        <h1 className="flex-1 truncate text-sm font-medium text-zinc-200">{title}</h1>

        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[status] ?? STATUS_CLASS['draft']}`}>
          {status}
        </span>

        <div className="h-4 w-px bg-zinc-800" />

        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
          title={panelOpen ? 'Hide info panel' : 'Show info panel'}
        >
          {panelOpen
            ? <ChevronDoubleRightIcon className="h-3.5 w-3.5" />
            : <ChevronDoubleLeftIcon className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{panelOpen ? 'Hide panel' : 'Show panel'}</span>
        </button>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Prose area */}
        <main className="flex-1 overflow-y-auto px-6 py-12">
          <div className="mx-auto max-w-3xl">
            {renderContent()}
          </div>
        </main>

        {/* Metadata panel */}
        {panelOpen && (
          <ArticlePreviewMeta
            metadata={metadata}
            versionData={versionData}
            metaIsLoading={metaLoading}
            versionsIsLoading={versionsLoading}
          />
        )}
      </div>
    </div>
  )
}
