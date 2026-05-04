import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/features/account/settings/SettingsPage'
import { useSettings } from '@/features/account/hooks/use-settings'

export const Route = createFileRoute('/_dashboard/settings/')({
  component: SettingsRoute,
})

function SettingsRoute() {
  const { settings, update } = useSettings()
  return <SettingsPage settings={settings} onUpdateSettings={update} />
}
