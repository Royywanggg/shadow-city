import type { CityModel, RoadEdge, RoadNode } from '../../city/model'
import type { GroundPointMm, NavEdgeV2, NavNodeV2, WorldPointMm } from '../model'
import { heightAtMm, type DevRoadProfileV1, type DevTerrainV1 } from '../terrain/devTerrain'

const JUNCTION_ID = 'dev-road:ridge-junction'
const SOUTH_EDGE_ID = 'edge-x-4-0'
const OLD_STRAIGHT_ID = 'edge-z-5--1'
export const RIDGE_ROAD_ID = 'dev-road:ridge-link'
const EAST_EDGE_ID = 'dev-road:ridge-row-east'
const ROAD_TOP_MM = 70

function smoothstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  return clamped * clamped * (3 - 2 * clamped)
}

function point(terrain: DevTerrainV1, x: number, z: number): WorldPointMm {
  return { x, y: ROAD_TOP_MM + heightAtMm(terrain, x, z), z }
}

function straightProfile(terrain: DevTerrainV1, edge: RoadEdge,
  nodes: ReadonlyMap<string, RoadNode>): DevRoadProfileV1 {
  const from = nodes.get(edge.from)!
  const to = nodes.get(edge.to)!
  const dx = Math.round((to.x - from.x) * 1000)
  const dz = Math.round((to.z - from.z) * 1000)
  const segments = Math.max(2, Math.ceil(Math.hypot(dx, dz) / 1_000))
  return { edgeId: edge.id, bridge: false,
    path: Array.from({ length: segments + 1 }, (_, index) => {
      const t = index / segments
      return point(terrain, Math.round(from.x * 1000 + dx * t),
        Math.round(from.z * 1000 + dz * t))
    }) }
}

function distanceToRectangle(point: GroundPointMm,
  bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>): number {
  return Math.hypot(Math.max(bounds.minX - point.x, 0, point.x - bounds.maxX),
    Math.max(bounds.minZ - point.z, 0, point.z - bounds.maxZ))
}

/** A real dev-only road graph diversion around the western ridge, with a three-way junction. */
export function deriveDevRidgeRoad(city: CityModel, terrain: DevTerrainV1):
  Readonly<{ city: CityModel; terrain: DevTerrainV1 }> {
  const oldSouth = city.roads.edges.find((edge) => edge.id === SOUTH_EDGE_ID)
  const oldStraight = city.roads.edges.find((edge) => edge.id === OLD_STRAIGHT_ID)
  const oldNodes = new Map(city.roads.nodes.map((node) => [node.id, node]))
  if (!oldSouth || !oldStraight || oldSouth.to !== oldStraight.to &&
    oldSouth.to !== oldStraight.from) {
    throw new Error('Dev ridge diversion requires the original connected road corridor')
  }
  const north = oldNodes.get(oldStraight.from)!
  const south = oldNodes.get(oldStraight.to)!
  const southXmm = Math.round(south.x * 1000)
  const junctionXmm = southXmm - 6_000
  const corridorXmm = southXmm + 2_100
  if (Math.round(south.z * 1000) !== -100_000 ||
    Math.round(north.z * 1000) !== -145_000 ||
    southXmm <= junctionXmm) {
    throw new Error('Dev ridge diversion no longer fits the expected open escarpment blocks')
  }
  const junction: RoadNode = { id: JUNCTION_ID, x: junctionXmm / 1000, z: south.z }
  const roadNodes = [...city.roads.nodes, junction]
  const southWest: RoadEdge = { ...oldSouth, to: JUNCTION_ID }
  const southEast: RoadEdge = { ...oldSouth, id: EAST_EDGE_ID,
    from: JUNCTION_ID, to: oldSouth.to }
  const ridge: RoadEdge = { ...oldStraight, id: RIDGE_ROAD_ID,
    from: JUNCTION_ID, to: oldStraight.from }
  const roadEdges = city.roads.edges.flatMap((edge) => edge.id === SOUTH_EDGE_ID
    ? [southWest, southEast] : edge.id === OLD_STRAIGHT_ID ? [ridge] : [edge])
  const nodeById = new Map(roadNodes.map((node) => [node.id, node]))
  const northX = Math.round(north.x * 1000)
  const path = Array.from({ length: 91 }, (_, index) => {
    const z = -100_000 - index * 500
    const x = z >= -107_000
      ? junctionXmm + Math.round((corridorXmm - junctionXmm) *
        smoothstep((-100_000 - z) / 7_000))
      : z >= -134_000 ? corridorXmm
        : corridorXmm + Math.round((northX - corridorXmm) *
          smoothstep((-134_000 - z) / 11_000))
    return point(terrain, x, z)
  })
  path[path.length - 1] = point(terrain, northX, -145_000)
  const ridgeProfile: DevRoadProfileV1 = { edgeId: RIDGE_ROAD_ID, path, bridge: false }
  const roadProfiles = terrain.roadProfiles.flatMap((profile) =>
    profile.edgeId === SOUTH_EDGE_ID
      ? [straightProfile(terrain, southWest, nodeById),
        straightProfile(terrain, southEast, nodeById)]
      : profile.edgeId === OLD_STRAIGHT_ID ? [ridgeProfile] : [profile])

  // Road, curb and sidewalk geometry share this centreline. Refuse any route
  // that leaves less than the full pedestrian verge beside rock or a building.
  const requiredClearance = Math.round(oldStraight.width * 500) + 2_050
  const blocked = [
    ...terrain.nonWalkableEscarpment.patches.map((patch) => {
      const xs = patch.polygonXZ.map((p) => p.x)
      const zs = patch.polygonXZ.map((p) => p.z)
      return { minX: Math.min(...xs), maxX: Math.max(...xs),
        minZ: Math.min(...zs), maxZ: Math.max(...zs) }
    }),
    ...city.buildings.flatMap((building) => building.masses
      .filter((mass) => mass.baseY < 2).map((mass) => ({
        minX: Math.round((building.x + mass.offsetX - mass.width / 2) * 1000),
        maxX: Math.round((building.x + mass.offsetX + mass.width / 2) * 1000),
        minZ: Math.round((building.z + mass.offsetZ - mass.depth / 2) * 1000),
        maxZ: Math.round((building.z + mass.offsetZ + mass.depth / 2) * 1000),
      }))),
  ]
  for (const roadPoint of path) {
    if (blocked.some((bounds) => distanceToRectangle(roadPoint, bounds) < requiredClearance)) {
      throw new Error(`Dev ridge road lacks verge clearance at ${roadPoint.x},${roadPoint.z}`)
    }
  }
  const oldX = Math.round(south.x * 1000)
  const streetFeatures = city.streetFeatures.filter((feature) => {
    const z = Math.round(feature.z * 1000)
    const x = Math.round(feature.x * 1000)
    return z < -146_000 || z > -99_000 || Math.abs(x - oldX) > 4_500
  })
  const pedestrian = { ...city.pedestrian,
    edges: city.pedestrian.edges.filter((edge) => edge.sourceRoadEdgeId !== OLD_STRAIGHT_ID) }
  return { city: { ...city, roads: { nodes: roadNodes, edges: roadEdges },
    streetFeatures, pedestrian }, terrain: { ...terrain, roadProfiles } }
}

/** The two pedestrian verges follow the same curved centreline as the visible road. */
export function ridgePedestrianLinks(terrain: DevTerrainV1,
  existingNodes: readonly NavNodeV2[], roadWidthMm: number):
  Readonly<{ nodes: readonly NavNodeV2[]; edges: readonly NavEdgeV2[] }> {
  const profile = terrain.roadProfiles.find((item) => item.edgeId === RIDGE_ROAD_ID)
  if (!profile) throw new Error('Missing dev ridge road profile')
  const anchors = [
    existingNodes.find((node) => node.id === 'ped-block-4-0-2-0'),
    existingNodes.find((node) => node.id === 'ped-block-4-0-1-0'),
  ]
  if (anchors.some((node) => !node)) throw new Error('Missing dev ridge sidewalk landing')
  const offsetMm = roadWidthMm / 2 + 950
  const nodes: NavNodeV2[] = []
  const edges: NavEdgeV2[] = []
  const groundPoint = (x: number, z: number): WorldPointMm =>
    ({ x, y: 250 + heightAtMm(terrain, x, z), z })
  const sampledPath = (waypoints: readonly WorldPointMm[]): WorldPointMm[] => {
    const result: WorldPointMm[] = []
    for (let segment = 0; segment < waypoints.length - 1; segment += 1) {
      const from = waypoints[segment]
      const to = waypoints[segment + 1]
      const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x,
        to.z - from.z) / 1_000))
      for (let step = 0; step < count; step += 1) {
        const t = step / count
        result.push(groundPoint(Math.round(from.x + (to.x - from.x) * t),
          Math.round(from.z + (to.z - from.z) * t)))
      }
    }
    result.push(waypoints.at(-1)!)
    return result
  }
  const pathLength = (path: readonly WorldPointMm[]): number =>
    path.slice(1).reduce((sum, current, index) => {
      const previous = path[index]
      return sum + Math.round(Math.hypot(current.x - previous.x,
        current.y - previous.y, current.z - previous.z))
    }, 0)
  for (const [sideIndex, sign] of [1, -1].entries()) {
    const side = sign > 0 ? 'east' : 'west'
    const anchor = anchors[sideIndex]!
    const verge = profile.path.map((center, index) => {
      const before = profile.path[Math.max(0, index - 1)]
      const after = profile.path[Math.min(profile.path.length - 1, index + 1)]
      const dx = after.x - before.x
      const dz = after.z - before.z
      const length = Math.hypot(dx, dz)
      const x = center.x + Math.round(-dz / length * offsetMm * sign)
      const z = center.z + Math.round(dx / length * offsetMm * sign)
      return { x, y: 250 + heightAtMm(terrain, x, z), z }
    })
    const end: NavNodeV2 = { id: `dev-ped:ridge-${side}-north`,
      position: verge.at(-1)!, surfaceId: 'ground' }
    const path = [anchor.position, ...verge]
    nodes.push(end)
    edges.push({ id: `dev-ped:ridge-${side}`, fromNodeId: anchor.id,
      toNodeId: end.id, path, surfaceId: 'ground', connectorId: null,
      kind: 'walk', lengthMm: pathLength(path), accessId: null, direction: 'both' })
  }
  // The row at z=-145 m has no developed block to its north. Continue on its
  // south sidewalk to the retained block-3--1 network instead of ending here.
  const northAnchor = existingNodes.find((node) => node.id === 'ped-block-3--1-3-0')
  if (!northAnchor) throw new Error('Missing safe northern ridge sidewalk connection')
  const west = nodes.find((node) => node.id === 'dev-ped:ridge-west-north')!
  const east = nodes.find((node) => node.id === 'dev-ped:ridge-east-north')!
  const northwestPath = sampledPath([west.position,
    groundPoint(west.position.x, northAnchor.position.z), northAnchor.position])
  edges.push({ id: 'dev-ped:ridge-northwest-link', fromNodeId: west.id,
    toNodeId: northAnchor.id, path: northwestPath, surfaceId: 'ground',
    connectorId: null, kind: 'walk', lengthMm: pathLength(northwestPath),
    accessId: null, direction: 'both' })
  const northCrossing = sampledPath([east.position,
    groundPoint(east.position.x, northAnchor.position.z),
    groundPoint(west.position.x, northAnchor.position.z), west.position])
  edges.push({ id: 'dev-ped:ridge-north-crossing', fromNodeId: east.id,
    toNodeId: west.id, path: northCrossing, surfaceId: 'ground',
    connectorId: null, kind: 'crossing', lengthMm: pathLength(northCrossing),
    accessId: null, direction: 'both' })
  return { nodes, edges }
}
