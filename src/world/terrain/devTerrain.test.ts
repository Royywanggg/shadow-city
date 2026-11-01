import { describe, expect, it } from 'vitest'
import { createEscarpmentFaceGeometry } from '../../scene/terrain/TerrainEscarpment'
import { HERO_SEED } from '../../city/generation/generateCity'
import { generateDevWorld } from '../generation/generateDevWorld'
import { DEV_UPPER_CONTOUR_ROAD_EDGE_ID, DEV_UPPER_ROAD_EDGE_ID } from
  '../generation/devUpperRoadPlan'
import { channelCenterXAtMm, channelWidthsAtMm,
  escarpmentZBoundsAtMm, heightAtMm } from './devTerrain'

function ridgeTerrain(seed = HERO_SEED) {
  return generateDevWorld(seed).terrain!
}

describe('curved dev escarpment', () => {
  it('widens only the middle valley while keeping both road banks clear', () => {
    for (const seed of [HERO_SEED, 'twilight-alt-01', 'twilight-alt-02']) {
      const world = generateDevWorld(seed)
      const terrain = world.terrain!
      expect(terrain.channel.widthProfile.map((sample) => sample.zMm))
        .toEqual([33_000, 50_000, 65_000, 76_000, 88_000,
          96_000, 100_000, 108_000, 150_000])
      expect(channelWidthsAtMm(terrain, 50_000))
        .toEqual({ halfWidthMm: 3_800, bankWidthMm: 5_200 })
      expect(channelWidthsAtMm(terrain, 70_000))
        .toEqual({ halfWidthMm: 6_800, bankWidthMm: 7_200 })
      expect(channelWidthsAtMm(terrain, 98_000))
        .toEqual({ halfWidthMm: 3_800, bankWidthMm: 2_500 })
      expect(channelWidthsAtMm(terrain, 108_000))
        .toEqual({ halfWidthMm: 3_800, bankWidthMm: 5_200 })
      const roadXAtZ = (column: 0 | 1, zMm: number): number => {
        const path = terrain.roadProfiles.filter((profile) =>
          ['4', '5', '6'].some((row) =>
            profile.edgeId === `edge-z-${column}-${row}`))
          .flatMap((profile) => profile.path)
        const afterIndex = path.findIndex((point) => point.z >= zMm)
        const before = path[afterIndex - 1]
        const after = path[afterIndex]
        const t = (zMm - before.z) / (after.z - before.z)
        return before.x + (after.x - before.x) * t
      }
      for (let zMm = 50_000; zMm <= 100_000; zMm += 1_000) {
        const centerX = channelCenterXAtMm(terrain, zMm)
        const widths = channelWidthsAtMm(terrain, zMm)
        const ravineEdgeMm = widths.halfWidthMm + widths.bankWidthMm
        for (const column of [0, 1] as const) {
          const bankRoadX = roadXAtZ(column, zMm)
          const roadClearanceMm = Math.abs(bankRoadX - centerX) - ravineEdgeMm
          expect(roadClearanceMm, `${seed}: bank ${column} at ${zMm} mm`)
            .toBeGreaterThan(5_000)
        }
      }
    }
  })

  it('uses the same curved contour for terrain, blocked space and rock faces', () => {
    const terrain = ridgeTerrain()
    const patches = terrain.nonWalkableEscarpment.patches
    expect(patches).toHaveLength(1)
    expect(patches[0].frontLine.at(-1)!.x - patches[0].frontLine[0].x)
      .toBeGreaterThan(105_000)
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
      expect(heightAtMm(terrain, x, Math.round(frontZ - 2_500)) -
        heightAtMm(terrain, x, Math.round(frontZ))).toBeLessThan(3_000)
      expect(heightAtMm(terrain, x, Math.round(frontZ - 9_000)) -
        heightAtMm(terrain, x, Math.round(frontZ))).toBeGreaterThan(6_000)
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

  it('keeps ground roads outside the cliff and carries the upper road across it', () => {
    const world = generateDevWorld(HERO_SEED)
    const terrain = world.terrain!
    const roadWidths = new Map(world.baseCity!.roads.edges.map((edge) =>
      [edge.id, edge.width]))
    for (const profile of terrain.roadProfiles.filter((item) =>
      item.edgeId !== DEV_UPPER_ROAD_EDGE_ID &&
      item.edgeId !== DEV_UPPER_CONTOUR_ROAD_EDGE_ID)) for (const point of profile.path) {
      for (const patch of terrain.nonWalkableEscarpment.patches) {
        if (point.x < patch.frontLine[0].x || point.x > patch.frontLine.at(-1)!.x) continue
        const { backZ, frontZ } = escarpmentZBoundsAtMm(patch, point.x)
        const pavementClearanceMm = ((roadWidths.get(profile.edgeId) ?? 0) / 2 +
          1.675 + 0.25) * 1000
        expect(point.z < backZ - pavementClearanceMm ||
          point.z > frontZ + pavementClearanceMm,
        `${profile.edgeId} at ${point.x},${point.z} inside ${backZ},${frontZ}`)
          .toBe(true)
      }
    }
    const upper = terrain.roadProfiles.find((item) =>
      item.edgeId === DEV_UPPER_ROAD_EDGE_ID)!
    const contour = terrain.roadProfiles.find((item) =>
      item.edgeId === DEV_UPPER_CONTOUR_ROAD_EDGE_ID)!
    expect(contour.bridge).toBe(false)
    for (const point of contour.path) {
      const { backZ, frontZ } = escarpmentZBoundsAtMm(
        terrain.nonWalkableEscarpment.patches[0], point.x)
      expect(point.z - backZ).toBeGreaterThan(2_000)
      expect(frontZ - point.z).toBeGreaterThan(4_000)
    }
    expect(upper.bridgeSpan).toEqual({ startIndex: 0,
      endIndex: upper.path.length - 1 })
    const clearance = upper.path.map((point) => point.y -
      heightAtMm(terrain, point.x, point.z))
    expect(Math.min(...clearance)).toBeGreaterThan(0)
    expect(Math.max(...clearance)).toBeGreaterThan(2_000)
    expect(upper.path.some((point) => terrain.nonWalkableEscarpment.patches
      .some((patch) => {
        if (point.x < patch.frontLine[0].x ||
          point.x > patch.frontLine.at(-1)!.x) return false
        const { backZ, frontZ } = escarpmentZBoundsAtMm(patch, point.x)
        return point.z > backZ && point.z < frontZ
      }))).toBe(true)
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
