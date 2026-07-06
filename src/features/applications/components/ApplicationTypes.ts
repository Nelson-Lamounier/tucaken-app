import type {
  ApplicationStatus,
  FitRating,
  ApplicationRecommendation,
  InterviewStage,
} from '@/lib/types/applications.types'

// =============================================================================
// CONSTANTS
// =============================================================================

export const STATUS_FILTER_OPTIONS: readonly { value: ApplicationStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Applications' },
  { value: 'analysing', label: 'Analysing' },
  { value: 'analysis-ready', label: 'Ready for Review' },
  { value: 'failed', label: 'Failed' },
  { value: 'interview-prep', label: 'Interview Prep' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offer-received', label: 'Offer Received' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'rejected', label: 'Rejected' },
]

export const INTERVIEW_STAGE_OPTIONS: readonly { value: InterviewStage; label: string }[] = [
  { value: 'applied', label: 'Just Applied' },
  { value: 'phone-screen', label: 'Phone Screen' },
  { value: 'technical', label: 'Technical Round' },
  { value: 'system-design', label: 'System Design' },
  { value: 'behavioural', label: 'Behavioural' },
  { value: 'bar-raiser', label: 'Bar Raiser' },
  { value: 'final', label: 'Final Round' },
]

export const MIN_JD_LENGTH = 50

/**
 * Soft warning threshold (characters) for very long job descriptions. The shared
 * public ALB's WAF rejects request bodies over 8 KB (SizeRestrictions_BODY), so a
 * job description near that size — plus the other form fields and serialisation
 * overhead — can be blocked at the edge before it reaches Tucaken. We warn (never
 * block) so the user can trim proactively; admin-api's own hard cap is 100 KB.
 */
export const JD_LONG_WARNING_LENGTH = 7000

// =============================================================================
// COLOUR MAPS
// =============================================================================

export const STATUS_COLOURS: Record<ApplicationStatus, string> = {
  'analysing': 'bg-violet-50 text-violet-700 border-violet-600/20 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/30',
  'analysis-ready': 'bg-emerald-50 text-emerald-700 border-emerald-600/20 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30',
  'coaching': 'bg-indigo-50 text-indigo-700 border-indigo-600/20 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30',
  'interview-prep': 'bg-sky-50 text-sky-700 border-sky-600/20 dark:bg-sky-500/20 dark:text-sky-300 dark:border-sky-500/30',
  'applied': 'bg-blue-50 text-blue-700 border-blue-600/20 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30',
  'interviewing': 'bg-amber-50 text-amber-800 border-amber-600/20 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30',
  'offer-received': 'bg-teal-50 text-teal-700 border-teal-600/20 dark:bg-teal-500/20 dark:text-teal-300 dark:border-teal-500/30',
  'accepted': 'bg-green-50 text-green-700 border-green-600/20 dark:bg-green-500/20 dark:text-green-300 dark:border-green-500/30',
  'withdrawn': 'bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-500/20 dark:text-zinc-400 dark:border-zinc-500/30',
  'rejected': 'bg-red-50 text-red-700 border-red-600/20 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30',
  'failed': 'bg-rose-50 text-rose-700 border-rose-600/20 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30',
}

export const FIT_RATING_COLOURS: Record<FitRating, string> = {
  'STRONG_FIT': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  'REASONABLE_FIT': 'bg-amber-50 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  'STRETCH': 'bg-orange-50 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
  'REACH': 'bg-red-50 text-red-700 dark:bg-red-500/20 dark:text-red-300',
}

export const FIT_RATING_LABELS: Record<FitRating, string> = {
  'STRONG_FIT': 'Strong Fit',
  'REASONABLE_FIT': 'Reasonable Fit',
  'STRETCH': 'Stretch',
  'REACH': 'Reach',
}

export const RECOMMENDATION_LABELS: Record<ApplicationRecommendation, string> = {
  'APPLY': 'Apply',
  'APPLY_WITH_CAVEATS': 'Apply with Caveats',
  'STRETCH_APPLICATION': 'Stretch Application',
  'NOT_RECOMMENDED': 'Not Recommended',
}

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  'analysing': 'Analysing',
  'analysis-ready': 'Ready for Review',
  'coaching': 'Coaching',
  'interview-prep': 'Interview Prep',
  'applied': 'Applied',
  'interviewing': 'Interviewing',
  'offer-received': 'Offer',
  'accepted': 'Accepted',
  'withdrawn': 'Withdrawn',
  'rejected': 'Rejected',
  'failed': 'Failed',
}

export const STAGE_LABELS: Record<InterviewStage, string> = {
  'applied': 'Applied',
  'phone-screen': 'Phone Screen',
  'technical': 'Technical',
  'system-design': 'System Design',
  'behavioural': 'Behavioural',
  'bar-raiser': 'Bar Raiser',
  'final': 'Final',
}

export const REC_COLOURS: Record<ApplicationRecommendation, string> = {
  'APPLY': 'border-emerald-600/20 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
  'APPLY_WITH_CAVEATS': 'border-amber-600/20 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
  'STRETCH_APPLICATION': 'border-orange-600/20 bg-orange-50 text-orange-700 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300',
  'NOT_RECOMMENDED': 'border-red-600/20 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300',
}

export const STATUS_OPTIONS: { value: ApplicationStatus; label: string }[] = [
  { value: 'analysing', label: 'Analysing' },
  { value: 'analysis-ready', label: 'Ready for Review' },
  { value: 'applied', label: 'Applied' },
  { value: 'interview-prep', label: 'Interview Prep' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offer-received', label: 'Offer Received' },
  { value: 'accepted', label: 'Accepted Offer' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'rejected', label: 'Rejected' },
]
