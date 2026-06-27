import type { ReactNode, CSSProperties } from 'react'

interface PanelFlowProps {
  readonly children: ReactNode
  /** Column min width in px; drives `minmax(min(100%, <min>), 1fr)`. */
  readonly min?: number
  readonly className?: string
}

/**
 * Auto-fit panel grid. Panels reflow to fill the row — `auto-fit` collapses
 * empty tracks so short/absent panels never strand a column — and native
 * masonry tightens vertical packing where supported (see `.panel-flow` in
 * styles.css). Pure layout: renders no panel chrome.
 */
export function PanelFlow({ children, min = 320, className }: PanelFlowProps) {
  // Cast is load-bearing: CSSProperties has no index signature for `--*` vars.
  const style = { '--panel-min': `${min}px` } as CSSProperties
  return (
    <div className={className ? `panel-flow ${className}` : 'panel-flow'} style={style}>
      {children}
    </div>
  )
}
