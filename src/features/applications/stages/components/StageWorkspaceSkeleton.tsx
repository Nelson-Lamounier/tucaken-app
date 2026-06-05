import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Loading placeholder for the stage shell — mirrors the new WorkspaceShell
 * master–detail layout (header, tab bar, a wide left column of stacked rows and
 * a narrower right rail) so there's no layout shift when content lands.
 * Skeletons over spinners (brief constraint).
 */
export function StageWorkspaceSkeleton() {
  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading application">
      <Skeleton className="mb-8 h-8 w-64" />
      <Skeleton className="mb-6 h-10 w-full rounded-xl" />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-3">
          {Array.from({ length: 6 }, (_, i) => `row-${i}`).map(key => (
            <Skeleton key={key} className="h-14 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl lg:w-96" />
      </div>
    </div>
  )
}
