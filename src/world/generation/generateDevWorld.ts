import { generateCity, HERO_SEED } from '../../city/generation/generateCity'
import type { GroundPointMm, NavEdgeV2, NavNodeV2, WorldModelV2 } from '../model'
import { createDevTerrainV1, DEV_OPEN_CHANNEL_BLOCK_IDS, heightAtMm,
  DEV_ESCARPMENT_BLOCK_IDS, buildingPadElevationMm,
  roadBendMm, type DevRoadProfileV1, type DevTerrainV1 } from '../terrain/devTerrain'
import { generateIntegratedWorld } from './generateIntegratedWorld'
import { deriveDevRidgeRoad, ridgePedestrianLinks, RIDGE_ROAD_ID } from './devRidgeRoad'
import { expandOriginalCity } from './expandOriginalCity'
import { createDevOrganicLayout } from './devOrganicLayout'

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

function channelBlockedPolygons(terrain: DevTerrainV1): GroundPointMm[][] {
  const points = terrain.channel.centerline
  return points.slice(1).map((end, index) => {
    const start = points[index]
    const dx = end.x - start.x
    const dz = end.z - start.z
    const length = Math.hypot(dx, dz) || 1
    const nx = -dz / length * (terrain.channel.halfWidthMm + 2_000)
    const nz = dx / length * (terrain.channel.halfWidthMm + 2_000)
    return [
      { x: Math.round(start.x + nx), z: Math.round(start.z + nz) },
      { x: Math.round(end.x + nx), z: Math.round(end.z + nz) },
      { x: Math.round(end.x - nx), z: Math.round(end.z - nz) },
      { x: Math.round(start.x - nx), z: Math.round(start.z - nz) },
    ]
  })
}

function lengthMm(path: readonly { x: number; y: number; z: number }[]): number {
  return path.slice(1).reduce((sum, point, index) => {
    const previous = path[index]
    return sum + Math.round(Math.hypot(point.x - previous.x,
      point.y - previous.y, point.z - previous.z))
  }, 0)
}

function bridgePedestrianLinks(profile: DevRoadProfileV1,
  nodes: readonly NavNodeV2[], terrain: DevTerrainV1):
  Readonly<{ nodes: readonly NavNodeV2[]; edges: readonly NavEdgeV2[] }> {
  const row = Number(profile.edgeId.split('-').at(-1))
  const nodeOnBank = (blockId: string, side: 'west' | 'east') => {
    const candidates = nodes.filter((node) => node.id.startsWith(`ped-${blockId}-`))
      .sort((a, b) => Math.abs(a.position.z - profile.path[0].z) -
        Math.abs(b.position.z - profile.path[0].z) ||
        (side === 'west' ? b.position.x - a.position.x : a.position.x - b.position.x) ||
        a.id.localeCompare(b.id))
    if (!candidates[0]) throw new Error(`Missing bridge landing for ${blockId}`)
    return candidates[0]
  }
  const addedNodes: NavNodeV2[] = []
  const addedEdges: NavEdgeV2[] = []
  const edges = [row - 1, row].map((bankRow, index) => {
    const to = nodeOnBank(`block-1-${bankRow}`, 'east')
    let from = nodeOnBank(`block--1-${row === 6 && index === 1 ? row - 1 : bankRow}`,
      'west')
    if (row === 6 && index === 1) {
      const landing: NavNodeV2 = {
        id: `terrain-bridge-landing:${profile.edgeId}:west-south`,
        position: { x: from.position.x, z: to.position.z,
          y: GROUND_Y_MM + heightAtMm(terrain, from.position.x, to.position.z) },
        surfaceId: 'ground',
      }
      const segments = Math.max(2, Math.ceil((landing.position.z - from.position.z) / 1_000))
      const path = Array.from({ length: segments + 1 }, (_, step) => {
        const z = Math.round(from.position.z +
          (landing.position.z - from.position.z) * step / segments)
        return { x: from.position.x, y: GROUND_Y_MM +
          heightAtMm(terrain, from.position.x, z), z }
      })
      path[0] = from.position
      path[path.length - 1] = landing.position
      addedNodes.push(landing)
      addedEdges.push({ id: `terrain-bridge-approach:${profile.edgeId}:west-south`,
        fromNodeId: from.id, toNodeId: landing.id, path, surfaceId: 'ground',
        connectorId: null, kind: 'walk', lengthMm: lengthMm(path), accessId: null,
        direction: 'both' })
      from = landing
    }
    const segments = Math.max(2, Math.ceil((to.position.x - from.position.x) / 1_000))
    const path = Array.from({ length: segments + 1 }, (_, step) => {
      const t = step / segments
      const x = Math.round(from.position.x + (to.position.x - from.position.x) * t)
      const road = roadAtX(profile, x)
      const z = Math.round(from.position.z + (to.position.z - from.position.z) * t) +
        road.z - profile.path[0].z
      return { x, y: road.y + BRIDGE_SIDEWALK_OFFSET_MM, z }
    })
    path[0] = from.position
    path[path.length - 1] = to.position
    return { id: `terrain-ped-bridge:${profile.edgeId}:${index === 0 ? 'north' : 'south'}`,
      fromNodeId: from.id, toNodeId: to.id, path,
      surfaceId: `terrain-bridge:${profile.edgeId}`, connectorId: null,
      kind: 'walk' as const, lengthMm: lengthMm(path), accessId: null,
      direction: 'both' as const }
  })
  return { nodes: addedNodes, edges: [...addedEdges, ...edges] }
}

/** Isolated terrain experiment derived from the integrated city, never mutating main. */
export function generateDevWorld(seed = HERO_SEED): WorldModelV2 {
  const expandedCity = expandOriginalCity(generateCity(seed))
  const baseCity = createDevOrganicLayout(expandedCity)
  const integrated = generateIntegratedWorld(seed, {
    baseCity,
    openChannelBlockIds: [...DEV_OPEN_CHANNEL_BLOCK_IDS, ...DEV_ESCARPMENT_BLOCK_IDS],
  })
  const sourceCity = integrated.baseCity!
  const sourceTerrain = createDevTerrainV1(sourceCity, seed)
  const { city, terrain } = deriveDevRidgeRoad(sourceCity, sourceTerrain)
  const buildingPad = new Map(city.buildings.map((building) => [building.id,
    buildingPadElevationMm(terrain, building.id)]))
  const buildingEntry = new Map(terrain.buildingPads.map((pad) => [pad.buildingId, pad]))
  const stairFoot = new Map(terrain.buildingPads.filter((pad) => pad.entryStair)
    .map((pad) => [`ped-entrance-${pad.buildingId}`, pad.entryStair!.foot]))
  const surfaceShift = (surfaceId: string): number => surfaceId.startsWith('interior:')
    ? buildingPad.get(surfaceId.slice('interior:'.length)) ?? 0 : 0
  const navNodes = integrated.navNodes.map((node) => {
    const foot = stairFoot.get(node.id)
    if (foot) return { ...node, position: { x: foot.x, z: foot.z,
      y: GROUND_Y_MM + heightAtMm(terrain, foot.x, foot.z) } }
    const shift = node.surfaceId === 'ground'
      ? heightAtMm(terrain, node.position.x, node.position.z)
      : surfaceShift(node.surfaceId)
    return shift === 0 ? node : { ...node,
      position: { ...node.position, y: node.position.y + shift } }
  })
  const originalNodeById = new Map(integrated.navNodes.map((node) => [node.id, node]))
  const nodeById = new Map(navNodes.map((node) => [node.id, node]))
  const bridgeProfiles = terrain.roadProfiles.filter((profile) => profile.bridge)
  const culvertProfiles = terrain.roadProfiles.filter((profile) => profile.culvertSpan)
  const curvedProfiles = terrain.roadProfiles.filter((profile) =>
    roadBendMm(profile.edgeId) !== 0 && !profile.bridge)
  const bridgeSurfaceId = (profile: DevRoadProfileV1) => `terrain-bridge:${profile.edgeId}`
  const closedBlocks = [...DEV_OPEN_CHANNEL_BLOCK_IDS, ...DEV_ESCARPMENT_BLOCK_IDS]
  const isClosedBlockNode = (nodeId: string) => closedBlocks.some((blockId) =>
    nodeId.startsWith(`ped-${blockId}-`))
  const closedCrossings = new Set(integrated.navEdges.filter((edge) =>
    edge.id.startsWith('ped-cross-') &&
    (isClosedBlockNode(edge.fromNodeId) || isClosedBlockNode(edge.toNodeId)))
    .map((edge) => edge.id.replace(/-approach-[ab]$/, '')))
  const navEdges: NavEdgeV2[] = integrated.navEdges.flatMap((edge) => {
    if (isClosedBlockNode(edge.fromNodeId) || isClosedBlockNode(edge.toNodeId) ||
      closedCrossings.has(edge.id.replace(/-approach-[ab]$/, ''))) return []
    const oldFrom = originalNodeById.get(edge.fromNodeId)!
    const oldTo = originalNodeById.get(edge.toNodeId)!
    const from = nodeById.get(edge.fromNodeId)!
    const to = nodeById.get(edge.toNodeId)!
    const portalBuildingId = edge.id.startsWith('portal:')
      ? edge.id.slice('portal:'.length) : null
    const portalPad = portalBuildingId ? buildingEntry.get(portalBuildingId) : null
    if (portalPad?.entryStair) {
      const treads = portalPad.entryStair.treads.map((tread) => ({
        x: tread.center.x, y: GROUND_Y_MM + tread.topMm, z: tread.center.z }))
      const threshold = { x: oldFrom.position.x,
        y: GROUND_Y_MM + portalPad.elevationMm, z: oldFrom.position.z }
      const path = [from.position, ...treads, threshold, to.position]
      return [{ ...edge, kind: 'stair' as const, path, lengthMm: lengthMm(path) }]
    }
    const ground = from.surfaceId === 'ground' && to.surfaceId === 'ground'
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
    const sourcePath = ground ? edge.path.map((point, index) =>
      index === 0 ? from.position : index === edge.path.length - 1 ? to.position : point)
      : edge.path
    const path = ground ? sourcePath.flatMap((point, index) => {
      if (index === sourcePath.length - 1) return []
      const next = sourcePath[index + 1]
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
    return [{ ...edge, path, lengthMm: lengthMm(path),
      kind: portalPad?.entryKind === 'stair' ? 'stair' as const : edge.kind }]
  })
  const bridgeLinks = bridgeProfiles.map((profile) =>
    bridgePedestrianLinks(profile, navNodes, terrain))
  navEdges.push(...bridgeLinks.flatMap((link) => link.edges))
  const ridgeRoad = city.roads.edges.find((edge) => edge.id === RIDGE_ROAD_ID)!
  const ridgeLinks = ridgePedestrianLinks(terrain, navNodes,
    Math.round(ridgeRoad.width * 1000))
  navEdges.push(...ridgeLinks.edges)
  const usedNodeIds = new Set(navEdges.flatMap((edge) => [edge.fromNodeId, edge.toNodeId]))
  const reachableNavNodes = [...navNodes, ...bridgeLinks.flatMap((link) => link.nodes),
    ...ridgeLinks.nodes]
    .filter((node) => usedNodeIds.has(node.id))
  const surfaces = integrated.surfaces.map((surface) => surface.id === 'ground'
    ? { ...surface, elevationMode: 'terrain' as const,
      blockedPolygonsXZ: [...surface.blockedPolygonsXZ,
        ...terrain.nonWalkableEscarpment.patches.map((patch) => patch.polygonXZ),
        ...channelBlockedPolygons(terrain)] }
    : surfaceShift(surface.id) === 0 ? surface : { ...surface,
      elevationMm: surface.elevationMm + surfaceShift(surface.id) }).concat(
        bridgeProfiles.map((profile) => {
          const sidewalkPoints = navEdges.filter((edge) =>
            edge.surfaceId === bridgeSurfaceId(profile)).flatMap((edge) => edge.path)
          const xs = [...profile.path, ...sidewalkPoints].map((point) => point.x)
          const zs = [...profile.path, ...sidewalkPoints].map((point) => point.z)
          const minX = Math.min(...xs) - 500
          const maxX = Math.max(...xs) + 500
          const minZ = Math.min(...zs) - 500
          const maxZ = Math.max(...zs) + 500
          return { id: bridgeSurfaceId(profile), levelId: 'L0', placeId: null,
            interactionZoneId: bridgeSurfaceId(profile), elevationMm: GROUND_Y_MM,
            polygonXZ: [{ x: minX, z: minZ }, { x: maxX, z: minZ },
              { x: maxX, z: maxZ }, { x: minX, z: maxZ }],
            blockedPolygonsXZ: [], clearanceMm: 20_000, indoor: false }
        }), ...culvertProfiles.map((profile) => ({
          id: `terrain-culvert:${profile.edgeId}`, levelId: 'L0', placeId: null,
          interactionZoneId: `terrain-culvert:${profile.edgeId}`,
          elevationMm: GROUND_Y_MM,
          polygonXZ: [
            { x: profile.path[0].x - 6_000, z: profile.path[0].z - 500 },
            { x: profile.path[0].x + 6_000, z: profile.path[0].z - 500 },
            { x: profile.path[0].x + 6_000, z: profile.path.at(-1)!.z + 500 },
            { x: profile.path[0].x - 6_000, z: profile.path.at(-1)!.z + 500 },
          ], blockedPolygonsXZ: [], clearanceMm: 20_000, indoor: false,
        })))
  const resources = integrated.resources.map((resource) => {
    const shift = resource.surfaceId === 'ground'
      ? heightAtMm(terrain, resource.position.x, resource.position.z)
      : surfaceShift(resource.surfaceId)
    return shift === 0 ? resource : { ...resource,
      position: { ...resource.position, y: resource.position.y + shift } }
  })
  return {
    ...integrated,
    config: { ...integrated.config, generatorVersion: 'twilight-dev-v3' },
    baseCity: city,
    roadNodes: city.roads.nodes.map((node) => ({ id: node.id,
      position: { x: Math.round(node.x * 1000), z: Math.round(node.z * 1000) } })),
    roadEdges: city.roads.edges.map((edge) => ({ id: edge.id, from: edge.from,
      to: edge.to, widthMm: Math.round(edge.width * 1000) })),
    terrain, surfaces, navNodes: reachableNavNodes, navEdges, resources,
  }
}
