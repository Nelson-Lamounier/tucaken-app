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
 * Stored SVG is sanitised with DOMPurify (SVG profile); Mermaid output is
 * sanitised by Mermaid (securityLevel: 'strict') and injected as-is — a second
 * DOMPurify pass strips its <style> + foreignObject labels.
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
        if (format === 'svg') {
          // Stored / hand-authored SVG is untrusted HTML — sanitise it (SVG-only
          // profile keeps the visual elements; ADD style for any <style> block).
          const DOMPurify = (await import('dompurify')).default
          const clean = DOMPurify.sanitize(source, {
            USE_PROFILES: { svg: true, svgFilters: true },
            ADD_TAGS: ['style'],
          })
          if (!cancelled) { setSvg(clean); setError(null) }
          return
        }

        const mermaid = (await import('mermaid')).default
        const isDark = theme === 'dark'
        mermaid.initialize({
          startOnLoad:   false,
          securityLevel: 'strict',
          theme:         'base',
          flowchart:     { curve: 'basis', padding: 14 },
          themeVariables: isDark
            ? {
                background:         'transparent',
                primaryColor:       '#134e4a', // teal-900 node fill
                primaryBorderColor: '#2dd4bf', // teal-400 border
                primaryTextColor:   '#e4e4e7', // zinc-200 label text
                nodeTextColor:      '#e4e4e7',
                secondaryColor:     '#1e293b', // slate-800 (subgraphs / 2nd level)
                tertiaryColor:      '#0f172a', // slate-900
                lineColor:          '#cbd5e1', // slate-300 edges — distinct from nodes
                fontSize:           '14px',
              }
            : {
                background:         'transparent',
                primaryColor:       '#ccfbf1', // teal-100 node fill
                primaryBorderColor: '#0d9488', // teal-600 border
                primaryTextColor:   '#18181b', // zinc-900 label text
                nodeTextColor:      '#18181b',
                secondaryColor:     '#f1f5f9', // slate-100
                tertiaryColor:      '#e2e8f0', // slate-200
                lineColor:          '#475569', // slate-600 edges — distinct from nodes
                fontSize:           '14px',
              },
        })
        // Mermaid's securityLevel: 'strict' already HTML-encodes label text and
        // strips scripts/click handlers, so its own SVG is safe to inject. A second
        // DOMPurify SVG-profile pass strips Mermaid's <style> block + the
        // <foreignObject> HTML node labels, leaving unlabelled/uncoloured shapes.
        const { svg: rendered } = await mermaid.render(`arch-${reactId}`, source)
        if (!cancelled) { setSvg(rendered); setError(null) }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to render diagram')
      }
    })()
    return () => { cancelled = true }
  }, [format, source, theme, reactId])

  const downloadSvg = () => {
    // Re-serialise the live SVG node to well-formed XML. The in-page markup is
    // HTML-parsed and Mermaid's foreignObject labels carry HTML void tags (<br>)
    // that aren't valid standalone XML — dumping the raw string yields a .svg that
    // fails to open. XMLSerializer self-closes void elements + keeps namespaces.
    const node = containerRef.current?.querySelector('svg')
    if (!node) return
    const xml  = new XMLSerializer().serializeToString(node)
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`], { type: 'image/svg+xml' })
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

      {showSource && (
        <pre className="overflow-x-auto rounded-md bg-zinc-950/60 p-4 text-xs leading-relaxed text-zinc-300 inset-ring inset-ring-white/10">
          <code>{source}</code>
        </pre>
      )}
      {!showSource && error && (
        <p className="rounded-md bg-rose-400/5 px-4 py-6 text-center text-xs text-rose-300 inset-ring inset-ring-rose-400/30">
          {error}
        </p>
      )}
      {!showSource && !error && svg && (
        <div
          ref={containerRef}
          className="flex justify-center overflow-x-auto rounded-md bg-white/2 p-4 inset-ring inset-ring-white/10 [&_svg]:max-w-full"
          // Stored SVG is DOMPurify-sanitised above; Mermaid output is sanitised by
          // Mermaid itself (securityLevel: 'strict') — see the effect.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
      {!showSource && !error && !svg && (
        <div className="h-40 animate-pulse rounded-md bg-white/2 inset-ring inset-ring-white/10" aria-label="Rendering diagram" />
      )}
    </div>
  )
}
