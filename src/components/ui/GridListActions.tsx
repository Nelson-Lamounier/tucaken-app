import * as React from 'react'
import { Link } from '@tanstack/react-router'

export interface GridListAction {
  title: string
  href?: string
  onClick?: () => void
  icon: React.ElementType
  iconForeground: string
  iconBackground: string
  description?: string
}

export interface GridListActionGroup {
  label: string
  actions: GridListAction[]
}

export interface GridListActionsProps {
  groups: GridListActionGroup[]
}

const cardClasses =
  'group flex flex-col gap-4 rounded-lg bg-white p-6 text-left shadow-sm outline -outline-offset-1 outline-zinc-200 transition-colors hover:bg-zinc-50 focus:outline-2 focus:outline-offset-2 focus:outline-teal-500 dark:bg-zinc-800/50 dark:outline-white/10 dark:hover:bg-zinc-800'

/** Icon on top, title + description stacked underneath. */
function ActionBody({ action }: { action: GridListAction }) {
  const { icon: Icon, iconBackground, iconForeground, title, description } = action
  return (
    <>
      <span className={`${iconBackground} ${iconForeground} inline-flex w-fit rounded-lg p-3`}>
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <div>
        <h3 className="text-base font-semibold text-zinc-900 dark:text-white">{title}</h3>
        {description ? (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
        ) : null}
      </div>
    </>
  )
}

/** The whole card is the clickable target — Link when there's an href, button otherwise. */
function ActionCard({ action }: { action: GridListAction }) {
  if (action.href) {
    return (
      <Link to={action.href} onClick={action.onClick} className={cardClasses}>
        <ActionBody action={action} />
      </Link>
    )
  }
  return (
    <button type="button" onClick={action.onClick} className={cardClasses}>
      <ActionBody action={action} />
    </button>
  )
}

export function GridListActions({ groups }: GridListActionsProps) {
  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <section key={group.label}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {group.label}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.actions.map((action) => (
              <ActionCard key={action.title} action={action} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
