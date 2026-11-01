import { generateCity, HERO_SEED } from '../../city/generation/generateCity'
import type { GroundPointMm, NavEdgeV2, NavNodeV2, WorldModelV2 } from '../model'
import { createDevTerrainV1, DEV_OPEN_CHANNEL_BLOCK_IDS, heightAtMm,
  DEV_ESCARPMENT_BLOCK_IDS, buildingPadElevationMm,
  roadBendMm, type DevRoadProfileV1, type DevTerrainV1 } from '../terrain/devTerrain'
import { generateIntegratedWorld } from './generateIntegratedWorld'
import { expandOriginalCity } from './expandOriginalCity'
import { createDevOrganicLayout } from './devOrganicLayout'
import { deriveDevRoadCorridor } from './devRoadCorridor'
import { placeDevCorridorParcels } from './devParcelPlacement'
import { applyDevValleyPlan } from './devValleyPlan'
import { applyDevForegroundValley } from './devForegroundValley'
import { applyDevHighlandPlan } from './devHighlandPlan'
import { applyDevRidgeFrontage } from './devRidgeFrontage'
import { applyDevUpperRoadPlan } from './devUpperRoadPlan'
import { DEV_UPPER_CONTOUR_ROAD_EDGE_ID, DEV_UPPER_ROAD_EDGE_ID,
  upperContourCenterZmm } from './devUpperRoadPlan'
import { addDevTerraceNeighborhood, DEV_TERRACE_BLOCK_PREFIX,
  DEV_TERRACE_BUILDING_PREFIX, DEV_TERRACE_SITES } from './devTerraceNeighborhood'
import { rearHighlandBackZmm, rearHighlandFrontZmm } from '../terrain/devHighlandContour'

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
  const organicCity = createDevOrganicLayout(expandedCity)
  const curvedCity = applyDevValleyPlan(deriveDevRoadCorridor(organicCity))
  const baseCity = applyDevForegroundValley(addDevTerraceNeighborhood(applyDevUpperRoadPlan(
    applyDevHighlandPlan(applyDevRidgeFrontage(
      placeDevCorridorParcels(curvedCity))))))
  const integrated = generateIntegratedWorld(seed, {
    baseCity,
    openChannelBlockIds: [...DEV_OPEN_CHANNEL_BLOCK_IDS, ...DEV_ESCARPMENT_BLOCK_IDS],
  })
  const city = integrated.baseCity!
  const terrain = createDevTerrainV1(city, seed)
  const buildingPad = new Map(city.buildings.map((building) => [building.id,
    buildingPadElevationMm(terrain, building.id)]))
  const buildingEntry = new Map(terrain.buildingPads.map((pad) => [pad.buildingId, pad]))
  const stairFoot = new Map(terrain.buildingPads.filter((pad) => pad.entryStair)
    .map((pad) => [`ped-entrance-${pad.buildingId}`, pad.entryStair!.foot]))
  const terraceSurfaceId = 'terrain:terrace-top'
  const isTerraceNode = (id: string): boolean =>
    id.startsWith(`ped-${DEV_TERRACE_BLOCK_PREFIX}`) ||
    id.startsWith(`ped-entrance-${DEV_TERRACE_BUILDING_PREFIX}`)
  const surfaceShift = (surfaceId: string): number => surfaceId.startsWith('interior:')
    ? buildingPad.get(surfaceId.slice('interior:'.length)) ?? 0 : 0
  const navNodes = integrated.navNodes.map((node) => {
    const foot = stairFoot.get(node.id)
    if (foot) return { ...node, position: { x: foot.x, z: foot.z,
      y: GROUND_Y_MM + heightAtMm(terrain, foot.x, foot.z) },
      surfaceId: isTerraceNode(node.id) ? terraceSurfaceId : node.surfaceId }
    if (isTerraceNode(node.id)) return { ...node, surfaceId: terraceSurfaceId,
      position: { ...node.position,
        y: GROUND_Y_MM + heightAtMm(terrain, node.position.x, node.position.z) } }
    const shift = node.surfaceId === 'ground'
      ? heightAtMm(terrain, node.position.x, node.position.z)
      : surfaceShift(node.surfaceId)
    return shift === 0 ? node : { ...node,
      position: { ...node.position, y: node.position.y + shift } }
  })
  const originalNodeById = new Map(integrated.navNodes.map((node) => [node.id, node]))
  const nodeById = new Map(navNodes.map((node) => [node.id, node]))
  const bridgeProfiles = terrain.roadProfiles.filter((profile) =>
    profile.bridge && profile.edgeId !== DEV_UPPER_ROAD_EDGE_ID)
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
    const terrainWalk = from.surfaceId === to.surfaceId &&
      (ground || from.surfaceId === terraceSurfaceId)
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
    const sourcePath = terrainWalk ? edge.path.map((point, index) =>
      index === 0 ? from.position : index === edge.path.length - 1 ? to.position : point)
      : edge.path
    const path = terrainWalk ? sourcePath.flatMap((point, index) => {
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
      surfaceId: terrainWalk ? from.surfaceId : edge.surfaceId,
      kind: portalPad?.entryKind === 'stair' ? 'stair' as const : edge.kind }]
  })
  const bridgeLinks = bridgeProfiles.map((profile) =>
    bridgePedestrianLinks(profile, navNodes, terrain))
  navEdges.push(...bridgeLinks.flatMap((link) => link.edges))
  const access = terrain.terraceAccess
  if (!access) throw new Error('Dev terrace access was not generated')
  const terraceWestXmm = access.trail[0].x - 4_000
  const terraceEastXmm = access.trail.at(-1)!.x + 4_000
  const terraceContourSteps = Math.ceil((terraceEastXmm - terraceWestXmm) / 2_000)
  const terracePlaceId = 'public:dev-north-terrace'
  const terraceConnectorId = 'terrain:terrace-stair'
  const footId = 'terrain:terrace-foot'
  const trailNodeId = (index: number) => `terrain:terrace-trail:${index}`
  const trailStep = 8
  const trailEdgeCount = (access.trail.length - 1) / trailStep
  if (!Number.isInteger(trailEdgeCount) ||
    access.stairTrailIndex % trailStep !== 0) {
    throw new Error('Terrace trail must align with its navigation nodes')
  }
  const crossingNode = nodeById.get(access.crossingNodeId)
  if (!crossingNode || crossingNode.surfaceId !== 'ground') {
    throw new Error('Missing terrace crossing node in integrated navigation')
  }
  const terraceNodes: NavNodeV2[] = [
    { id: footId, position: access.foot, surfaceId: 'ground' },
    ...Array.from({ length: trailEdgeCount + 1 }, (_, index) => ({
      id: trailNodeId(index), position: access.trail[index * trailStep],
      surfaceId: terraceSurfaceId,
    })),
  ]
  const crossingPath = access.crossing
  const stairEdgeId = 'terrain:terrace-stair-edge'
  navEdges.push({ id: 'terrain:terrace-crossing',
    fromNodeId: crossingNode.id, toNodeId: footId, path: crossingPath,
    surfaceId: 'ground', connectorId: null, kind: 'crossing',
    lengthMm: lengthMm(crossingPath), accessId: null, direction: 'both' },
  { id: stairEdgeId, fromNodeId: footId,
    toNodeId: trailNodeId(access.stairTrailIndex / trailStep),
    path: access.stair, surfaceId: null, connectorId: terraceConnectorId,
    kind: 'stair', lengthMm: lengthMm(access.stair), accessId: null,
    direction: 'both' },
  ...Array.from({ length: trailEdgeCount }, (_, index): NavEdgeV2 => {
    const path = access.trail.slice(index * trailStep,
      index * trailStep + trailStep + 1)
    return { id: `terrain:terrace-trail-edge:${index}`,
      fromNodeId: trailNodeId(index), toNodeId: trailNodeId(index + 1),
      path, surfaceId: terraceSurfaceId, connectorId: null,
      kind: 'walk', lengthMm: lengthMm(path), accessId: null,
      direction: 'both' }
  }))
  const contourProfile = terrain.roadProfiles.find((profile) =>
    profile.edgeId === DEV_UPPER_CONTOUR_ROAD_EDGE_ID)
  if (!contourProfile || (contourProfile.path.length - 1) % 4 !== 0) {
    throw new Error('Upper contour road needs aligned pedestrian samples')
  }
  const contourRoad = city.roads.edges.find((edge) =>
    edge.id === DEV_UPPER_CONTOUR_ROAD_EDGE_ID)!
  const sidewalkOffsetMm = Math.round((contourRoad.width / 2 + 0.95) * 1_000)
  const sidewalkAt = (side: -1 | 1) => contourProfile.path.map((point, index, path) => {
    const before = path[Math.max(0, index - 1)]
    const after = path[Math.min(path.length - 1, index + 1)]
    const dx = after.x - before.x
    const dz = after.z - before.z
    const span = Math.hypot(dx, dz) || 1
    const offsetMm = (contourProfile.widthsMm?.[index] ??
      Math.round(contourRoad.width * 1_000)) / 2 + 950
    const x = Math.round(point.x - side * dz / span * offsetMm)
    const z = Math.round(point.z + side * dx / span * offsetMm)
    return { x, y: point.y + 180 + heightAtMm(terrain, x, z) -
      heightAtMm(terrain, point.x, point.z), z }
  })
  const contourWalk = sidewalkAt(-1)
  const contourNorthWalk = sidewalkAt(1)
  const contourNodeId = (index: number) => `terrain:upper-contour-walk:${index}`
  const contourNorthNodeId = (index: number) =>
    `terrain:upper-contour-north-walk:${index}`
  const contourEdgeCount = (contourWalk.length - 1) / 4
  const contourNodes: NavNodeV2[] = Array.from({ length: contourEdgeCount + 1 },
    (_, index) => ({ id: contourNodeId(index),
      position: contourWalk[index * 4], surfaceId: terraceSurfaceId }))
  const contourNorthNodes: NavNodeV2[] = Array.from({ length: contourEdgeCount + 1 },
    (_, index) => ({ id: contourNorthNodeId(index),
      position: contourNorthWalk[index * 4], surfaceId: terraceSurfaceId }))
  for (let index = 0; index < contourEdgeCount; index += 1) {
    for (const [side, nodes, path] of [
      ['south', contourNodes, contourWalk],
      ['north', contourNorthNodes, contourNorthWalk],
    ] as const) {
      const section = path.slice(index * 4, index * 4 + 5)
      navEdges.push({ id: side === 'south'
        ? `terrain:upper-contour-walk-edge:${index}`
        : `terrain:upper-contour-north-walk-edge:${index}`,
        fromNodeId: nodes[index].id, toNodeId: nodes[index + 1].id,
        path: section, surfaceId: terraceSurfaceId, connectorId: null,
        kind: 'walk', lengthMm: lengthMm(section), accessId: null,
        direction: 'both' })
    }
  }
  for (const index of [Math.round((86 - 30) / 4), contourEdgeCount]) {
    const south = contourNodes[index]
    const north = contourNorthNodes[index]
    const middle = contourProfile.path[index * 4]
    const path = [north.position, { x: middle.x,
      y: GROUND_Y_MM + heightAtMm(terrain, middle.x, middle.z),
      z: middle.z }, south.position]
    navEdges.push({ id: `terrain:upper-contour-crossing:${index}`,
      fromNodeId: north.id, toNodeId: south.id, path,
      surfaceId: terraceSurfaceId, connectorId: null, kind: 'crossing',
      lengthMm: lengthMm(path), accessId: null, direction: 'both' })
  }
  const trailEnd = terraceNodes.at(-1)!
  const contourStart = contourNodes[5]
  const transferSegments = Math.max(2, Math.ceil(Math.hypot(
    trailEnd.position.x - contourStart.position.x,
    trailEnd.position.z - contourStart.position.z) / 500))
  const contourTransfer = Array.from({ length: transferSegments + 1 }, (_, index) => {
    const t = index / transferSegments
    const x = Math.round(trailEnd.position.x +
      (contourStart.position.x - trailEnd.position.x) * t)
    const z = Math.round(trailEnd.position.z +
      (contourStart.position.z - trailEnd.position.z) * t)
    return { x, y: GROUND_Y_MM + heightAtMm(terrain, x, z), z }
  })
  navEdges.push({ id: 'terrain:upper-contour-transfer',
    fromNodeId: trailEnd.id, toNodeId: contourStart.id, path: contourTransfer,
    surfaceId: terraceSurfaceId, connectorId: null, kind: 'walk',
    lengthMm: lengthMm(contourTransfer), accessId: null, direction: 'both' })
  const stairTrailNode = terraceNodes[access.stairTrailIndex / trailStep]
  const contourLanding = [...contourNodes].sort((a, b) =>
    Math.hypot(a.position.x - stairTrailNode.position.x,
      a.position.z - stairTrailNode.position.z) -
    Math.hypot(b.position.x - stairTrailNode.position.x,
      b.position.z - stairTrailNode.position.z) || a.id.localeCompare(b.id))[0]
  if (!contourLanding || Math.hypot(contourLanding.position.x - stairTrailNode.position.x,
    contourLanding.position.z - stairTrailNode.position.z) > 3_000 ||
    Math.abs(contourLanding.position.y - stairTrailNode.position.y) > 800) {
    throw new Error('Upper contour sidewalk misses terrace stair landing')
  }
  const landingPath = [stairTrailNode.position, contourLanding.position]
  navEdges.push({ id: 'terrain:upper-contour-stair-landing',
    fromNodeId: stairTrailNode.id, toNodeId: contourLanding.id, path: landingPath,
    surfaceId: terraceSurfaceId, connectorId: null, kind: 'walk',
    lengthMm: lengthMm(landingPath), accessId: null, direction: 'both' })
  for (let index = 0; index < DEV_TERRACE_SITES.length; index += 1) {
    const blockId = `${DEV_TERRACE_BLOCK_PREFIX}${index}`
    const ring = navNodes.filter((node) =>
      node.id.startsWith(`ped-${blockId}-polygon-`))
    const block = city.blocks.find((item) => item.id === blockId)!
    const source = ring.sort((a, b) =>
      Math.abs(a.position.x - block.x * 1_000) -
      Math.abs(b.position.x - block.x * 1_000) ||
      b.position.z - a.position.z || a.id.localeCompare(b.id))[0]
    if (!source) throw new Error(`Missing terrace sidewalk for ${blockId}`)
    const destination = [...contourNorthNodes].sort((a, b) =>
      Math.hypot(a.position.x - source.position.x,
        a.position.z - source.position.z) -
      Math.hypot(b.position.x - source.position.x,
        b.position.z - source.position.z) || a.id.localeCompare(b.id))[0]
    const count = Math.max(1, Math.ceil(Math.hypot(
      source.position.x - destination.position.x,
      source.position.z - destination.position.z) / 1_000))
    const path = Array.from({ length: count + 1 }, (_, step) => {
      const t = step / count
      const x = Math.round(source.position.x +
        (destination.position.x - source.position.x) * t)
      const z = Math.round(source.position.z +
        (destination.position.z - source.position.z) * t)
      return { x, y: GROUND_Y_MM + heightAtMm(terrain, x, z), z }
    })
    path[0] = source.position
    path[path.length - 1] = destination.position
    navEdges.push({ id: `terrain:terrace-building-link:${index}`,
      fromNodeId: source.id, toNodeId: destination.id, path,
      surfaceId: terraceSurfaceId, connectorId: null, kind: 'walk',
      lengthMm: lengthMm(path), accessId: null, direction: 'both' })
  }
  const upperProfile = terrain.roadProfiles.find((profile) =>
    profile.edgeId === DEV_UPPER_ROAD_EDGE_ID)
  if (!upperProfile) throw new Error('Missing upper road profile')
  const upperWalk = upperProfile.path.map((point, index, path) => {
    const before = path[Math.max(0, index - 1)]
    const after = path[Math.min(path.length - 1, index + 1)]
    const dx = after.x - before.x
    const dz = after.z - before.z
    const span = Math.hypot(dx, dz) || 1
    const offsetMm = 4_150
    return { x: Math.round(point.x + dz / span * offsetMm),
      y: point.y + 190,
      z: Math.round(point.z - dx / span * offsetMm) }
  })
  const rampStart = [...navNodes].filter((node) =>
    node.surfaceId === 'ground' && node.id.includes('polygon'))
    .sort((a, b) => Math.hypot(a.position.x - upperWalk[0].x,
      a.position.z - upperWalk[0].z) -
      Math.hypot(b.position.x - upperWalk[0].x,
        b.position.z - upperWalk[0].z) || a.id.localeCompare(b.id))[0]
  if (!rampStart || Math.hypot(rampStart.position.x - upperWalk[0].x,
    rampStart.position.z - upperWalk[0].z) > 12_000) {
    throw new Error('Upper road ramp has no ground approach')
  }
  const approachCount = Math.ceil(Math.hypot(
    rampStart.position.x - upperWalk[0].x,
    rampStart.position.z - upperWalk[0].z) / 500)
  const approach = Array.from({ length: approachCount }, (_, index) => {
    const t = index / approachCount
    const x = Math.round(rampStart.position.x +
      (upperWalk[0].x - rampStart.position.x) * t)
    const z = Math.round(rampStart.position.z +
      (upperWalk[0].z - rampStart.position.z) * t)
    return { x, y: GROUND_Y_MM + heightAtMm(terrain, x, z), z }
  })
  const rampEnd = access.trail.at(-1)!
  const rampPath = [...approach, ...upperWalk, rampEnd]
  const upperConnectorId = 'terrain:upper-road-ramp'
  const upperRampEdgeId = 'terrain:upper-road-pedestrian-ramp'
  navEdges.push({ id: upperRampEdgeId,
    fromNodeId: rampStart.id, toNodeId: trailNodeId(trailEdgeCount), path: rampPath,
    surfaceId: null, connectorId: upperConnectorId, kind: 'ramp',
    lengthMm: lengthMm(rampPath), accessId: null, direction: 'both' })
  const usedNodeIds = new Set(navEdges.flatMap((edge) => [edge.fromNodeId, edge.toNodeId]))
  const reachableNavNodes = [...navNodes, ...bridgeLinks.flatMap((link) => link.nodes),
    ...terraceNodes, ...contourNodes, ...contourNorthNodes]
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
          polygonXZ: (() => {
            const xs = profile.path.map((point) => point.x)
            const zs = profile.path.map((point) => point.z)
            const minX = Math.min(...xs) - 6_000
            const maxX = Math.max(...xs) + 6_000
            const minZ = Math.min(...zs) - 6_000
            const maxZ = Math.max(...zs) + 6_000
            return [{ x: minX, z: minZ }, { x: maxX, z: minZ },
              { x: maxX, z: maxZ }, { x: minX, z: maxZ }]
          })(), blockedPolygonsXZ: [], clearanceMm: 20_000, indoor: false,
        })), {
          id: `connector:${terraceConnectorId}`, levelId: 'L0', placeId: null,
          interactionZoneId: `connector:${terraceConnectorId}`,
          elevationMm: GROUND_Y_MM, elevationMode: 'terrain' as const,
          polygonXZ: [
            { x: access.foot.x - 1_500, z: access.stair[0].z + 300 },
            { x: access.foot.x + 1_500, z: access.stair[0].z + 300 },
            { x: access.foot.x + 1_500, z: access.stair.at(-1)!.z - 300 },
            { x: access.foot.x - 1_500, z: access.stair.at(-1)!.z - 300 },
          ], blockedPolygonsXZ: [], clearanceMm: 5_000, indoor: false,
        }, {
          id: terraceSurfaceId, levelId: 'L0', placeId: terracePlaceId,
          interactionZoneId: terraceSurfaceId, elevationMm: GROUND_Y_MM,
          elevationMode: 'terrain' as const,
          polygonXZ: [
            ...Array.from({ length: terraceContourSteps + 1 }, (_, index) => {
              const x = Math.round(terraceWestXmm +
                (terraceEastXmm - terraceWestXmm) * index / terraceContourSteps)
              return { x, z: rearHighlandFrontZmm(x) - 6_500 }
            }),
            ...Array.from({ length: terraceContourSteps + 1 }, (_, index) => {
              const x = Math.round(terraceEastXmm -
                (terraceEastXmm - terraceWestXmm) * index / terraceContourSteps)
              return { x, z: Math.max(rearHighlandBackZmm(x) + 500,
                Math.min(rearHighlandFrontZmm(x) - 23_500,
                  upperContourCenterZmm(x) - sidewalkOffsetMm - 500)) }
            }),
          ], blockedPolygonsXZ: city.buildings
            .filter((building) => building.id.startsWith(DEV_TERRACE_BUILDING_PREFIX))
            .flatMap((building) => building.masses.filter((mass) => mass.baseY < 2)
              .map((mass) => {
                const minX = Math.round((building.x + mass.offsetX - mass.width / 2) * 1_000)
                const maxX = Math.round((building.x + mass.offsetX + mass.width / 2) * 1_000)
                const minZ = Math.round((building.z + mass.offsetZ - mass.depth / 2) * 1_000)
                const maxZ = Math.round((building.z + mass.offsetZ + mass.depth / 2) * 1_000)
                return [{ x: minX, z: minZ }, { x: maxX, z: minZ },
                  { x: maxX, z: maxZ }, { x: minX, z: maxZ }]
              })), clearanceMm: 10_000, indoor: false,
        }, {
          id: `connector:${upperConnectorId}`, levelId: 'L0', placeId: null,
          interactionZoneId: `connector:${upperConnectorId}`,
          elevationMm: GROUND_Y_MM,
          polygonXZ: [
            { x: Math.min(...rampPath.map((point) => point.x)) - 5_000,
              z: Math.min(...rampPath.map((point) => point.z)) - 5_000 },
            { x: Math.max(...rampPath.map((point) => point.x)) + 5_000,
              z: Math.min(...rampPath.map((point) => point.z)) - 5_000 },
            { x: Math.max(...rampPath.map((point) => point.x)) + 5_000,
              z: Math.max(...rampPath.map((point) => point.z)) + 5_000 },
            { x: Math.min(...rampPath.map((point) => point.x)) - 5_000,
              z: Math.max(...rampPath.map((point) => point.z)) + 5_000 },
          ], blockedPolygonsXZ: [], clearanceMm: 20_000, indoor: false,
        })
  const resources = integrated.resources.map((resource) => {
    const shift = resource.surfaceId === 'ground'
      ? heightAtMm(terrain, resource.position.x, resource.position.z)
      : surfaceShift(resource.surfaceId)
    return shift === 0 ? resource : { ...resource,
      position: { ...resource.position, y: resource.position.y + shift } }
  })
  const terrainWithWalkways: DevTerrainV1 = { ...terrain,
    terraceAccess: { ...access, walkways: navEdges.filter((edge) =>
      edge.id.startsWith(`ped-${DEV_TERRACE_BLOCK_PREFIX}`) ||
      edge.id.startsWith(`ped-access-${DEV_TERRACE_BUILDING_PREFIX}`) ||
      edge.id.startsWith('terrain:terrace-building-link:'))
      .map((edge) => ({ edgeId: edge.id, path: edge.path,
        widthMm: edge.id.includes('building-link') ? 1_300 :
          edge.id.startsWith('ped-access-') ? 1_200 : 900 })) } }
  return {
    ...integrated,
    config: { ...integrated.config, generatorVersion: 'twilight-dev-v22' },
    baseCity: city,
    roadNodes: city.roads.nodes.map((node) => ({ id: node.id,
      position: { x: Math.round(node.x * 1000), z: Math.round(node.z * 1000) } })),
    roadEdges: city.roads.edges.map((edge) => ({ id: edge.id, from: edge.from,
      to: edge.to, widthMm: Math.round(edge.width * 1000),
      ...(edge.taperAtStart ? { taperAtStart: {
        widthMm: Math.round(edge.taperAtStart.width * 1_000),
        lengthMm: Math.round(edge.taperAtStart.length * 1_000) } } : {}) })),
    terrain: terrainWithWalkways, surfaces, navNodes: reachableNavNodes,
    navEdges, resources,
    connectors: [...integrated.connectors, { id: terraceConnectorId,
      kind: 'stair', lowerSurfaceId: 'ground', upperSurfaceId: terraceSurfaceId,
      edgeIds: [stairEdgeId], capacity: 12 }, { id: upperConnectorId,
      kind: 'ramp', lowerSurfaceId: 'ground', upperSurfaceId: terraceSurfaceId,
      edgeIds: [upperRampEdgeId], capacity: 40 }],
    places: [...integrated.places, {
      id: terracePlaceId, name: 'North Terrace Walk', kind: 'park',
      districtId: 'block-3--1', surfaceIds: [terraceSurfaceId],
      accessNodeIds: [trailNodeId(access.stairTrailIndex / trailStep)],
      activityTags: ['leisure'],
      openingHours: [{ openMinute: 0, closeMinute: 1440 }],
      capacity: 6, attractiveness: 0.78, typicalVisitTicks: [18, 55],
      slotNodeIds: Array.from({ length: 6 }, (_, index) =>
        trailNodeId(2 + index * 3)),
    }],
  }
}
