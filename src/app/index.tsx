import { createFileRoute, redirect } from '@tanstack/react-router'
import { HomePage } from '../features/home/HomePage'

export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    if (context.auth.user) {
      throw redirect({ to: '/overview' })
    }
  },
  component: HomePage,
})
