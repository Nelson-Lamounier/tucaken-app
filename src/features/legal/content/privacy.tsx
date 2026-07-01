import { LEGAL } from '../config'
import type { LegalDoc } from '../types'

export const privacyDoc: LegalDoc = {
  slug: 'privacy',
  title: 'Privacy Policy',
  lastUpdated: LEGAL.lastUpdated,
  intro: (
    <p>
      This policy explains how {LEGAL.operator} handles your personal data when you
      use Tucaken. It covers both the EU GDPR and the UK GDPR.
    </p>
  ),
  sections: [
    {
      id: 'controller',
      heading: 'Who controls your data',
      body: (
        <p>
          {LEGAL.operator} is the data controller for the personal data you provide
          to Tucaken. For any privacy request, contact{' '}
          <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
        </p>
      ),
    },
    {
      id: 'data-we-process',
      heading: 'Data we process',
      body: (
        <ul className="list-disc space-y-1 pl-5">
          <li>Account and sign-in details, managed through Amazon Cognito.</li>
          <li>Data you connect from GitHub, used to generate your resume.</li>
          <li>Profile and professional information you add.</li>
          <li>Billing details handled by Stripe - Stripe holds your card data, not us.</li>
          <li>
            Please avoid placing sensitive information (for example, health or
            political details) in free-text fields, as it is not needed.
          </li>
        </ul>
      ),
    },
    {
      id: 'lawful-basis',
      heading: 'Why we are allowed to process it',
      body: (
        <p>
          We process the data needed to generate your resume on the basis of our
          contract with you. We use analytics and marketing cookies only with your
          consent, which you can change at any time on the Cookie Policy page.
        </p>
      ),
    },
    {
      id: 'sub-processors',
      heading: 'Sub-processors and international transfers',
      body: (
        <p>
          We share data with service providers that help us run Tucaken: Amazon Web
          Services and Amazon Bedrock (hosting and AI processing), GitHub (the
          connection you authorise), Stripe (payments), and Amazon Cognito
          (authentication). Where data is transferred outside the EU or UK, we rely
          on the relevant safeguards, such as Standard Contractual Clauses and the
          UK Addendum.
        </p>
      ),
    },
    {
      id: 'automated-processing',
      heading: 'Automated processing',
      body: (
        <p>
          Tucaken uses automated steps to extract skills and structure your evidence
          into a resume. This supports you; it does not make an automated decision
          with legal or similarly significant effect. You decide whether and how to
          use the resume Tucaken produces.
        </p>
      ),
    },
    {
      id: 'rights',
      heading: 'Your rights and how long we keep data',
      body: (
        <>
          <p>
            You can ask us to access, correct, delete, or export your data, or object
            to certain processing. To exercise any right, contact{' '}
            <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
            We keep your data for as long as your account is active and delete it on
            request, unless we must keep it to meet a legal obligation.
          </p>
          <p>
            You can also complain to a supervisory authority: the {LEGAL.euAuthority}
            {' '}in the EU, or the {LEGAL.ukAuthority} in the UK.
          </p>
        </>
      ),
    },
  ],
}
