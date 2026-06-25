// src/features/account/types.ts
//
// Shared types for the Billing and Settings pages.

// ---- Billing ---------------------------------------------------------------

export type PlanId = 'free' | 'pro' | 'premium'
export type BillingStatus = 'active' | 'trialing' | 'past_due' | 'canceled'
export type BillingInterval = 'monthly' | 'annual'

export interface PaymentMethod {
  brand: string
  last4: string
  expMonth: number
  expYear: number
}

/** Read-only card view fetched live from Stripe — never persisted. */
export interface PaymentMethodView {
  brand: string
  last4: string
  expMonth: number
  expYear: number
  wallet: string | null
}

/** Read-only billing details fetched live from the Stripe customer. */
export interface BillingDetailsView {
  email: string | null
  taxIds: { type: string; value: string }[]
  address: {
    line1: string | null
    line2: string | null
    city: string | null
    state: string | null
    postal: string | null
    country: string | null
  } | null
}

/** Read-only invoice view fetched live from Stripe. */
export interface InvoiceView {
  id: string
  number: string | null
  date: string                // ISO
  amount: number              // major units
  currency: string
  status: 'paid' | 'open' | 'void' | 'uncollectible' | 'draft'
  invoicePdf: string | null
  hostedUrl: string | null
}

export interface BillingAddress {
  line1: string
  line2?: string
  city: string
  state: string
  postal: string
  country: string
}

export interface UsageMeter {
  used: number
  included: number
  unit: string
}

export interface UsageBlock {
  resumes: UsageMeter
  articles: UsageMeter
  repos: UsageMeter
  storage: UsageMeter
}

export interface Invoice {
  id: string
  date: string         // ISO
  amount: number
  status: 'paid' | 'open' | 'failed'
  number: string
}

export interface Billing {
  plan: PlanId
  status: BillingStatus
  interval: BillingInterval
  seats: number
  pricePerMonth: number
  pricePerYear: number
  renewsAt: string                 // ISO
  trialEndsAt: string | null
  cancelAtPeriodEnd: boolean
  paymentMethod: PaymentMethod
  billingEmail: string
  taxId: string
  address: BillingAddress
  usage: UsageBlock
  invoices: Invoice[]
  /** Stripe Customer ID once a subscription has been created. */
  stripeCustomerId?: string | null
  /** Stripe Subscription ID once a subscription has been created. */
  stripeSubscriptionId?: string | null
}

// ---- Settings --------------------------------------------------------------

export type Theme = 'light' | 'dark' | 'system'
export type Accent = 'teal' | 'indigo' | 'rose' | 'amber'
export type Density = 'comfortable' | 'compact'

export interface AppearanceSettings {
  theme: Theme
  accent: Accent
  density: Density
  reducedMotion: boolean
}

export type DateFormat = 'Mon DD, YYYY' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
export type TimeFormat = '12h' | '24h'

export interface LocaleSettings {
  language: string
  timezone: string
  dateFormat: DateFormat
  timeFormat: TimeFormat
  weekStartsOn: 'sunday' | 'monday'
}

export type ResumeTemplate = 'classic' | 'compact' | 'modern'
export type ResumeTone = 'professional' | 'warm' | 'punchy'
export type PageSize = 'Letter' | 'A4'

export interface ResumeDefaults {
  template: ResumeTemplate
  tone: ResumeTone
  includePhoto: boolean
  includeLinks: boolean
  pageSize: PageSize
  autoPublish: boolean
}

export type WorkspaceRole = 'viewer' | 'editor' | 'admin'

export interface WorkspaceSettings {
  name: string
  slug: string
  defaultRoleForNewMembers: WorkspaceRole
  requireSso: boolean
}

export type ApiScope = 'read' | 'write'

export interface ApiToken {
  id: string
  name: string
  last4: string
  scopes: ApiScope[]
  createdAt: string
  lastUsedAt: string | null
}

export interface Webhook {
  id: string
  url: string
  events: string[]
  active: boolean
  lastDeliveryAt: string | null
}

export interface Settings {
  appearance: AppearanceSettings
  locale: LocaleSettings
  resumeDefaults: ResumeDefaults
  workspace: WorkspaceSettings
  apiTokens: ApiToken[]
  webhooks: Webhook[]
  legal: {
    acceptedTermsAt: string
    acceptedPrivacyAt: string
  }
}

// ---- Page section descriptor used by PageShell -----------------------------

import type { LucideIcon } from 'lucide-react'

export interface PageNavSection {
  id: string
  label: string
  icon: LucideIcon
}

// ---- Shell props -----------------------------------------------------------

export interface BillingPageProps {
  billing: Billing
  onUpdateBilling: (patch: Partial<Billing>) => void
}

export interface SettingsPageProps {
  settings: Settings
  onUpdateSettings: (patch: Partial<Settings>) => void
}
