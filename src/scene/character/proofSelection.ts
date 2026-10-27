/** Stable one-resident-per-preset sample for the opt-in animation proof. */
export function selectCharacterProofIds(identities: ReadonlyMap<string,
  { readonly appearance: { readonly presetId: string } }>): ReadonlySet<string> {
  const selected = new Set<string>()
  for (const presetId of ['character-0', 'character-3', 'character-5', 'character-9']) {
    const id = [...identities.keys()].sort().find((candidate) =>
      identities.get(candidate)?.appearance.presetId === presetId)
    if (id) selected.add(id)
  }
  return selected
}
