import type {
  Building,
  CityModel,
  PedestrianAnchor,
  PedestrianEdge,
  PedestrianNetwork,
  PedestrianNode,
  RoadEdge,
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

type SpatialCity = Pick<CityModel, 'roads' | 'blocks' | 'parcels' | 'buildings' | 'plaza'>

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

function sortedDistinct(values: readonly number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.filter((value, index) => index === 0 || value - sorted[index - 1] > EPSILON)
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

  for (const block of city.blocks) {
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
  ): void {
    const from = nodeById.get(a)!
    const to = nodeById.get(b)!
    const roadStart = roadNodeById.get(road.from)!
    const roadEnd = roadNodeById.get(road.to)!
    let first: Pick<PedestrianNode, 'x' | 'z'>
    let second: Pick<PedestrianNode, 'x' | 'z'>
    if (options.curbPlacement === 'endpointVector') {
      const dx = to.x - from.x
      const dz = to.z - from.z
      const roadDx = roadEnd.x - roadStart.x
      const roadDz = roadEnd.z - roadStart.z
      const determinant = dx * roadDz - dz * roadDx
      const roadLength = Math.hypot(roadDx, roadDz)
      if (Math.abs(determinant) < EPSILON || roadLength < EPSILON) {
        throw new Error(`Pedestrian crossing does not meet road ${road.id}`)
      }
      const startDx = roadStart.x - from.x
      const startDz = roadStart.z - from.z
      const centerFraction = (startDx * roadDz - startDz * roadDx) / determinant
      const roadFraction = (startDx * dz - startDz * dx) / determinant
      const halfFraction = road.width * roadLength / (2 * Math.abs(determinant))
      if (centerFraction - halfFraction <= 0 || centerFraction + halfFraction >= 1 ||
        roadFraction < -EPSILON || roadFraction > 1 + EPSILON) {
        throw new Error(`Pedestrian crossing lacks curb clearance at ${road.id}`)
      }
      first = { x: from.x + dx * (centerFraction - halfFraction),
        z: from.z + dz * (centerFraction - halfFraction) }
      second = { x: from.x + dx * (centerFraction + halfFraction),
        z: from.z + dz * (centerFraction + halfFraction) }
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

  for (const block of city.blocks) {
    const current = blocks.get(block.id)!
    const eastNeighbor = blocks.get(`block-${block.column + 1}-${block.row}`)
    if (eastNeighbor) {
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
    const southNeighbor = blocks.get(`block-${block.column}-${block.row + 1}`)
    if (southNeighbor) {
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
