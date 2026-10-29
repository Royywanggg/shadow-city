import { HERO_SEED } from '../../city/generation/generateCity'
import type { WorldModelV2 } from '../model'
import { createDevTerrainV1, DEV_OPEN_CHANNEL_BLOCK_IDS, heightAtMm,
  blockPadElevationMm, roadBendMm, type DevRoadProfileV1 } from '../terrain/devTerrain'
import { generateIntegratedWorld } from './generateIntegratedWorld'

const GROUND_Y_MM = 250
const BRIDGE_SIDEWALK_OFFSET_MM = 180

function roadAtX(profile: DevRoadProfileV1, xMm: number): { y: number; z: number } {
  const path = profile.path
  if (xMm <= path[0].x) return path[0]
  for (let index = 1; index < path.length; index += 1) {
    if (xMm <= path[index].x) {
      const before = path[index - 1]
      const after = path[index]
      const t = (xMm - before.x) / (after.x - before.x)
      return { y: Math.round(before.y + (after.y - before.y) * t),
        z: Math.round(before.z + (after.z - before.z) * t) }
    }
  }
  return path.at(-1)!
}

function roadAtZ(profile: DevRoadProfileV1, zMm: number): { x: number; y: number } {
  const path = profile.path
  if (zMm <= path[0].z) return path[0]
  for (let index = 1; index < path.length; index += 1) {
    if (zMm <= path[index].z) {
      const before = path[index - 1]
      const after = path[index]
      const t = (zMm - before.z) / (after.z - before.z)
      return { x: Math.round(before.x + (after.x - before.x) * t),
        y: Math.round(before.y + (after.y - before.y) * t) }
    }
  }
  return path.at(-1)!
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
  const culvertProfile = terrain.roadProfiles.find((profile) => profile.culvertSpan)!
  const curvedProfiles = terrain.roadProfiles.filter((profile) =>
    roadBendMm(profile.edgeId) !== 0 && !profile.bridge)
  const bridgeSurfaceId = (profile: DevRoadProfileV1) => `terrain-bridge:${profile.edgeId}`
  const navEdges = integrated.navEdges.flatMap((edge) => {
    const oldFrom = originalNodeById.get(edge.fromNodeId)!
    const oldTo = originalNodeById.get(edge.toNodeId)!
    const from = nodeById.get(edge.fromNodeId)!
    const to = nodeById.get(edge.toNodeId)!
    const ground = from.surfaceId === 'ground' && to.surfaceId === 'ground'
    const culvertWalk = ground && edge.id.startsWith('ped-block--1-6-v-') &&
      Math.abs(from.position.x - culvertProfile.path[0].x) < 6_000 &&
      Math.abs(to.position.x - culvertProfile.path[0].x) < 6_000 &&
      Math.abs(from.position.z - to.position.z) > 8_000
    if (culvertWalk) {
      const segments = Math.max(2, Math.ceil(Math.abs(to.position.z - from.position.z) / 1_000))
      const path = Array.from({ length: segments + 1 }, (_, index) => {
        const t = index / segments
        const z = Math.round(from.position.z + (to.position.z - from.position.z) * t)
        const road = roadAtZ(culvertProfile, z)
        return { x: from.position.x + road.x - culvertProfile.path[0].x,
          y: road.y + BRIDGE_SIDEWALK_OFFSET_MM, z }
      })
      path[0] = from.position
      path[path.length - 1] = to.position
      return [{ ...edge, surfaceId: `terrain-culvert:${culvertProfile.edgeId}`,
        path, lengthMm: lengthMm(path) }]
    }
    if (ground && openChannelRing(edge.id)) {
      const zMm = (from.position.z + to.position.z) / 2
      const bridge = bridgeProfiles.find((profile) =>
        Math.abs(profile.path[0].z - zMm) < 6_000)
      if (!bridge) return []
      const segments = Math.max(2, Math.ceil(Math.abs(to.position.x - from.position.x) / 1_000))
      const path = Array.from({ length: segments + 1 }, (_, index) => {
        const t = index / segments
        const x = Math.round(from.position.x + (to.position.x - from.position.x) * t)
        const road = roadAtX(bridge, x)
        const originalZ = Math.round(from.position.z + (to.position.z - from.position.z) * t)
        const z = originalZ + road.z - bridge.path[0].z
        return { x, y: road.y + BRIDGE_SIDEWALK_OFFSET_MM, z }
      })
      path[0] = from.position
      path[path.length - 1] = to.position
      return [{ ...edge, surfaceId: bridgeSurfaceId(bridge), path, lengthMm: lengthMm(path) }]
    }
    const curved = ground && Math.abs(to.position.x - from.position.x) > 8_000 &&
      Math.abs(to.position.z - from.position.z) < 100
      ? curvedProfiles.find((profile) => {
        const start = profile.path[0]; const end = profile.path.at(-1)!
        const minX = Math.min(from.position.x, to.position.x)
        const maxX = Math.max(from.position.x, to.position.x)
        return minX >= start.x - 100 && maxX <= end.x + 100 &&
          Math.abs(from.position.z - start.z) < 6_000 &&
          Math.abs(to.position.z - end.z) < 6_000
      }) : undefined
    if (curved) {
      const segments = Math.max(2, Math.ceil(Math.abs(to.position.x - from.position.x) / 1_000))
      const path = Array.from({ length: segments + 1 }, (_, index) => {
        const t = index / segments
        const x = Math.round(from.position.x + (to.position.x - from.position.x) * t)
        const originalZ = Math.round(from.position.z + (to.position.z - from.position.z) * t)
        const z = originalZ + roadAtX(curved, x).z - curved.path[0].z
        return { x, y: GROUND_Y_MM + heightAtMm(terrain, x, z), z }
      })
      path[0] = from.position
      path[path.length - 1] = to.position
      return [{ ...edge, path, lengthMm: lengthMm(path) }]
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
        }), {
          id: `terrain-culvert:${culvertProfile.edgeId}`, levelId: 'L0', placeId: null,
          interactionZoneId: `terrain-culvert:${culvertProfile.edgeId}`,
          elevationMm: GROUND_Y_MM,
          polygonXZ: [
            { x: culvertProfile.path[0].x - 6_000, z: culvertProfile.path[0].z - 500 },
            { x: culvertProfile.path[0].x + 6_000, z: culvertProfile.path[0].z - 500 },
            { x: culvertProfile.path[0].x + 6_000, z: culvertProfile.path.at(-1)!.z + 500 },
            { x: culvertProfile.path[0].x - 6_000, z: culvertProfile.path.at(-1)!.z + 500 },
          ], blockedPolygonsXZ: [], clearanceMm: 20_000, indoor: false,
        })
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
