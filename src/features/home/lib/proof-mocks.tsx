"use client"
// On-brand proof visuals for the scroll-story right panel. Each slide maps to a
// minimal SVG illustration via the MOCKS map, so the section can render
// MOCKS[slide.mock] without a switch/ternary chain.
import type { MockKind } from './story-data'
import kubernetesProofSvg from '../../../images/hero-github-kubernetes-proof-unread-minimal.svg'
import migrationPrsSvg from '../../../images/hero-monolith-microservices-proof-skimmed-minimal.svg'
import resumeScanSvg from '../../../images/hero-resume-scan-six-seconds-minimal.svg'
import connectGithubSvg from '../../../images/hero-connect-github-minimal.svg'
import jdMatchSvg from '../../../images/hero-job-description-match-minimal.svg'
import resumeEvidenceSvg from '../../../images/hero-verifiable-resume-evidence-minimal.svg'

function MockImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <img src={src} alt={alt} className="h-full w-full object-contain" loading="lazy" />
    </div>
  )
}

const CommitMock = () => (
  <MockImage
    src={kubernetesProofSvg}
    alt="A month of GitHub commits scaling Kubernetes clusters in production that a resume never surfaces"
  />
)

const ArchitectureMock = () => (
  <MockImage
    src={migrationPrsSvg}
    alt="GitHub pull requests from a six-month migration from a monolith to event-driven microservices"
  />
)

const SkimMock = () => (
  <MockImage
    src={resumeScanSvg}
    alt="A recruiter scanning a resume in about six seconds, missing the candidate's real engineering work"
  />
)

const ReposMock = () => (
  <MockImage
    src={connectGithubSvg}
    alt="Connecting a GitHub account with read-only access and choosing repositories to sync into Tucaken"
  />
)

const JdMock = () => (
  <MockImage
    src={jdMatchSvg}
    alt="Tucaken AI matching a job description's required skills against verified GitHub evidence"
  />
)

const ResumeMock = () => (
  <MockImage
    src={resumeEvidenceSvg}
    alt="A job-tailored resume where every claim links to verifiable evidence from the candidate's real work"
  />
)

export const MOCKS: Record<MockKind, () => React.JSX.Element> = {
  commit: CommitMock,
  architecture: ArchitectureMock,
  skim: SkimMock,
  repos: ReposMock,
  jd: JdMock,
  resume: ResumeMock,
}
