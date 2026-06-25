/**
 * Admin Users UI Store — Zustand
 *
 * Client-side UI state for the admin Users list (tier filter + search).
 * Server data lives in the TanStack Query cache, not here.
 */
import { create } from 'zustand'
import type { UserTier } from '@/features/admin-users/types'

interface AdminUsersUIStore {
  activeTierFilter: UserTier | 'all'
  searchQuery: string
  setTierFilter: (tier: UserTier | 'all') => void
  setSearchQuery: (query: string) => void
  reset: () => void
}

const INITIAL_STATE = {
  activeTierFilter: 'all' as const,
  searchQuery: '',
}

export const useAdminUsersStore = create<AdminUsersUIStore>((set) => ({
  ...INITIAL_STATE,
  setTierFilter: (tier) => set({ activeTierFilter: tier }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  reset: () => set(INITIAL_STATE),
}))
