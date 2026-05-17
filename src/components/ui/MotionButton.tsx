// src/components/ui/MotionButton.tsx
//
// Button with a text-swap slide-reveal on hover/focus: the label slides up
// and out while an identical label slides in from below, both clipped by an
// overflow-hidden mask. Honours prefers-reduced-motion (opacity fallback).

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { motion, useReducedMotion, type Variants } from 'motion/react'

export type MotionButtonVariant = 'primary' | 'ghost'
export type MotionButtonSize = 'sm' | 'md' | 'lg'

// motion.button redefines the drag / animation event handlers with
// Motion-specific signatures, so drop the native ones to avoid a clash.
type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd'
>

export interface MotionButtonProps extends NativeButtonProps {
  children?: ReactNode
  variant?: MotionButtonVariant
  size?: MotionButtonSize
}

function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

const SWAP_SPRING = { type: 'spring' as const, stiffness: 400, damping: 30 }

// Label that starts in place and slides up out of the clip on hover.
const topVariants: Variants = {
  rest: { y: '0%' },
  hover: { y: '-100%' },
}
// Identical label waiting below; slides up into the clip on hover.
const bottomVariants: Variants = {
  rest: { y: '100%' },
  hover: { y: '0%' },
}

const SIZE: Record<MotionButtonSize, string> = {
  sm: 'gap-1.5 px-4 py-2 text-xs',
  md: 'gap-2 px-5 py-2.5 text-sm',
  lg: 'gap-2.5 px-7 py-3 text-base',
}

const VARIANT: Record<MotionButtonVariant, string> = {
  primary:
    'text-zinc-950 bg-gradient-to-r from-teal-400 via-emerald-400 to-teal-500 bg-[length:200%_auto] bg-left hover:bg-right transition-[background-position,box-shadow] duration-500 shadow-[0_8px_30px_-12px_rgba(20,184,166,0.7)] hover:shadow-[0_10px_40px_-10px_rgba(16,185,129,0.85)]',
  ghost:
    'bg-transparent text-slate-900 dark:text-zinc-200 hover:bg-slate-900/5 dark:hover:bg-white/5 transition-colors duration-200',
}

export function MotionButton({
  children,
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  ...props
}: Readonly<MotionButtonProps>) {
  const reduce = useReducedMotion()

  const base = cx(
    'group relative inline-flex cursor-pointer items-center justify-center',
    'rounded-md font-semibold whitespace-nowrap select-none',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
    'focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
    'disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed',
    SIZE[size],
    VARIANT[variant],
    className,
  )

  // Reduced motion: no vertical slide — a single label with a gentle
  // opacity shift on hover/focus.
  if (reduce) {
    return (
      <motion.button
        type="button"
        disabled={disabled}
        className={base}
        whileHover={{ opacity: 0.85 }}
        whileFocus={{ opacity: 0.85 }}
        whileTap={{ scale: 0.97 }}
        {...props}
      >
        <span className="inline-flex items-center">{children}</span>
      </motion.button>
    )
  }

  return (
    <motion.button
      type="button"
      disabled={disabled}
      className={base}
      initial="rest"
      animate="rest"
      whileHover="hover"
      whileFocus="hover"
      whileTap={{ scale: 0.97 }}
      {...props}
    >
      {/* Clip mask — both labels share this overflow-hidden box */}
      <span className="relative grid overflow-hidden">
        <motion.span
          className="col-start-1 row-start-1 inline-flex items-center justify-center"
          style={{ willChange: 'transform' }}
          variants={topVariants}
          transition={SWAP_SPRING}
        >
          {children}
        </motion.span>
        <motion.span
          aria-hidden
          className="col-start-1 row-start-1 inline-flex items-center justify-center"
          style={{ willChange: 'transform' }}
          variants={bottomVariants}
          transition={SWAP_SPRING}
        >
          {children}
        </motion.span>
      </span>
    </motion.button>
  )
}
