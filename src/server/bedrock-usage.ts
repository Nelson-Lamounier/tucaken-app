/**
 * @format
 * Bedrock usage tracking and cost management server functions.
 *
 * Exposes endpoints for querying prompt invocation records, user token budgets,
 * and budget management. All operations delegate to the `admin-api` BFF service
 * via authenticated `fetch()` requests.
 *
 * The `requireAuth()` call acts as a fast-path guard — it rejects
 * unauthenticated requests at the edge before the network hop to admin-api.
 * The raw JWT is forwarded as `Authorization: Bearer <token>` so admin-api
 * can re-verify it with Cognito.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAuth } from './auth-guard'
import { apiFetch } from './_api-client'

// =============================================================================
// Types
// =============================================================================

export interface PromptInvocationRow {
  id: string
  userId: string | null
  email: string | null
  pipeline: string
  agent: string
  modelId: string
  inputTokens: number
  outputTokens: number
  totalCostCents: number
  importId: string | null
  repoName: string | null
  syncKind: string | null
  invokedAt: string
}

export interface UserCostRow {
  userId: string | null
  email: string | null
  totalCents: number
  inputTokens: number
  outputTokens: number
  invocations: number
}

export interface RepoCostRow {
  repoName: string
  syncKind: string | null
  totalCents: number
  invocations: number
}

export interface ApplicationCostRow {
  applicationId: string
  company: string | null
  role: string | null
  totalCents: number
  invocations: number
}

export interface ProjectCostRow {
  projectId: string
  name: string | null
  totalCents: number
  invocations: number
}

export interface UsageSummary {
  rows: PromptInvocationRow[]
  totalCents: number
  byPipeline: Record<string, number>
  byModel: Record<string, number>
  byUser: UserCostRow[]
  byRepo: RepoCostRow[]
  byApplication: ApplicationCostRow[]
  byProject: ProjectCostRow[]
}

export interface UserTokenBudget {
  userId: string
  monthlyLimitCents: number
  alertThresholdPct: number
}

// =============================================================================
// Input Schemas
// =============================================================================

const usageSummarySchema = z.object({
  userId: z.string().uuid().optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
})

const budgetSchema = z.object({
  userId: z.string().uuid(),
})

const setBudgetSchema = z.object({
  userId: z.string().uuid(),
  monthlyLimitCents: z.number().int().min(0).max(100_000),
  alertThresholdPct: z.number().int().min(1).max(100),
})

// =============================================================================
// Server Functions
// =============================================================================

/**
 * Retrieves a summary of Bedrock prompt invocations with cost breakdown.
 * Supports filtering by userId and month.
 *
 * @param data.userId - Optional user UUID to filter invocations
 * @param data.month - Optional month in YYYY-MM format
 * @returns UsageSummary with rows, total cost, and breakdowns by pipeline/model
 */
export const getUsageSummaryFn = createServerFn({ method: 'GET' })
  .inputValidator(usageSummarySchema)
  .handler(async ({ data }) => {
    await requireAuth()
    const params = new URLSearchParams()
    if (data.userId) params.set('userId', data.userId)
    if (data.month) params.set('month', data.month)
    return apiFetch<UsageSummary>(
      `/bedrock-usage/summary?${params.toString()}`,
      { pathTemplate: '/bedrock-usage/summary' },
    )
  })

/**
 * Retrieves the monthly token budget and alert threshold for a user.
 *
 * @param data.userId - User UUID
 * @returns UserTokenBudget with monthlyLimitCents and alertThresholdPct
 */
export const getUserBudgetFn = createServerFn({ method: 'GET' })
  .inputValidator(budgetSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<UserTokenBudget>(
      `/bedrock-usage/budget/${data.userId}`,
      { pathTemplate: '/bedrock-usage/budget/:userId' },
    )
  })

/**
 * Updates a user's monthly token budget and alert threshold.
 *
 * @param data.userId - User UUID
 * @param data.monthlyLimitCents - New monthly limit in cents (0-100000)
 * @param data.alertThresholdPct - Alert threshold percentage (1-100)
 * @returns { ok: boolean }
 */
export const setUserBudgetFn = createServerFn({ method: 'POST' })
  .inputValidator(setBudgetSchema)
  .handler(async ({ data }) => {
    await requireAuth()
    return apiFetch<{ ok: boolean }>(
      `/bedrock-usage/budget/${data.userId}`,
      {
        method: 'PUT',
        pathTemplate: '/bedrock-usage/budget/:userId',
        body: JSON.stringify({
          monthlyLimitCents: data.monthlyLimitCents,
          alertThresholdPct: data.alertThresholdPct,
        }),
      },
    )
  })
