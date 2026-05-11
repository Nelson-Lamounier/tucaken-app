'use client'

import { Fragment, useState } from 'react'
import { useNavigate, Link } from '@tanstack/react-router'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import {
  ArrowUpCircleIcon,
  EllipsisHorizontalIcon,
  PlusSmallIcon,
} from '@heroicons/react/20/solid'
import { Stats } from '@/components/ui/Stats'
import { useQuery } from '@tanstack/react-query'
import { useAdminArticles } from '@/hooks/use-admin-articles'
import { useAdminComments } from '@/hooks/use-admin-comments'
import { getResumesFn } from '@/server/resumes'
import { finopsQueries, articlePipelineQueries, promptQualityQueries } from '../queries'
import { BedrockCostTab } from './BedrockCostTab'
import type { ArticleSummary } from '@/server/articles'
import type { ArticleWithSlug } from '@/lib/types/article.types'

// ── Constants ─────────────────────────────────────────────────────────────────

const RECENT_LIMIT = 5

const secondaryNavigation = [
  { name: 'Last 7 days', days: 7 },
  { name: 'Last 30 days', days: 30 },
  { name: 'All-time', days: 365 },
]

const statuses = {
  published: 'bg-green-500/10 text-green-400 ring-green-500/10',
  draft: 'bg-white/5 text-zinc-400 ring-white/10',
  review: 'bg-yellow-500/10 text-yellow-400 ring-yellow-500/10',
  pending: 'bg-yellow-500/10 text-yellow-400 ring-yellow-500/10',
  approved: 'bg-green-500/10 text-green-400 ring-green-500/10',
}

type TabId =
  | 'platform-overview'
  | 'all'
  | 'pipelines'
  | 'chatbot'
  | 'selfhealing'
  | 'prompt-quality'
  | 'cost'
  | 'content-management'
  | 'career-docs'

function classNames(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ')
}

function promptQualityBadgeClass(badRate: number): string {
  if (badRate > 20) return 'bg-red-500/10 text-red-400 ring-red-500/20'
  if (badRate > 10) return 'bg-yellow-500/10 text-yellow-400 ring-yellow-500/20'
  return 'bg-green-500/10 text-green-400 ring-green-500/20'
}

function computeTotalBilledCost(billedCosts: { Groups?: { Metrics?: { UnblendedCost?: { Amount?: string } } }[] }[] | undefined): number {
  let total = 0
  if (!billedCosts) return total
  for (const day of billedCosts) {
    if (day.Groups) {
      for (const group of day.Groups) {
        total += Number.parseFloat(group.Metrics?.UnblendedCost?.Amount || '0')
      }
    }
  }
  return total
}

function resolveArticleTitle(pk: string | undefined, title: string | undefined): string {
  if (title) return title
  if (pk) return pk.replace('ARTICLE#', '')
  return 'Untitled'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReportContainer() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState(7)
  const [activeTab, setActiveTab] = useState<TabId>('platform-overview')

  const tabs: { id: TabId; name: string }[] = [
    { id: 'platform-overview', name: 'Platform Overview' },
    { id: 'all',               name: 'AI Overview' },
    { id: 'pipelines',         name: 'Content Pipelines' },
    { id: 'chatbot',           name: 'Chatbot' },
    { id: 'selfhealing',       name: 'Self-Healing' },
    { id: 'prompt-quality',    name: 'Prompt Quality' },
    { id: 'cost' as TabId,     name: 'Cost' },
    { id: 'content-management', name: 'Content Management' },
    { id: 'career-docs',       name: 'Career Documents' },
  ]

  // ── AI / FinOps queries ───────────────────────────────────────────────────
  const { data: realtimeUsage,    isLoading: isRealtimeLoading }      = useQuery(finopsQueries.realtimeUsage(period))
  const { data: billedCosts,      isLoading: isCostsLoading }         = useQuery(finopsQueries.billedCosts(period))
  const { data: pipelineArticles, isLoading: isPipelineLoading }      = useQuery(articlePipelineQueries.all())
  const { data: chatbotUsage,     isLoading: isChatbotLoading }       = useQuery(finopsQueries.chatbotUsage(period))
  const { data: selfHealingUsage, isLoading: isSelfHealingLoading }   = useQuery(finopsQueries.selfHealingUsage(period))
  const { data: promptQualityStats, isLoading: isPromptQualityLoading } = useQuery(promptQualityQueries.stats(period))

  // ── Content queries ───────────────────────────────────────────────────────
  const { data: adminArticles, isLoading: isAdminArticlesLoading } = useAdminArticles()
  const { data: comments,      isLoading: isCommentsLoading }      = useAdminComments()
  const { data: resumes,       isLoading: isResumesLoading }       = useQuery({
    queryKey: ['admin-resumes'],
    queryFn:  () => getResumesFn(),
  })

  // ── Pricing constants ─────────────────────────────────────────────────────
  const inputCostPer1M  = 3
  const outputCostPer1M = 15

  // ── AI pipeline derived state ─────────────────────────────────────────────
  const typedRealtime         = realtimeUsage
  const totalPipelineArticles = pipelineArticles?.length || 0
  const invocations           = typedRealtime?.invocations || 0
  const avgGenTime            = typedRealtime?.processingDuration || 0
  const avgBedrockMs          = typedRealtime?.bedrockConverseDuration || 0
  const pipelineInputTokens   = typedRealtime?.inputTokens || 0
  const pipelineOutputTokens  = typedRealtime?.outputTokens || 0
  const pipelineThinkingTokens = typedRealtime?.thinkingTokens || 0
  const pipelineTotalTokens   = pipelineInputTokens + pipelineOutputTokens + pipelineThinkingTokens
  const pipelineInputCost     = (pipelineInputTokens   / 1_000_000) * inputCostPer1M
  const pipelineOutputCost    = (pipelineOutputTokens  / 1_000_000) * outputCostPer1M
  const pipelineThinkingCost  = (pipelineThinkingTokens / 1_000_000) * outputCostPer1M
  const pipelineTokenCost     = pipelineInputCost + pipelineOutputCost + pipelineThinkingCost

  const totalCost = computeTotalBilledCost(billedCosts)

  const avgCostPerArticle = totalPipelineArticles > 0 ? (totalCost / totalPipelineArticles) : 0

  // ── Chatbot derived state ─────────────────────────────────────────────────
  const typedChatbot       = chatbotUsage
  const chatbotInvocations = typedChatbot?.invocationCount || 0
  const avgPromptLen       = typedChatbot?.promptLength || 0
  const avgResponseLen     = typedChatbot?.responseLength || 0
  const blocked            = typedChatbot?.blockedInputs || 0
  const redacted           = typedChatbot?.redactedOutputs || 0
  const chatbotErrors      = typedChatbot?.invocationErrors || 0
  const totalInterceptions = blocked + redacted
  const chatbotLatency     = typedChatbot?.invocationLatency || 0
  const estPromptTokens    = avgPromptLen / 4
  const estResponseTokens  = avgResponseLen / 4
  const avgChatbotCost     = ((estPromptTokens / 1_000_000) * inputCostPer1M) + ((estResponseTokens / 1_000_000) * outputCostPer1M)

  // ── Self-Healing derived state ────────────────────────────────────────────
  const typedSelfHealing = selfHealingUsage
  const shInputTokens    = typedSelfHealing?.inputTokens || 0
  const shOutputTokens   = typedSelfHealing?.outputTokens || 0
  const shTotalTokens    = shInputTokens + shOutputTokens
  const BUDGET           = 100000
  const shEstimatedCost  = ((shInputTokens / 1_000_000) * inputCostPer1M) + ((shOutputTokens / 1_000_000) * outputCostPer1M)

  // ── Combined AI derived state ─────────────────────────────────────────────
  const isAgentActive          = shTotalTokens > 0
  const combinedTotalRequests  = totalPipelineArticles + chatbotInvocations + (isAgentActive ? 1 : 0)
  const combinedEstCost        = (chatbotInvocations * avgChatbotCost) + shEstimatedCost
  const combinedInputTokens    = pipelineInputTokens + (chatbotInvocations * estPromptTokens) + shInputTokens
  const combinedOutputTokens   = pipelineOutputTokens + pipelineThinkingTokens + (chatbotInvocations * estResponseTokens) + shOutputTokens
  const isAILoadingAny         = isRealtimeLoading || isCostsLoading || isPipelineLoading || isChatbotLoading || isSelfHealingLoading

  // ── Content derived state ─────────────────────────────────────────────────
  const draftCount      = adminArticles?.draftCount ?? 0
  const publishedCount  = adminArticles?.publishedCount ?? 0
  const totalArticles   = draftCount + publishedCount
  const pendingComments = comments?.length ?? 0
  const totalResumes    = resumes?.length ?? 0
  const pipelineCount   = pipelineArticles?.length ?? 0
  const isContentLoading = isAdminArticlesLoading || isCommentsLoading || isResumesLoading || isPipelineLoading

  // ── Stats: AI tabs ────────────────────────────────────────────────────────

  const pipelineOverviewStats = [
    { name: 'Total Articles',       value: isPipelineLoading  ? '...' : totalPipelineArticles.toString(), change: 'Data across the entire DynamoDB table',                                          changeType: 'positive' },
    { name: 'Agent Invocations',    value: isRealtimeLoading  ? '...' : invocations.toString(),            change: `${period} Days (CloudWatch)`,                                                    changeType: 'positive' },
    { name: 'Avg Cost / Article',   value: isCostsLoading     ? '...' : `$${avgCostPerArticle.toFixed(3)}`, change: `Total Billed: $${totalCost.toFixed(2)} (Cost Explorer)`,                       changeType: 'negative' },
    { name: 'Avg Processing Time',  value: isRealtimeLoading  ? '...' : `${(avgGenTime / 1000).toFixed(2)}s`, change: `Bedrock wait: ${(avgBedrockMs / 1000).toFixed(2)}s (CloudWatch)`,           changeType: 'positive' },
  ]

  const bedrockTokenStats = [
    { name: 'Input Tokens',      value: isRealtimeLoading ? '...' : pipelineInputTokens.toLocaleString(),    change: `Est. $${pipelineInputCost.toFixed(4)} @ $${inputCostPer1M}/M tokens`,               changeType: 'positive' as const },
    { name: 'Output Tokens',     value: isRealtimeLoading ? '...' : pipelineOutputTokens.toLocaleString(),   change: `Est. $${pipelineOutputCost.toFixed(4)} @ $${outputCostPer1M}/M tokens`,              changeType: 'negative' as const },
    { name: 'Thinking Tokens',   value: isRealtimeLoading ? '...' : pipelineThinkingTokens.toLocaleString(), change: `Est. $${pipelineThinkingCost.toFixed(4)} (extended thinking, output rate)`,          changeType: 'negative' as const },
    { name: 'Total Token Cost',  value: isRealtimeLoading ? '...' : `$${pipelineTokenCost.toFixed(4)}`,      change: `${pipelineTotalTokens.toLocaleString()} total tokens processed`,                      changeType: 'negative' as const },
  ]

  const chatbotStats = [
    { name: 'Total Chat Requests',    value: isChatbotLoading ? '...' : chatbotInvocations.toString(),             change: `${period} Days (CloudWatch)`,                         changeType: 'positive' },
    { name: 'Est. Cost / Request',    value: isChatbotLoading ? '...' : `$${avgChatbotCost.toFixed(5)}`,           change: 'Derived from Context Size estimates',                  changeType: 'negative' },
    { name: 'Avg Response Latency',   value: isChatbotLoading ? '...' : `${(chatbotLatency / 1000).toFixed(2)}s`,  change: 'End-to-End Chatbot Wait',                             changeType: 'positive' },
    { name: 'Security Interceptions', value: isChatbotLoading ? '...' : totalInterceptions.toString(),             change: `Blocked: ${blocked} | Redacted: ${redacted}`,         changeType: totalInterceptions > 0 ? 'negative' : 'positive' },
    { name: 'Invocation Errors',      value: isChatbotLoading ? '...' : chatbotErrors.toString(),                  change: 'Failed Bedrock converse calls (CloudWatch)',           changeType: chatbotErrors > 0 ? 'negative' : 'positive' },
  ]

  const selfHealingStats = [
    { name: 'Token Budget Used', value: isSelfHealingLoading ? '...' : `${Math.round((shTotalTokens / BUDGET) * 100)}%`, change: `${shTotalTokens.toLocaleString()} / 100k Token Alarm Limit`, changeType: shTotalTokens > BUDGET ? 'negative' : 'positive' },
    { name: 'Input Tokens',      value: isSelfHealingLoading ? '...' : shInputTokens.toLocaleString(),                    change: 'Analyzed Logs/Metrics',                                      changeType: 'positive' },
    { name: 'Output Tokens',     value: isSelfHealingLoading ? '...' : shOutputTokens.toLocaleString(),                   change: 'Remediation Plans Generated',                                changeType: 'positive' },
    { name: 'Cumulated Cost',    value: isSelfHealingLoading ? '...' : `$${shEstimatedCost.toFixed(4)}`,                  change: 'Estimated token pricing',                                    changeType: 'negative' },
  ]

  const combinedStats = [
    { name: 'Total AI Executions',          value: isAILoadingAny ? '...' : combinedTotalRequests.toLocaleString(),             change: 'Pipelines, Chats & Automations',        changeType: 'positive' },
    { name: 'Est. Additional Cost (Tokens)', value: isAILoadingAny ? '...' : `$${combinedEstCost.toFixed(4)}`,                  change: `Current Billed: $${totalCost.toFixed(2)}`, changeType: 'negative' },
    { name: 'Est. Input Tokens Processed',  value: isAILoadingAny ? '...' : Math.round(combinedInputTokens).toLocaleString(),   change: 'Prompts & Log Analysis',               changeType: 'positive' },
    { name: 'Est. Output Tokens Rendered',  value: isAILoadingAny ? '...' : Math.round(combinedOutputTokens).toLocaleString(),  change: 'Responses & Remediation',              changeType: 'positive' },
  ]

  // ── Stats: content tabs ───────────────────────────────────────────────────

  const agentContrib        = isAgentActive ? 1 : 0
  const aiAutomationTotal   = pipelineCount + chatbotInvocations + agentContrib
  const aiAgentLabel        = isAgentActive ? 'Agent Active' : 'No Incidents'
  let   aiAutomationValue: string
  if (isContentLoading) { aiAutomationValue = '...' }
  else                  { aiAutomationValue = aiAutomationTotal.toString() }

  const overviewStats = [
    { name: 'Total Articles',      value: isContentLoading ? '...' : totalArticles.toString(),   change: `${draftCount} drafts · ${publishedCount} published`,                                    changeType: 'positive' },
    { name: 'Comments Pending',    value: isContentLoading ? '...' : pendingComments.toString(), change: pendingComments > 0 ? 'Awaiting moderation' : 'All moderated',                           changeType: pendingComments > 0 ? 'negative' : 'positive' },
    { name: 'Resume Versions',     value: isContentLoading ? '...' : totalResumes.toString(),    change: 'Active managed documents',                                                               changeType: 'positive' },
    { name: 'AI Automations (7d)', value: aiAutomationValue,                                     change: `${pipelineCount} Pipes · ${chatbotInvocations} Chats · ${aiAgentLabel}`,               changeType: 'positive' },
  ]

  const articleStats = [
    { name: 'Published',    value: isContentLoading ? '...' : publishedCount.toString(), change: 'Live on the portfolio',                                                                                   changeType: 'positive' },
    { name: 'Drafts',       value: isContentLoading ? '...' : draftCount.toString(),     change: 'Awaiting review & publish',                                                                               changeType: draftCount > 0 ? 'negative' : 'positive' },
    { name: 'AI Generated', value: isPipelineLoading ? '...' : pipelineCount.toString(), change: 'Multi-Agent Pipeline output',                                                                             changeType: 'positive' },
    { name: 'Comments',     value: isContentLoading ? '...' : pendingComments.toString(), change: pendingComments > 0 ? `${pendingComments} requiring moderation` : 'All comments moderated',              changeType: pendingComments > 0 ? 'negative' : 'positive' },
  ]

  const resumeStats = [
    { name: 'Total Versions',       value: isContentLoading ? '...' : totalResumes.toString(), change: 'PDF documents managed',           changeType: 'positive' },
    { name: 'Active Applications',  value: '—',                                                 change: 'Check Applications tab',          changeType: 'positive' },
    { name: 'Interview Prep Items', value: '—',                                                 change: 'Company–specific prep kits',      changeType: 'positive' },
    { name: 'Cover Letters',        value: '—',                                                 change: 'AI–generated cover letters',      changeType: 'positive' },
  ]

  // ── Recent activity (rich article data) ───────────────────────────────────
  const recentDrafts    = adminArticles?.drafts.slice(0, RECENT_LIMIT) ?? []
  const recentPublished = adminArticles?.published.slice(0, RECENT_LIMIT) ?? []

  const allRecent = [
    ...recentPublished.map((a: ArticleWithSlug) => ({ ...a, _status: 'published' as const })),
    ...recentDrafts.map((a: ArticleWithSlug)    => ({ ...a, _status: 'draft'     as const })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10)

  const activityDays = [
    {
      date:     `Recent Activity (${allRecent.length} records)`,
      dateTime: allRecent[0] ? new Date(allRecent[0].date).toISOString() : '1970-01-01T00:00:00.000Z',
      transactions: allRecent.map((a) => ({
        id:          a.slug,
        status:      a._status,
        title:       a.title,
        description: a.description || a.aiSummary || 'No description',
        category:    a.category || 'Uncategorised',
        date:        new Date(a.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        readingTime: a.readingTimeMinutes ? `${a.readingTimeMinutes} min` : '—',
        icon:        ArrowUpCircleIcon,
      })),
    },
  ]

  // ── Pipeline cards ────────────────────────────────────────────────────────
  const pipelines = [
    {
      id:       1,
      name:     'Drafts',
      count:    draftCount,
      articles: recentDrafts.slice(0, 4).map((a: ArticleWithSlug) => ({
        title:  a.title,
        detail: new Date(a.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        status: 'draft',
      })),
    },
    {
      id:       2,
      name:     'Published',
      count:    publishedCount,
      articles: recentPublished.slice(0, 4).map((a: ArticleWithSlug) => ({
        title:  a.title,
        detail: new Date(a.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        status: 'published',
      })),
    },
    {
      id:       3,
      name:     'AI Pipeline',
      count:    pipelineCount,
      articles: (pipelineArticles ?? []).slice(0, 4).map((a: ArticleSummary) => ({
        title:  resolveArticleTitle(a.pk, a.title),
        detail: typeof a.updatedAt === 'string' ? new Date(a.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
        status: typeof a.status === 'string' ? a.status : 'draft',
      })),
    },
  ]

  // ── Quick actions ─────────────────────────────────────────────────────────
  const quickActions = [
    { label: 'New Article',        href: '/editor/new',   description: 'Open the article editor' },
    { label: 'Moderate Comments',  href: '/comments',     description: `${pendingComments} pending` },
    { label: 'Manage Resumes',     href: '/resumes',      description: `${totalResumes} version${totalResumes === 1 ? '' : 's'}` },
    { label: 'Applications',       href: '/applications', description: 'Track job pipeline' },
  ] as const

  // ── Prompt Quality content (extracted to avoid chained ternary in JSX) ──────
  let promptQualityContent: React.ReactNode
  if (isPromptQualityLoading) {
    promptQualityContent = <div className="text-sm text-zinc-500">Loading prompt quality data...</div>
  } else if (!promptQualityStats || promptQualityStats.length === 0) {
    promptQualityContent = (
      <div className="rounded-lg border border-white/10 bg-white/2.5 px-6 py-8 text-center text-sm text-zinc-500">
        No invocation data yet — prompt quality metrics will appear once pipeline jobs have run with the observability callback enabled.
      </div>
    )
  } else {
    promptQualityContent = (
      <div className="overflow-hidden rounded-xl outline outline-white/10 -outline-offset-1">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-white/10 bg-white/2.5">
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide">Pipeline / Agent</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide text-right">Invocations</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide text-right">👍</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide text-right">👎</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide text-right">Bad Rate</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide text-right">Avg Latency</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide text-right">Cache Hit</th>
              <th className="px-4 py-3 text-xs font-semibold text-zinc-400 uppercase tracking-wide text-right">Avg Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {promptQualityStats.map((row) => (
              <tr key={`${row.pipeline}-${row.agent}`} className="hover:bg-white/2.5 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{row.agent}</div>
                  <div className="text-xs text-zinc-500">{row.pipeline}</div>
                </td>
                <td className="px-4 py-3 text-right text-zinc-300">{row.totalInvocations.toLocaleString()}</td>
                <td className="px-4 py-3 text-right text-green-400">{row.thumbsUp}</td>
                <td className="px-4 py-3 text-right text-red-400">{row.thumbsDown}</td>
                <td className="px-4 py-3 text-right">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${promptQualityBadgeClass(row.badRate)}`}>
                    {row.badRate}%
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-zinc-300">{(row.avgLatencyMs / 1000).toFixed(1)}s</td>
                <td className="px-4 py-3 text-right text-zinc-300">{row.cacheHitRate}%</td>
                <td className="px-4 py-3 text-right text-zinc-300">${(row.avgTotalCostCents / 100).toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main>
      <div className="relative isolate overflow-hidden">

        {/* Header */}
        <header className="pt-6 pb-4 sm:pb-6">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-6 px-4 sm:flex-nowrap sm:px-6 lg:px-8">
            <h1 className="text-base/7 font-semibold text-white">Admin Dashboard</h1>
            <div className="order-last flex w-full gap-x-8 text-sm/6 font-semibold sm:order-0 sm:w-auto sm:border-l sm:border-white/10 sm:pl-6 sm:text-sm/7">
              {secondaryNavigation.map((item) => (
                <button
                  key={item.name}
                  onClick={() => setPeriod(item.days)}
                  className={period === item.days ? 'text-indigo-400' : 'text-zinc-300 hover:text-white'}
                >
                  {item.name}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="ml-auto flex items-center gap-x-1 rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
            >
              <PlusSmallIcon aria-hidden="true" className="-ml-1.5 size-5" />
              New generation
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-12 mb-4">
          <div className="flex flex-wrap gap-2 border-b border-white/10 pb-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={classNames(
                  activeTab === tab.id
                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                    : 'text-zinc-400 hover:text-zinc-300 hover:bg-white/5 border border-transparent',
                  'px-4 py-2 rounded-md text-sm font-medium transition-colors'
                )}
              >
                {tab.name}
              </button>
            ))}
          </div>
        </div>

        {/* Tab panels */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-12 mb-12">

          {activeTab === 'platform-overview' && (
            <div>
              <div className="mb-4">
                <h2 className="text-base/7 font-semibold text-indigo-400">Platform Metrics</h2>
              </div>
              <Stats stats={overviewStats} />
            </div>
          )}

          {activeTab === 'all' && (
            <div>
              <div className="mb-4">
                <h2 className="text-base/7 font-semibold text-indigo-400">Aggregated AI Activity</h2>
              </div>
              <Stats stats={combinedStats} />
            </div>
          )}

          {activeTab === 'pipelines' && (
            <div className="space-y-8">
              <div>
                <div className="mb-4">
                  <h2 className="text-base/7 font-semibold text-indigo-400">Pipeline Overview</h2>
                  <p className="mt-1 text-sm text-zinc-500">Invocation counts, cost-per-article, and processing latency from CloudWatch &amp; Cost Explorer.</p>
                </div>
                <Stats stats={pipelineOverviewStats} />
              </div>
              <div>
                <div className="mb-4">
                  <h2 className="text-base/7 font-semibold text-indigo-400">Bedrock Token Usage</h2>
                  <p className="mt-1 text-sm text-zinc-500">Token counts and estimated spend from the BedrockMultiAgent CloudWatch namespace. Thinking tokens billed at output rate.</p>
                </div>
                <Stats stats={bedrockTokenStats} />
              </div>
            </div>
          )}

          {activeTab === 'chatbot' && (
            <div>
              <div className="mb-4">
                <h2 className="text-base/7 font-semibold text-indigo-400">Chatbot Application</h2>
              </div>
              <Stats stats={chatbotStats} />
            </div>
          )}

          {activeTab === 'selfhealing' && (
            <div>
              <div className="mb-4">
                <h2 className="text-base/7 font-semibold text-indigo-400">Self-Healing Automation</h2>
              </div>
              <Stats stats={selfHealingStats} />
            </div>
          )}

          {activeTab === 'prompt-quality' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base/7 font-semibold text-indigo-400">Prompt Quality</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Per-agent quality metrics derived from user thumbs-up/down feedback and Bedrock invocation logs.
                  Bad rate = thumbs-down ÷ total rated. Cache hit rate = invocations served from Bedrock prompt cache.
                </p>
              </div>
              {promptQualityContent}
            </div>
          )}

          {activeTab === 'cost' && <BedrockCostTab />}

          {activeTab === 'content-management' && (
            <div>
              <div className="mb-4">
                <h2 className="text-base/7 font-semibold text-indigo-400">Content Management</h2>
              </div>
              <Stats stats={articleStats} />
            </div>
          )}

          {activeTab === 'career-docs' && (
            <div>
              <div className="mb-4">
                <h2 className="text-base/7 font-semibold text-indigo-400">Career Documents</h2>
              </div>
              <Stats stats={resumeStats} />
            </div>
          )}

        </div>

        <div
          aria-hidden="true"
          className="absolute top-full left-0 -z-10 mt-96 origin-top-left translate-y-40 -rotate-90 transform-gpu opacity-10 blur-3xl sm:left-1/2 sm:-mt-10 sm:-ml-96 sm:translate-y-0 sm:rotate-0 sm:opacity-30"
        >
          <div
            style={{ clipPath: 'polygon(100% 38.5%, 82.6% 100%, 60.2% 37.7%, 52.4% 32.1%, 47.5% 41.8%, 45.2% 65.6%, 27.5% 23.4%, 0.1% 35.3%, 17.9% 0%, 27.7% 23.4%, 76.2% 2.5%, 74.2% 56%, 100% 38.5%)' }}
            className="aspect-1154/678 w-288.5 bg-linear-to-br from-[#FF80B5] to-[#9089FC]"
          />
        </div>
      </div>

      <div className="space-y-16 py-16 xl:space-y-20">

        {/* Recent Activity */}
        <div>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="mx-auto max-w-2xl text-base font-semibold text-white lg:mx-0 lg:max-w-none">
              Recent Activity
            </h2>
          </div>
          <div className="mt-6 overflow-hidden border-t border-white/5">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none">
                <table className="w-full text-left">
                  <thead className="sr-only">
                    <tr>
                      <th>Article</th>
                      <th className="hidden sm:table-cell">Category</th>
                      <th>More details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityDays.map((day) => (
                      <Fragment key={day.dateTime}>
                        <tr className="text-sm/6 text-white">
                          <th scope="colgroup" colSpan={3} className="relative isolate py-2 font-semibold">
                            <time dateTime={day.dateTime}>{day.date}</time>
                            <div className="absolute inset-y-0 right-full -z-10 w-screen border-b border-white/10 bg-white/2.5" />
                            <div className="absolute inset-y-0 left-0 -z-10 w-screen border-b border-white/10 bg-white/2.5" />
                          </th>
                        </tr>
                        {day.transactions.map((transaction) => (
                          <tr key={transaction.id}>
                            <td className="relative py-5 pr-6">
                              <div className="flex gap-x-6">
                                <transaction.icon aria-hidden="true" className="hidden h-6 w-5 flex-none text-zinc-500 sm:block" />
                                <div className="flex-auto">
                                  <div className="text-sm/6 font-medium text-white">{transaction.title}</div>
                                  <div className="mt-1 text-xs/5 text-zinc-400">{transaction.description}</div>
                                </div>
                              </div>
                              <div className="absolute right-full bottom-0 h-px w-screen bg-white/5" />
                              <div className="absolute bottom-0 left-0 h-px w-screen bg-white/5" />
                            </td>
                            <td className="hidden py-5 pr-6 sm:table-cell">
                              <div className="flex items-start gap-x-3">
                                <div className="text-sm/6 text-white">{transaction.category}</div>
                                <div className={classNames(
                                  statuses[transaction.status as keyof typeof statuses] || statuses.draft,
                                  'rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
                                )}>
                                  {transaction.status}
                                </div>
                              </div>
                              <div className="mt-1 flex gap-2 text-xs/5 text-zinc-400">
                                <span>{transaction.date}</span>
                                <span>&middot;</span>
                                <span>{transaction.readingTime} read</span>
                              </div>
                            </td>
                            <td className="py-5 text-right">
                              <Link to="/articles" className="text-sm/6 font-medium text-indigo-400 hover:text-indigo-300">
                                View<span className="hidden sm:inline"> article</span>
                                <span className="sr-only">, {transaction.title}</span>
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Content Pipeline */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none">
            <div className="flex items-center justify-between">
              <h2 className="text-base/7 font-semibold text-white">Content Pipeline</h2>
              <Link to="/articles" className="text-sm/6 font-semibold text-indigo-400 hover:text-indigo-300">
                View all articles &rarr;
              </Link>
            </div>
            <ul className="mt-6 grid grid-cols-1 gap-x-6 gap-y-8 lg:grid-cols-3 xl:gap-x-8">
              {pipelines.map((pipeline) => (
                <li key={pipeline.id} className="overflow-hidden rounded-xl outline -outline-offset-1 outline-white/10">
                  <div className="flex items-center gap-x-4 border-b border-white/10 bg-zinc-800/50 p-6">
                    <div className="text-sm/6 font-semibold text-white">{pipeline.name}</div>
                    <div className="ml-2 rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-400 ring-1 ring-inset ring-indigo-500/20">
                      {pipeline.count}
                    </div>
                    <Menu as="div" className="relative ml-auto">
                      <MenuButton className="relative block text-zinc-500 hover:text-white">
                        <span className="absolute -inset-2.5" />
                        <span className="sr-only">Open options</span>
                        <EllipsisHorizontalIcon aria-hidden="true" className="size-5" />
                      </MenuButton>
                      <MenuItems
                        transition
                        className="absolute right-0 z-10 mt-0.5 w-32 origin-top-right rounded-md bg-zinc-800 py-2 outline-1 -outline-offset-1 outline-white/10 transition data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in"
                      >
                        <MenuItem>
                          <Link to="/articles" className="block px-3 py-1 text-sm/6 text-white data-focus:bg-white/5 data-focus:outline-hidden">
                            View list
                          </Link>
                        </MenuItem>
                      </MenuItems>
                    </Menu>
                  </div>
                  <dl className="-my-3 divide-y divide-white/10 px-6 py-4 text-sm/6">
                    {pipeline.articles.map((article) => (
                      <div key={article.title} className="flex flex-col py-3">
                        <dt className="text-sm/6 font-medium text-white truncate" title={article.title}>{article.title}</dt>
                        <dd className="mt-1 flex justify-between gap-x-4 text-xs/5 text-zinc-400">
                          <span>{article.detail}</span>
                          <span className="text-zinc-300 font-medium">{article.status}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-base/7 font-semibold text-white">Quick Actions</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((action) => (
              <button
                key={action.label}
                type="button"
                // @ts-expect-error - router types for dynamic hrefs
                onClick={() => navigate({ to: action.href })}
                className="group flex items-center gap-4 rounded-xl border border-white/10 bg-white/4 p-4 text-left transition-all hover:border-teal-500/30 hover:bg-white/4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-400 ring-1 ring-inset ring-teal-500/20">
                  <PlusSmallIcon className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-100">{action.label}</p>
                  <p className="text-xs text-zinc-400">{action.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

      </div>
    </main>
  )
}
