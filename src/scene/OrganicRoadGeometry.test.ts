import { describe, expect, it } from 'vitest'
import { generateOrganicWorld } from '../world/generation/generateOrganicWorld'
import { getTerrainHeight } from '../world/terrain/terrainV1'
import { createOrganicRoadSurface } from './OrganicRoadGeometry'

describe('organic road mesh', () => {
  it('rests both edges of a hillside road on the authoritative terrain', () => {
    const world = generateOrganicWorld()
    const geometry = createOrganicRoadSurface(world, 'arterial', 0, 35)
    const position = geometry.getAttribute('position')
    const firstRoad = world.roadEdges[0]
    for (let index = 0; index < (firstRoad.path!.length - 2) * 2; index += 1) {
      const x = position.getX(index) * 1000
      const y = position.getY(index) * 1000
      const z = position.getZ(index) * 1000
      expect(Math.abs(y - getTerrainHeight(world.terrain!, x, z) - 110))
        .toBeLessThan(1)
    }
    geometry.dispose()
  })
})
