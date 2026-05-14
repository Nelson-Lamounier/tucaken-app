import { createFileRoute, redirect } from '@tanstack/react-router'
import { CommentModeration } from '../features/comments/components/CommentModeration'

export const Route = createFileRoute('/_dashboard/comments')({
  beforeLoad: ({ context }) => {
    if (!context.isAdmin) throw redirect({ to: '/overview' })
  },
  component: CommentModeration,
})
