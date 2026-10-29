import { describe, expect, it } from 'vitest'
import { createEscarpmentFaceGeometry } from '../../scene/terrain/TerrainEscarpment'
import { HERO_SEED } from '../../city/generation/generateCity'
import { deriveDevRidgeRoad } from '../generation/devRidgeRoad'
import { generateDevWorld } from '../generation/generateDevWorld'
import { generateIntegratedWorld } from '../generation/generateIntegratedWorld'
import { createDevTerrainV1, DEV_ESCARPMENT_BLOCK_IDS, DEV_OPEN_CHANNEL_BLOCK_IDS,
  channelCenterXAtMm, escarpmentZBoundsAtMm, heightAtMm } from './devTerrain'

function ridgeTerrain(seed = HERO_SEED) {
  const world = generateIntegratedWorld(seed, { openChannelBlockIds:
    [...DEV_OPEN_CHANNEL_BLOCK_IDS, ...DEV_ESCARPMENT_BLOCK_IDS] })
  const city = world.baseCity!
  return deriveDevRidgeRoad(city, createDevTerrainV1(city, seed)).terrain
}

describe('curved dev escarpment', () => {
  it('uses the same curved contour for terrain, blocked space and rock faces', () => {
    const terrain = ridgeTerrain()
    const patches = terrain.nonWalkableEscarpment.patches
    expect(patches).toHaveLength(3)
    const frontHeights = patches.flatMap((patch) => patch.frontLine.map((point) => point.z))
    expect(Math.max(...frontHeights) - Math.min(...frontHeights)).toBeGreaterThan(2_000)
    for (const patch of patches) {
      expect(patch.polygonXZ).toEqual([...patch.backLine,
        ...[...patch.frontLine].reverse()])
      expect(patch.frontLine.length).toBeGreaterThan(6)
      expect(patch.frontLine.every((point, index) => index === 0 ||
        point.x > patch.frontLine[index - 1].x)).toBe(true)
      const x = Math.round((patch.frontLine[0].x + patch.frontLine.at(-1)!.x) / 2)
      const { backZ, frontZ } = escarpmentZBoundsAtMm(patch, x)
      expect(frontZ - backZ).toBeGreaterThan(20_000)
      const terraceZ = Math.round((backZ + frontZ) / 2)
      const terraceMiddle = heightAtMm(terrain, x, terraceZ)
      expect(Math.abs(heightAtMm(terrain, x - 2_000, terraceZ) - terraceMiddle))
        .toBeLessThan(2_000)
      expect(Math.abs(heightAtMm(terrain, x + 2_000, terraceZ) - terraceMiddle))
        .toBeLessThan(2_000)
      expect(heightAtMm(terrain, x, Math.round(frontZ - 5_100)) -
        heightAtMm(terrain, x, Math.round(frontZ))).toBeGreaterThan(4_000)
    }
    const geometry = createEscarpmentFaceGeometry(terrain)
    const vertices = geometry.getAttribute('position')
    expect(vertices.count).toBeGreaterThan(60)
    for (let index = 0; index < vertices.count; index += 1) {
      const x = Math.round(vertices.getX(index) * 1000)
      const z = Math.round(vertices.getZ(index) * 1000)
      expect(vertices.getY(index)).toBeCloseTo(heightAtMm(terrain, x, z) / 1000 + 0.08, 2)
    }
    geometry.dispose()
  })

  it('keeps every road centreline outside the curved impassable patches', () => {
    const terrain = ridgeTerrain()
    for (const profile of terrain.roadProfiles) for (const point of profile.path) {
      for (const patch of terrain.nonWalkableEscarpment.patches) {
        if (point.x < patch.frontLine[0].x || point.x > patch.frontLine.at(-1)!.x) continue
        const { backZ, frontZ } = escarpmentZBoundsAtMm(patch, point.x)
        expect(point.z < backZ || point.z > frontZ).toBe(true)
      }
    }
  })

  it('starts the full-depth water upstream of both bridge decks without cutting the avenue', () => {
    for (const seed of [HERO_SEED, 'twilight-alt-01', 'twilight-alt-02']) {
      const world = generateDevWorld(seed)
      const terrain = world.terrain!
      const city = world.baseCity!
      const inlet = terrain.channel.centerline[0]
      const openBlock = city.blocks.find((block) => block.id === 'block-0-4')!
      const avenue = city.roads.edges.find((edge) => edge.id === 'edge-x-0-4')!
      const avenueNode = city.roads.nodes.find((node) => node.id === avenue.from)!
      expect(inlet.z).toBeGreaterThanOrEqual(Math.round(
        (openBlock.z - openBlock.depth / 2) * 1000))
      expect(inlet.z - Math.round((avenueNode.z + avenue.width / 2) * 1000))
        .toBeGreaterThanOrEqual(1_500)
      expect(terrain.channel.fullDepthZmm - inlet.z).toBe(7_000)
      for (const [id, halfWidthMm] of [['edge-x-0-5', 2_250],
        ['edge-x-0-6', 2_750]] as const) {
        const bridge = terrain.roadProfiles.find((profile) => profile.edgeId === id)!
        const deck = bridge.path[Math.floor(bridge.path.length / 2)]
        const channelX = channelCenterXAtMm(terrain, deck.z)
        const bedMm = heightAtMm(terrain, channelX, deck.z)
        const waterYmm = -terrain.channel.depthMm + 380
        expect(waterYmm - bedMm).toBeGreaterThan(250)
        expect(waterYmm - bedMm).toBeLessThan(800)
        expect(deck.y - waterYmm).toBeGreaterThan(5_000)
        expect(deck.z - halfWidthMm - terrain.channel.fullDepthZmm)
          .toBeGreaterThan(5_000)
      }
      const grade = (a: { x: number; y: number; z: number },
        b: { x: number; y: number; z: number }) =>
        Math.abs(b.y - a.y) / Math.max(1, Math.hypot(b.x - a.x, b.z - a.z))
      for (const profile of terrain.roadProfiles) for (let step = 1;
        step < profile.path.length; step += 1) {
        expect(grade(profile.path[step - 1], profile.path[step])).toBeLessThanOrEqual(0.1)
      }
      for (const edge of world.navEdges.filter((item) => item.surfaceId === 'ground')) {
        for (let step = 1; step < edge.path.length; step += 1) {
          expect(grade(edge.path[step - 1], edge.path[step])).toBeLessThanOrEqual(0.12)
        }
      }
    }
  })
})
