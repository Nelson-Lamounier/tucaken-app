'use client'

import { useState } from 'react'
import { HandThumbUpIcon, HandThumbDownIcon } from '@heroicons/react/24/outline'
import { HandThumbUpIcon as HandThumbUpSolid, HandThumbDownIcon as HandThumbDownSolid } from '@heroicons/react/24/solid'
import { useMutation } from '@tanstack/react-query'
import { submitPromptFeedbackFn } from '@/server/prompt-feedback'
import { useToastStore } from '@/lib/stores/toast-store'

interface ResumeFeedbackWidgetProps {
  readonly invocationId?: string
  readonly label?: string
}

export function ResumeFeedbackWidget({ invocationId, label }: ResumeFeedbackWidgetProps) {
  const [submitted, setSubmitted] = useState<1 | -1 | null>(null)
  const { addToast } = useToastStore()

  const { mutate, isPending } = useMutation({
    mutationFn: (rating: 1 | -1) =>
      submitPromptFeedbackFn({ data: { invocationId, rating } }),
    onSuccess: (_data, rating) => {
      setSubmitted(rating)
      addToast(
        'success',
        rating === 1 ? 'Thanks for the feedback!' : "Noted — we'll use this to improve.",
      )
    },
    onError: () => {
      addToast('error', 'Could not save feedback — please try again.')
    },
  })

  const handleRate = (rating: 1 | -1) => {
    if (submitted !== null || isPending) return
    mutate(rating)
  }

  return (
    <div className="flex items-center gap-3">
      {label && (
        <span className="text-xs text-zinc-500">{label}</span>
      )}
      <button
        type="button"
        aria-label="Thumbs up"
        disabled={submitted !== null || isPending}
        onClick={() => handleRate(1)}
        className={[
          'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
          submitted === 1
            ? 'bg-green-500/10 text-green-400 ring-1 ring-green-500/20'
            : 'text-zinc-400 hover:bg-white/5 hover:text-green-400 disabled:opacity-40',
        ].join(' ')}
      >
        {submitted === 1
          ? <HandThumbUpSolid className="size-4" />
          : <HandThumbUpIcon className="size-4" />
        }
      </button>
      <button
        type="button"
        aria-label="Thumbs down"
        disabled={submitted !== null || isPending}
        onClick={() => handleRate(-1)}
        className={[
          'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
          submitted === -1
            ? 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20'
            : 'text-zinc-400 hover:bg-white/5 hover:text-red-400 disabled:opacity-40',
        ].join(' ')}
      >
        {submitted === -1
          ? <HandThumbDownSolid className="size-4" />
          : <HandThumbDownIcon className="size-4" />
        }
      </button>
    </div>
  )
}
