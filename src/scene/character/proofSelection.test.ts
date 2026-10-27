import { describe, expect, it } from 'vitest'
import { selectCharacterProofIds } from './proofSelection'

describe('animation proof sample', () => {
  it('selects one stable existing resident per supported preset', () => {
    const identities = new Map([
      ['citizen-3', { appearance: { presetId: 'character-0' } }],
      ['citizen-1', { appearance: { presetId: 'character-0' } }],
      ['citizen-2', { appearance: { presetId: 'character-3' } }],
      ['citizen-4', { appearance: { presetId: 'character-5' } }],
      ['citizen-5', { appearance: { presetId: 'character-9' } }],
      ['citizen-6', { appearance: { presetId: 'character-2' } }],
    ])
    expect([...selectCharacterProofIds(identities)]).toEqual([
      'citizen-1', 'citizen-2', 'citizen-4', 'citizen-5',
    ])
  })
})
