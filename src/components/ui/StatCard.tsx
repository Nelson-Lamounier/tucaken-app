"use client"
// src/components/ui/StatCard.tsx
// Stat: a teal number that counts up when scrolled into view, with its label
// set beside it (numeral-left, label-right). No card chrome. Count-up is frozen
// for reduced-motion users (the value jumps straight to its target).
import { useEffect, useRef, useState } from 'react'
import { useInView, useReducedMotion } from 'motion/react'

interface StatCardProps {
  value: number
  suffix?: string
  label: string
}

function formatCount(n: number): string {
  if (n < 1000) return n.toString()
  const k = n / 1000
  const rounded = k >= 10 ? Math.round(k) : Math.round(k * 10) / 10
  return `${rounded}k`
}

function useCountUp(target: number, start: boolean, reduced: boolean): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (reduced) {
      setCount(target)
      return
    }
    if (!start || target <= 0) return
    const steps = Math.max(1, Math.round(1600 / 50))
    const increment = Math.ceil(target / steps)
    let current = 0
    const timer = setInterval(() => {
      current += increment
      if (current >= target) {
        current = target
        clearInterval(timer)
      }
      setCount(current)
    }, 50)
    return () => clearInterval(timer)
  }, [target, start, reduced])

  return count
}

export function StatCard({ value, suffix = '', label }: StatCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const reduced = useReducedMotion() ?? false
  const count = useCountUp(value, inView, reduced)

  return (
    <div ref={ref} className="flex items-center justify-center gap-4 px-2 py-4 sm:justify-start">
      <span className="font-heading text-5xl font-bold leading-none tracking-tight text-teal-400 tabular-nums sm:text-6xl lg:text-7xl">
        {formatCount(count)}
        {suffix}
      </span>
      <span className="max-w-[11rem] text-left text-base leading-snug text-zinc-400">{label}</span>
    </div>
  )
}
