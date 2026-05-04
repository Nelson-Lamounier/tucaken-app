/**
 * @format
 * FinOps and Observability Metrics server functions for the admin dashboard.
 *
 * All data operations are delegated to the `admin-api` BFF service via
 * authenticated `fetch()` requests. The frontend pod carries no CloudWatch
 * or Cost Explorer SDK dependencies for this domain.
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

/** A single cost metric value from AWS Cost Explorer. */
interface CostMetricValue {
  Amount?: string
  Unit?: string
}

/** A cost group keyed by billing dimension. */
interface CostGroup {
  Keys?: string[]
  Metrics?: Record<string, CostMetricValue>
}

/**
 * A single day's billing result from AWS Cost Explorer ResultsByTime.
 * Matches the shape used by ReportContainer to sum billed costs.
 */
export interface CostResultItem {
  TimePeriod?: { Start?: string; End?: string }
  Groups?: CostGroup[]
  Estimated?: boolean
}

/** Flat stats returned by GET /finops/realtime (BedrockMultiAgent CloudWatch namespace). */
export interface RealtimeUsageStats {
  inputTokens: number
  outputTokens: number
  thinkingTokens: number
  processingDuration: number
  bedrockConverseDuration: number
  invocations: number
}

/** Flat stats returned by GET /finops/chatbot (BedrockChatbot CloudWatch namespace). */
export interface ChatbotUsageStats {
  invocationCount: number
  invocationLatency: number
  invocationErrors: number
  promptLength: number
  responseLength: number
  blockedInputs: number
  redactedOutputs: number
}

/** Flat stats returned by GET /finops/self-healing (SelfHealing CloudWatch namespace). */
export interface SelfHealingStats {
  inputTokens: number
  outputTokens: number
}

// =============================================================================
// Input Schemas
// =============================================================================

const periodSchema = z
  .object({ days: z.number().int().min(1).max(365).default(7) })
  .default({ days: 7 })

// =============================================================================
// Server Functions
// =============================================================================

/**
 * Retrieves real-time usage and performance metrics from CloudWatch.
 * Fetches from the BedrockMultiAgent namespace.
 *
 * @param data.days - Lookback window in days (default 7)
 * @returns Flat token/duration stats record
 */
export const getRealtimeUsageFn = createServerFn({ method: 'GET' })
  .inputValidator(periodSchema)
  .handler(async ({ data }) => {
    await requireAuth()

    return apiFetch<RealtimeUsageStats>(
      `/finops/realtime?days=${data.days}`,
      { pathTemplate: '/finops/realtime' },
    )
  })

/**
 * Retrieves penny-accurate billed costs from AWS Cost Explorer.
 * Filtered by the 'bedrock' Project tag and grouped by inference profile.
 *
 * @param data.days - Lookback window in days (default 7)
 * @returns Array of daily ResultsByTime from Cost Explorer
 */
export const getBilledCostsFn = createServerFn({ method: 'GET' })
  .inputValidator(periodSchema)
  .handler(async ({ data }) => {
    await requireAuth()

    const body = await apiFetch<{ costs: CostResultItem[] }>(
      `/finops/costs?days=${data.days}`,
      { pathTemplate: '/finops/costs' },
    )
    return body.costs
  })

/**
 * Retrieves chatbot usage and security metrics.
 * Fetches from the BedrockChatbot CloudWatch namespace.
 *
 * @param data.days - Lookback window in days (default 7)
 * @returns Flat invocation/safety stats record
 */
export const getChatbotUsageFn = createServerFn({ method: 'GET' })
  .inputValidator(periodSchema)
  .handler(async ({ data }) => {
    await requireAuth()

    return apiFetch<ChatbotUsageStats>(
      `/finops/chatbot?days=${data.days}`,
      { pathTemplate: '/finops/chatbot' },
    )
  })

/**
 * Retrieves self-healing token metrics from the SelfHealing CloudWatch namespace.
 *
 * @param data.days - Lookback window in days (default 7)
 * @returns Flat inputTokens / outputTokens stats record
 */
export const getSelfHealingUsageFn = createServerFn({ method: 'GET' })
  .inputValidator(periodSchema)
  .handler(async ({ data }) => {
    await requireAuth()

    return apiFetch<SelfHealingStats>(
      `/finops/self-healing?days=${data.days}`,
      { pathTemplate: '/finops/self-healing' },
    )
  })
