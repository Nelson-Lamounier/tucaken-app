/**
 * User-facing error standard.
 *
 * Maps any thrown error into a calm, consistent message for the UI. It NEVER
 * reads the raw error (no `error.message`, status codes, stack traces, URLs or
 * internal IDs) — those leak server internals and read as scary noise ("fetch
 * failed"). Every surface that shows an error to a user should go through here
 * (typically via `notifyError`), so the wording stays standard and safe.
 */

export type UserMessageTone = 'error' | 'warning' | 'info' | 'success'

export interface UserMessage {
  readonly tone: UserMessageTone
  /** Short, bold headline — what didn't happen, in the user's terms. */
  readonly title: string
  /** One actionable line — what to do next. Never what the server did. */
  readonly message: string
}

/** The action the user was attempting — selects standard, on-brand copy. */
export type ErrorContext =
  | 'analysis'
  | 'coach'
  | 'regenerate'
  | 'save'
  | 'delete'
  | 'load'
  | 'generic'

const CONTEXT_COPY: Record<ErrorContext, { title: string; message: string }> = {
  analysis:   { title: "Couldn't start the analysis", message: 'A very long job description can be rejected before it reaches Tucaken. Try trimming it to the core responsibilities and requirements, or retry in a moment.' },
  coach:      { title: "Couldn't generate interview prep", message: 'Give it another try in a moment.' },
  regenerate: { title: "Couldn't refresh the case study", message: 'Give it another try in a moment.' },
  save:       { title: "Couldn't save your changes", message: 'Your changes weren’t saved — try again.' },
  delete:     { title: "Couldn't delete that", message: 'Nothing was removed — try again.' },
  load:       { title: "Couldn't load this", message: 'Refresh the page, or try again shortly.' },
  generic:    { title: 'Something went wrong', message: 'Please try again.' },
}

/**
 * True when the browser reports it is offline. The only environmental signal we
 * surface — it's the user's side, not the server's, so it's safe and actionable.
 */
function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * Convert any error into a standard, server-detail-free {@link UserMessage}.
 * The raw `err` is intentionally ignored for display — kept in the signature so
 * call sites pass it (and so we can branch on safe, non-leaking signals only).
 */
export function toUserError(err: unknown, context: ErrorContext = 'generic'): UserMessage {
  void err
  const base = CONTEXT_COPY[context] ?? CONTEXT_COPY.generic
  if (isOffline()) {
    return { tone: 'error', title: base.title, message: 'You appear to be offline. Check your connection, then try again.' }
  }
  return { tone: 'error', title: base.title, message: base.message }
}
