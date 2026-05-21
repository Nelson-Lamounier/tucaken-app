import { queryOptions } from '@tanstack/react-query'
import { listProjectsFn } from '../../../server/projects'
import type { ProjectListParams } from '../lib/types'

export const projectsQueries = {
  list: (params: ProjectListParams = {}) =>
    queryOptions({
      queryKey: ['projects', 'list', params],
      queryFn:  () => listProjectsFn({ data: params }),
      staleTime: 30 * 1000,
    }),
}
