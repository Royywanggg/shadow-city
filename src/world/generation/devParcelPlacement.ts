import type { Building, CityBlock, CityModel, CityPointXZ, Parcel, RoadEdge,
  RoadNode } from '../../city/model'
import { createBuilding } from '../../city/generation/buildings'
import { createRandom } from '../../city/generation/random'

interface HalfPlane {
  readonly x: number
  readonly z: number
  readonly minimum: number
}

interface ParcelGroup {
  readonly parcel: Parcel
  readonly building: Building
}

interface Placement {
  readonly scale: number
  readonly shifts: readonly CityPointXZ[]
}

const CORRIDOR_BLOCKS = new Set([
  'block-6-4', 'block-6-5', 'block-7-4', 'block-7-5',
  'block-6-1', 'block-6-2', 'block-7-1', 'block-7-2',
  'block-2-4', 'block-2-5', 'block-3-4', 'block-3-5',
])
const VALLEY_BLOCKS = new Set([
  'block--1-4', 'block--1-5', 'block--1-6',
  'block-0-4', 'block-0-5', 'block-0-6',
  'block-1-4', 'block-1-5', 'block-1-6',
])
const RING_OFFSET_M = 0.72
const CURB_CLEARANCE_M = 0.25
const PARCEL_GAP_M = 0.25
const EPSILON = 1e-7

function clip(polygon: readonly CityPointXZ[], plane: HalfPlane): CityPointXZ[] {
  const result: CityPointXZ[] = []
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]
    const b = polygon[(index + 1) % polygon.length]
    const before = a.x * plane.x + a.z * plane.z - plane.minimum
    const after = b.x * plane.x + b.z * plane.z - plane.minimum
    if (before >= -EPSILON) result.push(a)
    if (before < -EPSILON && after > EPSILON ||
      before > EPSILON && after < -EPSILON) {
      const t = before / (before - after)
      result.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
    }
  }
  return result
}

function initialPolygon(limit: number): CityPointXZ[] {
  return [
    { x: -limit, z: -limit }, { x: limit, z: -limit },
    { x: limit, z: limit }, { x: -limit, z: limit },
  ]
}

function roadPlanes(block: CityBlock, city: CityModel, clearance: number): HalfPlane[] {
  const edges = new Map(city.roads.edges.map((edge) => [edge.id, edge]))
  const nodes = new Map(city.roads.nodes.map((node) => [node.id, node]))
  const sides: readonly (readonly [string, number])[] = [
    [`edge-x-${block.column}-${block.row}`, 1],
    [`edge-x-${block.column}-${block.row + 1}`, -1],
    [`edge-z-${block.column}-${block.row}`, -1],
    [`edge-z-${block.column + 1}-${block.row}`, 1],
  ]
  return sides.flatMap(([id, sign]) => {
    const edge: RoadEdge | undefined = edges.get(id)
    if (!edge) throw new Error(`Missing corridor boundary ${id}`)
    const from: RoadNode | undefined = nodes.get(edge.from)
    const to: RoadNode | undefined = nodes.get(edge.to)
    if (!from || !to) throw new Error(`Missing corridor road node for ${id}`)
    const path = edge.centerlineXZ ?? [from, to]
    return path.slice(1).map((end, index) => {
      const start = path[index]
      const dx = end.x - start.x
      const dz = end.z - start.z
      const length = Math.hypot(dx, dz)
      if (length < EPSILON) throw new Error(`Degenerate corridor segment ${id}`)
      const x = -sign * dz / length
      const z = sign * dx / length
      return { x, z, minimum: x * start.x + z * start.z +
        edge.width / 2 + clearance }
    })
  })
}

function lineIntersection(a: HalfPlane, b: HalfPlane): CityPointXZ {
  const determinant = a.x * b.z - a.z * b.x
  if (Math.abs(determinant) < EPSILON) throw new Error('Parallel corridor boundaries')
  return { x: (a.minimum * b.z - a.z * b.minimum) / determinant,
    z: (a.x * b.minimum - a.minimum * b.x) / determinant }
}

function signedDistance(point: CityPointXZ, plane: HalfPlane): number {
  return point.x * plane.x + point.z * plane.z - plane.minimum
}

function segmentsCross(a: CityPointXZ, b: CityPointXZ,
  c: CityPointXZ, d: CityPointXZ): boolean {
  const cross = (p: CityPointXZ, q: CityPointXZ, r: CityPointXZ) =>
    (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)
  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)
  return abC * abD < -EPSILON && cdA * cdB < -EPSILON
}

function assertSimplePolygon(polygon: readonly CityPointXZ[], blockId: string): void {
  for (let first = 0; first < polygon.length; first += 1) {
    for (let second = first + 2; second < polygon.length; second += 1) {
      if (first === 0 && second === polygon.length - 1) continue
      if (segmentsCross(polygon[first], polygon[(first + 1) % polygon.length],
        polygon[second], polygon[(second + 1) % polygon.length])) {
        throw new Error(`Self-intersecting curved footprint at ${blockId}`)
      }
    }
  }
}

function crossing(path: readonly CityPointXZ[], plane: HalfPlane,
  direction: 'enter' | 'exit'): { point: CityPointXZ; segment: number } {
  for (let index = 0; index < path.length - 1; index += 1) {
    const before = signedDistance(path[index], plane)
    const after = signedDistance(path[index + 1], plane)
    if (direction === 'enter' ? before <= EPSILON && after >= -EPSILON :
      before >= -EPSILON && after <= EPSILON) {
      const t = Math.abs(before - after) < EPSILON ? 0 : before / (before - after)
      return { point: { x: path[index].x + (path[index + 1].x - path[index].x) * t,
        z: path[index].z + (path[index + 1].z - path[index].z) * t },
      segment: index }
    }
  }
  throw new Error(`Curved road does not reach the corridor ${direction}`)
}

function curvedBoundary(edge: RoadEdge, north: HalfPlane, south: HalfPlane,
  interiorSign: number): CityPointXZ[] {
  const path = edge.centerlineXZ
  if (!path || path.length < 3) throw new Error(`Missing curved road ${edge.id}`)
  const offset = edge.width / 2 + CURB_CLEARANCE_M + RING_OFFSET_M
  const normals = path.slice(1).map((to, index) => {
    const from = path[index]
    const dx = to.x - from.x
    const dz = to.z - from.z
    const length = Math.hypot(dx, dz)
    return { x: -interiorSign * dz / length, z: interiorSign * dx / length }
  })
  const offsetPath = path.map((point, index): CityPointXZ => {
    const previous = normals[Math.max(0, index - 1)]
    const next = normals[Math.min(normals.length - 1, index)]
    const sum = { x: previous.x + next.x, z: previous.z + next.z }
    const length = Math.hypot(sum.x, sum.z)
    const miter = { x: sum.x / length, z: sum.z / length }
    const scale = offset / (miter.x * previous.x + miter.z * previous.z)
    return { x: point.x + miter.x * scale, z: point.z + miter.z * scale }
  })
  const start = crossing(offsetPath, north, 'enter')
  const end = crossing(offsetPath, south, 'exit')
  if (start.segment > end.segment) throw new Error(`Reversed corridor curve at ${edge.id}`)
  return [start.point, ...offsetPath.slice(start.segment + 1, end.segment + 1),
    end.point].filter((point, index, array) => index === 0 ||
      Math.hypot(point.x - array[index - 1].x,
        point.z - array[index - 1].z) > EPSILON)
}

function curvedFootprint(block: CityBlock, city: CityModel,
  ring: readonly HalfPlane[]): CityPointXZ[] {
  const north = ring[0]
  const south = ring[1]
  const edgeAt = (column: number) => city.roads.edges.find((road) =>
    road.id === `edge-z-${column}-${block.row}`)
  let polygon: CityPointXZ[]
  let validPlanes: readonly HalfPlane[]
  if (block.column === 0 && VALLEY_BLOCKS.has(block.id)) {
    const west = edgeAt(0)
    const east = edgeAt(1)
    if (!west || !east) throw new Error(`Missing paired valley roads at ${block.id}`)
    const westCurve = curvedBoundary(west, north, south, -1)
    const eastCurve = curvedBoundary(east, north, south, 1)
    polygon = [westCurve[0], ...eastCurve, ...westCurve.slice(1).reverse()]
    validPlanes = [north, south]
  } else {
    const curvedColumn = VALLEY_BLOCKS.has(block.id) ? block.column === -1 ? 0 : 1 :
      block.column < 4 ? 3 : 7
    const edge = edgeAt(curvedColumn)
    if (!edge) throw new Error(`Missing curved road beside ${block.id}`)
    const westOfCorridor = block.column === curvedColumn - 1
    const curve = curvedBoundary(edge, north, south, westOfCorridor ? 1 : -1)
    const opposite = westOfCorridor ? ring[2] : ring.at(-1)!
    const northCorner = lineIntersection(north, opposite)
    const southCorner = lineIntersection(south, opposite)
    polygon = westOfCorridor
      ? [northCorner, ...curve, southCorner]
      : [curve[0], northCorner, southCorner, ...curve.slice(1).reverse()]
    validPlanes = [north, south, opposite]
  }
  if (!polygon.every((point) => within(point, validPlanes))) {
    throw new Error(`Curved corridor leaves its block at ${block.id}`)
  }
  assertSimplePolygon(polygon, block.id)
  return polygon
}

function within(point: CityPointXZ, planes: readonly HalfPlane[]): boolean {
  return planes.every((plane) => point.x * plane.x + point.z * plane.z >=
    plane.minimum - EPSILON)
}

function massCorners(building: Building): CityPointXZ[] {
  return building.masses.filter((mass) => mass.baseY < 2).flatMap((mass) =>
    [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({
      x: building.x + mass.offsetX + sx * mass.width / 2,
      z: building.z + mass.offsetZ + sz * mass.depth / 2,
    }))))
}

function parcelCorners(parcel: Parcel, scale: number): CityPointXZ[] {
  return [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({
    x: parcel.x + sx * parcel.width * scale / 2,
    z: parcel.z + sz * parcel.depth * scale / 2,
  })))
}

function allowedShifts(group: ParcelGroup, scale: number,
  ring: readonly HalfPlane[], curb: readonly HalfPlane[], limit: number): CityPointXZ[] {
  const corners = [...parcelCorners(group.parcel, scale), ...massCorners(group.building)]
  let polygon = initialPolygon(limit)
  for (const plane of ring) {
    const lowest = Math.min(...corners.map((point) =>
      point.x * plane.x + point.z * plane.z))
    polygon = clip(polygon, { ...plane, minimum: plane.minimum - lowest })
    if (polygon.length === 0) return []
  }
  for (const plane of curb) {
    polygon = clip(polygon, { ...plane,
      minimum: plane.minimum - group.building.entrance.x * plane.x -
        group.building.entrance.z * plane.z })
    if (polygon.length === 0) return []
  }
  return polygon
}

function minScale(group: ParcelGroup): number {
  const corners = massCorners(group.building)
  const x = Math.max(...corners.map((point) => Math.abs(point.x - group.parcel.x))) *
    2 / group.parcel.width
  const z = Math.max(...corners.map((point) => Math.abs(point.z - group.parcel.z))) *
    2 / group.parcel.depth
  return Math.max(x, z) + 0.001
}

function compactBuildingX(building: Building, factor: number): Building {
  return { ...building, width: building.width * factor,
    entrance: { ...building.entrance,
      x: building.x + (building.entrance.x - building.x) * factor },
    masses: building.masses.map((mass) => ({ ...mass,
      offsetX: mass.offsetX * factor, width: mass.width * factor })),
    windows: building.windows.map((window) => ({ ...window,
      offsetX: window.offsetX * factor,
      width: window.face === 'z' ? window.width * factor : window.width })) }
}

function bounds(polygon: readonly CityPointXZ[]): {
  minX: number; maxX: number; minZ: number; maxZ: number
} {
  return { minX: Math.min(...polygon.map((point) => point.x)),
    maxX: Math.max(...polygon.map((point) => point.x)),
    minZ: Math.min(...polygon.map((point) => point.z)),
    maxZ: Math.max(...polygon.map((point) => point.z)) }
}

function verticalSlice(polygon: readonly CityPointXZ[], x: number): CityPointXZ | null {
  const zValues: number[] = []
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]
    const b = polygon[(index + 1) % polygon.length]
    if (Math.abs(a.x - b.x) < EPSILON) {
      if (Math.abs(x - a.x) < EPSILON) zValues.push(a.z, b.z)
    } else if (x >= Math.min(a.x, b.x) - EPSILON &&
      x <= Math.max(a.x, b.x) + EPSILON) {
      const t = (x - a.x) / (b.x - a.x)
      zValues.push(a.z + (b.z - a.z) * t)
    }
  }
  if (zValues.length === 0) return null
  return { x, z: Math.max(Math.min(...zValues), Math.min(0, Math.max(...zValues))) }
}

function candidates(polygon: readonly CityPointXZ[]): CityPointXZ[] {
  const span = bounds(polygon)
  const xs = new Set(polygon.map((point) => point.x))
  xs.add(Math.max(span.minX, Math.min(0, span.maxX)))
  for (let x = Math.ceil(span.minX * 10) / 10; x <= span.maxX; x += 0.1) xs.add(x)
  return [...xs].map((x) => verticalSlice(polygon, x)).filter(
    (point): point is CityPointXZ => point !== null)
}

function bestShifts(groups: readonly ParcelGroup[], polygons: readonly CityPointXZ[][],
  scale: number): readonly CityPointXZ[] | null {
  if (groups.length === 1) {
    const best = candidates(polygons[0]).sort((a, b) =>
      a.x ** 2 + a.z ** 2 - b.x ** 2 - b.z ** 2)[0]
    return best ? [best] : null
  }
  const first = candidates(polygons[0])
  const second = candidates(polygons[1])
  const left = groups[0].parcel.x + groups[0].parcel.width * scale / 2
  const right = groups[1].parcel.x - groups[1].parcel.width * scale / 2
  let best: readonly CityPointXZ[] | null = null
  let bestCost = Infinity
  for (const a of first) for (const b of second) {
    if (left + a.x + PARCEL_GAP_M > right + b.x + EPSILON) continue
    const cost = a.x ** 2 + a.z ** 2 + b.x ** 2 + b.z ** 2
    if (cost < bestCost) { best = [a, b]; bestCost = cost }
  }
  return best
}

function fitGroups(groups: readonly ParcelGroup[], ring: readonly HalfPlane[],
  curb: readonly HalfPlane[], limit: number): Placement {
  if (groups.length < 1 || groups.length > 2) {
    throw new Error('Dev corridor expects one or two parcels per block')
  }
  const minimum = Math.max(...groups.map(minScale))
  if (minimum > 1) throw new Error(`Existing building exceeds its corridor parcel`)
  const polygonsAt = (scale: number) => groups.map((group) =>
    allowedShifts(group, scale, ring, curb, limit))
  const possible = (scale: number) => {
    const polygons = polygonsAt(scale)
    if (polygons.some((polygon) => polygon.length === 0)) return false
    if (groups.length === 1) return true
    const first = bounds(polygons[0])
    const second = bounds(polygons[1])
    const initialGap = groups[1].parcel.x - groups[1].parcel.width * scale / 2 -
      groups[0].parcel.x - groups[0].parcel.width * scale / 2
    return initialGap + second.maxX - first.minX >= PARCEL_GAP_M - EPSILON
  }
  if (!possible(minimum)) throw new Error(`Dev corridor cannot pack existing buildings`)
  let low = minimum
  let high = 1
  if (!possible(high)) {
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const middle = (low + high) / 2
      if (possible(middle)) low = middle
      else high = middle
    }
  } else low = 1
  // A small slack absorbs sampling and floating-point rounding at the tightest fit.
  for (let scale = low; scale >= minimum - EPSILON; scale -= 0.002) {
    const polygons = polygonsAt(scale)
    if (polygons.some((polygon) => polygon.length === 0)) continue
    const shifts = bestShifts(groups, polygons, scale)
    if (shifts) return { scale, shifts }
  }
  throw new Error('Dev corridor has no non-overlapping parcel placement')
}

/** Packs original building meshes beside the curved dev corridors. */
export function placeDevCorridorParcels(city: CityModel): CityModel {
  for (const edgeId of ['edge-z-7-4', 'edge-z-7-1', 'edge-z-3-4']) {
    if (!city.roads.edges.find((edge) => edge.id === edgeId)?.centerlineXZ) {
      throw new Error(`Dev corridor centreline is required: ${edgeId}`)
    }
  }
  const valley = city.roads.edges.some((edge) =>
    edge.id === 'edge-z-0-5' && edge.centerlineXZ)
  const targetBlocks = valley ? new Set([...CORRIDOR_BLOCKS, ...VALLEY_BLOCKS]) :
    CORRIDOR_BLOCKS
  const blockUpdates = new Map<string, CityBlock>()
  const parcelUpdates = new Map<string, Parcel>()
  const buildingUpdates = new Map<string, Building>()
  for (const block of city.blocks.filter((item) => targetBlocks.has(item.id))) {
    const ring = roadPlanes(block, city, RING_OFFSET_M + CURB_CLEARANCE_M)
    const curb = roadPlanes(block, city, CURB_CLEARANCE_M)
    const safePolygon = ring.reduce<CityPointXZ[]>((remaining, plane) =>
      clip(remaining, plane), initialPolygon(city.size))
    if (safePolygon.length < 3) throw new Error(`No safe corridor polygon for ${block.id}`)
    const polygon = curvedFootprint(block, city, ring)
    const box = bounds(polygon)
    blockUpdates.set(block.id, { ...block, footprintXZ: polygon,
      boundaryRoadEdgeIds: VALLEY_BLOCKS.has(block.id) ? [
        `edge-x-${block.column}-${block.row}`,
        `edge-x-${block.column}-${block.row + 1}`,
        `edge-z-${block.column}-${block.row}`,
        `edge-z-${block.column + 1}-${block.row}`,
      ] : block.boundaryRoadEdgeIds,
      x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2,
      width: box.maxX - box.minX, depth: box.maxZ - box.minZ })
    if (VALLEY_BLOCKS.has(block.id) &&
      (block.column === 0 || block.id === 'block--1-6' || block.isPark)) continue
    const groups = city.parcels.filter((parcel) => parcel.blockId === block.id)
      .sort((a, b) => a.x - b.x).map((parcel) => {
        const building = city.buildings.find((item) => item.parcelId === parcel.id)
        if (!building) throw new Error(`Missing building on ${parcel.id}`)
        return { parcel, building }
      })
    let placement: Placement
    let fittedGroups = groups
    try {
      placement = fitGroups(groups, ring, curb, city.size / 2)
    } catch (error) {
      const compactValley = VALLEY_BLOCKS.has(block.id) &&
        (block.column === 1 || block.column === -1)
      if (!compactValley && (block.column !== 3 ||
        block.row !== 4 && block.row !== 5)) {
        throw new Error(`Cannot fit dev corridor block ${block.id}: ${
          error instanceof Error ? error.message : String(error)}`)
      }
      let alternative: { groups: ParcelGroup[]; placement: Placement } | null = null
      for (const index of [...groups.keys()].reverse()) {
        for (const factor of [0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55]) {
          const parcel = { ...groups[index].parcel,
            width: groups[index].parcel.width * factor }
          const building = compactValley
            ? compactBuildingX(groups[index].building, factor)
            : createBuilding(parcel, block.district, block.column,
              block.row, createRandom(`${city.seed}:${parcel.id}`))
          if (building.id !== groups[index].building.id ||
            building.kind !== groups[index].building.kind) {
            throw new Error(`Compact dev building changes identity at ${block.id}`)
          }
          const candidate = groups.map((group, groupIndex) => groupIndex === index
            ? { parcel, building } : group)
          try {
            alternative = { groups: candidate,
              placement: fitGroups(candidate, ring, curb, city.size / 2) }
            break
          } catch { /* Try the next parcel width. */ }
        }
        if (alternative) break
      }
      if (!alternative) throw new Error(`Cannot compact dev corridor block ${
        block.id} while preserving its buildings`)
      fittedGroups = alternative.groups
      placement = alternative.placement
    }
    fittedGroups.forEach(({ parcel, building }, index) => {
      const shift = placement.shifts[index]
      const movedParcel: Parcel = { ...parcel, x: parcel.x + shift.x,
        z: parcel.z + shift.z, width: parcel.width * placement.scale,
        depth: parcel.depth * placement.scale }
      const movedBuilding: Building = { ...building, x: building.x + shift.x,
        z: building.z + shift.z, entrance: { ...building.entrance,
          x: building.entrance.x + shift.x,
          z: building.entrance.z + shift.z } }
      const movedCorners = massCorners(movedBuilding)
      if (!movedCorners.every((point) => within(point, ring)) ||
        !within(movedBuilding.entrance, curb) ||
        !parcelCorners(movedParcel, 1).every((point) => within(point, ring)) ||
        movedCorners.some((point) => Math.abs(point.x - movedParcel.x) >
          movedParcel.width / 2 + EPSILON || Math.abs(point.z - movedParcel.z) >
          movedParcel.depth / 2 + EPSILON)) {
        throw new Error(`Illegal corridor placement for ${building.id}`)
      }
      parcelUpdates.set(parcel.id, movedParcel)
      buildingUpdates.set(building.id, movedBuilding)
    })
  }
  if (blockUpdates.size !== targetBlocks.size) {
    throw new Error('Dev corridor is missing an adjacent block')
  }
  return { ...city,
    blocks: city.blocks.map((block) => blockUpdates.get(block.id) ?? block),
    parcels: city.parcels.map((parcel) => parcelUpdates.get(parcel.id) ?? parcel),
    buildings: city.buildings.map((building) => buildingUpdates.get(building.id) ?? building) }
}
