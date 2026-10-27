import { describe, expect, it } from 'vitest'
import { selectCharacterReviewIds } from './reviewSelection'

describe('character review sample', () => {
  it('selects one stable existing resident per supported preset', () => {
    const identities = new Map([
      ['citizen-3', { appearance: { presetId: 'character-0' } }],
      ['citizen-1', { appearance: { presetId: 'character-0' } }],
      ['citizen-2', { appearance: { presetId: 'character-3' } }],
      ['citizen-4', { appearance: { presetId: 'character-5' } }],
      ['citizen-5', { appearance: { presetId: 'character-9' } }],
      ['citizen-6', { appearance: { presetId: 'character-2' } }],
    ])
    expect([...selectCharacterReviewIds(identities)]).toEqual([
      'citizen-1', 'citizen-6', 'citizen-2', 'citizen-4', 'citizen-5',
    ])
  })
})
