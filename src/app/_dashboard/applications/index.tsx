import { createFileRoute } from '@tanstack/react-router'
import {
  PlusCircleIcon,
  QueueListIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline'
import { Sparkles, Github } from 'lucide-react'
import { GridListActions, type GridListActionGroup } from '@/components/ui/GridListActions'
import { DashboardPage } from '@/components/layouts/DashboardPage'

const actionGroups: GridListActionGroup[] = [
  {
    label: 'Core workflow',
    actions: [
      {
        title: 'New Analysis',
        href: '/applications/new',
        icon: PlusCircleIcon,
        iconForeground: 'text-teal-400',
        iconBackground: 'bg-teal-500/10',
        description: 'Analyse a new job description against your resume and generate a cover letter.',
      },
      {
        title: 'All Applications',
        href: '/applications/list',
        icon: QueueListIcon,
        iconForeground: 'text-purple-400',
        iconBackground: 'bg-purple-500/10',
        description: 'View and manage all your active and disqualified job applications.',
      },
      {
        title: 'Prepare for Interview',
        href: '/applications/list',
        icon: AcademicCapIcon,
        iconForeground: 'text-indigo-400',
        iconBackground: 'bg-indigo-500/10',
        description: 'Open an application to prep and practice across its interview stages.',
      },
    ],
  },
  {
    label: 'Knowledge & content',
    actions: [
      {
        title: 'GitHub Repositories',
        href: '/settings/github',
        icon: Github,
        iconForeground: 'text-zinc-300',
        iconBackground: 'bg-zinc-700/50',
        description: 'Connect and manage GitHub repositories indexed into the knowledge base.',
      },
      {
        title: 'Create Article',
        href: '/ai-agent?mode=test',
        icon: Sparkles,
        iconForeground: 'text-violet-400',
        iconBackground: 'bg-violet-500/10',
        description: 'Create an Article',
      },
      {
        title: 'Generate Article',
        onClick: () => {},
        icon: Sparkles,
        iconForeground: 'text-zinc-500',
        iconBackground: 'bg-zinc-800',
        description: 'Describe a topic and Bedrock will generate a complete article (Coming Soon)',
      },
    ],
  },
]

export const Route = createFileRoute('/_dashboard/applications/')({
  component: ApplicationsIndexRoute,
})

function ApplicationsIndexRoute() {
  return (
    <DashboardPage
      title="Job Applications Hub"
      description="Manage your job applications and interview preparation."
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6">
        <GridListActions groups={actionGroups} />
      </div>
    </DashboardPage>
  )
}

