import type {
  NavEdgeV2, NavNodeV2, WalkableSurface, WorldBox, WorldPointMm,
  VerticalConnector, SemanticPlace, DistrictV2, PlaceResource, GroundPointMm,
} from '../model'

function distance(a: WorldPointMm, b: WorldPointMm): number {
  return Math.round(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z))
}

function polygonContains(polygon: readonly GroundPointMm[], point: GroundPointMm): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    const cross = (point.x - a.x) * (b.z - a.z) - (point.z - a.z) * (b.x - a.x)
    if (Math.abs(cross) < 1 && point.x >= Math.min(a.x, b.x) &&
      point.x <= Math.max(a.x, b.x) && point.z >= Math.min(a.z, b.z) &&
      point.z <= Math.max(a.z, b.z)) return true
    if ((a.z > point.z) !== (b.z > point.z) &&
      point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

function surfaceContains(surface: WalkableSurface, position: WorldPointMm): boolean {
  const xz = { x: position.x, z: position.z }
  return Math.abs(surface.elevationMm - position.y) < 20 &&
    polygonContains(surface.polygonXZ, xz) &&
    !surface.blockedPolygonsXZ.some((polygon) => polygonContains(polygon, xz))
}

function pathStaysOnSurface(surface: WalkableSurface, path: readonly WorldPointMm[]): boolean {
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1]
    const b = path[index]
    const count = Math.max(1, Math.ceil(distance(a, b) / 2_000))
    for (let sample = 0; sample <= count; sample += 1) {
      const fraction = sample / count
      const point = { x: Math.round(a.x + (b.x - a.x) * fraction),
        y: Math.round(a.y + (b.y - a.y) * fraction),
        z: Math.round(a.z + (b.z - a.z) * fraction) }
      if (!surfaceContains(surface, point)) return false
    }
  }
  return true
}

export class WorldBuilder {
  readonly districts: DistrictV2[] = []
  readonly surfaces: WalkableSurface[] = []
  readonly nodes: NavNodeV2[] = []
  readonly edges: NavEdgeV2[] = []
  readonly connectors: VerticalConnector[] = []
  readonly places: SemanticPlace[] = []
  readonly resources: PlaceResource[] = []
  readonly boxes: WorldBox[] = []
  private readonly nodeById = new Map<string, NavNodeV2>()
  private readonly surfaceIds = new Set<string>()
  private readonly edgeIds = new Set<string>()

  surface(surface: WalkableSurface): void {
    if (this.surfaceIds.has(surface.id) || surface.polygonXZ.length < 3 ||
      surface.clearanceMm <= 0) throw new Error(`Invalid walkable surface ${surface.id}`)
    this.surfaceIds.add(surface.id)
    this.surfaces.push(surface)
  }

  node(id: string, position: WorldPointMm, surfaceId: string): void {
    if (this.nodeById.has(id) || !this.surfaceIds.has(surfaceId) ||
      !Object.values(position).every(Number.isSafeInteger)) throw new Error(`Invalid navigation node ${id}`)
    const node = { id, position, surfaceId }
    this.nodeById.set(id, node)
    this.nodes.push(node)
  }

  edge(input: Omit<NavEdgeV2, 'lengthMm' | 'path'> & { readonly path?: readonly WorldPointMm[] }): void {
    const from = this.nodeById.get(input.fromNodeId)
    const to = this.nodeById.get(input.toNodeId)
    if (this.edgeIds.has(input.id) || !from || !to || from.id === to.id ||
      (input.surfaceId !== null && !this.surfaceIds.has(input.surfaceId))) {
      throw new Error(`Invalid navigation edge ${input.id}`)
    }
    const path = input.path ?? [from.position, to.position]
    if (path.length < 2 || ![path[0], path.at(-1)!].every((point, index) => {
      const expected = index === 0 ? from.position : to.position
      return point.x === expected.x && point.y === expected.y && point.z === expected.z
    })) throw new Error(`Invalid navigation path ${input.id}`)
    const lengthMm = path.slice(1).reduce((sum, point, index) => sum + distance(path[index], point), 0)
    if (lengthMm <= 0) throw new Error(`Zero-length navigation edge ${input.id}`)
    this.edgeIds.add(input.id)
    this.edges.push({ ...input, path, lengthMm })
  }

  buildValidation(): void {
    const surfaces = new Map(this.surfaces.map((surface) => [surface.id, surface]))
    for (const node of this.nodes) {
      if (!surfaceContains(surfaces.get(node.surfaceId)!, node.position)) {
        throw new Error(`Navigation node outside walkable surface: ${node.id}`)
      }
    }
    const connectorById = new Map(this.connectors.map((connector) => [connector.id, connector]))
    for (const edge of this.edges) {
      if (edge.connectorId && !connectorById.has(edge.connectorId)) {
        throw new Error(`Missing vertical connector ${edge.connectorId}`)
      }
      const surfaceId = edge.surfaceId
      if (surfaceId && !pathStaysOnSurface(surfaces.get(surfaceId)!, edge.path)) {
        throw new Error(`Navigation edge outside walkable surface: ${edge.id}`)
      }
    }
    for (const connector of this.connectors) {
      if (!this.surfaceIds.has(connector.lowerSurfaceId) ||
        !this.surfaceIds.has(connector.upperSurfaceId) ||
        connector.edgeIds.some((id) => !this.edgeIds.has(id))) {
        throw new Error(`Invalid vertical connector ${connector.id}`)
      }
    }
    const placeIds = new Set(this.places.map((place) => place.id))
    if (placeIds.size !== this.places.length) throw new Error('Duplicate place ID')
    for (const place of this.places) {
      if (place.capacity < 1 || place.surfaceIds.some((id) => !this.surfaceIds.has(id)) ||
        place.accessNodeIds.some((id) => !this.nodeById.has(id)) ||
        place.slotNodeIds.some((id) => !this.nodeById.has(id)) ||
        place.kind !== 'home' && place.capacity > place.slotNodeIds.length ||
        place.slotNodeIds.some((id) => !place.surfaceIds.includes(this.nodeById.get(id)!.surfaceId))) {
        throw new Error(`Invalid semantic place ${place.id}`)
      }
    }
    for (const resource of this.resources) {
      if (!placeIds.has(resource.placeId) || !this.surfaceIds.has(resource.surfaceId) ||
        !surfaceContains(surfaces.get(resource.surfaceId)!, resource.position)) {
        throw new Error(`Invalid place resource ${resource.id}`)
      }
    }
  }
}
