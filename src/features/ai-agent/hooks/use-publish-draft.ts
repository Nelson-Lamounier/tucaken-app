import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminKeys } from '@/lib/api/query-keys'
import { publishDraftFn } from '@/server/draft-publish'

/** A verified measured number carried from a chosen topic candidate (Gap 3). */
export interface PublishDraftBriefMetric {
  readonly label: string
  readonly value: string
  readonly unit?: string
  readonly source?: string
}

/** Structured brief from a chosen topic candidate. */
export interface PublishDraftBrief {
  readonly problem?: string
  readonly angle?: string
  readonly primaryKeyword?: string
  readonly verifiedMetrics?: PublishDraftBriefMetric[]
}

interface PublishDraftParams {
  readonly fileName: string
  readonly content: string
  /** Present when the draft was started from a suggested topic. */
  readonly brief?: PublishDraftBrief
  readonly candidateId?: string
}

export function usePublishDraft() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ fileName, content, brief, candidateId }: PublishDraftParams) => {
      const result = await publishDraftFn({ data: { fileName, content, brief, candidateId } })
      if (!result.success) {
        // Surface the underlying admin-api error, not just the generic message
        const detail = result.error ? ` — ${result.error}` : ''
        throw new Error(`${result.message}${detail}`)
      }
      return result
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.articles.all })
      void queryClient.invalidateQueries({ queryKey: adminKeys.pipeline.all })
    },
  })
}
