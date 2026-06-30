import { LEGAL } from '../config'
import type { LegalDoc } from '../types'

export const termsDoc: LegalDoc = {
  slug: 'terms',
  title: 'Terms & Conditions',
  lastUpdated: LEGAL.lastUpdated,
  intro: (
    <p>
      These terms govern your use of Tucaken, a service operated by {LEGAL.operator}.
      By creating an account or using Tucaken, you agree to them. Please read the
      section on AI-generated output carefully.
    </p>
  ),
  sections: [
    {
      id: 'who-we-are',
      heading: 'Who we are',
      body: (
        <p>
          Tucaken is operated by {LEGAL.operator}. You can contact us at{' '}
          <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
        </p>
      ),
    },
    {
      id: 'eligibility',
      heading: 'Eligibility',
      body: (
        <p>
          You must be at least 16 years old to use Tucaken. By submitting or
          connecting data - including data from your GitHub account - you confirm
          you have the right to provide it to us for the purpose of generating
          your resume.
        </p>
      ),
    },
    {
      id: 'acceptable-use',
      heading: 'Acceptable use',
      body: (
        <ul className="list-disc space-y-1 pl-5">
          <li>Do not scrape, reverse-engineer, or attempt to disrupt the service.</li>
          <li>Do not submit other people&apos;s personal data without the right to do so.</li>
          <li>Do not submit unlawful, infringing, or harmful content.</li>
        </ul>
      ),
    },
    {
      id: 'ai-output',
      heading: 'AI-generated output',
      body: (
        <>
          <p>
            Tucaken uses AI to generate a resume from the evidence you supply, such
            as your GitHub activity and professional history. You are interacting
            with and receiving output from an automated AI system.
          </p>
          <p>
            AI output may contain inaccuracies or omissions. You are responsible for
            reviewing and verifying all generated content before you use or share
            it. We do not warrant that output is accurate or complete, and we do not
            guarantee any employment, interview, or other outcome.
          </p>
        </>
      ),
    },
    {
      id: 'ip',
      heading: 'Intellectual property',
      body: (
        <>
          <p>
            We own the Tucaken platform and software. You keep ownership of the data
            you provide and of the resume Tucaken generates for you.
          </p>
          <p>
            You grant us a limited licence to process your data only as needed to
            provide the service to you.
          </p>
        </>
      ),
    },
    {
      id: 'third-parties',
      heading: 'Third-party services',
      body: (
        <p>
          Tucaken relies on third-party services to work: GitHub (for the
          connection you authorise), Amazon Web Services and Amazon Bedrock (for AI
          processing), and Stripe (for payments). Your use of those connections is
          also subject to their terms.
        </p>
      ),
    },
    {
      id: 'billing',
      heading: 'Billing and cancellation',
      body: (
        <>
          <p>
            Paid plans are billed through Stripe. You can cancel at any time to stop
            future billing; cancellation takes effect at the end of the current
            billing period.
          </p>
          <p>
            Tucaken is a digital service provided immediately. When you subscribe you
            ask us to begin straight away and acknowledge that your statutory 14-day
            right of withdrawal ends once the service has begun. This does not affect
            your other statutory consumer rights.
          </p>
        </>
      ),
    },
    {
      id: 'liability',
      heading: 'Liability',
      body: (
        <p>
          To the fullest extent permitted by law, we are not liable for indirect or
          unforeseeable loss arising from your use of Tucaken. Nothing in these terms
          excludes or limits our liability where it would be unlawful to do so -
          including liability for death or personal injury caused by negligence, for
          fraud, or for your non-excludable statutory consumer rights.
        </p>
      ),
    },
    {
      id: 'governing-law',
      heading: 'Changes, termination and governing law',
      body: (
        <p>
          We may update these terms or suspend or end accounts that breach them; we
          will show the updated date above when we make changes. These terms are
          governed by the laws of {LEGAL.jurisdiction}, and disputes fall to its
          courts. If you are a consumer in the EU, you keep the mandatory
          protections of the country where you live.
        </p>
      ),
    },
  ],
}
