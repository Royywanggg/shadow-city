import { describe, expect, it } from 'vitest'
import { HERO_SEED } from '../../city/generation/generateCity'
import { worldFingerprintV5 } from '../../simulation/engineV5'
import { DEFAULT_SIMULATION_CONFIG_V5 } from '../../simulation/v5Types'
import { generateDevWorld } from './generateDevWorld'
import { generateIntegratedWorld } from './generateIntegratedWorld'

describe('isolated Twilight development world', () => {
  it('starts with the same integrated map and a distinct replay identity', () => {
    const main = generateIntegratedWorld(HERO_SEED)
    const dev = generateDevWorld(HERO_SEED)
    expect(dev.baseCity).toEqual(main.baseCity)
    expect(dev.roadNodes).toEqual(main.roadNodes)
    expect(dev.roadEdges).toEqual(main.roadEdges)
    expect(dev.surfaces).toEqual(main.surfaces)
    expect(dev.navNodes).toEqual(main.navNodes)
    expect(dev.navEdges).toEqual(main.navEdges)
    expect(dev.boxes).toEqual(main.boxes)
    expect(dev.config.seed).toBe(main.config.seed)
    expect(dev.config.generatorVersion).toBe('twilight-dev-v1')
    expect(main.config.generatorVersion).toBe('heritage-extension-v6')
    expect(worldFingerprintV5(dev, DEFAULT_SIMULATION_CONFIG_V5))
      .not.toBe(worldFingerprintV5(main, DEFAULT_SIMULATION_CONFIG_V5))
  })

  it('is deterministic and never mutates the integrated world', () => {
    const first = generateDevWorld(HERO_SEED)
    const second = generateDevWorld(HERO_SEED)
    expect(second).toEqual(first)
    expect(generateIntegratedWorld(HERO_SEED).config.generatorVersion)
      .toBe('heritage-extension-v6')
  })
})
