import { useEffect, useId, useRef, useState } from 'react'
import { Code2, Download, Image } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'

export interface ArchitectureDiagramProps {
  readonly format: 'mermaid' | 'svg'
  readonly source: string
}

/**
 * Renders a project architecture diagram. Mermaid is rendered client-side only
 * (it touches the DOM and isn't SSR-safe), so the canvas stays empty until
 * after hydration. All SVG — whether rendered from Mermaid or stored directly —
 * is sanitised with DOMPurify (SVG profile, no scripts) before injection.
 * Offers a raw-source toggle and an SVG download.
 */
export function ArchitectureDiagram({ format, source }: ArchitectureDiagramProps) {
  const { theme } = useTheme()
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [svg, setSvg]           = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [showSource, setShowSource] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const DOMPurify = (await import('dompurify')).default
        const sanitize = (raw: string) =>
          DOMPurify.sanitize(raw, { USE_PROFILES: { svg: true, svgFilters: true } })

        if (format === 'svg') {
          if (!cancelled) { setSvg(sanitize(source)); setError(null) }
          return
        }

        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad:   false,
          theme:         theme === 'dark' ? 'dark' : 'default',
          securityLevel: 'strict',
        })
        const { svg: rendered } = await mermaid.render(`arch-${reactId}`, source)
        if (!cancelled) { setSvg(sanitize(rendered)); setError(null) }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to render diagram')
      }
    })()
    return () => { cancelled = true }
  }, [format, source, theme, reactId])

  const downloadSvg = () => {
    if (!svg) return
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `architecture-${reactId}.svg`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => setShowSource((s) => !s)}
          aria-pressed={showSource}
          className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[11px] font-medium text-zinc-300 inset-ring inset-ring-white/10 hover:bg-white/10"
        >
          {showSource ? <Image className="size-3" /> : <Code2 className="size-3" />}
          {showSource ? 'View diagram' : 'View source'}
        </button>
        {svg && !showSource && (
          <button
            type="button"
            onClick={downloadSvg}
            className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[11px] font-medium text-zinc-300 inset-ring inset-ring-white/10 hover:bg-white/10"
          >
            <Download className="size-3" />
            SVG
          </button>
        )}
      </div>

      {showSource ? (
        <pre className="overflow-x-auto rounded-xl bg-zinc-950/60 p-4 text-xs leading-relaxed text-zinc-300 inset-ring inset-ring-white/10">
          <code>{source}</code>
        </pre>
      ) : error ? (
        <p className="rounded-xl bg-rose-400/5 px-4 py-6 text-center text-xs text-rose-300 inset-ring inset-ring-rose-400/30">
          {error}
        </p>
      ) : svg ? (
        <div
          ref={containerRef}
          className="flex justify-center overflow-x-auto rounded-xl bg-white/2 p-4 inset-ring inset-ring-white/10 [&_svg]:max-w-full"
          // SVG is sanitised with DOMPurify (SVG profile, scripts stripped) above.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="h-40 animate-pulse rounded-xl bg-white/2 inset-ring inset-ring-white/10" aria-label="Rendering diagram" />
      )}
    </div>
  )
}
