interface CheckoutConsentProps {
  accepted: boolean
  onChange: (value: boolean) => void
}

/**
 * Required affirmative consent at checkout. Ticking it expresses consent to
 * immediate performance (which ends the statutory withdrawal right) and to the
 * subscription being non-refundable.
 */
export function CheckoutConsent({ accepted, onChange }: CheckoutConsentProps) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-600">
      <input
        type="checkbox"
        checked={accepted}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-teal-600 focus:ring-teal-500"
      />
      <span>
        I agree to the{' '}
        <a
          href="/terms"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-teal-600 underline hover:text-teal-500"
        >
          Terms &amp; Conditions
        </a>{' '}
        and ask Tucaken to begin immediately. I understand the service starts at
        once, that this ends my 14-day right to withdraw, and that my payment is
        non-refundable.
      </span>
    </label>
  )
}
