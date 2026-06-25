'use client'

import { useEffect, useState } from 'react'
import { Users, Search, Loader2, AlertCircle } from 'lucide-react'
import { useAdminUsers, useRestoreAdminUser } from '../hooks/use-admin-users'
import { useAdminUsersStore } from '@/lib/stores/admin-users-store'
import { CustomDropDown } from '@/components/ui/CustomDropDown'
import { CommandPallete, type CommandPalleteItem } from '@/components/ui/CommandPallete'
import { Pagination } from '@/components/ui/Pagination'
import { TIER_FILTER_OPTIONS } from './AdminUserTypes'
import { UserListRow } from './UserListRow'
import { UserDetailPanel } from './UserDetailPanel'
import { ChangeRolePlanModal } from './ChangeRolePlanModal'
import type { AdminUserSummary, UserTier } from '../types'

const ITEMS_PER_PAGE = 10

function matchesQuery(user: AdminUserSummary, query: string): boolean {
  if (!query.trim()) return true
  const q = query.toLowerCase()
  return (
    user.email.toLowerCase().includes(q) ||
    (user.fullName?.toLowerCase().includes(q) ?? false)
  )
}

interface ToolbarProps {
  readonly tierFilter: UserTier | 'all'
  readonly onTierChange: (val: UserTier | 'all') => void
  readonly onSearchOpen: () => void
}

function Toolbar({ tierFilter, onTierChange, onSearchOpen }: ToolbarProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-zinc-200 p-3 dark:border-white/10 sm:flex-row sm:items-center">
      <div className="z-10 w-full sm:w-64">
        <CustomDropDown
          options={TIER_FILTER_OPTIONS}
          value={tierFilter}
          onChange={(val) => onTierChange(val as UserTier | 'all')}
        />
      </div>
      <div className="group relative flex-1">
        <button
          type="button"
          onClick={onSearchOpen}
          className="flex w-full items-center justify-between rounded-md bg-zinc-100 py-1.5 pl-3 pr-2 text-sm text-zinc-500 outline-1 -outline-offset-1 outline-zinc-300 transition-colors hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:outline-white/10 dark:hover:bg-white/10"
        >
          <span className="flex items-center">
            <Search className="mr-2 size-4" />
            Search email or name...
          </span>
          <kbd className="hidden items-center rounded border border-zinc-200 bg-zinc-100 px-2 py-0.5 font-sans text-xs text-zinc-500 sm:inline-flex dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
            <abbr title="Command" className="no-underline">⌘</abbr>K
          </kbd>
        </button>
      </div>
    </div>
  )
}

interface ListBodyProps {
  readonly isLoading: boolean
  readonly error: Error | null
  readonly paginated: readonly AdminUserSummary[]
  readonly totalPages: number
  readonly currentPage: number
  readonly onView: (user: AdminUserSummary) => void
  readonly onEdit: (user: AdminUserSummary) => void
  readonly onRestore: (user: AdminUserSummary) => void
  readonly onPageChange: (page: number) => void
  readonly hasResults: boolean
}

function ListBody({
  isLoading,
  error,
  paginated,
  totalPages,
  currentPage,
  onView,
  onEdit,
  onRestore,
  onPageChange,
  hasResults,
}: ListBodyProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-8 animate-spin text-violet-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="m-3 flex items-center gap-3 rounded-md border border-red-600/20 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
        <AlertCircle className="size-5 shrink-0" />
        <span>Failed to load users: {error.message}</span>
      </div>
    )
  }

  if (!hasResults) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users className="mb-4 size-12 text-zinc-300 dark:text-zinc-700" />
        <h3 className="text-lg font-medium text-zinc-700 dark:text-zinc-400">No users found</h3>
      </div>
    )
  }

  return (
    <>
      <div className="hidden grid-cols-[1.5fr_1.5fr_8rem_6rem_8rem_auto] items-center gap-4 border-b border-zinc-200 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:border-white/10 dark:text-zinc-500 sm:grid">
        <span>Email</span>
        <span>Name</span>
        <span>Plan</span>
        <span>Role</span>
        <span>Status</span>
        <span className="sr-only">Actions</span>
      </div>
      <div className="divide-y divide-zinc-200 dark:divide-white/10">
        {paginated.map((user) => (
          <UserListRow
            key={user.id}
            user={user}
            onView={onView}
            onEdit={onEdit}
            onRestore={onRestore}
          />
        ))}
      </div>
      {totalPages > 1 && (
        <div className="border-t border-zinc-200 p-3 dark:border-white/10">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </>
  )
}

export function AdminUsersList() {
  const tierFilter = useAdminUsersStore((s) => s.activeTierFilter)
  const setTierFilter = useAdminUsersStore((s) => s.setTierFilter)
  const searchQuery = useAdminUsersStore((s) => s.searchQuery)

  const [palleteOpen, setPalleteOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [detailUserId, setDetailUserId] = useState<string | null>(null)
  const [editUser, setEditUser] = useState<AdminUserSummary | null>(null)

  const { data: users, isLoading, error } = useAdminUsers(tierFilter)
  const { mutate: restoreUser } = useRestoreAdminUser()

  useEffect(() => {
    setCurrentPage(1)
  }, [tierFilter, searchQuery])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setPalleteOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const filtered = (users ?? []).filter((u) => matchesQuery(u, searchQuery))
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const paginated = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  )
  const commandItems: CommandPalleteItem[] = (users ?? []).map((u) => ({
    id: u.id,
    name: u.email,
    description: u.fullName ?? undefined,
  }))

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-8">
      <CommandPallete
        open={palleteOpen}
        setOpen={setPalleteOpen}
        items={commandItems}
        placeholder="Jump to user..."
        onSelect={(item) => setDetailUserId(item.id)}
      />

      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/2">
        <Toolbar
          tierFilter={tierFilter}
          onTierChange={setTierFilter}
          onSearchOpen={() => setPalleteOpen(true)}
        />
        <ListBody
          isLoading={isLoading}
          error={error instanceof Error ? error : null}
          paginated={paginated}
          totalPages={totalPages}
          currentPage={currentPage}
          onView={(u) => setDetailUserId(u.id)}
          onEdit={(u) => setEditUser(u)}
          onRestore={(u) => restoreUser({ id: u.id })}
          onPageChange={setCurrentPage}
          hasResults={filtered.length > 0}
        />
      </div>

      <UserDetailPanel
        userId={detailUserId}
        open={detailUserId !== null}
        onClose={() => setDetailUserId(null)}
      />
      {editUser && (
        <ChangeRolePlanModal user={editUser} open onClose={() => setEditUser(null)} />
      )}
    </div>
  )
}
