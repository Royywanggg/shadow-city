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
  const sorted = [...candidates].sort((a, b) =>
    Number(b.selected) - Number(a.selected) || b.pixelHeight - a.pixelHeight || a.id.localeCompare(b.id))
  const assigned = new Map<string, CharacterTier>()
  let close = 0
  let medium = 0
  for (const candidate of sorted) {
    const preferred = preferredCharacterTier(candidate.pixelHeight, candidate.selected, candidate.previous)
    if (preferred === 'close' && close < MAX_CLOSE_CHARACTERS) {
      assigned.set(candidate.id, 'close')
      close += 1
    } else if (preferred !== 'far' && medium < MAX_MEDIUM_CHARACTERS) {
      assigned.set(candidate.id, 'medium')
      medium += 1
    } else {
      assigned.set(candidate.id, 'far')
    }
  }
  return assigned
}
