import { usePreferencesUiStore } from '../store-ui'

/** Footer entry point to reopen the consent preferences panel. */
export function CookiePreferencesLink({ className }: { className?: string }) {
  const openPanel = usePreferencesUiStore((s) => s.openPanel)
  return (
    <button
      type="button"
      onClick={openPanel}
      className={
        className ??
        'text-sm text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
      }
    >
      Cookie preferences
    </button>
  )
}
