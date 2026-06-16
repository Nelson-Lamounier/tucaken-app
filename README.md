# Tucaken

**Tucaken is a SaaS that turns a developer's real code into a job-tailored,
evidence-backed résumé.** A job-seeker connects their GitHub account, Tucaken
verifies which skills they can actually prove from their repositories, and then —
given a specific job description — generates a résumé tailored to that role using
only skills the candidate can defend in an interview.

## Who it's for

Software engineers and adjacent technical roles applying for jobs who want a
résumé that is (a) tailored to each posting and (b) honest — grounded in what
their code actually shows, not aspirational keyword stuffing.

## The problem it solves

- **Résumés claim skills the candidate can't prove.** Recruiters and ATS filters
  reward keywords, so résumés drift toward unverifiable claims. Tucaken grounds
  every skill in concrete repository evidence (files, commits, PRs) and is honest
  about gaps.
- **Tailoring to each job is slow and manual.** Rewriting a résumé per posting is
  tedious. Tucaken reads the job description once, maps its required skills to the
  candidate's verified evidence, and produces a tailored draft automatically.
- **Candidates can't see how they actually match a role.** Tucaken surfaces a
  per-skill verdict (verified / partial / gap), an evidence-quality overview, and
  coaching for interviews — so the user understands their real standing.

## How it works (user flow)

1. **Connect GitHub** — the user authorises Tucaken; their repositories are
   ingested and chunked.
2. **Verify skills** — a deterministic + LLM pipeline extracts a per-skill
   evidence ledger from the actual code (languages, frameworks, infrastructure),
   classified by source lane (repo code, documented project, career history).
3. **Add a job description** — the JD is read once into a canonical required-skill
   list; a matcher assesses each required skill against the verified evidence.
4. **Generate the tailored résumé** — a multi-agent Bedrock pipeline writes a
   résumé tailored to the JD, grounded in verified skills, with honest framing of
   partial matches and gaps.
5. **Coach & iterate** — interview coaching, evidence-quality insight, and
   project case studies help the user present the work credibly.

## This repository

`tucaken-app` is the **product surface**: the Next.js web application, user
dashboard, authenticated API (`admin-api`), and the UI that renders skill
evidence, evidence-quality overviews, job-strategist results, and coaching. It is
the front door users interact with.

The heavy AI/ML work — GitHub ingestion, skill-evidence extraction, the
JD-strategist pipeline, the multi-agent résumé synthesis, and project case-study
generation — runs in the sibling **`ai-applications`** backend (TypeScript
services on AWS Bedrock, Aurora Postgres + pgvector, Kubernetes/EKS, orchestrated
by ArgoCD). `tucaken-app` dispatches jobs to that backend and presents the
results.

## Related repositories

- **`ai-applications`** — AI/ML backend: ingestion, skill evidence, JD strategist,
  résumé synthesis, case studies.
- **`cdk-monitoring`** — AWS CDK infrastructure (EKS, observability, delivery).
- **`kubernetes-bootstrap`** — in-cluster GitOps manifests, Helm values, Grafana
  dashboards.
