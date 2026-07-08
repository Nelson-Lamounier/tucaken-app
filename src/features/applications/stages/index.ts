// Stage workspaces — public surface. See src/features/applications/CONTEXT.md.

export { StageProgressBar } from './components/StageProgressBar'
export { StageWorkspacePlaceholder } from './components/StageWorkspacePlaceholder'
export { StageWorkspaceSkeleton } from './components/StageWorkspaceSkeleton'
export { EvidenceIndicator } from './components/EvidenceIndicator'
export { EvidenceCard } from './components/EvidenceCard'
export { TopicCard } from './components/TopicCard'
export { ProjectReferenceCard } from './components/ProjectReferenceCard'
export { ChecklistItem } from './components/ChecklistItem'
export { StoryCard } from './components/StoryCard'
export { ScheduleCard } from './components/ScheduleCard'
export { PracticeModal } from './components/PracticeModal'
export { SectionHeading } from './components/SectionHeading'
export { TradeoffBadge } from './components/TradeoffBadge'
export { CollapsibleSection } from './components/CollapsibleSection'
export { StoryForm } from './components/StoryForm'
export { ConfirmModal } from '@/components/ui/ConfirmModal'

export { TechnicalWorkspace } from './workspaces/TechnicalWorkspace'
export { PhoneScreenWorkspace } from './workspaces/PhoneScreenWorkspace'
export { SystemDesignWorkspace } from './workspaces/SystemDesignWorkspace'
export { BehaviouralWorkspace } from './workspaces/BehaviouralWorkspace'
export { BarRaiserWorkspace } from './workspaces/BarRaiserWorkspace'
export { FinalWorkspace } from './workspaces/FinalWorkspace'

export {
  LEADERSHIP_PRINCIPLES,
  storiesForPrinciple,
  coverageStrength,
} from './types/principles'
export type { LeadershipPrinciple } from './types/principles'

export { useStageDraft } from './hooks/useStageDraft'
export type { StageDraft } from './hooks/useStageDraft'
export { useStoryBank } from './hooks/useStoryBank'
export type { StoryDraft } from './hooks/useStoryBank'
export { useOfferDraft, personalFitScore } from './hooks/useOfferDraft'
export type { OfferDraft, DecisionFactor } from './hooks/useOfferDraft'

export {
  STAGE_ORDER,
  stageIndex,
  stageProgress,
  isInterviewStage,
} from './types/stage'
export type { StageProgress } from './types/stage'

export {
  STORY_THEMES,
  interviewPrepToWorkspace,
  researchToTopics,
  negotiationLeverage,
} from './types/workspace'
export type {
  EvidenceStrength,
  EvidenceTopic,
  ProjectReference,
  StarStory,
  StoryTheme,
  ChecklistEntry,
  StageWorkspaceData,
} from './types/workspace'
