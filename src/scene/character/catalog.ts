export interface CharacterAsset {
  readonly presetId: string
  readonly label: string
  readonly url: string
  readonly farColor: string
  readonly primaryMaterial: string | null
  readonly secondaryMaterial: string | null
}

const ASSET_ROOT = '/characters/quaternius-v01/'

/** Preset order is also the stable body-0..9 order of the population catalog. */
export const CHARACTER_ASSETS: readonly CharacterAsset[] = Object.freeze([
  { presetId: 'character-0', label: 'Casual 2', url: `${ASSET_ROOT}men-casual2.glb`, farColor: '#907d72', primaryMaterial: 'LightBrown', secondaryMaterial: 'LightBlue' },
  { presetId: 'character-1', label: 'Hoodie', url: `${ASSET_ROOT}men-hoodie.glb`, farColor: '#686078', primaryMaterial: 'Purple', secondaryMaterial: 'LightBlue' },
  { presetId: 'character-2', label: 'Punk', url: `${ASSET_ROOT}men-punk.glb`, farColor: '#a5a8a5', primaryMaterial: 'White', secondaryMaterial: 'LightBlue' },
  { presetId: 'character-3', label: 'Suit', url: `${ASSET_ROOT}men-suit.glb`, farColor: '#596578', primaryMaterial: 'Suit', secondaryMaterial: 'Tie' },
  { presetId: 'character-4', label: 'Worker', url: `${ASSET_ROOT}men-worker.glb`, farColor: '#b29665', primaryMaterial: 'Worker_Vest', secondaryMaterial: 'Brown' },
  { presetId: 'character-5', label: 'Casual', url: `${ASSET_ROOT}women-casual.glb`, farColor: '#adb1ac', primaryMaterial: 'White', secondaryMaterial: 'Orange' },
  { presetId: 'character-6', label: 'Formal', url: `${ASSET_ROOT}women-formal.glb`, farColor: '#83977e', primaryMaterial: 'LimeGreen', secondaryMaterial: 'Gold' },
  // Both dominant colors in the Punk model also touch its head, so this preset stays authored.
  { presetId: 'character-7', label: 'Punk', url: `${ASSET_ROOT}women-punk.glb`, farColor: '#a3778e', primaryMaterial: null, secondaryMaterial: null },
  { presetId: 'character-8', label: 'Suit', url: `${ASSET_ROOT}women-suit.glb`, farColor: '#5a5f69', primaryMaterial: 'Black', secondaryMaterial: 'White' },
  { presetId: 'character-9', label: 'Worker', url: `${ASSET_ROOT}women-worker.glb`, farColor: '#ae9268', primaryMaterial: 'Worker_Vest', secondaryMaterial: 'Brown2' },
])

export const CHARACTER_ASSET_BY_ID = new Map(CHARACTER_ASSETS.map((asset) => [asset.presetId, asset]))
