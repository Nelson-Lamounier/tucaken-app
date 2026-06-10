# Build: Stage Workspaces for Application Detail View

## Mission

Build out the stage workspace UI for the Application Detail view in Tucaken. Each application progresses through hiring stages (Applied → Phone Screen → Technical → System Design → Behavioural → Bar Raiser → Final), and the user needs a dedicated, glanceable workspace for each stage. This is **not a chatbot**. It is a structured prep workspace per stage.

The "Applied" stage is already implemented at `/applications/<id>`. You are extending the existing Application Detail view to support the remaining stages, and building the navigation chrome that lets the user move between them.

## Discovery — Required First Step

Before writing any code, complete this discovery and produce a short summary. Do not skip.

### 1. Read the relevant skills

The work involves:
- Frontend React components → load `/mnt/skills/public/frontend-design/SKILL.md`
- Tailwind Plus components → search and load the Tailwind Plus MCP/skill for component templates
- Motion Plus animations → search and load the Motion Plus skill/MCP for hover and transition patterns

If any of these are not available, note it in the discovery doc and proceed with what is available. Do not invent skill content.

### 2. Inventory existing components and patterns

Read enough of the current frontend to understand:

- The directory structure for components (`src/components/`, `src/features/`, or similar — find the convention)
- The existing Application Detail page at the route that serves `/applications/<id>`. Identify the file(s) that render it.
- The "Resume Analysis" feature — locate its files and components, especially the form, card, and result-display patterns
- The "Job Applications" list page — locate the table/list components and the data shape it consumes
- The Application Information view — the structure that renders application details today
- The existing design tokens: where colors, spacing, typography, and dark mode are defined
- The state management approach (Redux, Zustand, React Query, plain hooks — find it; don't impose a new pattern)
- The API client conventions (`fetch` wrappers, axios, generated SDK, etc.)
- The TypeScript types for `Application`, `ResumeAnalysis`, and any existing `Stage` or `InterviewStage` types
- Existing Motion+ usage — find where motion variants are defined and named, reuse rather than invent
- The current chart, card, badge, and progress components — these are likely reusable

### 3. Output the discovery as

`docs/stage-workspaces/00-current-state.md` with the inventory above plus:

- A list of every component you intend to reuse vs. create new
- Confirmation of the design tokens you will adhere to (no new colors, no new typography scale, no new spacing units)
- The exact data shapes (TypeScript interfaces) for the stage data you will need from the backend
- Open questions surfaced from the discovery (do not guess; flag them)

Pause here and confirm before proceeding to implementation.

---

## Goals of the UI

Each application is a workspace. The user opens `/applications/<id>` and lands in a shell that contains:

1. **Application header** — company, role, applied date, JD-match score, salary range (reuse existing)
2. **Stage progress bar** — horizontal navigation across the seven stages, showing completed, current, and upcoming. Each stage is clickable.
3. **Active stage workspace** — the dynamic area below the progress bar. The content of this area changes based on which stage is selected. This is the new work.
4. **Persistent notes/timeline panel** — a sticky panel (right side on desktop, collapsible drawer on mobile) showing the application's timeline events and the user's notes across all stages. Reuse the timeline if one exists; otherwise build it minimal.

The visual identity must match what's already in place. The user should not be able to tell the new screens were built by a different person than the existing ones.

---

## The Seven Stages — Workspace Specifications

For each stage below, build a self-contained workspace component. All workspaces share:

- The same outer card / panel chrome (reuse the existing one if it exists in Applied / Application Information)
- Consistent spacing, typography, and color usage
- An advance-stage action ("Mark complete and advance") at the bottom

### Common UI Primitives to Establish Once and Reuse

Define these once, reuse across stages. Each is a small reusable component:

**EvidenceIndicator** — a traffic-light visual indicator (green/yellow/red) used wherever the UI surfaces a claim about the user's competency or fit. Used heavily in Technical, System Design, Bar Raiser. Three states: `strong`, `moderate`, `none`. Accessible — color is supplemental to a textual label, not the only signal.

**EvidenceCard** — a card that contains:
- A title (e.g., "Distributed systems fundamentals")
- An EvidenceIndicator
- A "Reference your..." section that links to the user's projects (deep-link into the existing Project case-study view)
- A small action area ("Quick refresh", "View your projects")
- Optional "Be honest" note for gap areas

**ProjectReferenceCard** — a compact card representing one of the user's projects, with a title, one-line pitch, top 2-3 component links, and a "Open case study" CTA that deep-links to the existing Project page.

**ChecklistItem** — checkbox with label, used for "questions to ask the recruiter" patterns. Persisted per application.

**StoryCard** — a STAR-formatted story card with theme tags, used in Behavioural and Bar Raiser. Expandable, editable inline. Has a "Practice telling this" action that opens a rehearsal modal.

**TopicCard** — wrapper around EvidenceCard for technical topics with topic-specific actions (refresh, practice).

These primitives should live in a shared `stage-workspaces/components/` directory or wherever your frontend conventions place shared feature components.

---

### Stage 1: Applied (already implemented)

You are NOT rebuilding this. Confirm it exists, integrate the stage progress bar above it so the user can navigate to other stages from the Applied workspace, and ensure the workspace fits the new shell pattern. If the existing Applied view sets a precedent for the chrome (card layout, spacing), the other stages must match it.

### Stage 2: Phone Screen

Sections (in order):

1. **Schedule** — date/time of the call, recruiter name and title (if known), typical duration. Editable inline.
2. **Two-column block: "What to Expect" / "Your Talking Points"**
   - Left column: bullet list of typical phone screen content for this company/role (pulled from backend, includes generic + company-specific items if available)
   - Right column: the user's tailored talking points pulled from their KB and JD match
3. **Comp Conversation** — a card showing market range for the role/location, the user's saved target, and a suggested response template. Editable.
4. **Questions to Ask** — ChecklistItem list with 6-8 suggested questions. User checks the 2-3 they plan to ask. Includes "Add your own" affordance. Persists.
5. **After the Call** — note-taking input (free-form, auto-saves) and the "Mark complete and advance to Technical" button.

### Stage 3: Technical — Highest-Leverage Stage

This is the showcase stage. Take extra care with the visual polish.

Sections (in order):

1. **Schedule + format** — date/time, format breakdown (e.g., "30 min coding + 30 min systems discussion")
2. **Topics Likely to Come Up** — a stacked list of EvidenceCards. Each topic shows:
   - Topic name
   - EvidenceIndicator (strong / moderate / none)
   - "Evidence in your work" plain-text summary
   - "Reference your: [project names with deep links]" if evidence exists
   - For gap areas: "Be honest" guidance text suggesting how to address the gap gracefully
   - Action buttons: "Quick refresh" (opens a modal with concept summaries) and "View your projects" (deep-link)
3. **Your Project Reference Sheet** — a grid of ProjectReferenceCards (3-4 across on desktop, stacked on mobile). These are the projects the user is most likely to reference, ranked by relevance to the JD.
4. **Practice** — two CTAs: "Generate a practice question based on this role" and "Self-mock: time-boxed exercise". These trigger backend actions and open dedicated modals/views (modal scaffolding only for v1; full practice flow is a follow-on feature).
5. **After the round** — notes + advance button.

### Stage 4: System Design

Sections:

1. **Schedule + format**
2. **Common Question Patterns at $COMPANY** — bullet list pulled from backend (Glassdoor + LinkedIn signals where available)
3. **Your Own System Design Work** — EvidenceCard-style blocks per relevant project, surfacing the *tradeoffs the user actually made* in their work (pulled from ADRs / decision detection). Each tradeoff is a small badge: "RDS+pgvector over dedicated vector DB", "Sequential K8s jobs over Step Functions", etc. The user should recognize their own reasoning at a glance.
4. **Framework to Have Ready** — collapsed/expanded list of the 6-step system design interview framework. Each step expandable to show prompts the user can ask themselves to drive the discussion.
5. **After the round** — notes + advance.

### Stage 5: Behavioural

Sections:

1. **Schedule + format**
2. **Your Story Bank** — filter chips at the top (Conflict / Leadership / Failure / Ambiguity / Impact / Growth / Customer, plus All). Below, a list of StoryCards filtered by selected tag. Each card shows the STAR breakdown, can be edited inline, has a "Practice telling this" CTA.
3. **Add Story** — a CTA to create a new story from the user's portfolio (opens a guided creation flow — scaffolding only for v1; full flow is a follow-on).
4. **Typical Questions at $COMPANY** — a list of likely behavioral questions, each paired with the best-match story from the user's bank. If no match, show "Gap — consider drafting".
5. **After the round** — notes + advance.

### Stage 6: Bar Raiser

Amazon-specific (and similar at companies with leadership principles). Sections:

1. **Schedule + format**
2. **Company Values Matrix** — a grid of all relevant leadership principles. Each row shows the principle name, an EvidenceIndicator for story coverage (strong / moderate / none), and the count of stories tagged to it. Click a principle to filter the story bank to that tag.
3. **Principles Without Stories — Do You Have Evidence?** — for each red-indicator principle, a card showing commit excerpts or project signals that might map to that principle, with a "Draft a story from this evidence" CTA.
4. **After the round** — notes + advance.

### Stage 7: Final / Offer

Sections:

1. **The Offer** — a structured display of base, bonus, equity, signing, other. Fully editable inline. Auto-saves.
2. **Market Context** — a small chart or stat block showing 25th / median / 75th percentile for the role/location, and where this offer lands.
3. **Negotiation Leverage** — bullet list of factual leverage points the system has identified (portfolio depth, demonstrated skills above stated bar, etc.). Tone is direct, not breathless.
4. **Suggested Counter** — a small card with a proposed counter offer and a "See suggested message" CTA that opens a draft response (uses the existing message-compose pattern if one exists).
5. **Your Decision Factors** — slider or weighted-input UI for the user's priorities (Compensation, Tech stack, Growth, Team, Location, etc.). Calculates a personal-fit score that reflects the user's stated priorities against the offer.
6. **Decision actions** — `Accept`, `Counter`, `Decline`, `Request more time` buttons. Each opens a confirmation flow appropriate to the action.

---

## The Shell

Above all stage workspaces:

### Stage Progress Bar

A horizontal navigation strip. Each stage is a clickable segment. States:

- **Completed**: filled circle / checkmark, label, dimmer color
- **Current**: filled circle with primary color, prominent label, optional subtle motion glow (use existing Motion+ pattern if one exists)
- **Upcoming**: outlined circle, label dimmed
- **Skipped**: dotted outline (stages can be skipped depending on company process)

Animations on stage change: stage labels and the active indicator should transition smoothly. Reuse existing Motion+ stage-change variant if one exists; otherwise define one in the shared variants file and reuse for all similar transitions.

Mobile: progress bar becomes scrollable horizontally. The user can swipe through stages.

### Notes & Timeline Panel

Persistent across stages, anchored to the right side on desktop (collapsible), drawer on mobile.

Contents:

- **Timeline** at the top: chronological events for this application (applied date, stages advanced, interview dates, status changes). Reuse existing timeline component if it exists; otherwise minimal vertical list.
- **Notes** below: free-form notes the user has taken across all stages. Each note tagged with the stage it was taken in. Stage-specific notes flow into here automatically.
- **Quick add note** at the bottom: text input, auto-tags to the current stage.

The panel state (open/closed) is persisted per user, not per application.

---

## Constraints — What You Must Not Do

- **Do not introduce new colors, fonts, or spacing units.** Use only what is in the existing design tokens.
- **Do not invent new Motion+ animation patterns** outside what already exists in the codebase. If a needed motion pattern isn't there, define it once in the shared variants module and reuse it everywhere a similar transition occurs. No one-off motion code in stage workspace files.
- **Do not import a chat or conversation library.** This is not a chatbot. There are no "send message" inputs in the stage workspaces. The only free-text inputs are: notes (auto-save), counter-offer messages, story-card edits.
- **Do not build a generic "AI suggestions" surface** that just renders LLM output. Every recommendation card must be backed by structured backend data (evidence references, project links, specific topic IDs). The UI surfaces structured data, never raw LLM prose.
- **Do not duplicate the Resume Analysis or Job Applications list patterns.** Reuse their components — cards, badges, status indicators, list rows — wherever appropriate. Differences should be deliberate and noted in the discovery doc.
- **Do not introduce a new state management library.** Use whatever is already in the codebase.
- **Do not write loading spinners as the primary loading UI for stage content.** Stage content is pre-computed by the backend when the user enters a stage. Use skeleton loaders matching the final layout, not spinners.
- **Do not block stage advancement on having all sections filled.** The advance button is always enabled. Users may want to advance before completing prep.

---

## Backend Integration

You do not need to build the backend in this task. Stub the API endpoints with TypeScript interfaces and mock data that matches the expected response shape. The expected endpoints (confirm or refine names against existing API conventions during discovery):

- `GET /applications/:id` — already exists, returns application metadata
- `GET /applications/:id/stages` — returns the user's stage progress and per-stage prep data
- `GET /applications/:id/stages/:stage` — returns the full prep workspace data for a specific stage
- `POST /applications/:id/advance` — moves the application to the next stage
- `POST /applications/:id/notes` — adds a note to the application timeline
- `PATCH /applications/:id/stages/:stage` — updates stage-specific state (notes, checked items, story selections, etc.)

For each, define the TypeScript request and response types based on the workspace specs above. Place these in the existing types directory.

Build the frontend against the typed stub. Real backend work is a follow-on task.

---

## Component Reuse Inventory

Before creating any new component, check if a similar one already exists. The discovery doc should list the existing components you found. The following are *likely* reusable; confirm during discovery:

- `Card` / `Panel` for the workspace chrome
- `Badge` for tags (story themes, leadership principles, tradeoff badges)
- `ProgressIndicator` or `StatusPill` for stage states
- `Tabs` if the existing UI uses them anywhere — the stage progress bar may follow that pattern
- `Modal` / `Drawer` for practice question modals, story creation flow, counter-offer message draft
- `Timeline` if one exists for the notes panel
- `Slider` / `WeightInput` for the decision factors in Final stage
- Form inputs (text, textarea, date picker) — never build new ones; use existing
- `Button` variants — primary, secondary, ghost, destructive — use existing variants

If you find that an existing component is *almost* right but needs a small extension, extend it via composition or props, not by forking. Note the extension in the discovery doc.

---

## File Layout

Place new code following the existing convention. A likely structure:

```
src/features/applications/stages/
  workspaces/
    AppliedWorkspace.tsx          # already exists or extracted from existing detail view
    PhoneScreenWorkspace.tsx
    TechnicalWorkspace.tsx
    SystemDesignWorkspace.tsx
    BehaviouralWorkspace.tsx
    BarRaiserWorkspace.tsx
    FinalWorkspace.tsx
  components/
    StageProgressBar.tsx
    EvidenceIndicator.tsx
    EvidenceCard.tsx
    ProjectReferenceCard.tsx
    ChecklistItem.tsx
    StoryCard.tsx
    TopicCard.tsx
    NotesAndTimelinePanel.tsx
  hooks/
    useStageData.ts
    useStageAdvancement.ts
  types/
    stage.ts
  variants/
    motion.ts                     # shared Motion+ variants for stage transitions
  index.ts
```

Confirm and adjust this structure against the existing conventions during discovery. The principle is: feature-scoped folder with workspaces, shared components, hooks, types, and a motion-variants module.

---

## Testing

For v1:

- Component tests for each workspace using the existing test setup (Jest + React Testing Library, or whatever is in use). At minimum: renders without crashing, renders mock data correctly, fires the advance-stage callback on button click.
- Shared component tests for `EvidenceIndicator`, `EvidenceCard`, `StageProgressBar`, `StoryCard`. These get used everywhere, so they get more coverage than individual workspaces.
- Visual regression: if there is a Storybook or similar, add a story for each new component. If not, screenshots in the PR are acceptable.
- Accessibility: all interactive elements keyboard-navigable, all color-based signals (the EvidenceIndicator especially) have textual labels, all modals have proper focus trapping.

No backend integration tests — backend is stubbed for this task.

---

## Phasing — Ship in this order

Do not build all seven workspaces in one PR.

1. **PR 1: Shell + shared primitives.** Stage progress bar, notes/timeline panel, all shared components (EvidenceIndicator, EvidenceCard, etc.), updated routing, the discovery doc. Existing Applied workspace integrated into the new shell with no regressions. No new stage workspaces yet.

2. **PR 2: Technical workspace.** The highest-leverage stage. Full implementation including TopicCards with evidence indicators, ProjectReferenceCards grid, practice CTAs as stubs. This PR is the showcase — extra care on polish.

3. **PR 3: Phone Screen workspace.** Simpler implementation, validates the shell pattern works for less KB-dependent stages.

4. **PR 4: System Design workspace.** Includes the tradeoff-badge pattern for surfacing user's own architectural decisions.

5. **PR 5: Behavioural workspace.** Story bank UI, filter chips, story-creation flow as a stub.

6. **PR 6: Bar Raiser workspace.** Values matrix grid.

7. **PR 7: Final workspace.** Offer evaluation, market context, decision factors, action confirmations.

8. **PR 8: Polish and cleanup.** Address any deferred UX issues, fill in skeleton loaders, complete accessibility audit, remove stub-only artifacts.

Each PR is independently shippable behind the feature flag (use whatever feature-flag system already exists; if none, gate by user opt-in in settings for now).

---

## Acceptance criteria for the overall task

The work is complete when:

- All seven stages render correctly with mock data, matching the spec above
- Stage progress bar correctly reflects current stage and allows navigation between stages
- All shared components are reused appropriately (no duplicate cards, no inconsistent button variants)
- Visual identity matches the existing app — no new colors, no new fonts, dark mode works correctly across all new screens
- All Motion+ animations use either existing variants or new variants defined in the shared module
- TypeScript types for all stage data shapes are defined and used consistently
- Stubbed API endpoints have correct request/response types
- All interactive elements are keyboard-navigable
- The discovery doc has been produced and addresses all questions noted in step 3
- No regressions in the existing Resume Analysis, Job Applications list, or Application Detail Applied view

---

## Open Questions to Surface Before Implementation

Surface these in the discovery doc — do not guess:

1. What is the existing routing pattern for nested application views? Should each stage be a separate route (`/applications/:id/technical`) or a query param (`/applications/:id?stage=technical`)?
2. Where do existing Motion+ variants live? Is there a shared `motion-variants.ts` file or are they inline per component?
3. Is there a Tailwind Plus MCP/component library installed? If yes, what's the import path? If no, do we build components from scratch following existing patterns?
4. What's the existing pattern for feature flags? Should new stages be gated behind one?
5. Is there an existing Storybook? Should new components have stories?
6. Does the backend already have any of the suggested endpoints (`/stages`, `/advance`, `/notes`)? If yes, use those shapes. If no, document the new shapes for backend team.
7. Are there any existing components for "evidence indicators" or "competency signals" used elsewhere in the app (e.g., in Resume Analysis)? If yes, reuse instead of inventing EvidenceIndicator.
8. What's the localization strategy? Are strings in the new components localized like the rest of the app, or English-only for v1?

---

## Reference

The complete UX rationale for these stage workspaces is in the conversation history that produced this brief. The five-pillar design philosophy from Tucaken Signal (Authenticity, Readability, System Thinking, Production Reality, Stage Calibration) also informs these workspaces — particularly the evidence-grounding requirement in Technical and System Design, and the honesty positioning ("Be honest" guidance for gap areas).

This is not a chatbot. It's a structured workspace per stage. Every UI element should make the user's actual evidence more visible, more usable, more actionable at the moment they need it. When in doubt, ask "would this help the user 20 minutes before their interview?" If yes, ship it. If it's just decoration or impressive-looking AI output, cut it.