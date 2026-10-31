import type { CityModel } from '../../city/model'
import type { GroundPointMm, WorldPointMm } from '../model'
import { createDevValleyChannel } from '../generation/devValleyPlan'
import { rearHighlandBackZmm, rearHighlandFrontZmm } from './devHighlandContour'
import { DEV_UPPER_ROAD_EDGE_ID } from '../generation/devUpperRoadPlan'

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

export interface DevTerraceAccessV1 {
  readonly crossingNodeId: string
  readonly foot: WorldPointMm
  readonly crossingSouth: WorldPointMm
  readonly crossing: readonly WorldPointMm[]
  readonly frontZmm: number
  readonly stair: readonly WorldPointMm[]
  readonly stairTrailIndex: number
  readonly trail: readonly WorldPointMm[]
  /** Visible paving copied from the matching static navigation edges. */
  readonly walkways: readonly Readonly<{
    edgeId: string
    path: readonly WorldPointMm[]
    widthMm: number
  }>[]
}

export interface DevTerrainV1 {
  readonly version: 'twilight-terrain-v1'
  readonly seed: string
  readonly grid: DevTerrainGridV1
  readonly blockPads: readonly DevBlockPadV1[]
  readonly buildingPads: readonly DevBuildingPadV1[]
  readonly roadProfiles: readonly DevRoadProfileV1[]
  readonly terraceAccess?: DevTerraceAccessV1
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
  'block-3--1', 'block-4--1', 'block-5--1', 'block-6--1',
] as const

const STEP_MM = 2_000
const ROAD_TOP_MM = 70
const CHANNEL_HALF_WIDTH_MM = 3_000
const CHANNEL_BANK_WIDTH_MM = 6_000
const CHANNEL_DEPTH_MM = 8_000
const CHANNEL_FULL_DEPTH_Z_MM = 40_000
const TERRACE_STAIR_X_MM = 30_000
const TERRACE_STAIR_FRONT_RUN_MM = 17_000
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
    const stairCut = 1 - smoothstep((Math.abs(xMm - TERRACE_STAIR_X_MM) - 2_400) / 3_200)
    const frontRunMm = 2_400 + stairCut *
      (TERRACE_STAIR_FRONT_RUN_MM - 2_400)
    const zBlend = smoothstep((zMm - backZ) / 3_000) *
      ((1 - stairCut) * smoothstep((frontZ - zMm) / frontRunMm) +
        stairCut * terraceRamp((frontZ - zMm) / frontRunMm))
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
    if (edge.id === DEV_UPPER_ROAD_EDGE_ID) {
      const lengths = path.map((point, index) => index === 0 ? 0 :
        Math.hypot(point.x - path[index - 1].x,
          point.z - path[index - 1].z))
      for (let index = 1; index < lengths.length; index += 1) {
        lengths[index] += lengths[index - 1]
      }
      const total = lengths.at(-1)!
      const startY = path[0].y
      const endY = path.at(-1)!.y
      const deck = path.map((point, index) => {
        const t = lengths[index] / total
        return { ...point, y: Math.max(point.y, Math.round(startY +
          (endY - startY) * t + 550 * Math.sin(Math.PI * t))) }
      })
      return { edgeId: edge.id, path: deck, bridge: true,
        bridgeSpan: { startIndex: 0, endIndex: deck.length - 1 } }
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

function buildTerraceAccess(city: CityModel,
  terrain: DevTerrainV1): DevTerraceAccessV1 | undefined {
  const patch = terrain.nonWalkableEscarpment.patches[0]
  const road = terrain.roadProfiles.find((profile) =>
    profile.edgeId === 'edge-x-4-0')
  if (!patch || !road) return undefined
  const roadSamples = road.path
  const right = roadSamples.findIndex((point) => point.x >= TERRACE_STAIR_X_MM)
  if (right < 1) return undefined
  const before = roadSamples[right - 1]
  const after = roadSamples[right]
  const t = (TERRACE_STAIR_X_MM - before.x) / (after.x - before.x)
  const roadZmm = Math.round(before.z + (after.z - before.z) * t)
  const southNode = city.pedestrian.nodes.filter((node) =>
    node.id.startsWith('ped-block-4-0-polygon-') &&
    Math.abs(node.x * 1000 - TERRACE_STAIR_X_MM) < 6_000 &&
    node.z * 1000 > roadZmm).sort((a, b) =>
    Math.hypot(a.x * 1000 - TERRACE_STAIR_X_MM,
      a.z * 1000 - roadZmm - 4_000) -
    Math.hypot(b.x * 1000 - TERRACE_STAIR_X_MM,
      b.z * 1000 - roadZmm - 4_000) ||
    a.id.localeCompare(b.id))[0]
  if (!southNode) return undefined
  const onGround = (x: number, z: number): WorldPointMm =>
    ({ x, y: 250 + heightAtMm(terrain, x, z), z })
  const frontZmm = Math.round(escarpmentZBoundsAtMm(patch, TERRACE_STAIR_X_MM).frontZ)
  const foot = onGround(TERRACE_STAIR_X_MM, roadZmm - 6_200)
  if (foot.z <= frontZmm + 1_500) throw new Error('Terrace stair foot overlaps cliff')
  const crossingSouth = onGround(Math.round(southNode.x * 1000),
    Math.round(southNode.z * 1000))
  const crossingCount = Math.ceil(Math.hypot(foot.x - crossingSouth.x,
    foot.z - crossingSouth.z) / 500)
  const crossing = Array.from({ length: crossingCount + 1 }, (_, index) => {
    const t = index / crossingCount
    return onGround(Math.round(crossingSouth.x + (foot.x - crossingSouth.x) * t),
      Math.round(crossingSouth.z + (foot.z - crossingSouth.z) * t))
  })
  const topZmm = frontZmm - TERRACE_STAIR_FRONT_RUN_MM - 1_200
  const count = Math.ceil((foot.z - topZmm) / 320)
  const stair = Array.from({ length: count + 1 }, (_, index) =>
    onGround(TERRACE_STAIR_X_MM,
      Math.round(foot.z + (topZmm - foot.z) * index / count)))
  const trailStartXmm = -10_000
  const stairTrailIndex = (TERRACE_STAIR_X_MM - trailStartXmm) / 1_000
  const trail = Array.from({ length: 97 }, (_, index) => {
    const x = trailStartXmm + index * 1_000
    const stairCut = 1 - smoothstep((Math.abs(x - TERRACE_STAIR_X_MM) -
      2_400) / 3_200)
    const z = Math.round(escarpmentZBoundsAtMm(patch, x).frontZ) -
      Math.round(8_500 + stairCut * 9_700)
    return onGround(x, z)
  })
  stair[stair.length - 1] = trail[stairTrailIndex]
  return { crossingNodeId: southNode.id, crossingSouth, crossing, foot,
    frontZmm, stair, stairTrailIndex, trail, walkways: [] }
}

export function createDevTerrainV1(city: CityModel, seed: string): DevTerrainV1 {
  const channelLine = createDevValleyChannel(city)
  const openChannelBlockIds = [...DEV_OPEN_CHANNEL_BLOCK_IDS]
  const open = new Set<string>([...openChannelBlockIds, ...DEV_ESCARPMENT_BLOCK_IDS])
  const patches = (() => {
    const cleared = DEV_ESCARPMENT_BLOCK_IDS.map((id) =>
      city.blocks.find((block) => block.id === id))
    if (cleared.some((block) => !block)) throw new Error('Missing north terrace block')
    // The unbuilt rear blocks share a single ridge. Roads around its east and
    // west ends retain the north-south connection through the original city.
    const x0 = -17_000
    const x1 = 94_000
    const samples = Math.max(6, Math.ceil((x1 - x0) / 1_200))
    const backLine = Array.from({ length: samples + 1 }, (_, index) => {
      const x = Math.round(x0 + (x1 - x0) * index / samples)
      return { x, z: rearHighlandBackZmm(x) }
    })
    const frontLine = Array.from({ length: samples + 1 }, (_, index) => {
      const x = Math.round(x0 + (x1 - x0) * index / samples)
      return { x, z: rearHighlandFrontZmm(x) }
    })
    return [{ blockId: 'dev-north-terrace', backLine, frontLine,
      polygonXZ: [...backLine, ...[...frontLine].reverse()], riseMm: 8_000 }
    ]
  })()
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
  const withRoads = { ...initial, roadProfiles: buildRoadProfiles(city, initial) }
  return { ...withRoads, terraceAccess: buildTerraceAccess(city, withRoads) }
}
