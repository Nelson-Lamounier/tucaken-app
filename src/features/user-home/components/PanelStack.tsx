import type { ReactNode } from 'react'

interface PanelStackProps {
  readonly children: ReactNode
  readonly className?: string
}

/**
 * Vertical panel stack — a list that grows downward. Adding a panel appends it
 * to the bottom at the stack's full width; the parent decides the width (a
 * full-width band for large panels, a SplitLayout slot for the main/sidebar
 * columns). Pure layout: renders no panel chrome.
 */
export function PanelStack({ children, className }: PanelStackProps) {
  return <div className={className ? `flex flex-col gap-6 ${className}` : 'flex flex-col gap-6'}>{children}</div>
}
