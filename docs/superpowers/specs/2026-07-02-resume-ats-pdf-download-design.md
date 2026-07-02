# Resume ATS PDF download — design

Date: 2026-07-02
Status: approved (design), pending spec review
Repos: `ai-applications` (backend) + `tucaken-app` (frontend/admin-api)
Worktrees: `ai-applications/.worktrees/ats-pdf-store` (`fix/ats-pdf-store-wiring`, base `develop`),
`tucaken-app/.worktrees/resume-ats-download` (`feat/resume-download-ats-pdf`, base `main`)

## Problem

Downloading a tailored resume as PDF from the application editor produces a **31 MB
raster PDF** (`jsPDF 4.2.1`, 4 embedded PNG images). It is over the 2 MB cap of
job portals (e.g. Google) **and** has no text layer, so ATS parsers cannot read
it. Bullet dots are also missing from the rendered document.

## Evidence (live dev account, verified — not assumed)

- Downloaded file `Nelson_Lamounier_Resume (10).pdf`: 32,105,010 bytes, 3 pages,
  producer `jsPDF 4.2.1`, 4 `/Image` XObjects → raster, no text layer.
- Last two executions (RDS `tucaken`, via admin-api pod):
  - Google — Forward Deployed Engineer, GenAI (`cef19fe7…`), 2026-07-02 11:35,
    `mode=standard`, `analysis.atsCheck.status=issues`.
  - OpenAI — AI Support Engineer, Dublin (`4d98159e…`), 2026-07-02 10:37,
    `mode=standard`, `analysis.atsCheck.status=passed`.
  - Both: `resumes.pdf_s3_key = NULL`, `resumes.ats_check_json = NULL`.
- S3 `bedrock-data-development-assetsbucket…` prefix `resumes/` → **0 objects**.

## Root causes

1. **Backend — dispatched strategist Job env omits `ASSETS_BUCKET`.**
   `admin-api/src/routes/applications.ts` builds the job-strategist Job env
   (MODE, USER_ID, PG via secret ref, …) with **no `ASSETS_BUCKET`**. The
   dispatched pipeline reads `process.env['ASSETS_BUCKET'] ?? ''`
   (`applications/job-strategist/src/run-pipeline.ts:796`), un-validated by
   `parseEnv()`. So `a.bucket=''` → the store guard
   `if (a.bucket)` in `applications/job-strategist/src/ats/run-ats-check.ts:99`
   is false → the PDF is rendered and parse-checked (hence `passed`/`issues`)
   but **`storeAtsArtifacts` (S3 put + column UPDATE) is skipped silently** — no
   error, no `unverified`.

2. **Frontend — download never uses `pdf_s3_key`.** The editor's PDF option
   (`src/features/resume-theme/app/downloads.tsx:downloadPdf`) always rasterises
   the on-screen sheets with `html2canvas` → PNG → jsPDF, ignoring any stored
   text PDF.

3. **Bullet dots — `list-style` reset, never restored.** `.resume-doc .bullets`
   (`src/features/resume-theme/app/themes.tsx:389`) sets only `padding-left`;
   Tailwind v4 preflight resets `ul { list-style: none }`, so no disc marker
   renders. Independent of the PDF pipeline.

## Design

### Phase 1 — Backend (make `pdf_s3_key` populate)

- **Inject `ASSETS_BUCKET`** into every `buildPipelineJob` env that uses the
  `job-strategist` image (analysis + coach dispatch sites in
  `admin-api/src/routes/applications.ts`), sourced from admin-api config (which
  already resolves the assets bucket as `ASSETS_BUCKET_NAME`). Value =
  `config.assetsBucketName`.
- **Harden the silent skip.** In `run-ats-check.ts`, when `a.bucket` is empty,
  emit a `warn` log + a metric (`job_strategist_ats_store_skipped_total`) instead
  of a silent no-op, so a missing bucket can never regress invisibly again.
  Optionally: validate `ASSETS_BUCKET` in `run-pipeline.ts` (log-and-continue,
  fail-open — do not crash the analysis).
- **Backfill (optional):** a one-off re-render for the two existing resumes, or
  leave to the next run.

Verification: dispatch a standard analysis in dev → assert an object appears at
`resumes/<userId>/<resumeId>.pdf` and `resumes.pdf_s3_key` / `ats_check_json` are
set. Extract text (`pdfjs-dist`) → candidate name + JD keywords present; size
< 500 KB.

### Phase 2 — Frontend (serve + download the stored PDF)

- **admin-api endpoint** `GET /applications/:slug/resume.pdf` — authz-checked
  (owner/admin), looks up the active resume's `pdf_s3_key`, returns a short-lived
  **presigned S3 URL** (302) or streams the object. 404 when `pdf_s3_key` is null.
  Zod-validate the slug; re-verify JWT.
- **tucaken-app server fn** wrapping the endpoint (`src/server/applications.ts`),
  exposed via `queryOptions`.
- **Rewire the editor PDF download** (`downloads.tsx` / `main.tsx` handler): for
  the `pdf` kind, if a stored PDF exists → download it; else fall back to the
  current raster with a "generating ATS copy" note. TXT/DOC unchanged.

### Phase 3 — Bullet dots (quick, standalone)

- Add `list-style: disc; list-style-position: outside;` to
  `.resume-doc .bullets li` so markers render in the on-screen doc and the raster
  fallback. The Phase 1/2 server PDF draws bullets explicitly (react-pdf), so it
  is unaffected.

## Out of scope

- The three decommissioned static resume variants (`resume-data*.ts`).
- react-pdf theme parity for the on-screen editor (server PDF is one clean ATS
  layout; the editor keeps its themes for preview).
- Removing `html2canvas-pro` / `jspdf` (retained as the raster fallback until the
  server PDF is proven in prod).

## Verification (end to end)

1. Standard analysis in dev → S3 object + columns populated.
2. Download PDF from the editor → text-selectable (`pdftotext` yields name + JD
   keywords), bullet dots present, < 500 KB.
3. `yarn typecheck && yarn lint && yarn test` green in tucaken-app; job-strategist
   tests green.
