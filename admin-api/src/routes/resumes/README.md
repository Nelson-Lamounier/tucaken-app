# resumes

Resume storage and the resume-import pipeline. Two mounts, both user JWT:
`/api/admin/resumes` (CRUD over stored resumes) and `/api/admin/resume-imports`
(upload → parse → confirm flow + career entries).

## Files

| File | Exports | Mount | Purpose |
|---|---|---|---|
| `resumes.ts` | `createResumesRouter` | `/api/admin/resumes` | Resume CRUD + active selection |
| `resume-imports.ts` | `createResumeImportsRouter` | `/api/admin/resume-imports` | Import pipeline dispatch + career entries |

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/resumes` | List the caller's resumes |
| GET | `/resumes/active` | Currently active resume |
| GET | `/resumes/:id` | Resume detail |
| POST | `/resumes` | Create |
| PUT | `/resumes/:id` | Update |
| DELETE | `/resumes/:id` | Delete |
| POST | `/resumes/:id/activate` | Make this the active resume |
| GET | `/resume-imports/upload-url` | Presigned upload URL for the source file |
| POST | `/resume-imports/:id/complete` | Signal upload complete → dispatch parse Job |
| POST | `/resume-imports/:id/confirm` | Accept parsed output into the Knowledge Base |
| POST | `/resume-imports/:id/retry` | Re-dispatch a failed import |
| GET | `/resume-imports` | List imports |
| GET | `/resume-imports/:id` | Import detail |
| GET | `/resume-imports/:id/progress` | Poll import progress |
| GET | `/resume-imports/:id/gap-report` | Gaps between resume and indexed data |
| GET/PUT/DELETE | `/resume-imports/career-entries[/:eid]` | Career entry reads/edits |

## Design notes

- Import processing runs as a K8s Job (resume-import-processor image in the
  sibling ai-applications repo); progress is **polled**, not pushed — see
  ADR 0008 (polling over SSE).
- Import dispatch is deduplicated and rolled up via
  `lib/jobs/dispatch-rollup.ts` so Profile Intelligence refreshes without a
  full re-ingest.
- The codebase term is **`resume`** (no diacritics) — keep field names and
  docs consistent with it.

## Testing

`__tests__/resumes.test.ts`, `__tests__/resume-imports.test.ts`.

## Related

- [routes overview](../README.md) · [lib/jobs](../../lib/jobs/README.md) · [lib/repositories](../../lib/repositories/README.md)
