export type CharacterTier = 'far' | 'medium' | 'close'

export const MAX_CLOSE_CHARACTERS = 10
export const MAX_MEDIUM_CHARACTERS = 24

/** Pixel thresholds have hysteresis so camera damping does not rapidly swap models. */
export function preferredCharacterTier(pixelHeight: number, selected: boolean, previous: CharacterTier = 'far'): CharacterTier {
  if (selected) return 'close'
  if (pixelHeight >= (previous === 'close' ? 15 : 19)) return 'close'
  if (pixelHeight >= (previous === 'medium' ? 6 : 8)) return 'medium'
  return 'far'
}

export interface CharacterTierCandidate {
  readonly id: string
  readonly pixelHeight: number
  readonly selected: boolean
  readonly previous: CharacterTier
}

export function allocateCharacterTiers(candidates: readonly CharacterTierCandidate[]): ReadonlyMap<string, CharacterTier> {
  const assigned = new Map<string, CharacterTier>(candidates.map(({ id }) => [id, 'far']))
  const priority = (candidate: CharacterTierCandidate, tier: 'close' | 'medium') =>
    candidate.pixelHeight + (candidate.previous === tier ? 3 : 0)
  const sortedFor = (tier: 'close' | 'medium') => [...candidates].sort((a, b) =>
    Number(b.selected) - Number(a.selected) || priority(b, tier) - priority(a, tier) || a.id.localeCompare(b.id))

  let close = 0
  for (const candidate of sortedFor('close')) {
    if (close === MAX_CLOSE_CHARACTERS) break
    if (preferredCharacterTier(candidate.pixelHeight, candidate.selected, candidate.previous) !== 'close') continue
    assigned.set(candidate.id, 'close')
    close += 1
  }

  let medium = 0
  for (const candidate of sortedFor('medium')) {
    if (medium === MAX_MEDIUM_CHARACTERS) break
    if (assigned.get(candidate.id) === 'close') continue
    if (preferredCharacterTier(candidate.pixelHeight, candidate.selected, candidate.previous) === 'far') continue
    assigned.set(candidate.id, 'medium')
    medium += 1
  }
  return assigned
}
