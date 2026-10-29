import type {
  Building,
  CityModel,
  PedestrianAnchor,
  PedestrianEdge,
  PedestrianNetwork,
  PedestrianNode,
  RoadEdge,
  CityPointXZ,
} from '../model'

const SIDEWALK_Y = 0.24
const CURB_Y = 0.1
const RING_OFFSET = 0.72
const EPSILON = 1e-6
// These points follow the visible plaza promenades and the paved park paths.
const PLAZA_PROMENADE_X = [-0.31, -0.24, -0.09, 0, 0.09, 0.24, 0.31] as const
const PLAZA_PROMENADE_Z = [-0.27, 0.27] as const
const PARK_PATH_X = [-0.05, 0, 0.05] as const
const PARK_PATH_Z = [-0.34, -0.17, 0, 0.17, 0.34] as const

type SpatialCity = Pick<CityModel, 'roads' | 'blocks' | 'parcels' | 'buildings' | 'plaza'> &
  Partial<Pick<CityModel, 'streetFeatures'>>

export interface PedestrianDerivationOptions {
  /** Use the actual block-to-block approach across a possibly diagonal road. */
  readonly curbPlacement?: 'axisAligned' | 'endpointVector'
}

interface BlockWalkways {
  west: number
  east: number
  north: number
  south: number
  at(x: number, z: number): string
}

function polygonArea(points: readonly CityPointXZ[]): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]
    return sum + point.x * next.z - next.x * point.z
  }, 0) / 2
}

function outerRing(footprint: readonly CityPointXZ[], offset: number): CityPointXZ[] {
  const polygon = footprint.filter((point, index) =>
    index === 0 || Math.hypot(point.x - footprint[index - 1].x,
      point.z - footprint[index - 1].z) > 1e-4)
  if (polygon.length < 3 || polygonArea(polygon) <= EPSILON) {
    throw new Error('Polygon block footprint must be counterclockwise and nondegenerate')
  }
  return polygon.map((point, index) => {
    const previous = polygon[(index - 1 + polygon.length) % polygon.length]
    const next = polygon[(index + 1) % polygon.length]
    const priorLength = Math.hypot(point.x - previous.x, point.z - previous.z)
    const nextLength = Math.hypot(next.x - point.x, next.z - point.z)
    const before = { x: (point.z - previous.z) / priorLength,
      z: -(point.x - previous.x) / priorLength }
    const after = { x: (next.z - point.z) / nextLength,
      z: -(next.x - point.x) / nextLength }
    const bisector = { x: before.x + after.x, z: before.z + after.z }
    const projection = bisector.x * before.x + bisector.z * before.z
    if (projection < 0.2) throw new Error('Polygon block has an unsafe corner')
    return { x: point.x + offset * bisector.x / projection,
      z: point.z + offset * bisector.z / projection }
  })
}

function distanceToPath(point: CityPointXZ, path: readonly CityPointXZ[]): number {
  return Math.min(...path.slice(1).map((end, index) => {
    const start = path[index]
    const dx = end.x - start.x
    const dz = end.z - start.z
    const t = Math.max(0, Math.min(1,
      ((point.x - start.x) * dx + (point.z - start.z) * dz) /
      (dx * dx + dz * dz || 1)))
    return Math.hypot(point.x - start.x - dx * t,
      point.z - start.z - dz * t)
  }))
}

function insidePolygon(point: CityPointXZ,
  polygon: readonly CityPointXZ[]): boolean {
  if (distanceToPath(point, [...polygon, polygon[0]]) <= EPSILON) return true
  let inside = false
  for (let index = 0, previous = polygon.length - 1;
    index < polygon.length; previous = index, index += 1) {
    const a = polygon[index]
    const b = polygon[previous]
    if ((a.z > point.z) !== (b.z > point.z) &&
      point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) {
      inside = !inside
    }
  }
  return inside
}

function segmentInsidePolygon(from: CityPointXZ, to: CityPointXZ,
  polygon: readonly CityPointXZ[]): boolean {
  const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x,
    to.z - from.z) / 0.25))
  return Array.from({ length: count + 1 }, (_, index) => {
    const t = index / count
    return insidePolygon({ x: from.x + (to.x - from.x) * t,
      z: from.z + (to.z - from.z) * t }, polygon)
  }).every(Boolean)
}

function southernRayHit(origin: CityPointXZ, polygon: readonly CityPointXZ[]):
  { edgeIndex: number; t: number; point: CityPointXZ } {
  const candidates = polygon.flatMap((a, edgeIndex) => {
    const b = polygon[(edgeIndex + 1) % polygon.length]
    const dx = b.x - a.x
    if (Math.abs(dx) <= EPSILON) return []
    const t = (origin.x - a.x) / dx
    if (t < -EPSILON || t > 1 + EPSILON) return []
    const z = a.z + (b.z - a.z) * t
    return z > origin.z + EPSILON ? [{ edgeIndex, t,
      point: { x: origin.x, z } }] : []
  }).sort((a, b) => a.point.z - b.point.z)
  if (!candidates[0]) throw new Error('Building entrance has no southern polygon sidewalk')
  return candidates[0]
}

function sortedDistinct(values: readonly number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.filter((value, index) => index === 0 || value - sorted[index - 1] > EPSILON)
}

function boundaryRoadIds(block: CityModel['blocks'][number]): readonly string[] {
  if (block.boundaryRoadEdgeIds) {
    if (block.boundaryRoadEdgeIds.length === 0 ||
      new Set(block.boundaryRoadEdgeIds).size !== block.boundaryRoadEdgeIds.length) {
      throw new Error(`Invalid explicit road boundaries for ${block.id}`)
    }
    return block.boundaryRoadEdgeIds
  }
  return [
    `edge-x-${block.column}-${block.row}`,
    `edge-x-${block.column}-${block.row + 1}`,
    `edge-z-${block.column}-${block.row}`,
    `edge-z-${block.column + 1}-${block.row}`,
  ]
}

function coordinateKey(x: number, z: number): string {
  return `${x.toFixed(8)}:${z.toFixed(8)}`
}

function isGroundMass(mass: Building['masses'][number]): boolean {
  return mass.baseY < 2
}

function crossesBuilding(a: Pick<PedestrianNode, 'x' | 'z'>, b: Pick<PedestrianNode, 'x' | 'z'>, buildings: readonly Building[]): boolean {
  for (const building of buildings) {
    for (const mass of building.masses) {
      if (!isGroundMass(mass)) continue
      const minX = building.x + mass.offsetX - mass.width / 2 + 0.02
      const maxX = building.x + mass.offsetX + mass.width / 2 - 0.02
      const minZ = building.z + mass.offsetZ - mass.depth / 2 + 0.02
      const maxZ = building.z + mass.offsetZ + mass.depth / 2 - 0.02
      if (Math.abs(a.x - b.x) < EPSILON) {
        if (a.x > minX && a.x < maxX && Math.max(a.z, b.z) > minZ && Math.min(a.z, b.z) < maxZ) return true
      } else if (Math.abs(a.z - b.z) < EPSILON) {
        if (a.z > minZ && a.z < maxZ && Math.max(a.x, b.x) > minX && Math.min(a.x, b.x) < maxX) return true
      } else {
        const tx = [(minX - a.x) / (b.x - a.x),
          (maxX - a.x) / (b.x - a.x)].sort((left, right) => left - right)
        const tz = [(minZ - a.z) / (b.z - a.z),
          (maxZ - a.z) / (b.z - a.z)].sort((left, right) => left - right)
        const enter = Math.max(0, tx[0], tz[0])
        const leave = Math.min(1, tx[1], tz[1])
        if (leave - enter > EPSILON) return true
      }
    }
  }
  return false
}

/** Derives walkable space from visible block sidewalks, frontage, and road crossings. */
export function derivePedestrianNetwork(city: SpatialCity,
  options: PedestrianDerivationOptions = {}): PedestrianNetwork {
  const nodes: PedestrianNode[] = []
  const edges: PedestrianEdge[] = []
  const anchors: PedestrianAnchor[] = []
  const nodeById = new Map<string, PedestrianNode>()
  const edgeIds = new Set<string>()
  const roadEdgeById = new Map(city.roads.edges.map((edge) => [edge.id, edge]))
  const roadNodeById = new Map(city.roads.nodes.map((node) => [node.id, node]))
  const blockById = new Map(city.blocks.map((block) => [block.id, block]))
  const blocks = new Map<string, BlockWalkways>()

  function addNode(node: PedestrianNode): void {
    if (nodeById.has(node.id)) throw new Error(`Duplicate pedestrian node ${node.id}`)
    if (![node.x, node.z, node.surfaceY].every(Number.isFinite)) throw new Error(`Invalid pedestrian node ${node.id}`)
    nodes.push(node)
    nodeById.set(node.id, node)
  }

  function addEdge(id: string, from: string, to: string, kind: PedestrianEdge['kind'], sourceRoadEdgeId?: string): void {
    if (edgeIds.has(id)) throw new Error(`Duplicate pedestrian edge ${id}`)
    const start = nodeById.get(from)
    const end = nodeById.get(to)
    if (!start || !end) throw new Error(`Missing pedestrian endpoint for ${id}`)
    const length = Math.hypot(end.x - start.x, end.z - start.z)
    if (!Number.isFinite(length) || length <= EPSILON) throw new Error(`Zero-length pedestrian edge ${id}`)
    if (kind !== 'crossing' && crossesBuilding(start, end, city.buildings)) {
      throw new Error(`Pedestrian edge crosses a building: ${id}`)
    }
    const edge: PedestrianEdge = { id, from, to, length, costMm: Math.max(1, Math.round(length * 1000)), kind }
    if (sourceRoadEdgeId) edge.sourceRoadEdgeId = sourceRoadEdgeId
    edges.push(edge)
    edgeIds.add(id)
  }

  function safePolygonRing(block: SpatialCity['blocks'][number]): CityPointXZ[] {
    const footprint = block.footprintXZ!
    const boundaries = boundaryRoadIds(block).map((id) => {
      const road = roadEdgeById.get(id)
      if (!road) throw new Error(`Missing polygon boundary road ${id}`)
      const from = roadNodeById.get(road.from)!
      const to = roadNodeById.get(road.to)!
      return { road, path: road.centerlineXZ ?? [from, to] }
    })
    const safe = (ring: readonly CityPointXZ[]) => ring.every((from, index) => {
      const to = ring[(index + 1) % ring.length]
      const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x,
        to.z - from.z) / 0.5))
      return Array.from({ length: count + 1 }, (_, step) => {
        const t = step / count
        return { x: from.x + (to.x - from.x) * t,
          z: from.z + (to.z - from.z) * t }
      }).every((point) => boundaries.every(({ road, path }) =>
        distanceToPath(point, path) >= road.width / 2 + 0.255))
    })
    const full = outerRing(footprint, RING_OFFSET)
    if (safe(full)) return full
    if (!safe(footprint)) throw new Error(`Polygon block lacks road clearance: ${block.id}`)
    let lower = 0
    let upper = RING_OFFSET
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const middle = (lower + upper) / 2
      if (safe(outerRing(footprint, middle))) lower = middle
      else upper = middle
    }
    return outerRing(footprint, lower)
  }

  for (const block of city.blocks) {
    if (block.footprintXZ) {
      const ring = safePolygonRing(block)
      const ringIds = ring.map((point, index) => {
        const id = `ped-${block.id}-polygon-${index}`
        addNode({ id, ...point, surfaceY: SIDEWALK_Y, kind: 'sidewalk' })
        anchors.push({ id: `anchor-street-${block.id}-polygon-${index}`,
          nodeId: id, kind: 'street', blockId: block.id })
        return id
      })
      const blockParcels = city.parcels.filter((parcel) => parcel.blockId === block.id)
      const parcelIds = new Set(blockParcels.map((parcel) => parcel.id))
      const blockBuildings = city.buildings.filter((building) =>
        parcelIds.has(building.parcelId))
      const splits = new Map<number, { t: number; id: string }[]>()
      for (const building of blockBuildings) {
        const id = `ped-entrance-${building.id}`
        addNode({ id, x: building.entrance.x, z: building.entrance.z,
          surfaceY: SIDEWALK_Y, kind: 'entrance' })
        const hit = southernRayHit(building.entrance, ring)
        let sidewalkId = hit.t <= EPSILON ? ringIds[hit.edgeIndex] :
          hit.t >= 1 - EPSILON ? ringIds[(hit.edgeIndex + 1) % ringIds.length] : null
        if (!sidewalkId) {
          sidewalkId = `ped-${block.id}-polygon-access-${building.id}`
          addNode({ id: sidewalkId, ...hit.point,
            surfaceY: SIDEWALK_Y, kind: 'sidewalk' })
          const list = splits.get(hit.edgeIndex) ?? []
          list.push({ t: hit.t, id: sidewalkId })
          splits.set(hit.edgeIndex, list)
        }
        addEdge(`ped-access-${building.id}`, id, sidewalkId, 'access')
        anchors.push({ id: `anchor-${building.id}`, nodeId: id, kind: 'building',
          buildingId: building.id, blockId: block.id })
        if (building.kind === 'civic' || building.kind === 'commercial' ||
          building.kind === 'office') {
          anchors.push({ id: `anchor-public-${building.id}-door`, nodeId: id,
            kind: 'publicEntrance', buildingId: building.id, blockId: block.id })
          anchors.push({ id: `anchor-public-${building.id}-walk`,
            nodeId: sidewalkId, kind: 'publicEntrance', buildingId: building.id,
            blockId: block.id })
        }
      }
      ringIds.forEach((id, index) => {
        const nextId = ringIds[(index + 1) % ringIds.length]
        const stops = [{ t: 0, id }, ...(splits.get(index) ?? [])
          .sort((a, b) => a.t - b.t), { t: 1, id: nextId }]
        for (let stop = 1; stop < stops.length; stop += 1) {
          addEdge(`ped-${block.id}-polygon-ring-${index}-${stop - 1}`,
            stops[stop - 1].id, stops[stop].id, 'sidewalk')
        }
      })
      if (block.isPlaza || block.isPark) {
        const minX = Math.min(...block.footprintXZ.map((point) => point.x))
        const maxX = Math.max(...block.footprintXZ.map((point) => point.x))
        const minZ = Math.min(...block.footprintXZ.map((point) => point.z))
        const maxZ = Math.max(...block.footprintXZ.map((point) => point.z))
        const step = Math.max(1, Math.min(2.5, Math.min(maxX - minX,
          maxZ - minZ) / 6))
        const candidates: { point: CityPointXZ; ringIndex: number }[] = []
        for (let z = minZ + step / 2; z < maxZ; z += step) {
          for (let x = minX + step / 2; x < maxX; x += step) {
            const point = { x, z }
            if (!insidePolygon(point, block.footprintXZ) ||
              distanceToPath(point, [...block.footprintXZ, block.footprintXZ[0]]) < 1.1 ||
              block.isPlaza && Math.hypot(x - city.plaza.x,
                z - city.plaza.z) < 5 ||
              city.streetFeatures?.some((feature) =>
                (feature.kind === 'tree' || feature.kind === 'planter' ||
                  feature.kind === 'bench') &&
                Math.hypot(x - feature.x, z - feature.z) < 2)) continue
            const visible = ring.map((corner, index) => ({ index,
              distance: Math.hypot(corner.x - x, corner.z - z) }))
              .sort((a, b) => a.distance - b.distance || a.index - b.index)
              .find(({ index }) => segmentInsidePolygon(point, ring[index], ring) &&
                !crossesBuilding(point, ring[index], city.buildings))
            if (visible) candidates.push({ point, ringIndex: visible.index })
          }
        }
        if (candidates.length === 0) {
          throw new Error(`Polygon public block has no legal activity position: ${block.id}`)
        }
        const selected: typeof candidates = []
        const target = block.isPlaza ? 12 : 10
        while (selected.length < target && candidates.length > 0) {
          candidates.sort((a, b) => {
            const score = (item: typeof a) => selected.length === 0
              ? -Math.hypot(item.point.x - block.x, item.point.z - block.z)
              : Math.min(...selected.map((other) =>
                Math.hypot(item.point.x - other.point.x,
                  item.point.z - other.point.z)))
            return score(b) - score(a) || a.point.z - b.point.z ||
              a.point.x - b.point.x
          })
          const chosen = candidates.shift()!
          if (selected.length > 0 && selected.some((other) =>
            Math.hypot(chosen.point.x - other.point.x,
              chosen.point.z - other.point.z) < 2.4)) break
          selected.push(chosen)
        }
        selected.forEach(({ point, ringIndex }, index) => {
          const id = index === 0 ? `ped-place-${block.id}` :
            `ped-place-${block.id}-${index}`
          const kind = block.isPlaza ? 'plaza' : 'park'
          addNode({ id, ...point, surfaceY: block.isPlaza ? 0.295 : 0.355,
            kind: 'publicSpace' })
          addEdge(`ped-public-${block.id}-polygon-${index}`,
            ringIds[ringIndex], id, 'publicSpace')
          anchors.push({ id: `anchor-${kind}-${block.id}${index === 0 ? '' :
            `-${index}`}`, nodeId: id, kind, blockId: block.id })
        })
      }
      const west = Math.min(...ring.map((point) => point.x))
      const east = Math.max(...ring.map((point) => point.x))
      const north = Math.min(...ring.map((point) => point.z))
      const south = Math.max(...ring.map((point) => point.z))
      blocks.set(block.id, { west, east, north, south,
        at(x, z) {
          const nearest = ring.map((point, index) => ({ index,
            distance: Math.hypot(point.x - x, point.z - z) }))
            .sort((a, b) => a.distance - b.distance || a.index - b.index)[0]
          return ringIds[nearest.index]
        } })
      continue
    }
    const west = block.x - block.width / 2 - RING_OFFSET
    const east = block.x + block.width / 2 + RING_OFFSET
    const north = block.z - block.depth / 2 - RING_OFFSET
    const south = block.z + block.depth / 2 + RING_OFFSET
    const blockParcels = city.parcels.filter((parcel) => parcel.blockId === block.id)
    const blockBuildings = city.buildings.filter((building) => blockParcels.some((parcel) => parcel.id === building.parcelId))
    const parcelXs = sortedDistinct(blockParcels.map((parcel) => parcel.x))
    const parcelZs = sortedDistinct(blockParcels.map((parcel) => parcel.z))
    const separatorXs = parcelXs.slice(1).map((value, index) => (parcelXs[index] + value) / 2)
    const separatorZs = parcelZs.slice(1).map((value, index) => (parcelZs[index] + value) / 2)
    const publicX = block.isPlaza
      ? PLAZA_PROMENADE_X.map((ratio) => block.x + ratio * block.width)
      : block.isPark ? PARK_PATH_X.map((ratio) => block.x + ratio * block.width) : []
    const xValues = sortedDistinct([west, east, ...separatorXs, ...blockBuildings.map((building) => building.entrance.x), ...publicX])
    const zValues = sortedDistinct([north, south, ...separatorZs])
    const verticalXs = new Set([west, east, ...separatorXs].map((value) => value.toFixed(8)))
    const ids = new Map<string, string>()

    zValues.forEach((z, zi) => xValues.forEach((x, xi) => {
      const id = `ped-${block.id}-${xi}-${zi}`
      addNode({ id, x, z, surfaceY: SIDEWALK_Y, kind: 'sidewalk' })
      ids.set(coordinateKey(x, z), id)
    }))
    const at = (x: number, z: number): string => {
      const id = ids.get(coordinateKey(x, z))
      if (!id) throw new Error(`Missing sidewalk node in ${block.id}`)
      return id
    }

    zValues.forEach((z, zi) => {
      for (let xi = 1; xi < xValues.length; xi += 1) {
        addEdge(`ped-${block.id}-h-${zi}-${xi - 1}`, at(xValues[xi - 1], z), at(xValues[xi], z), 'sidewalk')
      }
    })
    xValues.forEach((x, xi) => {
      if (!verticalXs.has(x.toFixed(8))) return
      for (let zi = 1; zi < zValues.length; zi += 1) {
        addEdge(`ped-${block.id}-v-${xi}-${zi - 1}`, at(x, zValues[zi - 1]), at(x, zValues[zi]), 'sidewalk')
      }
    })

    for (const [side, z] of [['north', north], ['south', south]] as const) {
      xValues.forEach((x, index) => anchors.push({
        id: `anchor-street-${block.id}-${side}-${index}`,
        nodeId: at(x, z), kind: 'street', blockId: block.id,
      }))
    }
    for (const [side, x] of [['west', west], ['east', east]] as const) {
      zValues.slice(1, -1).forEach((z, index) => anchors.push({
        id: `anchor-street-${block.id}-${side}-${index}`,
        nodeId: at(x, z), kind: 'street', blockId: block.id,
      }))
    }

    for (const building of blockBuildings) {
      const id = `ped-entrance-${building.id}`
      addNode({ id, x: building.entrance.x, z: building.entrance.z, surfaceY: SIDEWALK_Y, kind: 'entrance' })
      const nextLane = zValues.find((z) => z > building.entrance.z + EPSILON)
      if (nextLane === undefined) throw new Error(`No sidewalk lane for ${building.id}`)
      addEdge(`ped-access-${building.id}`, id, at(building.entrance.x, nextLane), 'access')
      anchors.push({ id: `anchor-${building.id}`, nodeId: id, kind: 'building', buildingId: building.id, blockId: block.id })
      if (building.kind === 'civic' || building.kind === 'commercial' || building.kind === 'office') {
        const frontageIndex = xValues.findIndex((x) => Math.abs(x - building.entrance.x) < EPSILON)
        const frontage = [
          { suffix: 'door', nodeId: id },
          { suffix: 'walk', nodeId: at(building.entrance.x, nextLane) },
          ...[frontageIndex - 1, frontageIndex + 1]
            .filter((index) => index >= 0 && index < xValues.length &&
              Math.abs(xValues[index] - building.entrance.x) <= 3)
            .map((index) => ({ suffix: `side-${index}`, nodeId: at(xValues[index], nextLane) })),
        ]
        for (const spot of frontage) anchors.push({
          id: `anchor-public-${building.id}-${spot.suffix}`,
          nodeId: spot.nodeId,
          kind: 'publicEntrance',
          buildingId: building.id,
          blockId: block.id,
        })
      }
    }

    if (block.isPlaza) {
      PLAZA_PROMENADE_Z.forEach((zRatio, rowIndex) => {
        const row: string[] = []
        PLAZA_PROMENADE_X.forEach((xRatio, columnIndex) => {
          const legacyCenter = rowIndex === 0 && xRatio === 0
          const suffix = `${rowIndex}-${columnIndex}`
          const id = legacyCenter ? `ped-place-${block.id}` : `ped-place-${block.id}-${suffix}`
          const x = block.x + xRatio * block.width
          const z = block.z + zRatio * block.depth
          addNode({ id, x, z, surfaceY: 0.295, kind: 'publicSpace' })
          addEdge(`ped-public-${block.id}-${suffix}`, at(x, rowIndex === 0 ? north : south), id, 'publicSpace')
          anchors.push({
            id: legacyCenter ? `anchor-plaza-${block.id}` : `anchor-plaza-${block.id}-${suffix}`,
            nodeId: id,
            kind: 'plaza',
            blockId: block.id,
          })
          if (row.length > 0) addEdge(`ped-public-${block.id}-row-${rowIndex}-${columnIndex - 1}`, row[row.length - 1], id, 'publicSpace')
          row.push(id)
        })
      })
    } else if (block.isPark) {
      const columns: string[][] = []
      PARK_PATH_X.forEach((xRatio, columnIndex) => {
        const column: string[] = []
        const x = block.x + xRatio * block.width
        PARK_PATH_Z.forEach((zRatio, rowIndex) => {
          const legacyCenter = xRatio === 0 && zRatio === 0
          const id = legacyCenter ? `ped-place-${block.id}` : `ped-place-${block.id}-${columnIndex}-${rowIndex}`
          addNode({ id, x, z: block.z + zRatio * block.depth, surfaceY: 0.355, kind: 'publicSpace' })
          anchors.push({
            id: legacyCenter ? `anchor-park-${block.id}` : `anchor-park-${block.id}-${columnIndex}-${rowIndex}`,
            nodeId: id,
            kind: 'park',
            blockId: block.id,
          })
          addEdge(
            `ped-public-${block.id}-column-${columnIndex}-${rowIndex}`,
            rowIndex === 0 ? at(x, north) : column[rowIndex - 1],
            id,
            'publicSpace',
          )
          column.push(id)
        })
        addEdge(`ped-public-${block.id}-column-${columnIndex}-south`, column[column.length - 1], at(x, south), 'publicSpace')
        columns.push(column)
      })
      PARK_PATH_Z.forEach((_, rowIndex) => {
        for (let columnIndex = 1; columnIndex < columns.length; columnIndex += 1) {
          addEdge(`ped-public-${block.id}-row-${rowIndex}-${columnIndex - 1}`, columns[columnIndex - 1][rowIndex], columns[columnIndex][rowIndex], 'publicSpace')
        }
      })
    }

    blocks.set(block.id, { west, east, north, south, at })
  }

  function crossBlocks(
    id: string,
    a: string,
    b: string,
    road: RoadEdge,
    direction: 'x' | 'z',
    useRoadGeometry = false,
  ): void {
    const from = nodeById.get(a)!
    const to = nodeById.get(b)!
    const roadStart = roadNodeById.get(road.from)!
    const roadEnd = roadNodeById.get(road.to)!
    let first: Pick<PedestrianNode, 'x' | 'z'>
    let second: Pick<PedestrianNode, 'x' | 'z'>
    if (options.curbPlacement === 'endpointVector' || useRoadGeometry) {
      const dx = to.x - from.x
      const dz = to.z - from.z
      const path = road.centerlineXZ ?? [roadStart, roadEnd]
      const candidates = path.slice(1).flatMap((roadPoint, index) => {
        const previous = path[index]
        const roadDx = roadPoint.x - previous.x
        const roadDz = roadPoint.z - previous.z
        const determinant = dx * roadDz - dz * roadDx
        const roadLength = Math.hypot(roadDx, roadDz)
        if (Math.abs(determinant) < EPSILON || roadLength < EPSILON) return []
        const startDx = previous.x - from.x
        const startDz = previous.z - from.z
        const fraction = (startDx * roadDz - startDz * roadDx) / determinant
        const roadFraction = (startDx * dz - startDz * dx) / determinant
        const halfFraction = road.width * roadLength / (2 * Math.abs(determinant))
        return roadFraction >= -EPSILON && roadFraction <= 1 + EPSILON &&
          fraction - halfFraction > 0 && fraction + halfFraction < 1
          ? [{ fraction, halfFraction }] : []
      }).sort((a, b) => Math.abs(a.fraction - 0.5) -
        Math.abs(b.fraction - 0.5))
      const selected = candidates[0]
      if (!selected) {
        throw new Error(`Pedestrian crossing lacks curb clearance at ${road.id}`)
      }
      first = { x: from.x + dx * (selected.fraction - selected.halfFraction),
        z: from.z + dz * (selected.fraction - selected.halfFraction) }
      second = { x: from.x + dx * (selected.fraction + selected.halfFraction),
        z: from.z + dz * (selected.fraction + selected.halfFraction) }
    } else {
      const center = direction === 'x' ? (roadStart.x + roadEnd.x) / 2 :
        (roadStart.z + roadEnd.z) / 2
      const curbA = center - road.width / 2
      const curbB = center + road.width / 2
      first = { x: direction === 'x' ? curbA : from.x,
        z: direction === 'z' ? curbA : from.z }
      second = { x: direction === 'x' ? curbB : to.x,
        z: direction === 'z' ? curbB : to.z }
    }
    const firstId = `${id}-curb-a`
    const secondId = `${id}-curb-b`
    addNode({ id: firstId, ...first, surfaceY: CURB_Y, kind: 'crossing' })
    addNode({ id: secondId, ...second, surfaceY: CURB_Y, kind: 'crossing' })
    addEdge(`${id}-approach-a`, a, firstId, 'access')
    addEdge(id, firstId, secondId, 'crossing', road.id)
    addEdge(`${id}-approach-b`, secondId, b, 'access')
  }

  const explicitRoadIds = new Set(city.blocks.flatMap((block) =>
    block.boundaryRoadEdgeIds ?? []))
  if (explicitRoadIds.size > 0) {
    const blocksByRoad = new Map<string, string[]>()
    for (const block of city.blocks) {
      for (const id of boundaryRoadIds(block)) {
        const list = blocksByRoad.get(id) ?? []
        list.push(block.id)
        blocksByRoad.set(id, list)
      }
    }
    for (const id of [...explicitRoadIds].sort()) {
      const road = roadEdgeById.get(id)
      if (!road) throw new Error(`Missing explicit crossing road ${id}`)
      const blockIds = blocksByRoad.get(id) ?? []
      if (blockIds.length > 2) {
        throw new Error(`Road ${id} borders more than two blocks`)
      }
      if (blockIds.length < 2) continue
      const start = roadNodeById.get(road.from)!
      const end = roadNodeById.get(road.to)!
      const path = road.centerlineXZ ?? [start, end]
      const middle = path[Math.floor((path.length - 1) / 2)]
      const next = path[Math.ceil((path.length - 1) / 2)]
      const midpoint = { x: (middle.x + next.x) / 2,
        z: (middle.z + next.z) / 2 }
      const curbAnchor = (blockId: string): string => {
        const candidates = anchors.filter((anchor) => anchor.blockId === blockId &&
          anchor.kind === 'street').map((anchor) => ({
          id: anchor.nodeId, node: nodeById.get(anchor.nodeId)!,
        })).sort((a, b) => Math.hypot(a.node.x - midpoint.x,
          a.node.z - midpoint.z) - Math.hypot(b.node.x - midpoint.x,
          b.node.z - midpoint.z) || a.id.localeCompare(b.id))
        if (!candidates[0]) throw new Error(`No pedestrian frontage for ${blockId}`)
        return candidates[0].id
      }
      crossBlocks(`ped-cross-boundary-${id}`, curbAnchor(blockIds[0]),
        curbAnchor(blockIds[1]), road, 'x', true)
    }
  }

  for (const block of city.blocks) {
    const current = blocks.get(block.id)!
    const eastId = `block-${block.column + 1}-${block.row}`
    const eastNeighbor = blocks.get(eastId)
    const eastBlock = blockById.get(eastId)
    if (eastNeighbor && !block.boundaryRoadEdgeIds &&
      !eastBlock?.boundaryRoadEdgeIds) {
      const roadId = `edge-z-${block.column + 1}-${block.row}`
      const road = roadEdgeById.get(roadId)
      if (!road) throw new Error(`Missing crossing road ${roadId}`)
      crossBlocks(
        `ped-cross-east-${block.id}`,
        current.at(current.east, current.north),
        eastNeighbor.at(eastNeighbor.west, eastNeighbor.north),
        road,
        'x',
      )
    }
    const southId = `block-${block.column}-${block.row + 1}`
    const southNeighbor = blocks.get(southId)
    const southBlock = blockById.get(southId)
    if (southNeighbor && !block.boundaryRoadEdgeIds &&
      !southBlock?.boundaryRoadEdgeIds) {
      const roadId = `edge-x-${block.column}-${block.row + 1}`
      const road = roadEdgeById.get(roadId)
      if (!road) throw new Error(`Missing crossing road ${roadId}`)
      crossBlocks(
        `ped-cross-south-${block.id}`,
        current.at(current.west, current.south),
        southNeighbor.at(southNeighbor.west, southNeighbor.north),
        road,
        'z',
      )
    }
  }

  return { nodes, edges, anchors }
}
