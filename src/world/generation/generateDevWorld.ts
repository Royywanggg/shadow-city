import { HERO_SEED } from '../../city/generation/generateCity'
import type { WorldModelV2 } from '../model'
import { generateIntegratedWorld } from './generateIntegratedWorld'

/** Isolated world branch for terrain look development; starts from the integrated city. */
export function generateDevWorld(seed = HERO_SEED): WorldModelV2 {
  const integrated = generateIntegratedWorld(seed)
  return {
    ...integrated,
    config: { ...integrated.config, generatorVersion: 'twilight-dev-v1' },
  }
}
