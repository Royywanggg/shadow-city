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

  it('keeps incumbents when two residents exchange a small screen-size lead at pool capacity', () => {
    const candidates = Array.from({ length: MAX_MEDIUM_CHARACTERS + 1 }, (_, index) => ({
      id: `citizen-${index}`,
      pixelHeight: index === MAX_MEDIUM_CHARACTERS ? 9.1 : 9,
      selected: false,
      previous: index === MAX_MEDIUM_CHARACTERS ? 'far' as const : 'medium' as const,
    }))
    const first = allocateCharacterTiers(candidates)
    expect(first.get('citizen-0')).toBe('medium')
    expect(first.get(`citizen-${MAX_MEDIUM_CHARACTERS}`)).toBe('far')
    const second = allocateCharacterTiers(candidates.map((candidate) => ({
      ...candidate,
      previous: first.get(candidate.id)!,
      pixelHeight: candidate.id === `citizen-${MAX_MEDIUM_CHARACTERS}` ? 9.2 : 9,
    })))
    expect(second.get('citizen-0')).toBe('medium')
    expect(second.get(`citizen-${MAX_MEDIUM_CHARACTERS}`)).toBe('far')
  })

  it('allows a substantially larger newcomer to displace an incumbent', () => {
    const candidates = Array.from({ length: MAX_CLOSE_CHARACTERS + 1 }, (_, index) => ({
      id: `citizen-${index}`,
      pixelHeight: index === MAX_CLOSE_CHARACTERS ? 28 : 20,
      selected: false,
      previous: index === MAX_CLOSE_CHARACTERS ? 'far' as const : 'close' as const,
    }))
    const tiers = allocateCharacterTiers(candidates)
    expect(tiers.get(`citizen-${MAX_CLOSE_CHARACTERS}`)).toBe('close')
    expect([...tiers.values()].filter((tier) => tier === 'close')).toHaveLength(MAX_CLOSE_CHARACTERS)
  })
})
