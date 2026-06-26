// Home "Frequently asked" data, sourced from the repository-level faq.json
// (single source of truth). Only items marked `status: "published"` are shown
// on the public page; `needs_confirmation` items (e.g. unconfirmed prices) are
// filtered out. Categories with no published items are dropped.
import faqData from '../../../../faq.json'

export interface FaqItem {
  readonly id: string
  readonly question: string
  readonly answer: string
}

export interface FaqCategory {
  readonly id: string
  readonly title: string
  readonly items: readonly FaqItem[]
}

const PUBLISHED = 'published'

export const faqCategories: readonly FaqCategory[] = faqData.categories
  .map((c) => ({
    id: c.id,
    title: c.title,
    items: c.items
      .filter((i) => i.status === PUBLISHED)
      .map((i) => ({ id: i.id, question: i.question, answer: i.answer })),
  }))
  .filter((c) => c.items.length > 0)
