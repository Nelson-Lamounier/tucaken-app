import { createFileRoute, redirect } from '@tanstack/react-router'
import { ArticleContainer } from '../features/articles/components/ArticleContainer'
import { DashboardPage } from '../components/layouts/DashboardPage'

export const Route = createFileRoute('/_dashboard/articles')({
  beforeLoad: ({ context }) => {
    if (!context.isAdmin) throw redirect({ to: '/overview' })
  },
  component: ArticlesPage,
})

function ArticlesPage() {
  return (
    <DashboardPage
      title="Article Management"
      description="Review, edit, publish, and delete Bedrock-generated article versions."
    >
      <ArticleContainer />
    </DashboardPage>
  )
}
