import { createFileRoute, notFound } from '@tanstack/react-router'
import { PublicCaseStudy } from '@/features/projects/components/public/PublicCaseStudy'
import { getPublicCaseStudyFn } from '@/server/public-projects'
import type { PublicCaseStudy as PublicCaseStudyData } from '@/features/projects/lib/public-types'

export const Route = createFileRoute('/u/$username/p/$slug')({
  loader: async ({ params }) => {
    const data = await getPublicCaseStudyFn({ data: { username: params.username, slug: params.slug } })
    if (!data) throw notFound()
    return { caseStudy: data }
  },
  head: ({ loaderData }) => {
    const cs = loaderData?.caseStudy as PublicCaseStudyData | undefined
    if (!cs) return {}
    const title = `${cs.name} — ${cs.username} on Tucaken`
    const description = cs.tagline ?? cs.pitch?.slice(0, 160) ?? `${cs.name}, a project case study.`
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:type', content: 'article' },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
      ],
    }
  },
  notFoundComponent: PublicNotFound,
  component: PublicCaseStudyPage,
})

function PublicCaseStudyPage() {
  const { caseStudy } = Route.useLoaderData()
  return (
    <main className="min-h-screen bg-white dark:bg-zinc-950">
      <PublicCaseStudy data={caseStudy} />
    </main>
  )
}

function PublicNotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center dark:bg-zinc-950">
      <p className="text-5xl font-bold text-zinc-200 dark:text-zinc-800">404</p>
      <h1 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-zinc-100">Case study not found</h1>
      <p className="mt-2 text-sm text-zinc-500">
        This project may be private or the link may be incorrect.
      </p>
    </main>
  )
}
