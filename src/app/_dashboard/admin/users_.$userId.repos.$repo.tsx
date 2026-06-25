import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { DashboardPage } from '@/components/layouts/DashboardPage'
import { getUserRepositoryFn } from '@/server/admin-users'
import { RepoRagDetail } from '@/features/admin-users/components/RepoRagDetail'

export const Route = createFileRoute('/_dashboard/admin/users_/$userId/repos/$repo')({
  beforeLoad: ({ context }) => {
    if (!context.isAdmin) {
      throw redirect({ to: '/overview' })
    }
  },
  component: RepoRagDetailRoute,
})

function RepoRagDetailRoute() {
  const { userId, repo } = Route.useParams()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'user-repo', userId, repo],
    queryFn: () => getUserRepositoryFn({ data: { id: userId, repo } }),
    retry: false,
  })

  return (
    <DashboardPage title="Repository RAG metrics" description={repo}>
      <Link
        to="/admin/users"
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        <ChevronLeft className="size-4" /> Back to users
      </Link>
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-violet-400" /></div>
      ) : isError || !data ? (
        <p className="py-8 text-sm text-zinc-500">No RAG metrics found for this repository.</p>
      ) : (
        <RepoRagDetail repo={data} />
      )}
    </DashboardPage>
  )
}
