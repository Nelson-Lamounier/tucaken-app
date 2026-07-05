import type { ReactNode, CSSProperties } from 'react'

interface SplitLayoutProps {
  /** Wide reading column (left). */
  readonly main: ReactNode
  /** Narrow rail (right). */
  readonly aside: ReactNode
  /** Fixed sidebar width in px at xl and up. */
  readonly asideWidth?: number
  /** Stretch both columns to equal height (overrides the default top-align).
   *  Use when the two panels should read as one row (e.g. Activity beside the
   *  compact Resume-Readiness); each child card needs `h-full` to fill. */
  readonly stretch?: boolean
  readonly className?: string
}

/**
 * Wide main column beside a fixed-width sidebar rail. Stacks to a single column
 * below xl (1280px) so both stacks read top-to-bottom on narrow screens. Pure
 * layout: renders no panel chrome. See `.split-layout` in styles.css.
 */
export function SplitLayout({ main, aside, asideWidth = 340, stretch = false, className }: SplitLayoutProps) {
  // Cast is load-bearing: CSSProperties has no index signature for `--*` vars.
  // Inline alignItems (when stretching) overrides `.split-layout`'s align-items: start.
  const style = {
    '--aside-w': `${asideWidth}px`,
    ...(stretch ? { alignItems: 'stretch' } : {}),
  } as CSSProperties
  return (
    <div className={className ? `split-layout ${className}` : 'split-layout'} style={style}>
      <div className="min-w-0">{main}</div>
      <div className="min-w-0">{aside}</div>
    </div>
  )
}
