import { createFileRoute } from '@tanstack/react-router'
import { ArticleBuilder } from '../../../../features/articles/components/ArticleBuilder'
import { DashboardPage } from '../../../../components/layouts/DashboardPage'

export const Route = createFileRoute('/_dashboard/articles/new/')({
  component: NewArticlePage,
})

function NewArticlePage() {
  return (
    <DashboardPage title="New Article" description="Author an article and choose where to publish it.">
      <ArticleBuilder />
    </DashboardPage>
  )
}
