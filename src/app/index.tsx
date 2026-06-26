import { createFileRoute, redirect } from '@tanstack/react-router'
import { HomePage } from '../features/home/HomePage'

const HOME_TITLE = 'Tucaken — resumes matched to the job, proven by your GitHub'
const HOME_DESCRIPTION =
  'Tucaken connects your GitHub with read-only access, verifies the skills your code actually proves, matches them to any job description, and generates a tailored resume in minutes.'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: HOME_TITLE },
      { name: 'description', content: HOME_DESCRIPTION },
      { property: 'og:title', content: HOME_TITLE },
      { property: 'og:description', content: HOME_DESCRIPTION },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: HOME_TITLE },
      { name: 'twitter:description', content: HOME_DESCRIPTION },
    ],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: 'Tucaken',
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          description: HOME_DESCRIPTION,
          featureList: [
            'Read-only GitHub connection',
            'Skill verification from real code evidence',
            'Job description to skill matching',
            'AI-generated, job-tailored resume',
            'Per-stage interview coaching',
          ],
          offers: [
            { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'EUR' },
            { '@type': 'Offer', name: 'Pro', price: '12', priceCurrency: 'EUR' },
          ],
        }),
      },
    ],
  }),
  beforeLoad: ({ context }) => {
    // Authenticated users normally bypass the marketing home and land in the
    // dashboard. Under MOCK_AUTH (VITE_MOCK_AUTH=true, set by `just dev-mock`)
    // we keep the home page reachable so end-to-end UX tests can exercise the
    // PricingSection → /checkout → /checkout/return flow without signing the
    // mock user out first.
    if (!import.meta.env.VITE_MOCK_AUTH && context.auth.user) {
      throw redirect({ to: '/overview' })
    }
  },
  component: HomePage,
})
