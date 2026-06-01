import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Loading placeholder for the stage shell — mirrors the real layout (back nav,
 * header, stage progress bar, workspace body + notes aside) so there's no
 * layout shift when content lands. Skeletons over spinners (brief constraint).
 */
export function StageWorkspaceSkeleton() {
  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading application">
      <Skeleton className="mb-6 h-4 w-32" />

      {/* Header */}
      <div className="mb-8 space-y-3">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-40" />
        <div className="flex gap-3 pt-1">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-lg" />
        </div>
      </div>

      {/* Progress bar */}
      <Skeleton className="h-12 w-full rounded-xl" />

      {/* Body + aside */}
      <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl lg:w-80" />
      </div>
    </div>
  )
}
