// src/components/ui/Typewriter.tsx
//
// Equivalent of Motion+'s "Typewriter" effect, built on plain React
// (motion-plus is a paid pkg and not installed). Deterministic: on mount
// and whenever `text` changes it types from empty to the full string.
// Honours prefers-reduced-motion (renders final text immediately).

import { useEffect, useRef, useState, createElement } from 'react'
import { useReducedMotion } from 'motion/react'

interface TypewriterProps {
  text: string
  /** Element to render as. Default 'span'. */
  as?: 'span' | 'p' | 'h1' | 'h2' | 'h3'
  className?: string
  /** Ms per character while typing. Default 28. */
  speed?: number
  /** Delay before typing starts, in ms. Default 0. */
  startDelay?: number
  /** Show the blinking caret. Default true. */
  cursor?: boolean
  /** Fired once when typing finishes (or immediately under reduced motion). */
  onComplete?: () => void
}

export function Typewriter({
  text,
  as = 'span',
  className,
  speed = 28,
  startDelay = 0,
  cursor = true,
  onComplete,
}: Readonly<TypewriterProps>) {
  const reduce = useReducedMotion()
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (reduce) {
      setCount(text.length)
      onCompleteRef.current?.()
      return
    }

    setCount(0)
    let i = 0
    let startTimer: ReturnType<typeof setTimeout> | undefined
    let stepTimer: ReturnType<typeof setInterval> | undefined

    const begin = () => {
      stepTimer = setInterval(() => {
        i += 1
        setCount(i)
        if (i >= text.length) {
          if (stepTimer) clearInterval(stepTimer)
          onCompleteRef.current?.()
        }
      }, speed)
    }

    if (startDelay > 0) {
      startTimer = setTimeout(begin, startDelay)
    } else {
      begin()
    }

    return () => {
      if (startTimer) clearTimeout(startTimer)
      if (stepTimer) clearInterval(stepTimer)
    }
  }, [text, speed, startDelay, reduce])

  const shown = text.slice(0, count)
  const isTyping = !reduce && count < text.length

  const caret =
    cursor && !reduce ? (
      <span
        aria-hidden
        className={[
          'ml-0.5 inline-block w-px self-stretch bg-current align-text-bottom',
          isTyping ? 'opacity-100' : 'motion-safe:animate-pulse',
        ].join(' ')}
        style={{ height: '1em' }}
      />
    ) : null

  // The invisible full-text copy reserves the final wrapped size from the
  // first paint, so typing reveals into place instead of reflowing/jumping
  // when it completes. The visible layer is overlaid on top.
  // [text-wrap:normal] keeps every prefix's line breaks identical to the
  // final layout (balance/pretty would re-flow as the string grows).
  return createElement(
    as,
    { className, 'aria-label': text },
    <span className="relative block [text-wrap:normal]">
      <span aria-hidden className="invisible">
        {text}
      </span>
      <span aria-hidden className="absolute inset-0">
        {shown}
        {caret}
      </span>
    </span>,
  )
}
