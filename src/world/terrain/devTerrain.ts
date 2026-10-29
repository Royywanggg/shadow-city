import type { CityModel } from '../../city/model'
import type { GroundPointMm, WorldPointMm } from '../model'

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

export interface DevRoadProfileV1 {
  readonly edgeId: string
  /** The y coordinate is the road top in authoritative world millimetres. */
  readonly path: readonly WorldPointMm[]
  readonly bridge: boolean
  /** Both indices are inclusive and refer to points in path. */
  readonly bridgeSpan?: Readonly<{ startIndex: number; endIndex: number }>
}

export interface DevTerrainV1 {
  readonly version: 'twilight-terrain-v1'
  readonly seed: string
  readonly grid: DevTerrainGridV1
  readonly blockPads: readonly DevBlockPadV1[]
  readonly roadProfiles: readonly DevRoadProfileV1[]
  readonly openChannelBlockIds: readonly string[]
  readonly channel: Readonly<{
    centerline: readonly GroundPointMm[]
    halfWidthMm: number
    bankWidthMm: number
    depthMm: number
  }>
}

export const DEV_OPEN_CHANNEL_BLOCK_IDS = [
  'block--1-4', 'block--1-5', 'block--1-6',
] as const

const STEP_MM = 2_000
const ROAD_TOP_MM = 70
const CHANNEL_CENTERLINE: readonly GroundPointMm[] = [
  { x: -125_000, z: 20_000 },
  { x: -122_000, z: 47_000 },
  { x: -119_000, z: 75_000 },
  { x: -123_000, z: 112_000 },
]
const CHANNEL_HALF_WIDTH_MM = 3_800
const CHANNEL_BANK_WIDTH_MM = 9_000
const CHANNEL_DEPTH_MM = 8_000
const BRIDGE_EDGE_IDS = new Set(['edge-x--1-5', 'edge-x--1-6'])

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function smoothstep(value: number): number {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

function channelXAt(zMm: number): number {
  if (zMm <= CHANNEL_CENTERLINE[0].z) return CHANNEL_CENTERLINE[0].x
  for (let index = 1; index < CHANNEL_CENTERLINE.length; index += 1) {
    const previous = CHANNEL_CENTERLINE[index - 1]
    const next = CHANNEL_CENTERLINE[index]
    if (zMm <= next.z) {
      const t = smoothstep((zMm - previous.z) / (next.z - previous.z))
      return previous.x + (next.x - previous.x) * t
    }
  }
  return CHANNEL_CENTERLINE.at(-1)!.x
}

function rawHeightMm(xMm: number, zMm: number): number {
  const northRise = 9_400 * smoothstep((-zMm - 30_000) / 90_000)
  const channelAlong = smoothstep((zMm - 17_000) / 16_000) *
    (1 - smoothstep((zMm - 112_000) / 17_000))
  const distance = Math.abs(xMm - channelXAt(zMm))
  const channelAcross = 1 - smoothstep((distance - CHANNEL_HALF_WIDTH_MM) /
    CHANNEL_BANK_WIDTH_MM)
  return Math.round(northRise - CHANNEL_DEPTH_MM * channelAlong * channelAcross)
}

function insidePad(pad: DevBlockPadV1, xMm: number, zMm: number): boolean {
  return Math.abs(xMm - pad.centerXmm) <= pad.widthMm / 2 &&
    Math.abs(zMm - pad.centerZmm) <= pad.depthMm / 2
}

/** Shared authoritative terrain sampler for rendering and simulation. */
export function heightAtMm(terrain: DevTerrainV1, xMm: number, zMm: number): number {
  const pad = terrain.blockPads.find((item) => insidePad(item, xMm, zMm))
  if (pad) return pad.elevationMm
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
    const groundPoint = (index: number): WorldPointMm => {
      const x = Math.round(startXmm + dxMm * index / segments)
      const z = Math.round(startZmm + dzMm * index / segments)
      return { x, y: ROAD_TOP_MM + heightAtMm(terrain, x, z), z }
    }
    const path = Array.from({ length: segments + 1 }, (_, index) => groundPoint(index))
    if (!bridge) return { edgeId: edge.id, path, bridge }
    const zMid = (startZmm + endZmm) / 2
    const channelX = channelXAt(zMid)
    const leftBank = channelX - CHANNEL_HALF_WIDTH_MM - CHANNEL_BANK_WIDTH_MM - 1_000
    const rightBank = channelX + CHANNEL_HALF_WIDTH_MM + CHANNEL_BANK_WIDTH_MM + 1_000
    const isInSpan = (point: WorldPointMm) => point.x >= leftBank && point.x <= rightBank
    const startIndex = path.findIndex(isInSpan)
    let endIndex = -1
    for (let index = path.length - 1; index >= 0; index -= 1) {
      if (isInSpan(path[index])) { endIndex = index; break }
    }
    if (startIndex < 1 || endIndex >= path.length - 1 || endIndex <= startIndex) {
      throw new Error(`Bridge span does not fit road edge ${edge.id}`)
    }
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
  const openChannelBlockIds = [...DEV_OPEN_CHANNEL_BLOCK_IDS]
  const open = new Set<string>(openChannelBlockIds)
  const blockPads = city.blocks.filter((block) => !open.has(block.id)).map((block) => {
    const centerXmm = Math.round(block.x * 1000)
    const centerZmm = Math.round(block.z * 1000)
    const protectedCore = block.id === 'block-3-3' || block.id === 'block-4-3'
    return { blockId: block.id, centerXmm, centerZmm,
      widthMm: Math.round((block.width + 2.25) * 1000),
      depthMm: Math.round((block.depth + 2.25) * 1000),
      elevationMm: protectedCore ? 0 : Math.round(rawHeightMm(centerXmm, centerZmm) / 250) * 250 }
  })
  const halfMm = Math.round(city.size * 500)
  const width = Math.round(halfMm * 2 / STEP_MM) + 1
  const depth = width
  const grid: DevTerrainGridV1 = { originXmm: -halfMm, originZmm: -halfMm,
    stepMm: STEP_MM, width, depth,
    heightsMm: Array.from({ length: width * depth }, (_, index) =>
      rawHeightMm(-halfMm + index % width * STEP_MM,
        -halfMm + Math.floor(index / width) * STEP_MM)) }
  const initial: DevTerrainV1 = { version: 'twilight-terrain-v1', seed, grid,
    blockPads, roadProfiles: [], openChannelBlockIds,
    channel: { centerline: CHANNEL_CENTERLINE, halfWidthMm: CHANNEL_HALF_WIDTH_MM,
      bankWidthMm: CHANNEL_BANK_WIDTH_MM, depthMm: CHANNEL_DEPTH_MM } }
  return { ...initial, roadProfiles: buildRoadProfiles(city, initial) }
}
