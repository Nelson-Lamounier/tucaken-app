import { cn } from '@/lib/utils'

/**
 * Shimmer placeholder block. Use for layout-matched loading states instead of
 * spinners — the skeleton should mirror the shape of the content it replaces.
 * Dual-mode (light + dark).
 */
export function Skeleton({ className }: { readonly className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-md bg-zinc-200/80 dark:bg-white/10', className)}
    />
  )
}
