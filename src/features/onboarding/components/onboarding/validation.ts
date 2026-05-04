// src/features/onboarding/validation.ts
//
// Zod schemas used by the Portfolio + Resume steps.

import { z } from 'zod'

export const portfolioUrlSchema = z
  .string()
  .trim()
  .min(1, 'Paste your portfolio URL.')
  .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
  .pipe(
    z
      .string()
      .url('That does not look like a valid URL.')
      .refine(
        (v) => {
          try {
            const u = new URL(v)
            return u.hostname.includes('.')
          } catch {
            return false
          }
        },
        { message: 'That does not look like a valid URL.' },
      ),
  )

export const resumeFileSchema = z
  .instanceof(File, { message: 'Pick a file.' })
  .refine(
    (f) => f.size <= 50 * 1024 * 1024,
    'File is too large — keep it under 50 MB.',
  )
  .refine(
    (f) =>
      /\.(pdf|docx?)$/i.test(f.name) ||
      [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ].includes(f.type),
    'Use a PDF or Word document.',
  )
