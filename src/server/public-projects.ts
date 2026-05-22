/**
 * @format
 * Public case-study proxy. Unlike every other server fn, this one is
 * UNAUTHENTICATED — it forwards to the ai-applications public-api, which only
 * ever serves projects with visibility='public'. No session cookie, no
 * Authorization header.
 *
 * The browser hits tucaken-app SSR; this fn fetches the public-api server-side
 * over in-cluster DNS, so the public-api never needs a browser-reachable host
 * or CORS entry for tucaken-app.
 *
 * @see ai-applications/api/public-api/src/routes/projects.ts
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { PublicCaseStudy } from '../features/projects/lib/public-types'

const PUBLIC_API_URL = process.env['PUBLIC_API_URL'] ?? 'http://public-api.public-api:3001'

const USERNAME_REGEX = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})?$/
const SLUG_REGEX     = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/

const paramsSchema = z.object({
  username: z.string().regex(USERNAME_REGEX),
  slug:     z.string().regex(SLUG_REGEX),
})

/** Returns the public case study, or null when not found / not public. */
export const getPublicCaseStudyFn = createServerFn({ method: 'GET' })
  .inputValidator(paramsSchema)
  .handler(async ({ data }): Promise<PublicCaseStudy | null> => {
    const url = `${PUBLIC_API_URL}/public/projects/${encodeURIComponent(data.username)}/${encodeURIComponent(data.slug)}`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`public-api responded ${res.status}`)
    return (await res.json()) as PublicCaseStudy
  })
