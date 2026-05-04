// src/features/account/billing/plans.ts
//
// Static plan catalog used on the Billing page. Pulled out so it can be
// easily edited or swapped for a server response without touching the UI.

import type { PlanId } from '../types'

export interface PlanDefinition {
  id: PlanId
  name: string
  price: number      // monthly $
  yearly: number     // annual $
  popular?: boolean
  blurb: string
  features: string[]
}

export const PLANS: PlanDefinition[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    yearly: 0,
    blurb: 'Try the basics. Hand-tuned resumes only.',
    features: [
      '3 resumes / month',
      '1 connected GitHub repo',
      'PDF & web exports',
      'Community support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 19,
    yearly: 190,
    popular: true,
    blurb: 'For developers actively job-hunting.',
    features: [
      '50 generated resumes / month',
      '10 GitHub repos synced',
      'AI-rewritten bullets',
      'Custom domain on web resumes',
      'Priority support',
    ],
  },
  {
    id: 'team',
    name: 'Team',
    price: 49,
    yearly: 490,
    blurb: 'Career-services orgs and bootcamps.',
    features: [
      'Unlimited resumes & articles',
      'Shared workspace + roles',
      'SSO via Google / GitHub',
      'Admin audit log',
      'Dedicated CSM',
    ],
  },
]

export function planRank(id: PlanId) {
  return PLANS.findIndex((p) => p.id === id)
}
