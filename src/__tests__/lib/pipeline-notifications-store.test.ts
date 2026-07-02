import { beforeEach, describe, expect, it } from 'vitest'
import { usePipelineNotificationsStore } from '@/lib/stores/pipeline-notifications-store'

const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function reset() {
  usePipelineNotificationsStore.setState({ notifications: [], currentUserId: null })
}

function addArticle(slug: string) {
  usePipelineNotificationsStore.getState().addNotification({
    type: 'article',
    slug,
    label: slug,
    status: 'running',
    link: `/ai-agent?mode=pipeline&slug=${slug}`,
  })
}

describe('pipeline notifications store — user scoping', () => {
  beforeEach(reset)

  it('stamps new notifications with the current user id', () => {
    usePipelineNotificationsStore.getState().setCurrentUser(USER_A)
    addArticle('article-1')
    const [n] = usePipelineNotificationsStore.getState().notifications
    expect(n?.userId).toBe(USER_A)
  })

  it('drops another user\'s notifications when the account switches', () => {
    // User A creates a notification.
    usePipelineNotificationsStore.getState().setCurrentUser(USER_A)
    addArticle('article-from-a')
    expect(usePipelineNotificationsStore.getState().notifications).toHaveLength(1)

    // Switch to user B on the same browser — A's entry must not carry over.
    usePipelineNotificationsStore.getState().setCurrentUser(USER_B)
    expect(usePipelineNotificationsStore.getState().notifications).toHaveLength(0)
  })

  it('clears all notifications on sign-out (setCurrentUser(null))', () => {
    usePipelineNotificationsStore.getState().setCurrentUser(USER_A)
    addArticle('article-1')
    usePipelineNotificationsStore.getState().setCurrentUser(null)
    expect(usePipelineNotificationsStore.getState().notifications).toHaveLength(0)
  })

  it('does not re-surface a legacy (unstamped) notification once a user is set', () => {
    // Simulate a pre-scoping persisted entry with no userId.
    usePipelineNotificationsStore.setState({
      currentUserId: null,
      notifications: [{
        id: 'legacy-1', type: 'article', slug: 'legacy', label: 'legacy',
        status: 'running', link: '/x', createdAt: 1, read: false,
      }],
    })
    usePipelineNotificationsStore.getState().setCurrentUser(USER_A)
    expect(usePipelineNotificationsStore.getState().notifications).toHaveLength(0)
  })

  it('keeps each user seeing only their own entry across a switch back', () => {
    usePipelineNotificationsStore.getState().setCurrentUser(USER_A)
    addArticle('a-1')
    usePipelineNotificationsStore.getState().setCurrentUser(USER_B)
    addArticle('b-1')
    const notifs = usePipelineNotificationsStore.getState().notifications
    expect(notifs).toHaveLength(1)
    expect(notifs[0]?.slug).toBe('b-1')
    expect(notifs[0]?.userId).toBe(USER_B)
  })
})
