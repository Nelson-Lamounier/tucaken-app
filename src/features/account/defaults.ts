// Seed data for Billing & Settings pages.
//
// Billing: use-billing overlays live plan fields (tier, status, trialEndsAt,
// billingEmail) from getMeFn() on top of these defaults. Payment/invoices/usage
// remain stubs until a Stripe webhook handler writes to the DB.
//
// Settings: use-settings persists to localStorage (key: tucaken-user-settings-v1)
// until a /me/settings backend endpoint exists.

import type { Billing, Settings } from './types'

export const DEFAULT_BILLING: Billing = {
  plan: 'free',
  status: 'active',
  interval: 'monthly',
  seats: 1,
  pricePerMonth: 0,
  pricePerYear: 0,
  renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  trialEndsAt: null,
  cancelAtPeriodEnd: false,
  paymentMethod: { brand: 'visa', last4: '0000', expMonth: 12, expYear: 2030 },
  billingEmail: '',
  taxId: '',
  address: { line1: '', city: '', state: '', postal: '', country: '' },
  usage: {
    resumes:  { used: 0, included: 3,  unit: 'resumes'  },
    articles: { used: 0, included: 10, unit: 'articles' },
    repos:    { used: 0, included: 5,  unit: 'repos'    },
    storage:  { used: 0, included: 1,  unit: 'GB'       },
  },
  invoices: [],
}

export const DEFAULT_SETTINGS: Settings = {
  appearance: {
    theme: 'system',
    accent: 'teal',
    density: 'comfortable',
    reducedMotion: false,
  },
  locale: {
    language: 'en-US',
    timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
    dateFormat: 'Mon DD, YYYY',
    timeFormat: '24h',
    weekStartsOn: 'monday',
  },
  resumeDefaults: {
    template: 'classic',
    tone: 'professional',
    includePhoto: false,
    includeLinks: true,
    pageSize: 'Letter',
    autoPublish: false,
  },
  workspace: {
    name: '',
    slug: '',
    defaultRoleForNewMembers: 'editor',
    requireSso: false,
  },
  apiTokens: [],
  legal: {
    acceptedTermsAt: new Date().toISOString(),
    acceptedPrivacyAt: new Date().toISOString(),
  },
}
