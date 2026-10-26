import { describe, expect, it } from 'vitest'
import { allocateCharacterTiers, MAX_CLOSE_CHARACTERS, MAX_MEDIUM_CHARACTERS, preferredCharacterTier } from './lod'

describe('character level of detail', () => {
  it('keeps a selected citizen in the close pool and bounds full models under a large crowd', () => {
    const candidates = Array.from({ length: 1000 }, (_, index) => ({
      id: `citizen-${String(index).padStart(4, '0')}`,
      pixelHeight: 25,
      selected: index === 999,
      previous: 'far' as const,
    }))
    const tiers = allocateCharacterTiers(candidates)
    expect(tiers.get('citizen-0999')).toBe('close')
    expect([...tiers.values()].filter((tier) => tier === 'close')).toHaveLength(MAX_CLOSE_CHARACTERS)
    expect([...tiers.values()].filter((tier) => tier === 'medium')).toHaveLength(MAX_MEDIUM_CHARACTERS)
  })

  it('holds a previous tier near a threshold to avoid camera-damping flicker', () => {
    expect(preferredCharacterTier(17, false, 'close')).toBe('close')
    expect(preferredCharacterTier(17, false, 'far')).toBe('medium')
    expect(preferredCharacterTier(7, false, 'medium')).toBe('medium')
    expect(preferredCharacterTier(7, false, 'far')).toBe('far')
  })
})
