// src/features/auth/validation.ts
import { z } from 'zod'

export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Enter a valid email address')

export const passwordRules = [
  { id: 'len', label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
  { id: 'lower', label: 'One lowercase letter', test: (v: string) => /[a-z]/.test(v) },
  { id: 'num', label: 'One number', test: (v: string) => /\d/.test(v) },
  { id: 'sym', label: 'One symbol', test: (v: string) => /[^A-Za-z0-9]/.test(v) },
] as const

export type PasswordRuleId = (typeof passwordRules)[number]['id']

export function passwordStrength(value: string): {
  score: 0 | 1 | 2 | 3 | 4 | 5
  label: 'Empty' | 'Very weak' | 'Weak' | 'Fair' | 'Strong' | 'Excellent'
  passed: PasswordRuleId[]
} {
  const passed = passwordRules.filter((r) => r.test(value)).map((r) => r.id)
  const score = passed.length as 0 | 1 | 2 | 3 | 4 | 5
  const labels = ['Empty', 'Very weak', 'Weak', 'Fair', 'Strong', 'Excellent'] as const
  return { score, label: labels[score], passed }
}

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  remember: z.boolean().optional(),
})

export const signUpSchema = z
  .object({
    name: z.string().min(2, 'Tell us your name'),
    email: emailSchema,
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Add an uppercase letter')
      .regex(/[a-z]/, 'Add a lowercase letter')
      .regex(/\d/, 'Add a number')
      .regex(/[^A-Za-z0-9]/, 'Add a symbol'),
    confirm: z.string(),
    accept: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the terms' }),
    }),
    marketing: z.boolean().optional(),
  })
  .refine((d) => d.password === d.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  })

export const forgotSchema = z.object({ email: emailSchema })

export const otpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})
