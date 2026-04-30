"use client"
// src/features/auth/components/EnergeticAuthShell.tsx
import type { ComponentProps } from 'react'
import { AuthShell } from './AuthShell'

type Props = Omit<ComponentProps<typeof AuthShell>, 'variant'>

export function EnergeticAuthShell(props: Props) {
  return <AuthShell variant="energetic" {...props} />
}
