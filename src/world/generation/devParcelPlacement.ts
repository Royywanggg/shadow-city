import type { Building, CityBlock, CityModel, CityPointXZ, Parcel, RoadEdge,
  RoadNode } from '../../city/model'

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

/** Packs the original building meshes beside the curved east-side dev corridor. */
export function placeDevCorridorParcels(city: CityModel): CityModel {
  const target = city.roads.edges.find((edge) => edge.id === 'edge-z-7-4')
  if (!target?.centerlineXZ) throw new Error('Dev corridor centreline is required')
  const blockUpdates = new Map<string, CityBlock>()
  const parcelUpdates = new Map<string, Parcel>()
  const buildingUpdates = new Map<string, Building>()
  for (const block of city.blocks.filter((item) => CORRIDOR_BLOCKS.has(item.id))) {
    const ring = roadPlanes(block, city, RING_OFFSET_M + CURB_CLEARANCE_M)
    const curb = roadPlanes(block, city, CURB_CLEARANCE_M)
    const polygon = ring.reduce<CityPointXZ[]>((remaining, plane) =>
      clip(remaining, plane), initialPolygon(city.size))
    if (polygon.length < 3) throw new Error(`No safe corridor polygon for ${block.id}`)
    const box = bounds(polygon)
    const groups = city.parcels.filter((parcel) => parcel.blockId === block.id)
      .sort((a, b) => a.x - b.x).map((parcel) => {
        const building = city.buildings.find((item) => item.parcelId === parcel.id)
        if (!building) throw new Error(`Missing building on ${parcel.id}`)
        return { parcel, building }
      })
    const placement = fitGroups(groups, ring, curb, city.size / 2)
    blockUpdates.set(block.id, { ...block, footprintXZ: polygon,
      x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2,
      width: box.maxX - box.minX, depth: box.maxZ - box.minZ })
    groups.forEach(({ parcel, building }, index) => {
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
  if (blockUpdates.size !== CORRIDOR_BLOCKS.size) {
    throw new Error('Dev corridor is missing an adjacent block')
  }
  return { ...city,
    blocks: city.blocks.map((block) => blockUpdates.get(block.id) ?? block),
    parcels: city.parcels.map((parcel) => parcelUpdates.get(parcel.id) ?? parcel),
    buildings: city.buildings.map((building) => buildingUpdates.get(building.id) ?? building) }
}
