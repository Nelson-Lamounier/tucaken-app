/** @format */
import { describe, it, expect } from '@jest/globals'
import { rowToArticle } from './articles.js'

describe('rowToArticle destinations', () => {
  it('maps destinations, defaulting to portfolio when null', () => {
    expect(rowToArticle({ destinations: ['portfolio', 'tucaken'] }).destinations)
      .toEqual(['portfolio', 'tucaken'])
    expect(rowToArticle({ destinations: null }).destinations).toEqual(['portfolio'])
  })
})
