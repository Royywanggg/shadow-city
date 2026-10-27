import { CHARACTER_ASSETS } from './catalog'

/** Stable one-resident-per-preset sample for browser review. */
export function selectCharacterReviewIds(identities: ReadonlyMap<string,
  { readonly appearance: { readonly presetId: string } }>): ReadonlySet<string> {
  const selected = new Set<string>()
  for (const { presetId } of CHARACTER_ASSETS) {
    const id = [...identities.keys()].sort().find((candidate) =>
      identities.get(candidate)?.appearance.presetId === presetId)
    if (id) selected.add(id)
  }
  return selected
}
