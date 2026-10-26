import { describe, expect, it } from 'vitest'
import type { GroundPointMm, WalkableSurface, WorldModelV2, WorldPointMm } from '../../world/model'
import { hasClearSurfaceSegment, querySpatialCandidates } from './spatial'
import type { EncounterTracePoint } from './spatialTypes'

const rect = (x1: number, x2: number, z1: number, z2: number): GroundPointMm[] => [
  { x: x1, z: z1 }, { x: x2, z: z1 }, { x: x2, z: z2 }, { x: x1, z: z2 },
]
const surface = (id: string, elevationMm: number, polygonXZ: GroundPointMm[],
  blockedPolygonsXZ: GroundPointMm[][] = []): WalkableSurface => ({ id,
  levelId: elevationMm ? 'L1' : 'L0', placeId: id, interactionZoneId: id,
  elevationMm, polygonXZ, blockedPolygonsXZ, clearanceMm: 20_000, indoor: false })
const p = (x: number, y = 0, z = 0): WorldPointMm => ({ x, y, z })
const trace = (agentId: string, position: WorldPointMm, surfaceId = 'ground', second = 1):
  EncounterTracePoint => ({ agentId, position, surfaceId, placeId: surfaceId,
    second, edgeId: null })

function world(): WorldModelV2 {
  return { version: 2, config: { version: 2, seed: 'test', extentMm: 20_000,
    generatorVersion: 'district-world-v1' },
  bounds: { minX: -10_000, maxX: 20_000, minZ: -10_000, maxZ: 10_000, maxY: 10_000 },
  districts: [], roadNodes: [], roadEdges: [],
  surfaces: [surface('ground', 0, rect(-10_000, 9_500, -10_000, 10_000),
    [rect(-500, 500, -1_000, 1_000)]),
  surface('upper', 5_500, rect(-10_000, 10_000, -10_000, 10_000)),
  surface('other', 0, rect(-10_000, 10_000, -10_000, 10_000)),
  surface('shop', 0, rect(10_500, 20_000, -10_000, 10_000)),
  surface('connector:stair', 0, rect(7_600, 8_400, -500, 500))],
  navNodes: [
    { id: 'ground-door', position: p(9_000), surfaceId: 'ground' },
    { id: 'shop-door', position: p(11_000), surfaceId: 'shop' },
    { id: 'ground-stair', position: p(8_000), surfaceId: 'ground' },
    { id: 'upper-stair', position: p(8_000, 5_500), surfaceId: 'upper' },
  ],
  navEdges: [
    { id: 'door', fromNodeId: 'ground-door', toNodeId: 'shop-door',
      path: [p(9_000), p(11_000)], surfaceId: null, connectorId: null,
      kind: 'portal', lengthMm: 2_000, accessId: 'shop-door', direction: 'both' },
    { id: 'stairs', fromNodeId: 'ground-stair', toNodeId: 'upper-stair',
      path: [p(8_000), p(8_000, 5_500)], surfaceId: null, connectorId: 'stair',
      kind: 'stair', lengthMm: 5_500, accessId: null, direction: 'both' },
  ], connectors: [{ id: 'stair', kind: 'stair', lowerSurfaceId: 'ground',
    upperSurfaceId: 'upper', edgeIds: ['stairs'], capacity: 8 }],
  places: [], resources: [], boxes: [] }
}

describe('spatial encounter query', () => {
  it('rejects same X/Z across levels and line of contact through a blocked building', () => {
    const scene = world()
    expect(querySpatialCandidates(scene, [trace('a', p(0, 0, 4_000)),
      trace('b', p(0, 5_500, 4_000), 'upper')], {}, { radiusMm: 6_000 })).toHaveLength(0)
    expect(querySpatialCandidates(scene, [trace('a', p(-1_500)), trace('b', p(1_500))], {},
      { radiusMm: 3_200 })).toHaveLength(0)
    expect(querySpatialCandidates(scene, [trace('a', p(-2_000, 0, 3_000)),
      trace('b', p(0, 0, 3_000))], {}, { radiusMm: 3_200 })).toHaveLength(1)
    expect(querySpatialCandidates(scene, [trace('a', p(4_000)),
      trace('b', p(4_000), 'other')], {}, { radiusMm: 3_200 })).toHaveLength(0)
  })

  it('only joins adjacent surfaces at an open portal or stair endpoint', () => {
    const scene = world()
    const doorway = [trace('a', p(9_000)), trace('b', p(11_000), 'shop')]
    expect(querySpatialCandidates(scene, doorway, { 'shop-door': 'open' },
      { radiusMm: 3_200 })[0]?.relation).toBe('openPortal')
    expect(querySpatialCandidates(scene, doorway, { 'shop-door': 'closed' },
      { radiusMm: 3_200 })).toHaveLength(0)
    const inDoor: EncounterTracePoint = { ...trace('a', p(9_700)), edgeId: 'door' }
    expect(querySpatialCandidates(scene, [inDoor, doorway[1]], { 'shop-door': 'open' },
      { radiusMm: 3_200 })).toHaveLength(1)
    expect(() => querySpatialCandidates(scene, [trace('a', p(9_700)), doorway[1]],
      { 'shop-door': 'open' }, { radiusMm: 3_200 })).toThrow('outside legal space')
    expect(querySpatialCandidates(scene, [trace('a', p(8_000)),
      trace('b', p(8_000, 500), 'connector:stair')], {},
    { radiusMm: 3_200 })[0]?.relation).toBe('openPortal')
    expect(querySpatialCandidates(scene, [trace('a', p(8_000, 5_500), 'upper'),
      trace('b', p(8_000, 5_000), 'connector:stair')], {},
    { radiusMm: 3_200 })[0]?.relation).toBe('openPortal')
  })

  it('normalizes unordered pairs and produces identical ordering for shuffled traces', () => {
    const scene = world()
    const traces = [trace('z', p(1_000, 0, 4_000)), trace('b', p(0, 0, 4_000)),
      trace('a', p(-1_000, 0, 4_000))]
    const query = (items: EncounterTracePoint[]) => querySpatialCandidates(scene, items, {},
      { radiusMm: 3_200 }).map(({ pairKey }) => pairKey)
    expect(query(traces)).toEqual(query([...traces].reverse()))
    expect(query(traces)).toEqual(['["a","b"]', '["a","z"]', '["b","z"]'])
  })

  it('uses motion traces to distinguish a crossing from a stationary pair', () => {
    const scene = world()
    const moving = querySpatialCandidates(scene, [
      trace('a', p(0, 0, 4_000), 'ground', 0),
      trace('b', p(1_000, 0, 4_000), 'ground', 0),
      trace('a', p(800, 0, 4_000)), trace('b', p(1_000, 0, 4_000))], {},
    { radiusMm: 3_200 })
    expect(moving[0].firstSpeedMmPerSecond).toBe(800)
    expect(moving[0].secondSpeedMmPerSecond).toBe(0)
  })

  it('counts every unordered pair once in a crowded public space', () => {
    const crowd = Array.from({ length: 120 }, (_, index) =>
      trace(`citizen-${index.toString().padStart(3, '0')}`, p(2_000, 0, 4_000)))
    const candidates = querySpatialCandidates(world(), crowd, {}, { radiusMm: 3_200 })
    expect(candidates).toHaveLength(120 * 119 / 2)
    expect(new Set(candidates.map((item) => item.pairKey)).size).toBe(candidates.length)
  })

  it('attributes a shared plaza from both traces on a broad ground surface', () => {
    const base = world()
    const scene = { ...base, surfaces: base.surfaces.map((item) => item.id === 'ground'
      ? { ...item, placeId: null } : item) }
    const first = { ...trace('a', p(1_000, 0, 4_000)), placeId: 'plaza' }
    const second = { ...trace('b', p(2_000, 0, 4_000)), placeId: 'plaza' }
    expect(querySpatialCandidates(scene, [first, second], {},
      { radiusMm: 3_200 })[0].placeId).toBe('plaza')
    expect(querySpatialCandidates(scene, [first, { ...second, placeId: 'park' }], {},
      { radiusMm: 3_200 })[0].placeId).toBeNull()
  })

  it('offers the same wall check for static place-resource opportunities', () => {
    const scene = world()
    expect(hasClearSurfaceSegment(scene, 'ground', p(-1_500), p(1_500))).toBe(false)
    expect(hasClearSurfaceSegment(scene, 'ground', p(-1_500, 0, 3_000),
      p(1_500, 0, 3_000))).toBe(true)
    expect(hasClearSurfaceSegment(scene, 'ground', p(8_000), p(8_000, 5_500))).toBe(false)
  })
})
