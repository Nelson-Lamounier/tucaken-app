import { CookiePreferencesLink } from '@/features/consent/components/CookiePreferencesLink'
import { LEGAL } from '../config'
import type { LegalDoc } from '../types'

export const cookiesDoc: LegalDoc = {
  slug: 'cookies',
  title: 'Cookie Policy',
  lastUpdated: LEGAL.lastUpdated,
  intro: (
    <p>
      This policy explains the cookies Tucaken uses and how you can control them.
      See our Privacy Policy for how we handle personal data more broadly.
    </p>
  ),
  sections: [
    {
      id: 'what-we-use',
      heading: 'Cookies we use',
      body: (
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Necessary</strong> cookies keep you signed in and the site
            working. These are always on.
          </li>
          <li>
            <strong>Analytics</strong> cookies help us understand how the site is
            used. We set them only with your consent.
          </li>
          <li>
            <strong>Marketing</strong> cookies support relevant messaging. We set
            them only with your consent.
          </li>
        </ul>
      ),
    },
    {
      id: 'manage',
      heading: 'Managing your preferences',
      body: (
        <p>
          You can change your analytics and marketing choices at any time:{' '}
          <CookiePreferencesLink className="underline text-teal-600 hover:text-teal-500 dark:text-teal-400" />
          . You can also ask us anything at{' '}
          <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
        </p>
      ),
    },
  ],
}
