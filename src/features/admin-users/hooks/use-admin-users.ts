import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { notifyError } from '@/lib/errors/notify'
import type { AdminUserSummary, AdminUserDetail, UserTier, UserRole } from '../types'
import {
  listAdminUsersFn,
  getAdminUserFn,
  updateAdminUserFn,
  restoreAdminUserFn,
  deleteAdminUserFn,
  disconnectAdminUserGithubFn,
} from '@/server/admin-users'

export function useAdminUsers(tier: UserTier | 'all' = 'all') {
  return useQuery<AdminUserSummary[]>({
    queryKey: adminKeys.users.list(tier),
    queryFn: async () => {
      const data = await listAdminUsersFn({ data: { tier } })
      return Array.isArray(data) ? data : []
    },
  })
}

export function useAdminUser(id: string | null) {
  return useQuery<AdminUserDetail>({
    queryKey: adminKeys.users.detail(id ?? ''),
    queryFn: () => getAdminUserFn({ data: { id: id ?? '' } }),
    enabled: Boolean(id),
  })
}

export function useUpdateAdminUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; role?: UserRole; plan?: UserTier }) =>
      updateAdminUserFn({ data: vars }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.users.all })
    },
    onError: (err) => notifyError(err),
  })
}

export function useRestoreAdminUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string }) => restoreAdminUserFn({ data: vars }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.users.all })
    },
    onError: (err) => notifyError(err),
  })
}

export function useDeleteAdminUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; mode: 'soft' | 'hard'; reason?: string }) =>
      deleteAdminUserFn({ data: vars }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.users.all })
    },
    onError: (err) => notifyError(err),
  })
}

export function useDisconnectAdminUserGithub() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string }) => disconnectAdminUserGithubFn({ data: vars }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.users.all })
    },
    onError: (err) => notifyError(err),
  })
}
