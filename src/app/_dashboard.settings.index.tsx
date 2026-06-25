import { createFileRoute, redirect } from '@tanstack/react-router'
import { SettingsPage } from '@/features/account/settings/SettingsPage'
import { useSettings } from '@/features/account/hooks/use-settings'

export const Route = createFileRoute('/_dashboard/settings/')({
  // Workspace settings are owner-only. The _dashboard parent route resolves
  // `isAdmin` (me.plan.role === 'admin') into context; non-admins are bounced.
  beforeLoad: ({ context }) => {
    if (!context.isAdmin) {
      throw redirect({ to: '/overview' })
    }
  },
  component: SettingsRoute,
})

function SettingsRoute() {
  const { settings, update } = useSettings()
  return <SettingsPage settings={settings} onUpdateSettings={update} />
}
