import { createFileRoute } from '@tanstack/react-router'
import { ResumeBuilderApp } from '@/features/resume-theme/app/main'

export const Route = createFileRoute('/_dashboard/resume-theme')({
  staticData: { disableMainWrapper: true },
  component: ResumeBuilderApp,
})
