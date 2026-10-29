import type { CityModel } from '../../city/model'
import type { GroundPointMm, WorldPointMm } from '../model'
import { createDevValleyChannel } from '../generation/devValleyPlan'

export interface DevTerrainGridV1 {
  readonly originXmm: number
  readonly originZmm: number
  readonly stepMm: number
  readonly width: number
  readonly depth: number
  /** Ground elevation relative to the original city's y = 0 plane. */
  readonly heightsMm: readonly number[]
}

export interface DevBlockPadV1 {
  readonly blockId: string
  readonly centerXmm: number
  readonly centerZmm: number
  readonly widthMm: number
  readonly depthMm: number
  readonly elevationMm: number
}

export interface DevBuildingPadV1 {
  readonly buildingId: string
  readonly elevationMm: number
  readonly entryRiseMm: number
  readonly entryKind: 'level' | 'ramp' | 'stair'
  readonly entryStair: Readonly<{
    /** Outer ground landing before the first tread. */
    foot: GroundPointMm
    stepDepthMm: number
    /** Ordered from the street toward the building; topMm is visual world height. */
    treads: readonly Readonly<{ center: GroundPointMm; topMm: number }>[]
  }> | null
}

export interface DevEscarpmentPatchV1 {
  readonly blockId: string
  /** Shared curved contours, ordered west to east. The polygon is built from these lines. */
  readonly backLine: readonly GroundPointMm[]
  readonly frontLine: readonly GroundPointMm[]
  readonly polygonXZ: readonly GroundPointMm[]
  readonly riseMm: number
}

export interface DevRoadProfileV1 {
  readonly edgeId: string
  /** The y coordinate is the road top in authoritative world millimetres. */
  readonly path: readonly WorldPointMm[]
  readonly bridge: boolean
  /** Both indices are inclusive and refer to points in path. */
  readonly bridgeSpan?: Readonly<{ startIndex: number; endIndex: number }>
  /** A covered stream crossing; its road top stays continuous with the approaches. */
  readonly culvertSpan?: Readonly<{ startIndex: number; endIndex: number }>
}

export interface DevTerrainV1 {
  readonly version: 'twilight-terrain-v1'
  readonly seed: string
  readonly grid: DevTerrainGridV1
  readonly blockPads: readonly DevBlockPadV1[]
  readonly buildingPads: readonly DevBuildingPadV1[]
  readonly roadProfiles: readonly DevRoadProfileV1[]
  readonly openChannelBlockIds: readonly string[]
  readonly nonWalkableEscarpment: Readonly<{
    patches: readonly DevEscarpmentPatchV1[]
  }>
  readonly channel: Readonly<{
    centerline: readonly GroundPointMm[]
    /** First point where the bed reaches its full depth and open water begins. */
    fullDepthZmm: number
    halfWidthMm: number
    bankWidthMm: number
    depthMm: number
  }>
}

export const DEV_OPEN_CHANNEL_BLOCK_IDS = [
  'block-0-4', 'block-0-5', 'block-0-6', 'block--1-6',
] as const
export const DEV_ESCARPMENT_BLOCK_IDS = [
  'block-4--1', 'block-5--1', 'block-6--1',
] as const

const STEP_MM = 2_000
const ROAD_TOP_MM = 70
const CHANNEL_HALF_WIDTH_MM = 3_000
const CHANNEL_BANK_WIDTH_MM = 6_000
const CHANNEL_DEPTH_MM = 8_000
const CHANNEL_FULL_DEPTH_Z_MM = 40_000
const BRIDGE_EDGE_IDS = new Set(['edge-x-0-5', 'edge-x-0-6'])
const CULVERT_EDGE_IDS = new Set(['edge-z-0-6', 'edge-z--1-6'])
/** Deliberate contour bends; endpoints and tangents remain aligned with the original graph. */
const ROAD_BENDS_MM = new Map<string, number>([
  ['edge-x-0-5', -900],
  ['edge-x-0-6', 700],
  ['edge-x-0--1', 1_200],
  ['edge-x-1--1', 1_400],
  ['edge-x-2--1', 1_250],
  ['edge-x-5--1', 1_100],
  ['edge-x-6--1', 1_150],
])

export function roadBendMm(edgeId: string): number {
  return ROAD_BENDS_MM.get(edgeId) ?? 0
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function smoothstep(value: number): number {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

function terraceRamp(value: number): number {
  const t = clamp01(value)
  const edge = 0.12
  if (t < edge) return t * t / (2 * edge * (1 - edge))
  if (t > 1 - edge) return (1 - edge -
    (1 - t) * (1 - t) / (2 * edge)) / (1 - edge)
  return (t - edge / 2) / (1 - edge)
}

function channelXAt(points: readonly GroundPointMm[], zMm: number): number {
  if (zMm <= points[0].z) return points[0].x
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const next = points[index]
    if (zMm <= next.z) {
      const rawT = (zMm - previous.z) / (next.z - previous.z)
      const t = points.length > 10 && next.z <= 81_000 ? rawT : smoothstep(rawT)
      return previous.x + (next.x - previous.x) * t
    }
  }
  return points.at(-1)!.x
}

export function channelCenterXAtMm(terrain: DevTerrainV1, zMm: number): number {
  const points = terrain.channel.centerline
  if (zMm <= points[0].z) return points[0].x
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const next = points[index]
    if (zMm <= next.z) {
      const rawT = (zMm - previous.z) / (next.z - previous.z)
      const t = points.length > 10 && next.z <= 81_000 ? rawT : smoothstep(rawT)
      return Math.round(previous.x + (next.x - previous.x) * t)
    }
  }
  return points.at(-1)!.x
}

function lineZAtX(line: readonly GroundPointMm[], xMm: number): number {
  if (xMm <= line[0].x) return line[0].z
  for (let index = 1; index < line.length; index += 1) {
    const before = line[index - 1]
    const after = line[index]
    if (xMm <= after.x) {
      const t = (xMm - before.x) / (after.x - before.x)
      return before.z + (after.z - before.z) * t
    }
  }
  return line.at(-1)!.z
}

export function escarpmentZBoundsAtMm(patch: DevEscarpmentPatchV1,
  xMm: number): Readonly<{ backZ: number; frontZ: number }> {
  return { backZ: lineZAtX(patch.backLine, xMm),
    frontZ: lineZAtX(patch.frontLine, xMm) }
}

function patchHeightMm(patches: readonly DevEscarpmentPatchV1[], xMm: number,
  zMm: number): number {
  for (const patch of patches) {
    const minX = patch.frontLine[0].x
    const maxX = patch.frontLine.at(-1)!.x
    if (xMm < minX || xMm > maxX) continue
    const { backZ, frontZ } = escarpmentZBoundsAtMm(patch, xMm)
    if (zMm < backZ || zMm > frontZ) continue
    // Short rock faces meet a broad flat terrace. Long taper distances made
    // these narrow open blocks read as separate conical mounds.
    const xBlend = smoothstep((xMm - minX) / 2_000) *
      smoothstep((maxX - xMm) / 2_000)
    const zBlend = smoothstep((zMm - backZ) / 3_000) *
      smoothstep((frontZ - zMm) / 2_400)
    return Math.round(patch.riseMm * xBlend * zBlend)
  }
  return 0
}

function rawHeightMm(xMm: number, zMm: number,
  patches: readonly DevEscarpmentPatchV1[], channel: readonly GroundPointMm[]): number {
  const northRise = 10_000 * terraceRamp((-zMm - 22_000) / 128_000)
  const channelAlong = smoothstep((zMm - channel[0].z) /
    (CHANNEL_FULL_DEPTH_Z_MM - channel[0].z)) *
    (1 - smoothstep((zMm - 93_000) / 7_000))
  const distance = Math.abs(xMm - channelXAt(channel, zMm))
  const channelAcross = 1 - smoothstep((distance - CHANNEL_HALF_WIDTH_MM) /
    CHANNEL_BANK_WIDTH_MM)
  return Math.round(northRise - CHANNEL_DEPTH_MM * channelAlong * channelAcross +
    patchHeightMm(patches, xMm, zMm))
}

/** Shared authoritative terrain sampler for rendering and simulation. */
export function heightAtMm(terrain: DevTerrainV1, xMm: number, zMm: number): number {
  const { grid } = terrain
  const gx = Math.max(0, Math.min(grid.width - 1, (xMm - grid.originXmm) / grid.stepMm))
  const gz = Math.max(0, Math.min(grid.depth - 1, (zMm - grid.originZmm) / grid.stepMm))
  const x0 = Math.floor(gx); const z0 = Math.floor(gz)
  const x1 = Math.min(grid.width - 1, x0 + 1)
  const z1 = Math.min(grid.depth - 1, z0 + 1)
  const tx = gx - x0; const tz = gz - z0
  const at = (x: number, z: number) => grid.heightsMm[z * grid.width + x]
  return Math.round((at(x0, z0) * (1 - tx) + at(x1, z0) * tx) * (1 - tz) +
    (at(x0, z1) * (1 - tx) + at(x1, z1) * tx) * tz)
}

export function blockPadElevationMm(terrain: DevTerrainV1, blockId: string): number {
  const pad = terrain.blockPads.find((item) => item.blockId === blockId)
  if (!pad) throw new Error(`Unknown terrain block pad ${blockId}`)
  return pad.elevationMm
}

export function buildingPadElevationMm(terrain: DevTerrainV1, buildingId: string): number {
  const pad = terrain.buildingPads.find((item) => item.buildingId === buildingId)
  if (!pad) throw new Error(`Unknown terrain building pad ${buildingId}`)
  return pad.elevationMm
}

function buildRoadProfiles(city: CityModel, terrain: DevTerrainV1): DevRoadProfileV1[] {
  const nodes = new Map(city.roads.nodes.map((node) => [node.id, node]))
  return city.roads.edges.map((edge) => {
    const from = nodes.get(edge.from)!
    const to = nodes.get(edge.to)!
    const startXmm = Math.round(from.x * 1000)
    const startZmm = Math.round(from.z * 1000)
    const endXmm = Math.round(to.x * 1000)
    const endZmm = Math.round(to.z * 1000)
    const dxMm = endXmm - startXmm
    const dzMm = endZmm - startZmm
    const segments = Math.max(2, Math.ceil(Math.hypot(dxMm, dzMm) / STEP_MM))
    const bridge = BRIDGE_EDGE_IDS.has(edge.id)
    const bendMm = roadBendMm(edge.id)
    const lateralX = -dzMm / Math.hypot(dxMm, dzMm)
    const lateralZ = dxMm / Math.hypot(dxMm, dzMm)
    const groundPoint = (index: number): WorldPointMm => {
      const t = index / segments
      const bow = 16 * t * t * (1 - t) * (1 - t) * bendMm
      const x = Math.round(startXmm + dxMm * t + lateralX * bow)
      const z = Math.round(startZmm + dzMm * t + lateralZ * bow)
      return { x, y: ROAD_TOP_MM + heightAtMm(terrain, x, z), z }
    }
    const path = edge.centerlineXZ ? edge.centerlineXZ.map((point) => {
      const x = Math.round(point.x * 1000)
      const z = Math.round(point.z * 1000)
      return { x, y: ROAD_TOP_MM + heightAtMm(terrain, x, z), z }
    }) : Array.from({ length: segments + 1 }, (_, index) => groundPoint(index))
    if (edge.centerlineXZ && (path.length < 2 ||
      path[0].x !== startXmm || path[0].z !== startZmm ||
      path.at(-1)!.x !== endXmm || path.at(-1)!.z !== endZmm ||
      path.slice(1).some((point, index) =>
        point.x === path[index].x && point.z === path[index].z))) {
      throw new Error(`Road centreline does not match its graph edge ${edge.id}`)
    }
    if (CULVERT_EDGE_IDS.has(edge.id)) {
      const flooded = path.map((point, index) => ({ point, index }))
        .filter(({ point }) => point.y < ROAD_TOP_MM - 250)
      if (flooded.length === 0) throw new Error('Culvert misses terrain channel')
      const startIndex = Math.max(0, flooded[0].index - 2)
      const endIndex = Math.min(path.length - 1, flooded.at(-1)!.index + 2)
      const start = path[startIndex]
      const end = path[endIndex]
      const deckPath = path.map((point, index) => {
        if (index < startIndex || index > endIndex) return point
        const t = (point.z - start.z) / (end.z - start.z)
        return { ...point, y: Math.round(start.y + (end.y - start.y) * t) +
          Math.round(90 * Math.sin(Math.PI * t)) }
      })
      return { edgeId: edge.id, path: deckPath, bridge: false,
        culvertSpan: { startIndex, endIndex } }
    }
    if (!bridge) return { edgeId: edge.id, path, bridge }
    const startIndex = 0
    const endIndex = path.length - 1
    const start = path[startIndex]
    const end = path[endIndex]
    const deckPath = path.map((point, index) => {
      if (index < startIndex || index > endIndex) return point
      const t = (index - startIndex) / (endIndex - startIndex)
      const camber = Math.round(180 * Math.sin(Math.PI * t))
      return { ...point, y: Math.round(start.y + (end.y - start.y) * t) + camber }
    })
    return { edgeId: edge.id, path: deckPath, bridge,
      bridgeSpan: { startIndex, endIndex } }
  })
}

export function createDevTerrainV1(city: CityModel, seed: string): DevTerrainV1 {
  const channelLine = createDevValleyChannel(city)
  const openChannelBlockIds = [...DEV_OPEN_CHANNEL_BLOCK_IDS]
  const open = new Set<string>([...openChannelBlockIds, ...DEV_ESCARPMENT_BLOCK_IDS])
  const patches = city.blocks.filter((block) =>
    DEV_ESCARPMENT_BLOCK_IDS.some((id) => id === block.id)).map((block) => {
    const insetMm = 3_800
    const x0 = Math.round((block.x - block.width / 2) * 1000) + insetMm
    // The western ridge reaches the former straight road corridor. The dev road
    // network must route around it; the original integrated city is untouched.
    const x1 = block.id === 'block-4--1'
      ? Math.round((block.x + block.width / 2) * 1000)
      : Math.round((block.x + block.width / 2) * 1000) - insetMm
    const samples = Math.max(6, Math.ceil((x1 - x0) / 1_200))
    const backLine = Array.from({ length: samples + 1 }, (_, index) => {
      const x = Math.round(x0 + (x1 - x0) * index / samples)
      return { x, z: Math.round(-137_700 +
        850 * Math.sin((x - 36_000) / 13_500 + 0.4)) }
    })
    const frontLine = Array.from({ length: samples + 1 }, (_, index) => {
      const x = Math.round(x0 + (x1 - x0) * index / samples)
      return { x, z: Math.round(-112_000 +
        2_200 * Math.sin((x - 36_000) / 10_500) +
        650 * Math.sin((x - 36_000) / 3_900)) }
    })
    return { blockId: block.id, backLine, frontLine,
      polygonXZ: [...backLine, ...[...frontLine].reverse()], riseMm: 8_000 }
  })
  const halfMm = Math.round(city.size * 500)
  const width = Math.round(halfMm * 2 / STEP_MM) + 1
  const depth = width
  const grid: DevTerrainGridV1 = { originXmm: -halfMm, originZmm: -halfMm,
    stepMm: STEP_MM, width, depth,
    heightsMm: Array.from({ length: width * depth }, (_, index) =>
      rawHeightMm(-halfMm + index % width * STEP_MM,
        -halfMm + Math.floor(index / width) * STEP_MM, patches, channelLine)) }
  const sampler: DevTerrainV1 = { version: 'twilight-terrain-v1', seed, grid,
    blockPads: [], buildingPads: [], roadProfiles: [], openChannelBlockIds,
    nonWalkableEscarpment: { patches },
    channel: { centerline: channelLine, fullDepthZmm: CHANNEL_FULL_DEPTH_Z_MM,
      halfWidthMm: CHANNEL_HALF_WIDTH_MM,
      bankWidthMm: CHANNEL_BANK_WIDTH_MM, depthMm: CHANNEL_DEPTH_MM } }
  const blockPads = city.blocks.filter((block) => !open.has(block.id)).map((block) => {
    const centerXmm = Math.round(block.x * 1000)
    const centerZmm = Math.round(block.z * 1000)
    return { blockId: block.id, centerXmm, centerZmm,
      widthMm: Math.round((block.width + 2.25) * 1000),
      depthMm: Math.round((block.depth + 2.25) * 1000),
      elevationMm: heightAtMm(sampler, centerXmm, centerZmm) }
  })
  const footprintSamples = (minMm: number, maxMm: number, originMm: number) => {
    const samples = [minMm, maxMm]
    const first = Math.ceil((minMm - originMm) / STEP_MM)
    const last = Math.floor((maxMm - originMm) / STEP_MM)
    for (let index = first; index <= last; index += 1) samples.push(originMm + index * STEP_MM)
    return samples
  }
  const pedestrianNodes = new Map(city.pedestrian.nodes.map((node) => [node.id, node]))
  const pedestrianEdges = new Map(city.pedestrian.edges.map((edge) => [edge.id, edge]))
  const buildingPads = city.buildings.map((building) => {
    const baseHeights = building.masses.filter((mass) => mass.baseY < 2).flatMap((mass) => {
      const x = building.x + mass.offsetX
      const z = building.z + mass.offsetZ
      const xs = footprintSamples(Math.round((x - mass.width / 2) * 1000),
        Math.round((x + mass.width / 2) * 1000), grid.originXmm)
      const zs = footprintSamples(Math.round((z - mass.depth / 2) * 1000),
        Math.round((z + mass.depth / 2) * 1000), grid.originZmm)
      return xs.flatMap((xMm) => zs.map((zMm) => heightAtMm(sampler, xMm, zMm)))
    })
    const entranceHeight = heightAtMm(sampler, Math.round(building.entrance.x * 1000),
      Math.round(building.entrance.z * 1000))
    const elevationMm = Math.max(entranceHeight, ...baseHeights) + 80
    const entryRiseMm = elevationMm - entranceHeight
    const entryKind = entryRiseMm > 150 ? 'stair' as const : 'level' as const
    let entryStair: DevBuildingPadV1['entryStair'] = null
    if (entryKind === 'stair') {
      const count = Math.max(2, Math.min(9, Math.ceil(entryRiseMm / 175)))
      const access = pedestrianEdges.get(`ped-access-${building.id}`)
      const lane = access ? pedestrianNodes.get(access.to) : null
      if (!lane) throw new Error(`Missing entrance sidewalk for ${building.id}`)
      const entranceXmm = Math.round(building.entrance.x * 1000)
      const entranceZmm = Math.round(building.entrance.z * 1000)
      const outward = building.entrance.face === 'north' ? { x: 0, z: -1 } :
        building.entrance.face === 'east' ? { x: 1, z: 0 } :
          building.entrance.face === 'west' ? { x: -1, z: 0 } : { x: 0, z: 1 }
      const availableMm = Math.round((lane.x * 1000 - entranceXmm) * outward.x +
        (lane.z * 1000 - entranceZmm) * outward.z)
      const stepDepthMm = Math.min(330, Math.floor((availableMm - 250) / count))
      if (stepDepthMm < 220) {
        throw new Error(`Insufficient stair landing for ${building.id}`)
      }
      const pointAt = (distanceMm: number): GroundPointMm => ({
        x: entranceXmm + outward.x * distanceMm,
        z: entranceZmm + outward.z * distanceMm,
      })
      entryStair = {
        foot: pointAt(count * stepDepthMm + 100),
        stepDepthMm,
        treads: Array.from({ length: count }, (_, index) => ({
          center: pointAt(Math.round((count - index - 0.5) * stepDepthMm)),
          topMm: elevationMm - Math.round((count - index - 1) * entryRiseMm / count),
        })),
      }
    }
    return { buildingId: building.id, elevationMm, entryRiseMm,
      entryKind, entryStair }
  })
  const initial: DevTerrainV1 = { ...sampler, blockPads, buildingPads }
  return { ...initial, roadProfiles: buildRoadProfiles(city, initial) }
}
