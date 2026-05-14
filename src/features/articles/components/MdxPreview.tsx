import { useCallback, useEffect, useRef, useState, useMemo, isValidElement } from 'react'
import { evaluate } from '@mdx-js/mdx'
import * as _jsx_runtime from 'react/jsx-runtime'
import remarkGfm from 'remark-gfm'
import DOMPurify from 'dompurify'

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

// ─── Mermaid ──────────────────────────────────────────────────────────────────

interface MermaidProps {
  readonly chart?: string
  readonly children?: React.ReactNode
  readonly caption?: string
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (!node) return ''
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (isValidElement(node)) {
    return extractText((node.props as { children?: React.ReactNode }).children)
  }
  return ''
}

function Mermaid({ chart, children, caption }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgWrapperRef = useRef<HTMLDivElement>(null)
  const resolvedChart = (chart ?? extractText(children)).trim()

  const [safeSvg, setSafeSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isHovering, setIsHovering] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function renderDiagram() {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
          flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis', padding: 24, nodeSpacing: 40, rankSpacing: 50 },
          themeVariables: {
            primaryColor: '#6366f1',
            primaryTextColor: '#f1f5f9',
            primaryBorderColor: '#4338ca',
            lineColor: '#818cf8',
            secondaryColor: '#1e1b4b',
            tertiaryColor: '#0f172a',
            noteBkgColor: '#1e1b4b',
            noteTextColor: '#e2e8f0',
            noteBorderColor: '#4338ca',
            background: '#0f172a',
            mainBkg: '#1e1b4b',
            nodeBorder: '#6366f1',
            clusterBkg: '#1e1b4b',
            clusterBorder: '#4338ca',
            edgeLabelBackground: '#1e1b4b',
          },
        })

        if (!resolvedChart) throw new Error('Mermaid component requires a "chart" prop or mermaid syntax as children.')

        const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`
        const { svg } = await mermaid.render(id, resolvedChart)

        if (!cancelled) {
          setSafeSvg(DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } }))
          setError(null)
        }
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to render diagram')
      }
    }

    renderDiagram()
    return () => { cancelled = true }
  }, [resolvedChart])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const wrapper = svgWrapperRef.current
    if (!wrapper) return
    const rect = wrapper.getBoundingClientRect()
    wrapper.style.transformOrigin = `${((e.clientX - rect.left) / rect.width) * 100}% ${((e.clientY - rect.top) / rect.height) * 100}%`
  }, [])

  const handleMouseEnter = useCallback(() => setIsHovering(true), [])
  const handleMouseLeave = useCallback(() => {
    setIsHovering(false)
    if (svgWrapperRef.current) svgWrapperRef.current.style.transformOrigin = '50% 50%'
  }, [])

  if (error) {
    return (
      <div className="not-prose my-8 rounded-xl border border-red-800/50 bg-red-950/30 p-5">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-sm font-semibold text-red-300">Diagram render error</p>
        </div>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-red-900/20 p-3 text-xs text-red-400">{error}</pre>
      </div>
    )
  }

  return (
    <figure className="not-prose group my-10" ref={containerRef}>
      <div
        role="img"
        tabIndex={0}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="relative cursor-zoom-in overflow-hidden rounded-2xl border border-indigo-900/40 bg-linear-to-br from-slate-900 via-zinc-900 to-indigo-950/30 shadow-sm transition-shadow duration-300 hover:border-indigo-700/50"
      >
        <div className="h-1 w-full bg-linear-to-r from-indigo-500 via-violet-500 to-purple-500" />
        <div className="h-90 p-6">
          <div
            ref={svgWrapperRef}
            className="h-full w-full transition-transform duration-300 ease-out [&_svg]:mx-auto [&_svg]:max-h-full [&_svg]:w-auto"
            style={{ transform: isHovering ? 'scale(2)' : 'scale(1)', transformOrigin: '50% 50%' }}
            dangerouslySetInnerHTML={safeSvg ? { __html: safeSvg } : undefined}
          />
        </div>
        <div className={`absolute inset-x-0 bottom-0 flex items-center justify-center pb-4 pt-8 transition-opacity duration-300 ${isHovering ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
          <span className="flex items-center gap-2 rounded-full border border-indigo-800/60 bg-zinc-800/70 px-3 py-1.5 text-[11px] font-medium text-indigo-300 backdrop-blur-sm">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
            </svg>
            Hover to zoom
          </span>
        </div>
      </div>
      {caption && (
        <figcaption className="mt-4 flex items-start gap-3 px-1">
          <div className="mt-0.5 h-4 w-1 shrink-0 rounded-full bg-linear-to-b from-indigo-500 to-violet-500" />
          <span className="text-sm leading-relaxed text-zinc-400">{caption}</span>
        </figcaption>
      )}
    </figure>
  )
}

// ─── ImageRequest ─────────────────────────────────────────────────────────────

// Set VITE_IMAGES_CDN_URL in .env.local to load images from CloudFront.
// Without it, ImageRequest shows the amber placeholder with the AI instruction.
const CDN_URL = (import.meta.env.VITE_IMAGES_CDN_URL as string | undefined) ?? ''

const IMAGE_EXTENSIONS = ['jpeg', 'png', 'webp'] as const

interface ImageRequestProps {
  readonly id: string
  readonly instruction: string
}

function ImageRequest({ id, instruction }: ImageRequestProps) {
  const [extIndex, setExtIndex] = useState(0)
  const [imgError, setImgError] = useState(!CDN_URL)

  const imageUrl = `${CDN_URL}/images/articles/${id}.${IMAGE_EXTENSIONS[extIndex]}`

  function handleError() {
    if (extIndex < IMAGE_EXTENSIONS.length - 1) {
      setExtIndex((prev) => prev + 1)
    } else {
      setImgError(true)
    }
  }

  if (imgError) {
    return (
      <figure className="not-prose my-8">
        <div className="flex min-h-50 items-center justify-center rounded-xl border-2 border-dashed border-amber-600 bg-amber-950/20 p-6">
          <div className="text-center">
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-900/40 px-3 py-1 text-xs font-semibold text-amber-300">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
              </svg>
              Screenshot Needed
            </span>
            <p className="mt-3 max-w-md text-sm font-medium text-amber-200">{instruction}</p>
            <code className="mt-2 inline-block rounded bg-amber-900/30 px-2 py-0.5 text-xs text-amber-400">ID: {id}</code>
          </div>
        </div>
      </figure>
    )
  }

  return (
    <figure className="not-prose my-8">
      <div className="overflow-hidden rounded-xl border border-zinc-700/50 shadow-sm">
        <img key={imageUrl} src={imageUrl} alt={instruction} loading="lazy" className="h-auto w-full" onError={handleError} />
      </div>
      <figcaption className="mt-3 text-center text-sm text-zinc-400">{instruction}</figcaption>
    </figure>
  )
}

// ─── VideoRequest ─────────────────────────────────────────────────────────────

interface VideoRequestProps {
  readonly id: string
  readonly instruction: string
}

function VideoRequest({ id, instruction }: VideoRequestProps) {
  const [videoError, setVideoError] = useState(!CDN_URL)
  const mp4Url = `${CDN_URL}/videos/articles/${id}.mp4`
  const webmUrl = `${CDN_URL}/videos/articles/${id}.webm`

  if (videoError) {
    return (
      <figure className="not-prose my-8">
        <div className="flex min-h-50 items-center justify-center rounded-xl border-2 border-dashed border-violet-600 bg-violet-950/20 p-6">
          <div className="text-center">
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-violet-900/40 px-3 py-1 text-xs font-semibold text-violet-300">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
              Video Needed
            </span>
            <p className="mt-3 max-w-md text-sm font-medium text-violet-200">{instruction}</p>
            <code className="mt-2 inline-block rounded bg-violet-900/30 px-2 py-0.5 text-xs text-violet-400">ID: {id}</code>
          </div>
        </div>
      </figure>
    )
  }

  return (
    <figure className="not-prose my-8">
      <div className="overflow-hidden rounded-3xl border border-zinc-700/50 shadow-sm">
        <video autoPlay loop muted playsInline className="w-full" onError={() => setVideoError(true)}>
          <source src={mp4Url} type="video/mp4" />
          <source src={webmUrl} type="video/webm" />
        </video>
      </div>
      <figcaption className="mt-3 text-center text-sm text-zinc-400">{instruction}</figcaption>
    </figure>
  )
}

// ─── SmartImage ───────────────────────────────────────────────────────────────

interface SmartImageProps {
  readonly src: string
  readonly fallbackAlt?: string
  readonly caption?: string
}

function SmartImage({ src, fallbackAlt, caption }: SmartImageProps) {
  return (
    <figure className="not-prose my-8">
      <div className="overflow-hidden rounded-3xl border border-zinc-700/50 shadow-sm">
        <img src={src} alt={fallbackAlt ?? ''} className="h-auto w-full" loading="lazy" />
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

// ─── ProcessTimeline ──────────────────────────────────────────────────────────

interface ProcessTimelineProps {
  readonly children: React.ReactNode
}

function ProcessTimeline({ children }: ProcessTimelineProps) {
  return <div className="my-8 border-l-2 border-zinc-700 pl-6">{children}</div>
}

// ─── MDX component map ────────────────────────────────────────────────────────

const components = {
  Callout,
  SmartImage,
  ImageRequest,
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
