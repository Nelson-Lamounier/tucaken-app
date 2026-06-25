/** @format */
import { jest } from '@jest/globals'
import { updateApplicationCoverLetter } from './applications.js'

describe('updateApplicationCoverLetter', () => {
  it('writes the override JSON to cover_letter_override by id', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] })
    const cl = { greeting: 'Hi', paragraphs: ['p'], signoff: { name: 'N', email: '', linkedin: '', github: '' } }
    await updateApplicationCoverLetter({ query } as unknown as import('../pg.js').Queryable, 'app-1', cl)
    expect(query).toHaveBeenCalledTimes(1)
    const [sql, params] = query.mock.calls[0] as [string, string[]]
    expect(sql).toContain('cover_letter_override')
    expect(sql).toContain('$2::jsonb')
    expect(params[0]).toBe('app-1')
    expect(params[1]).toBe(JSON.stringify(cl))
  })
})
