import type { Building, CityBlock, CityModel, RoadEdge, RoadNode,
  StreetFeature } from '../../city/model'

interface Offset {
  readonly x: number
  readonly z: number
}

const EAST_X: readonly (readonly [number, number])[] = [
  [-145, 0], [-100, 0], [-76, 2], [-51, 5], [-27, 4],
  [27, 0], [51, -4], [76, -3], [100, 0], [145, 0],
]
const WEST_X: readonly (readonly [number, number])[] = [
  [-145, 0], [-100, -2], [-76, -5], [-51, -4],
  [-27, 2], [0, 4], [27, 0], [145, 0],
]
const NORTH_Z: readonly (readonly [number, number])[] = [
  [-145, 0], [-100, -3], [-76, -5], [-51, 3],
  [-27, 4], [0, 0], [145, 0],
]
const SOUTH_Z: readonly (readonly [number, number])[] = [
  [-145, 0], [-100, 0], [-76, 2], [-51, 4],
  [0, 5], [51, 3], [76, -2], [100, -4], [145, 0],
]

// Road-node control points bend three approach corridors into the original centre.
// Shared nodes keep every junction connected; the plaza and Galleria corners are fixed.
const INNER_NODE_OFFSETS: Readonly<Record<string, Offset>> = {
  'node-1-2': { x: 0, z: 1 },
  'node-2-2': { x: 0, z: 2 },
  'node-1-3': { x: 0, z: 2.5 },
  'node-2-3': { x: 0, z: 4 },
  'node-6-3': { x: 0, z: 3 },
  'node-7-3': { x: 0, z: 2 },
  'node-6-4': { x: 0, z: 2 },
  'node-7-4': { x: 0, z: 1 },
  'node-3-1': { x: 4, z: 0 },
  'node-3-2': { x: 2, z: 0 },
  'node-3-5': { x: 3, z: 0 },
  'node-3-6': { x: 4, z: 0 },
  'node-3-7': { x: 2, z: 0 },
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function smoothstep(value: number): number {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

function profileAt(points: readonly (readonly [number, number])[], position: number): number {
  if (position <= points[0][0]) return points[0][1]
  for (let index = 1; index < points.length; index += 1) {
    const [beforePosition, beforeValue] = points[index - 1]
    const [afterPosition, afterValue] = points[index]
    if (position <= afterPosition) {
      const t = smoothstep((position - beforePosition) / (afterPosition - beforePosition))
      return beforeValue + (afterValue - beforeValue) * t
    }
  }
  return points.at(-1)![1]
}

function offsetAt(x: number, z: number): Offset {
  // The original city, the channel outlet and the northern rock ridge stay pinned.
  if (Math.abs(x) <= 106 && Math.abs(z) <= 106 ||
    x <= -80 && z >= 30 && z <= 105 ||
    z <= -108 && x >= 0 && x <= 110) return { x: 0, z: 0 }
  const east = smoothstep((x - 100) / 45)
  const west = smoothstep((-x - 100) / 45) * (1 - smoothstep((z - 20) / 10))
  const north = smoothstep((-z - 100) / 45) * (1 - smoothstep(x / 10))
  const south = smoothstep((z - 100) / 45) * smoothstep((x + 100) / 45)
  return {
    x: east * profileAt(EAST_X, z) + west * profileAt(WEST_X, z),
    z: north * profileAt(NORTH_Z, x) + south * profileAt(SOUTH_Z, x),
  }
}

function pointToSegmentDistanceSquared(px: number, pz: number,
  ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax
  const dz = bz - az
  const t = clamp01(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1))
  return (px - ax - dx * t) ** 2 + (pz - az - dz * t) ** 2
}

function orientation(ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number): number {
  return (bx - ax) * (cz - az) - (bz - az) * (cx - ax)
}

function segmentsIntersect(ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, dx: number, dz: number): boolean {
  const a = orientation(ax, az, bx, bz, cx, cz)
  const b = orientation(ax, az, bx, bz, dx, dz)
  const c = orientation(cx, cz, dx, dz, ax, az)
  const d = orientation(cx, cz, dx, dz, bx, bz)
  const onSegment = (px: number, pz: number, qx: number, qz: number,
    rx: number, rz: number) => qx >= Math.min(px, rx) - 1e-9 &&
      qx <= Math.max(px, rx) + 1e-9 && qz >= Math.min(pz, rz) - 1e-9 &&
      qz <= Math.max(pz, rz) + 1e-9
  if (Math.abs(a) <= 1e-9 && onSegment(ax, az, cx, cz, bx, bz) ||
    Math.abs(b) <= 1e-9 && onSegment(ax, az, dx, dz, bx, bz) ||
    Math.abs(c) <= 1e-9 && onSegment(cx, cz, ax, az, dx, dz) ||
    Math.abs(d) <= 1e-9 && onSegment(cx, cz, bx, bz, dx, dz)) return true
  return (a > 0) !== (b > 0) && (c > 0) !== (d > 0)
}

function distanceToFootprint(ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, halfX: number, halfZ: number): number {
  const corners: readonly (readonly [number, number])[] = [
    [cx - halfX, cz - halfZ], [cx + halfX, cz - halfZ],
    [cx + halfX, cz + halfZ], [cx - halfX, cz + halfZ],
  ]
  if (Math.abs(ax - cx) <= halfX && Math.abs(az - cz) <= halfZ ||
    Math.abs(bx - cx) <= halfX && Math.abs(bz - cz) <= halfZ) return 0
  let best = Infinity
  for (let index = 0; index < corners.length; index += 1) {
    const [x0, z0] = corners[index]
    const [x1, z1] = corners[(index + 1) % corners.length]
    if (segmentsIntersect(ax, az, bx, bz, x0, z0, x1, z1)) return 0
    best = Math.min(best,
      pointToSegmentDistanceSquared(ax, az, x0, z0, x1, z1),
      pointToSegmentDistanceSquared(bx, bz, x0, z0, x1, z1),
      pointToSegmentDistanceSquared(x0, z0, ax, az, bx, bz),
      pointToSegmentDistanceSquared(x1, z1, ax, az, bx, bz))
  }
  return Math.sqrt(best)
}

function assertRoadClearance(city: CityModel): void {
  const nodes = new Map(city.roads.nodes.map((node) => [node.id, node]))
  const footprints = city.buildings.flatMap((building) => building.masses
    .filter((mass) => mass.baseY < 2).map((mass) => ({
      id: building.id,
      x: building.x + mass.offsetX,
      z: building.z + mass.offsetZ,
      halfX: mass.width / 2,
      halfZ: mass.depth / 2,
    })))
  for (const edge of city.roads.edges) {
    const from = nodes.get(edge.from)!
    const to = nodes.get(edge.to)!
    const required = edge.width / 2 + 0.3
    for (const footprint of footprints) {
      if (Math.max(from.x, to.x) + required < footprint.x - footprint.halfX ||
        Math.min(from.x, to.x) - required > footprint.x + footprint.halfX ||
        Math.max(from.z, to.z) + required < footprint.z - footprint.halfZ ||
        Math.min(from.z, to.z) - required > footprint.z + footprint.halfZ) continue
      if (distanceToFootprint(from.x, from.z, to.x, to.z, footprint.x,
        footprint.z, footprint.halfX, footprint.halfZ) < required) {
        throw new Error(`Organic road ${edge.id} conflicts with ${footprint.id}`)
      }
    }
  }
}

interface BlockRect {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}

const RING_OFFSET = 0.72
const CURB_CLEARANCE = 0.25

function blockRect(block: CityBlock): BlockRect {
  return { minX: block.x - block.width / 2, maxX: block.x + block.width / 2,
    minZ: block.z - block.depth / 2, maxZ: block.z + block.depth / 2 }
}

function safeBlockBounds(block: CityBlock, rect: BlockRect,
  edges: ReadonlyMap<string, RoadEdge>, nodes: ReadonlyMap<string, RoadNode>): BlockRect {
  const vertical = (column: number) => {
    const edge = edges.get(`edge-z-${column}-${block.row}`)
    if (!edge) throw new Error(`Missing road beside ${block.id}`)
    const a = nodes.get(edge.from)!
    const b = nodes.get(edge.to)!
    const dx = b.x - a.x
    const dz = b.z - a.z
    if (dz <= 0) throw new Error(`Reversed vertical road ${edge.id}`)
    const xAt = (z: number) => a.x + dx * (z - a.z) / dz
    const normalMargin = (edge.width / 2 + CURB_CLEARANCE) *
      Math.hypot(dx, dz) / dz + RING_OFFSET
    return { lower: Math.max(xAt(rect.minZ - RING_OFFSET),
      xAt(rect.maxZ + RING_OFFSET)) + normalMargin,
    upper: Math.min(xAt(rect.minZ - RING_OFFSET),
      xAt(rect.maxZ + RING_OFFSET)) - normalMargin }
  }
  const horizontal = (row: number) => {
    const edge = edges.get(`edge-x-${block.column}-${row}`)
    if (!edge) throw new Error(`Missing road beside ${block.id}`)
    const a = nodes.get(edge.from)!
    const b = nodes.get(edge.to)!
    const dx = b.x - a.x
    const dz = b.z - a.z
    if (dx <= 0) throw new Error(`Reversed horizontal road ${edge.id}`)
    const zAt = (x: number) => a.z + dz * (x - a.x) / dx
    const normalMargin = (edge.width / 2 + CURB_CLEARANCE) *
      Math.hypot(dx, dz) / dx + RING_OFFSET
    return { lower: Math.max(zAt(rect.minX - RING_OFFSET),
      zAt(rect.maxX + RING_OFFSET)) + normalMargin,
    upper: Math.min(zAt(rect.minX - RING_OFFSET),
      zAt(rect.maxX + RING_OFFSET)) - normalMargin }
  }
  const west = vertical(block.column)
  const east = vertical(block.column + 1)
  const north = horizontal(block.row)
  const south = horizontal(block.row + 1)
  return { minX: west.lower, maxX: east.upper,
    minZ: north.lower, maxZ: south.upper }
}

function fitBlockToRoads(block: CityBlock, desired: BlockRect,
  edges: ReadonlyMap<string, RoadEdge>, nodes: ReadonlyMap<string, RoadNode>): CityBlock {
  const pinned = ['block-3-3', 'block-4-3', 'block-0-4', 'block-0-5',
    'block-0-6', 'block--1-6', 'block-4--1', 'block-5--1',
    'block-6--1'].includes(block.id)
  let rect = desired
  if (!pinned) {
    for (let pass = 0; pass < 8; pass += 1) {
      const safe = safeBlockBounds(block, rect, edges, nodes)
      rect = { minX: Math.max(rect.minX, safe.minX),
        maxX: Math.min(rect.maxX, safe.maxX),
        minZ: Math.max(rect.minZ, safe.minZ),
        maxZ: Math.min(rect.maxZ, safe.maxZ) }
      if (rect.maxX - rect.minX < 6 || rect.maxZ - rect.minZ < 6) {
        throw new Error(`Road movement leaves no buildable area in ${block.id}`)
      }
    }
  }
  const safe = safeBlockBounds(block, rect, edges, nodes)
  if (rect.minX < safe.minX - 1e-6 || rect.maxX > safe.maxX + 1e-6 ||
    rect.minZ < safe.minZ - 1e-6 || rect.maxZ > safe.maxZ + 1e-6) {
    throw new Error(`Sidewalk ring enters road curb at ${block.id}`)
  }
  if (pinned) return block
  const x = (rect.minX + rect.maxX) / 2
  const z = (rect.minZ + rect.maxZ) / 2
  const width = rect.maxX - rect.minX
  const depth = rect.maxZ - rect.minZ
  return x === block.x && z === block.z && width === block.width &&
    depth === block.depth ? block : { ...block, x, z, width, depth }
}

function pointOnShiftedRoad(feature: StreetFeature, edge: RoadEdge,
  before: ReadonlyMap<string, RoadNode>, after: ReadonlyMap<string, RoadNode>): StreetFeature {
  const a = before.get(edge.from)!
  const b = before.get(edge.to)!
  const nextA = after.get(edge.from)!
  const nextB = after.get(edge.to)!
  if (nextA.x === a.x && nextA.z === a.z && nextB.x === b.x && nextB.z === b.z) {
    return feature
  }
  const dx = b.x - a.x
  const dz = b.z - a.z
  const length = Math.hypot(dx, dz)
  const t = ((feature.x - a.x) * dx + (feature.z - a.z) * dz) / (length * length)
  const offset = ((feature.x - a.x) * -dz + (feature.z - a.z) * dx) / length
  const newDx = nextB.x - nextA.x
  const newDz = nextB.z - nextA.z
  const newLength = Math.hypot(newDx, newDz)
  return { ...feature,
    x: nextA.x + newDx * t - newDz / newLength * offset,
    z: nextA.z + newDz * t + newDx / newLength * offset,
    rotationY: Math.atan2(newDx, newDz) }
}

/**
 * Positions the outer city without rebuilding any identities or building meshes.
 * The returned pedestrian network is intentionally stale; the integrated-world
 * entry point must call derivePedestrianNetwork on the returned CityModel.
 */
export function createDevOrganicLayout(city: CityModel): CityModel {
  if (city.size !== 300 || !city.roads.nodes.some((node) => node.id === 'node-8-8')) {
    throw new Error('Organic layout requires the expanded 300 m CityModel')
  }
  const originalNodes = new Map(city.roads.nodes.map((node) => [node.id, node]))
  const roadNodes = city.roads.nodes.map((node) => {
    const outer = offsetAt(node.x, node.z)
    const inner = INNER_NODE_OFFSETS[node.id] ?? { x: 0, z: 0 }
    const offset = { x: outer.x + inner.x, z: outer.z + inner.z }
    return offset.x === 0 && offset.z === 0 ? node :
      { ...node, x: node.x + offset.x, z: node.z + offset.z }
  })
  const movedNodes = new Map(roadNodes.map((node) => [node.id, node]))
  const roadEdges = new Map(city.roads.edges.map((edge) => [edge.id, edge]))
  const blocks = city.blocks.map((block): CityBlock => {
    const corners = [
      [block.column, block.row], [block.column + 1, block.row],
      [block.column, block.row + 1], [block.column + 1, block.row + 1],
    ]
    const shift = corners.reduce((sum, [column, row]) => {
      const id = `node-${column}-${row}`
      const before = originalNodes.get(id)!
      const after = movedNodes.get(id)!
      return { x: sum.x + (after.x - before.x) / 4,
        z: sum.z + (after.z - before.z) / 4 }
    }, { x: 0, z: 0 })
    const original = blockRect(block)
    return fitBlockToRoads(block, {
      minX: original.minX + shift.x, maxX: original.maxX + shift.x,
      minZ: original.minZ + shift.z, maxZ: original.maxZ + shift.z,
    }, roadEdges, movedNodes)
  })
  const beforeBlocks = new Map(city.blocks.map((block) => [block.id, block]))
  const afterBlocks = new Map(blocks.map((block) => [block.id, block]))
  const parcels = city.parcels.map((parcel) => {
    const before = beforeBlocks.get(parcel.blockId)!
    const after = afterBlocks.get(parcel.blockId)!
    if (before === after) return parcel
    const scaleX = after.width / before.width
    const scaleZ = after.depth / before.depth
    return { ...parcel,
      x: after.x + (parcel.x - before.x) * scaleX,
      z: after.z + (parcel.z - before.z) * scaleZ,
      width: parcel.width * scaleX, depth: parcel.depth * scaleZ }
  })
  const beforeParcels = new Map(city.parcels.map((parcel) => [parcel.id, parcel]))
  const afterParcels = new Map(parcels.map((parcel) => [parcel.id, parcel]))
  const buildings = city.buildings.map((building): Building => {
    const before = beforeParcels.get(building.parcelId)!
    const after = afterParcels.get(building.parcelId)!
    const shift = { x: after.x - before.x, z: after.z - before.z }
    return shift.x === 0 && shift.z === 0 ? building : { ...building,
      x: building.x + shift.x, z: building.z + shift.z,
      entrance: { ...building.entrance,
        x: building.entrance.x + shift.x, z: building.entrance.z + shift.z } }
  })
  const streetFeatures = city.streetFeatures.map((feature) => {
    const park = city.blocks.find((block) =>
      feature.id.startsWith(`tree-${block.id}-`))
    if (park) {
      const after = afterBlocks.get(park.id)!
      if (after === park) return feature
      return { ...feature,
        x: after.x + (feature.x - park.x) * after.width / park.width,
        z: after.z + (feature.z - park.z) * after.depth / park.depth }
    }
    const edge = city.roads.edges.find((road) =>
      feature.id.startsWith(`lamp-${road.id}-`) ||
      feature.id === `bus-stop-${road.id}`)
    return edge ? pointOnShiftedRoad(feature, edge, originalNodes, movedNodes) : feature
  })
  const result = { ...city, roads: { ...city.roads, nodes: roadNodes },
    blocks, parcels, buildings, streetFeatures }
  for (const building of buildings) {
    const parcel = afterParcels.get(building.parcelId)!
    for (const mass of building.masses.filter((item) => item.baseY < 2)) {
      if (Math.abs(building.x + mass.offsetX - parcel.x) + mass.width / 2 >
        parcel.width / 2 + 1e-6 ||
        Math.abs(building.z + mass.offsetZ - parcel.z) + mass.depth / 2 >
        parcel.depth / 2 + 1e-6) {
        throw new Error(`Organic parcel cannot contain ${building.id}`)
      }
    }
  }
  assertRoadClearance(result)
  return result
}
