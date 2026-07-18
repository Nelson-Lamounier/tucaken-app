/**
 * @format
 * Shared request-body validation for Hono routes.
 *
 * Thin wrapper around @hono/zod-validator that pins the API's uniform error
 * shape: every validation failure responds
 *   400 { error: 'Validation failed', issues: [...] }
 * matching the shape the admin-users routes already used, so clients parse
 * one format regardless of which route rejected the payload.
 *
 * Usage:
 *   router.post('/', jsonBody(CreateArticleBody), async (ctx) => {
 *     const body = ctx.req.valid('json')  // fully typed
 *     ...
 *   })
 *
 * Malformed (non-JSON) bodies are rejected by zod-validator itself with a
 * 400 before the schema runs.
 */
import { zValidator } from '@hono/zod-validator';
import type { ZodType } from 'zod';

export function jsonBody<T extends ZodType>(schema: T) {
  return zValidator('json', schema, (result, ctx) => {
    if (!result.success) {
      return ctx.json({ error: 'Validation failed', issues: result.error.issues }, 400);
    }
    return undefined;
  });
}
