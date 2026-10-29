import type { GroundPointMm, NavEdgeV2, WorldModelV2, WorldPointMm } from '../../world/model'
import { surfaceHeight } from '../../world/terrain/terrainV1'
import type { AccessMode } from '../../world/navigation/routeV2'
import { canonicalPair, compareEncounterIds, type EncounterTracePoint,
  type SpatialCandidateSample } from './spatialTypes'

const SQUARE = (n: number) => n * n
const distanceSquared = (a: WorldPointMm, b: WorldPointMm): number =>
  SQUARE(a.x - b.x) + SQUARE(a.y - b.y) + SQUARE(a.z - b.z)

function contains(polygon: readonly GroundPointMm[], p: GroundPointMm): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]; const b = polygon[j]
    const cross = (p.x - a.x) * (b.z - a.z) - (p.z - a.z) * (b.x - a.x)
    if (Math.abs(cross) <= 1 && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) &&
      p.z >= Math.min(a.z, b.z) && p.z <= Math.max(a.z, b.z)) return true
    if ((a.z > p.z) !== (b.z > p.z) &&
      p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

function segmentsIntersect(a: GroundPointMm, b: GroundPointMm,
  c: GroundPointMm, d: GroundPointMm): boolean {
  const orient = (p: GroundPointMm, q: GroundPointMm, r: GroundPointMm) =>
    (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)
  const on = (p: GroundPointMm, q: GroundPointMm, r: GroundPointMm) =>
    Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) &&
    Math.min(p.z, q.z) <= r.z && r.z <= Math.max(p.z, q.z)
  const abC = orient(a, b, c); const abD = orient(a, b, d)
  const cdA = orient(c, d, a); const cdB = orient(c, d, b)
  if (abC === 0 && on(a, b, c) || abD === 0 && on(a, b, d) ||
    cdA === 0 && on(c, d, a) || cdB === 0 && on(c, d, b)) return true
  return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0)
}

interface IndexedBlocker {
  readonly polygon: readonly GroundPointMm[]
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}

interface BlockerIndex {
  readonly cells: ReadonlyMap<string, readonly IndexedBlocker[]>
}

const BLOCKER_CELL_MM = 8_000
const blockerCell = (x: number, z: number): string =>
  `${Math.floor(x / BLOCKER_CELL_MM)}:${Math.floor(z / BLOCKER_CELL_MM)}`

function createBlockerIndex(polygons: readonly (readonly GroundPointMm[])[]): BlockerIndex {
  const cells = new Map<string, IndexedBlocker[]>()
  for (const polygon of polygons) {
    const blocker: IndexedBlocker = { polygon,
      minX: Math.min(...polygon.map((point) => point.x)),
      maxX: Math.max(...polygon.map((point) => point.x)),
      minZ: Math.min(...polygon.map((point) => point.z)),
      maxZ: Math.max(...polygon.map((point) => point.z)) }
    for (let x = Math.floor(blocker.minX / BLOCKER_CELL_MM);
      x <= Math.floor(blocker.maxX / BLOCKER_CELL_MM); x += 1) {
      for (let z = Math.floor(blocker.minZ / BLOCKER_CELL_MM);
        z <= Math.floor(blocker.maxZ / BLOCKER_CELL_MM); z += 1) {
        const key = `${x}:${z}`
        const group = cells.get(key) ?? []
        group.push(blocker); cells.set(key, group)
      }
    }
  }
  return { cells }
}

function blockersInBounds(index: BlockerIndex, minX: number, maxX: number,
  minZ: number, maxZ: number): readonly IndexedBlocker[] {
  if (index.cells.size === 0) return []
  const found = new Set<IndexedBlocker>()
  for (let x = Math.floor(minX / BLOCKER_CELL_MM);
    x <= Math.floor(maxX / BLOCKER_CELL_MM); x += 1) {
    for (let z = Math.floor(minZ / BLOCKER_CELL_MM);
      z <= Math.floor(maxZ / BLOCKER_CELL_MM); z += 1) {
      for (const blocker of index.cells.get(`${x}:${z}`) ?? []) {
        if (blocker.maxX < minX || blocker.minX > maxX ||
          blocker.maxZ < minZ || blocker.minZ > maxZ) continue
        found.add(blocker)
      }
    }
  }
  return [...found]
}

function pointBlocked(index: BlockerIndex, p: GroundPointMm): boolean {
  if (index.cells.size === 0) return false
  return (index.cells.get(blockerCell(p.x, p.z)) ?? []).some((blocker) =>
    p.x >= blocker.minX && p.x <= blocker.maxX &&
    p.z >= blocker.minZ && p.z <= blocker.maxZ && contains(blocker.polygon, p))
}

function blockedBetween(a: WorldPointMm, b: WorldPointMm,
  index: BlockerIndex): boolean {
  if (index.cells.size === 0) return false
  const start = { x: a.x, z: a.z }; const end = { x: b.x, z: b.z }
  const blockers = blockersInBounds(index, Math.min(a.x, b.x), Math.max(a.x, b.x),
    Math.min(a.z, b.z), Math.max(a.z, b.z))
  for (const blocker of blockers) {
    const polygon = blocker.polygon
    if (contains(polygon, start) || contains(polygon, end)) return true
    for (let index = 0; index < polygon.length; index += 1) {
      if (segmentsIntersect(start, end, polygon[index], polygon[(index + 1) % polygon.length])) return true
    }
  }
  return false
}

/** True only when both points occupy the same clear part of one static surface. */
export function hasClearSurfaceSegment(world: WorldModelV2, surfaceId: string,
  a: WorldPointMm, b: WorldPointMm): boolean {
  const index = staticIndex(world)
  const surface = index.surfaces.get(surfaceId)
  if (!surface) return false
  const blockers = index.blockersBySurface.get(surfaceId)!
  const onSurface = (point: WorldPointMm) =>
    Math.abs(point.y - surfaceHeight(surface, world.terrain, point)) <= 350 &&
    contains(surface.polygonXZ, { x: point.x, z: point.z }) &&
    !pointBlocked(blockers, { x: point.x, z: point.z })
  return onSurface(a) && onSurface(b) &&
    !blockedBetween(a, b, blockers)
}

function distanceToSegmentSquared(p: WorldPointMm, a: WorldPointMm, b: WorldPointMm): number {
  const vx = b.x - a.x; const vy = b.y - a.y; const vz = b.z - a.z
  const lengthSquared = vx * vx + vy * vy + vz * vz
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((p.x - a.x) * vx + (p.y - a.y) * vy + (p.z - a.z) * vz) / lengthSquared))
  return distanceSquared(p, { x: a.x + vx * t, y: a.y + vy * t, z: a.z + vz * t })
}

function validTrace(trace: EncounterTracePoint,
  world: WorldModelV2,
  surfaceById: ReadonlyMap<string, WorldModelV2['surfaces'][number]>,
  blockersBySurface: ReadonlyMap<string, BlockerIndex>,
  connectorEdges: ReadonlyMap<string, readonly NavEdgeV2[]>,
  edgeById: ReadonlyMap<string, NavEdgeV2>,
  nodeById: ReadonlyMap<string, WorldModelV2['navNodes'][number]>): boolean {
  const surface = surfaceById.get(trace.surfaceId)
  if (!surface || !Object.values(trace.position).every(Number.isSafeInteger)) return false
  if (trace.surfaceId.startsWith('connector:')) {
    const edges = connectorEdges.get(trace.surfaceId.slice('connector:'.length)) ?? []
    return edges.some((edge) => edge.path.slice(1).some((point, index) =>
      distanceToSegmentSquared(trace.position, edge.path[index], point) <= SQUARE(350)))
  }
  const xz = { x: trace.position.x, z: trace.position.z }
  if (Math.abs(trace.position.y - surfaceHeight(surface, world.terrain, trace.position)) <= 350 &&
    contains(surface.polygonXZ, xz) &&
    !pointBlocked(blockersBySurface.get(surface.id)!, xz)) return true
  const edge = trace.edgeId ? edgeById.get(trace.edgeId) : null
  if (!edge || edge.surfaceId !== null || edge.connectorId !== null) return false
  const from = nodeById.get(edge.fromNodeId); const to = nodeById.get(edge.toNodeId)
  return Boolean(from && to && (from.surfaceId === trace.surfaceId ||
    to.surfaceId === trace.surfaceId) && edge.path.slice(1).some((point, index) =>
    distanceToSegmentSquared(trace.position, edge.path[index], point) <= SQUARE(350)))
}

interface PortalBoundary {
  readonly firstSurfaceId: string
  readonly secondSurfaceId: string
  readonly firstPosition: WorldPointMm
  readonly secondPosition: WorldPointMm
  readonly accessIds: readonly string[]
}

function portalBoundaries(world: WorldModelV2): readonly PortalBoundary[] {
  const nodes = new Map(world.navNodes.map((node) => [node.id, node]))
  const result: PortalBoundary[] = []
  for (const edge of world.navEdges) {
    const from = nodes.get(edge.fromNodeId); const to = nodes.get(edge.toNodeId)
    if (!from || !to) continue
    const accessIds = edge.accessIds ?? (edge.accessId ? [edge.accessId] : [])
    if (edge.connectorId) {
      const connectorSurface = `connector:${edge.connectorId}`
      result.push({ firstSurfaceId: from.surfaceId, secondSurfaceId: connectorSurface,
        firstPosition: from.position, secondPosition: from.position, accessIds })
      result.push({ firstSurfaceId: connectorSurface, secondSurfaceId: to.surfaceId,
        firstPosition: to.position, secondPosition: to.position, accessIds })
    } else if (from.surfaceId !== to.surfaceId && edge.surfaceId === null) {
      result.push({ firstSurfaceId: from.surfaceId, secondSurfaceId: to.surfaceId,
        firstPosition: from.position, secondPosition: to.position, accessIds })
    }
  }
  return result
}

interface StaticSpatialIndex {
  readonly surfaces: ReadonlyMap<string, WorldModelV2['surfaces'][number]>
  readonly blockersBySurface: ReadonlyMap<string, BlockerIndex>
  readonly connectorEdges: ReadonlyMap<string, readonly NavEdgeV2[]>
  readonly edgeById: ReadonlyMap<string, NavEdgeV2>
  readonly nodeById: ReadonlyMap<string, WorldModelV2['navNodes'][number]>
  readonly boundaries: readonly PortalBoundary[]
}

const indexCache = new WeakMap<WorldModelV2, StaticSpatialIndex>()

function staticIndex(world: WorldModelV2): StaticSpatialIndex {
  const cached = indexCache.get(world)
  if (cached) return cached
  const surfaces = new Map(world.surfaces.map((surface) => [surface.id, surface]))
  const blockersBySurface = new Map(world.surfaces.map((surface) =>
    [surface.id, createBlockerIndex(surface.blockedPolygonsXZ)]))
  const connectorEdges = new Map<string, NavEdgeV2[]>()
  for (const edge of world.navEdges) if (edge.connectorId) {
    const edges = connectorEdges.get(edge.connectorId) ?? []
    edges.push(edge); connectorEdges.set(edge.connectorId, edges)
  }
  const index = { surfaces, blockersBySurface, connectorEdges,
    edgeById: new Map(world.navEdges.map((edge) => [edge.id, edge])),
    nodeById: new Map(world.navNodes.map((node) => [node.id, node])),
    boundaries: portalBoundaries(world) }
  indexCache.set(world, index)
  return index
}

function nearOpenPortal(a: EncounterTracePoint, b: EncounterTracePoint,
  boundaries: readonly PortalBoundary[], modes: Readonly<Record<string, AccessMode>>,
  endpointRadiusMm: number): boolean {
  const radiusSquared = SQUARE(endpointRadiusMm)
  return boundaries.some((boundary) => {
    if (boundary.accessIds.some((id) => modes[id] === 'closed')) return false
    if (a.surfaceId === boundary.firstSurfaceId && b.surfaceId === boundary.secondSurfaceId) {
      return distanceSquared(a.position, boundary.firstPosition) <= radiusSquared &&
        distanceSquared(b.position, boundary.secondPosition) <= radiusSquared
    }
    if (b.surfaceId === boundary.firstSurfaceId && a.surfaceId === boundary.secondSurfaceId) {
      return distanceSquared(b.position, boundary.firstPosition) <= radiusSquared &&
        distanceSquared(a.position, boundary.secondPosition) <= radiusSquared
    }
    return false
  })
}

export interface SpatialQueryOptions {
  readonly radiusMm: number
  readonly endpointRadiusMm?: number
}

/** Query close pairs in legal space without an all-agents pairwise scan. */
export function querySpatialCandidates(world: WorldModelV2,
  traces: readonly EncounterTracePoint[], modes: Readonly<Record<string, AccessMode>>,
  options: SpatialQueryOptions): readonly SpatialCandidateSample[] {
  const { radiusMm } = options
  if (!Number.isSafeInteger(radiusMm) || radiusMm <= 0) throw new Error('Invalid encounter radius')
  const endpointRadiusMm = options.endpointRadiusMm ?? 1_200
  if (!Number.isSafeInteger(endpointRadiusMm) || endpointRadiusMm <= 0) {
    throw new Error('Invalid portal endpoint radius')
  }
  const { surfaces, blockersBySurface, connectorEdges,
    edgeById, nodeById, boundaries } = staticIndex(world)
  const bySecond = new Map<number, EncounterTracePoint[]>()
  const previousByAgent = new Map<string, EncounterTracePoint>()
  const validByAgent = new Map<string, boolean>()
  const speedByTrace = new Map<EncounterTracePoint, number>()
  const seenBySecond = new Map<number, Set<string>>()
  for (const trace of [...traces].sort((a, b) => a.second - b.second ||
    compareEncounterIds(a.agentId, b.agentId))) {
    if (!Number.isSafeInteger(trace.second) || trace.second < 0) throw new Error('Invalid trace second')
    const prior = previousByAgent.get(trace.agentId)
    const unchangedPosition = prior?.surfaceId === trace.surfaceId &&
      prior.edgeId === trace.edgeId &&
      prior.position.x === trace.position.x &&
      prior.position.y === trace.position.y &&
      prior.position.z === trace.position.z
    const seen = seenBySecond.get(trace.second) ?? new Set<string>()
    if (seen.has(trace.agentId)) {
      throw new Error(`Duplicate trace ${trace.agentId} at second ${trace.second}`)
    }
    seen.add(trace.agentId); seenBySecond.set(trace.second, seen)
    speedByTrace.set(trace, prior && prior.second === trace.second - 1 ?
      unchangedPosition ? 0 : Math.sqrt(distanceSquared(prior.position, trace.position)) : 0)
    previousByAgent.set(trace.agentId, trace)
    if (trace.second === 0) continue
    const valid = unchangedPosition && validByAgent.get(trace.agentId) === true ||
      validTrace(trace, world, surfaces, blockersBySurface, connectorEdges, edgeById, nodeById)
    validByAgent.set(trace.agentId, valid)
    if (!valid) {
      throw new Error(`Encounter trace outside legal space: ${trace.agentId} at second ${trace.second}`)
    }
    const items = bySecond.get(trace.second) ?? []
    items.push(trace); bySecond.set(trace.second, items)
  }
  const result: SpatialCandidateSample[] = []
  const radiusSquared = SQUARE(radiusMm)
  const cellSize = radiusMm
  const occupiedAnySecond = new Set(traces.map((trace) => trace.surfaceId))
  const candidateBoundaries = boundaries.filter((boundary) =>
    occupiedAnySecond.has(boundary.firstSurfaceId) &&
    occupiedAnySecond.has(boundary.secondSurfaceId) &&
    !boundary.accessIds.some((id) => modes[id] === 'closed'))
  for (const [second, points] of [...bySecond].sort(([a], [b]) => a - b)) {
    const buckets = new Map<string, Map<string, EncounterTracePoint[]>>()
    const occupiedSurfaces = new Set(points.map((point) => point.surfaceId))
    // Horizontal bucketing is sufficient: true 3D proximity implies horizontal
    // proximity. Exact 3D distance and surface membership are still checked below.
    const cell = (p: WorldPointMm) => [Math.floor(p.x / cellSize),
      Math.floor(p.z / cellSize)] as const
    const key = (x: number, z: number) => `${x}:${z}`
    for (const trace of points) {
      const [x, z] = cell(trace.position)
      const surfaceBuckets = buckets.get(trace.surfaceId) ??
        new Map<string, EncounterTracePoint[]>()
      const bucketKey = key(x, z)
      const bucket = surfaceBuckets.get(bucketKey) ?? []
      bucket.push(trace); surfaceBuckets.set(bucketKey, bucket)
      buckets.set(trace.surfaceId, surfaceBuckets)
    }
    const found = new Set<string>()
    const add = (a: EncounterTracePoint, b: EncounterTracePoint,
      relation: SpatialCandidateSample['relation']) => {
      if (a.agentId === b.agentId || distanceSquared(a.position, b.position) > radiusSquared) return
      const pair = canonicalPair(a.agentId, b.agentId)
      if (found.has(pair.key)) return
      const [first, secondTrace] = a.agentId === pair.ids[0] ? [a, b] : [b, a]
      const surface = relation === 'sameSurface' ? surfaces.get(a.surfaceId)! : null
      if (surface && blockedBetween(a.position, b.position,
        blockersBySurface.get(surface.id)!)) return
      const sharedTracePlace = first.placeId && first.placeId === secondTrace.placeId
        ? first.placeId : null
      const staticPlace = surface?.placeId ?? null
      const compatibleStaticPlace = staticPlace &&
        (first.placeId === null || first.placeId === staticPlace) &&
        (secondTrace.placeId === null || secondTrace.placeId === staticPlace)
        ? staticPlace : null
      found.add(pair.key)
      result.push({ pairKey: pair.key, participantIds: pair.ids, second,
        distanceMm: Math.round(Math.sqrt(distanceSquared(a.position, b.position))), relation,
        surfaceId: surface?.id ?? null,
        placeId: relation === 'sameSurface' ? sharedTracePlace ?? compatibleStaticPlace : null,
        first, secondTrace,
        firstSpeedMmPerSecond: speedByTrace.get(first) ?? 0,
        secondSpeedMmPerSecond: speedByTrace.get(secondTrace) ?? 0 })
    }
    for (const a of points) {
      const [cx, cz] = cell(a.position)
      const surfaceBuckets = buckets.get(a.surfaceId)!
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          for (const b of surfaceBuckets.get(key(cx + dx, cz + dz)) ?? []) {
            if (a.agentId < b.agentId) add(a, b, 'sameSurface')
          }
        }
      }
    }
    // Only a small endpoint bucket of a real portal may bridge two surfaces.
    for (const boundary of candidateBoundaries) {
      if (!occupiedSurfaces.has(boundary.firstSurfaceId) ||
        !occupiedSurfaces.has(boundary.secondSurfaceId)) continue
      const around = (surfaceId: string, position: WorldPointMm) => {
        const [cx, cz] = cell(position)
        const matches: EncounterTracePoint[] = []
        const surfaceBuckets = buckets.get(surfaceId)
        if (!surfaceBuckets) return matches
        const reach = Math.ceil(endpointRadiusMm / cellSize)
        for (let dx = -reach; dx <= reach; dx += 1) {
          for (let dz = -reach; dz <= reach; dz += 1) {
            matches.push(...surfaceBuckets.get(key(cx + dx, cz + dz)) ?? [])
          }
        }
        return matches
      }
      for (const a of around(boundary.firstSurfaceId, boundary.firstPosition)) {
        for (const b of around(boundary.secondSurfaceId, boundary.secondPosition)) {
          if (nearOpenPortal(a, b, [boundary], modes, endpointRadiusMm)) add(a, b, 'openPortal')
        }
      }
    }
  }
  return result.sort((a, b) => a.second - b.second || compareEncounterIds(a.pairKey, b.pairKey))
}
