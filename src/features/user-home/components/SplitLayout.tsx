import type { ReactNode, CSSProperties } from 'react'

interface SplitLayoutProps {
  /** Wide reading column (left). */
  readonly main: ReactNode
  /** Narrow rail (right). */
  readonly aside: ReactNode
  /** Fixed sidebar width in px at xl and up. */
  readonly asideWidth?: number
  readonly className?: string
}

/**
 * Wide main column beside a fixed-width sidebar rail. Stacks to a single column
 * below xl (1280px) so both stacks read top-to-bottom on narrow screens. Pure
 * layout: renders no panel chrome. See `.split-layout` in styles.css.
 */
export function SplitLayout({ main, aside, asideWidth = 340, className }: SplitLayoutProps) {
  // Cast is load-bearing: CSSProperties has no index signature for `--*` vars.
  const style = { '--aside-w': `${asideWidth}px` } as CSSProperties
  return (
    <div className={className ? `split-layout ${className}` : 'split-layout'} style={style}>
      <div className="min-w-0">{main}</div>
      <div className="min-w-0">{aside}</div>
    </div>
  )
}
