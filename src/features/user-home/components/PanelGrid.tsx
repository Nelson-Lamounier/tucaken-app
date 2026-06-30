import type { ReactNode, CSSProperties } from 'react'

interface PanelGridProps {
  readonly children: ReactNode
  /** Column min width in px; drives `minmax(min(100%, <min>), 1fr)`. */
  readonly min?: number
  readonly className?: string
}

/**
 * Equal-height, full-width card grid. Cards flow into as many columns as fit;
 * adding a card wraps it to the next row and the row's cards stretch to equal
 * height (CSS grid's default `align-items: stretch`). `min(100%, --panel-min)`
 * stops the track overflowing on narrow screens. Pure layout: renders no panel
 * chrome. See `.panel-grid` in styles.css.
 */
export function PanelGrid({ children, min = 300, className }: PanelGridProps) {
  // Cast is load-bearing: CSSProperties has no index signature for `--*` vars.
  const style = { '--panel-min': `${min}px` } as CSSProperties
  return (
    <div className={className ? `panel-grid ${className}` : 'panel-grid'} style={style}>
      {children}
    </div>
  )
}
