import { useEffect, useState, useMemo } from 'react'
import { evaluate } from '@mdx-js/mdx'
import * as _jsx_runtime from 'react/jsx-runtime'
import remarkGfm from 'remark-gfm'

// ─── Callout ──────────────────────────────────────────────────────────────────

type CalloutVariant = 'info' | 'warning' | 'security' | 'insight'

const CALLOUT_CONFIG: Record<CalloutVariant, {
  readonly borderColor: string
  readonly bg: string
  readonly border: string
  readonly iconColor: string
  readonly titleColor: string
  readonly defaultTitle: string
  readonly icon: React.ReactNode
}> = {
  info: {
    borderColor: 'border-l-teal-500',
    bg: 'bg-teal-950/20',
    border: 'border-teal-900/40',
    iconColor: 'text-teal-400',
    titleColor: 'text-teal-300',
    defaultTitle: 'Note',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zm-9-3.75h.008v.008H12V8.25z" />
      </svg>
    ),
  },
  warning: {
    borderColor: 'border-l-amber-500',
    bg: 'bg-amber-950/20',
    border: 'border-amber-900/40',
    iconColor: 'text-amber-400',
    titleColor: 'text-amber-300',
    defaultTitle: 'Warning',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
    ),
  },
  security: {
    borderColor: 'border-l-violet-500',
    bg: 'bg-violet-950/20',
    border: 'border-violet-900/40',
    iconColor: 'text-violet-400',
    titleColor: 'text-violet-300',
    defaultTitle: 'Security',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
  },
  insight: {
    borderColor: 'border-l-indigo-500',
    bg: 'bg-indigo-950/20',
    border: 'border-indigo-900/40',
    iconColor: 'text-indigo-400',
    titleColor: 'text-indigo-300',
    defaultTitle: 'Insight',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
      </svg>
    ),
  },
}

interface CalloutProps {
  readonly variant?: CalloutVariant | 'error'
  readonly type?: CalloutVariant | 'error'
  readonly title?: string
  readonly children: React.ReactNode
}

function Callout({ variant, type, title, children }: CalloutProps) {
  const resolvedVariant: CalloutVariant =
    variant === 'error' || type === 'error'
      ? 'security'
      : variant ?? type ?? 'info'
  const config = CALLOUT_CONFIG[resolvedVariant] ?? CALLOUT_CONFIG.info
  const displayTitle = title ?? config.defaultTitle

  return (
    <div className={`not-prose my-8 rounded-xl border-l-[3px] border ${config.borderColor} ${config.border} ${config.bg} px-5 py-4`}>
      <div className="flex items-center gap-2.5">
        <span className={config.iconColor}>{config.icon}</span>
        <span className={`text-sm font-semibold ${config.titleColor}`}>{displayTitle}</span>
      </div>
      <div className="mt-2.5 text-sm leading-relaxed text-zinc-300 [&>p]:my-2 [&>ol]:my-2 [&>ol]:pl-4 [&>ol]:list-decimal [&>ul]:my-2 [&>ul]:pl-4 [&>ul]:list-disc">
        {children}
      </div>
    </div>
  )
}

// ─── Table ────────────────────────────────────────────────────────────────────

function Table({ children, ...props }: Readonly<React.ComponentPropsWithoutRef<'table'>>) {
  return (
    <div className="not-prose my-8 overflow-x-auto rounded-xl border border-zinc-700/60 shadow-md">
      <table className="w-full min-w-120 border-collapse text-sm" {...props}>
        {children}
      </table>
    </div>
  )
}

function TableHead({ children, ...props }: Readonly<React.ComponentPropsWithoutRef<'thead'>>) {
  return (
    <thead className="bg-linear-to-r from-teal-700 to-teal-600 text-white" {...props}>
      {children}
    </thead>
  )
}

function TableBody({ children, ...props }: Readonly<React.ComponentPropsWithoutRef<'tbody'>>) {
  return (
    <tbody className="divide-y divide-zinc-700/40" {...props}>
      {children}
    </tbody>
  )
}

function TableRow({ children, ...props }: Readonly<React.ComponentPropsWithoutRef<'tr'>>) {
  return (
    <tr className="transition-colors even:bg-zinc-800/40 hover:bg-teal-900/20" {...props}>
      {children}
    </tr>
  )
}

function TableHeaderCell({ children, ...props }: Readonly<React.ComponentPropsWithoutRef<'th'>>) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase" {...props}>
      {children}
    </th>
  )
}

function TableCell({ children, ...props }: Readonly<React.ComponentPropsWithoutRef<'td'>>) {
  return (
    <td className="px-4 py-3 text-zinc-300" {...props}>
      {children}
    </td>
  )
}

// ─── Media ────────────────────────────────────────────────────────────────────

interface SmartImageProps {
  readonly src: string
  readonly fallbackAlt?: string
  readonly caption?: string
}

function SmartImage({ src, fallbackAlt, caption }: SmartImageProps) {
  return (
    <figure className="my-8">
      <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/50 shadow-sm">
        <img src={src} alt={fallbackAlt ?? ''} className="w-full" />
      </div>
      {caption && (
        <figcaption className="mt-3 flex items-start gap-3 px-1">
          <div className="mt-0.5 h-4 w-1 shrink-0 rounded-full bg-linear-to-b from-teal-500 to-emerald-500" />
          <span className="text-sm leading-relaxed text-zinc-400">{caption}</span>
        </figcaption>
      )}
    </figure>
  )
}

interface VideoRequestProps {
  readonly src: string
  readonly label?: string
  readonly location?: string
}

function VideoRequest({ src, label, location }: VideoRequestProps) {
  return (
    <figure className="my-8">
      <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 shadow-sm">
        <video src={src} controls className="w-full" muted loop playsInline />
      </div>
      {(label ?? location) && (
        <figcaption className="mt-3 flex items-start px-1 text-sm text-zinc-400">
          <span className="font-medium text-emerald-400">{label}</span>
          {location && <span className="ml-2 border-l border-zinc-700 pl-2">{location}</span>}
        </figcaption>
      )}
    </figure>
  )
}

interface ProcessTimelineProps {
  readonly children: React.ReactNode
}

function ProcessTimeline({ children }: ProcessTimelineProps) {
  return <div className="my-8 border-l-2 border-zinc-700 pl-6">{children}</div>
}

interface MermaidProps {
  readonly chart: string
}

function Mermaid({ chart }: MermaidProps) {
  return (
    <div className="not-prose my-6 overflow-x-auto whitespace-pre rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 font-mono text-xs text-zinc-400">
      {chart}
    </div>
  )
}

// ─── MDX component map ────────────────────────────────────────────────────────

const components = {
  Callout,
  SmartImage,
  ImageRequest: SmartImage,
  VideoRequest,
  ProcessTimeline,
  Mermaid,
  MermaidChart: Mermaid,
  table: Table,
  thead: TableHead,
  tbody: TableBody,
  tr: TableRow,
  th: TableHeaderCell,
  td: TableCell,
}

// ─── MdxPreview ───────────────────────────────────────────────────────────────

interface MdxPreviewProps {
  readonly content: string
}

export function MdxPreview({ content }: MdxPreviewProps) {
  const [MDXContent, setMDXContent] = useState<React.ElementType | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sanitizedSource = useMemo(() => {
    return content.replace(
      /<MermaidChart\s+chart=\{\s*`([\s\S]*?)`\s*\}\s*\/>/g,
      '```mermaid\n$1\n```'
    )
  }, [content])

  useEffect(() => {
    let active = true

    evaluate(sanitizedSource, {
      ..._jsx_runtime,
      remarkPlugins: [remarkGfm],
    })
      .then((mod) => {
        if (active) {
          setMDXContent(() => mod.default)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : String(err))
      })

    return () => { active = false }
  }, [sanitizedSource])

  if (error) {
    return (
      <div className="rounded-xl border border-red-800 bg-red-900/20 p-4">
        <h3 className="mb-2 font-semibold text-red-400">MDX Compilation Error</h3>
        <pre className="overflow-auto font-mono text-xs text-red-300">{error}</pre>
      </div>
    )
  }

  if (!MDXContent) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-4 w-3/4 rounded bg-zinc-800" />
        <div className="h-4 w-full rounded bg-zinc-800" />
        <div className="h-4 w-5/6 rounded bg-zinc-800" />
      </div>
    )
  }

  return (
    <div className="prose prose-invert max-w-none">
      <MDXContent components={components} />
    </div>
  )
}
