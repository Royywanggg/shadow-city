import { HERO_SEED } from '../../city/generation/generateCity'
import type { WorldModelV2 } from '../model'
import { createDevTerrainV1, DEV_OPEN_CHANNEL_BLOCK_IDS, heightAtMm,
  blockPadElevationMm, type DevRoadProfileV1 } from '../terrain/devTerrain'
import { generateIntegratedWorld } from './generateIntegratedWorld'

const GROUND_Y_MM = 250
const BRIDGE_SIDEWALK_OFFSET_MM = 180

function roadTopAtX(profile: DevRoadProfileV1, xMm: number): number {
  const path = profile.path
  if (xMm <= path[0].x) return path[0].y
  for (let index = 1; index < path.length; index += 1) {
    if (xMm <= path[index].x) {
      const before = path[index - 1]
      const after = path[index]
      const t = (xMm - before.x) / (after.x - before.x)
      return Math.round(before.y + (after.y - before.y) * t)
    }
  }
  return path.at(-1)!.y
}

function openChannelRing(edgeId: string): boolean {
  return DEV_OPEN_CHANNEL_BLOCK_IDS.some((blockId) =>
    edgeId.startsWith(`ped-${blockId}-h-`))
}

function lengthMm(path: readonly { x: number; y: number; z: number }[]): number {
  return path.slice(1).reduce((sum, point, index) => {
    const previous = path[index]
    return sum + Math.round(Math.hypot(point.x - previous.x,
      point.y - previous.y, point.z - previous.z))
  }, 0)
}

/** Isolated terrain experiment derived from the integrated city, never mutating main. */
export function generateDevWorld(seed = HERO_SEED): WorldModelV2 {
  const integrated = generateIntegratedWorld(seed,
    { openChannelBlockIds: DEV_OPEN_CHANNEL_BLOCK_IDS })
  const city = integrated.baseCity!
  const terrain = createDevTerrainV1(city, seed)
  const parcelBlock = new Map(city.parcels.map((parcel) => [parcel.id, parcel.blockId]))
  const buildingPad = new Map(city.buildings.map((building) => [building.id,
    blockPadElevationMm(terrain, parcelBlock.get(building.parcelId)!)]))
  const surfaceShift = (surfaceId: string): number => surfaceId.startsWith('interior:')
    ? buildingPad.get(surfaceId.slice('interior:'.length)) ?? 0 : 0
  const navNodes = integrated.navNodes.map((node) => {
    const shift = node.surfaceId === 'ground'
      ? heightAtMm(terrain, node.position.x, node.position.z)
      : surfaceShift(node.surfaceId)
    return shift === 0 ? node : { ...node,
      position: { ...node.position, y: node.position.y + shift } }
  })
  const originalNodeById = new Map(integrated.navNodes.map((node) => [node.id, node]))
  const nodeById = new Map(navNodes.map((node) => [node.id, node]))
  const bridgeProfiles = terrain.roadProfiles.filter((profile) => profile.bridge)
  const bridgeSurfaceId = (profile: DevRoadProfileV1) => `terrain-bridge:${profile.edgeId}`
  const navEdges = integrated.navEdges.flatMap((edge) => {
    const oldFrom = originalNodeById.get(edge.fromNodeId)!
    const oldTo = originalNodeById.get(edge.toNodeId)!
    const from = nodeById.get(edge.fromNodeId)!
    const to = nodeById.get(edge.toNodeId)!
    const ground = from.surfaceId === 'ground' && to.surfaceId === 'ground'
    if (ground && openChannelRing(edge.id)) {
      const zMm = (from.position.z + to.position.z) / 2
      const bridge = bridgeProfiles.find((profile) =>
        Math.abs(profile.path[0].z - zMm) < 6_000)
      if (!bridge) return []
      const segments = Math.max(2, Math.ceil(Math.abs(to.position.x - from.position.x) / 1_000))
      const path = Array.from({ length: segments + 1 }, (_, index) => {
        const t = index / segments
        const x = Math.round(from.position.x + (to.position.x - from.position.x) * t)
        const z = Math.round(from.position.z + (to.position.z - from.position.z) * t)
        return { x, y: roadTopAtX(bridge, x) + BRIDGE_SIDEWALK_OFFSET_MM, z }
      })
      path[0] = from.position
      path[path.length - 1] = to.position
      return [{ ...edge, surfaceId: bridgeSurfaceId(bridge), path, lengthMm: lengthMm(path) }]
    }
    const path = ground ? edge.path.flatMap((point, index) => {
      if (index === edge.path.length - 1) return []
      const next = edge.path[index + 1]
      const count = Math.max(1, Math.ceil(Math.hypot(next.x - point.x,
        next.z - point.z) / 1_000))
      return Array.from({ length: count }, (_, step) => {
        const t = step / count
        const x = Math.round(point.x + (next.x - point.x) * t)
        const z = Math.round(point.z + (next.z - point.z) * t)
        return { x, y: GROUND_Y_MM + heightAtMm(terrain, x, z), z }
      })
    }).concat([to.position]) : edge.path.map((point, index) => {
      if (index === 0) return from.position
      if (index === edge.path.length - 1) return to.position
      const t = index / (edge.path.length - 1)
      const fromShift = from.position.y - oldFrom.position.y
      const toShift = to.position.y - oldTo.position.y
      return { ...point, y: point.y + Math.round(fromShift + (toShift - fromShift) * t) }
    })
    return [{ ...edge, path, lengthMm: lengthMm(path) }]
  })
  const surfaces = integrated.surfaces.map((surface) => surface.id === 'ground'
    ? { ...surface, elevationMode: 'terrain' as const }
    : surfaceShift(surface.id) === 0 ? surface : { ...surface,
      elevationMm: surface.elevationMm + surfaceShift(surface.id) }).concat(
        bridgeProfiles.map((profile) => {
          const xs = profile.path.map((point) => point.x)
          const z = profile.path[0].z
          const minX = Math.min(...xs) - 500
          const maxX = Math.max(...xs) + 500
          const halfWidth = 6_000
          return { id: bridgeSurfaceId(profile), levelId: 'L0', placeId: null,
            interactionZoneId: bridgeSurfaceId(profile), elevationMm: GROUND_Y_MM,
            polygonXZ: [{ x: minX, z: z - halfWidth }, { x: maxX, z: z - halfWidth },
              { x: maxX, z: z + halfWidth }, { x: minX, z: z + halfWidth }],
            blockedPolygonsXZ: [], clearanceMm: 20_000, indoor: false }
        }))
  const resources = integrated.resources.map((resource) => {
    const shift = resource.surfaceId === 'ground'
      ? heightAtMm(terrain, resource.position.x, resource.position.z)
      : surfaceShift(resource.surfaceId)
    return shift === 0 ? resource : { ...resource,
      position: { ...resource.position, y: resource.position.y + shift } }
  })
  return {
    ...integrated,
    config: { ...integrated.config, generatorVersion: 'twilight-dev-v1' },
    terrain, surfaces, navNodes, navEdges, resources,
  }
}
