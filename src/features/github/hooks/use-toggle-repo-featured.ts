import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setRepoFeaturedFn } from '@/server/github'
import { adminKeys } from '@/lib/api/query-keys'

export function useToggleRepoFeatured(repoFullName: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (useInResume: boolean) =>
      setRepoFeaturedFn({ data: { repoFullName, useInResume } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: adminKeys.github.connectedRepos() }),
  })
}
