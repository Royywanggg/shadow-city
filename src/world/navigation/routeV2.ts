import type { NavEdgeV2, NavNodeV2, WorldModelV2, WorldPointMm } from '../model'

export type AccessMode = 'open' | 'entryClosed' | 'closed'

export interface TravellerCosts {
  readonly speedMmPerSecond: number
  readonly stairMultiplier: number
  readonly rampMultiplier: number
  readonly escalatorMultiplier: number
  readonly bridgeMultiplier: number
  readonly allowStairs: boolean
  readonly allowRamps: boolean
}

export interface RouteStepV5 {
  readonly edgeId: string
  readonly fromNodeId: string
  readonly toNodeId: string
  readonly lengthMm: number
}

export type RouteResultV2 =
  | Readonly<{ status: 'ok'; steps: readonly RouteStepV5[]; lengthMm: number; costMs: number }>
  | Readonly<{ status: 'unreachable'; reason: 'unknown-node' | 'disconnected' }>

interface Neighbour {
  readonly edgeId: string
  readonly toNodeId: string
}

export interface NavigationIndexV2 {
  readonly world: WorldModelV2
  readonly nodeById: ReadonlyMap<string, NavNodeV2>
  readonly edgeById: ReadonlyMap<string, NavEdgeV2>
  readonly adjacency: ReadonlyMap<string, readonly Neighbour[]>
}

export const DEFAULT_TRAVELLER_COSTS: TravellerCosts = Object.freeze({
  speedMmPerSecond: 1_300, stairMultiplier: 1.45, rampMultiplier: 1.12,
  escalatorMultiplier: 0.7, bridgeMultiplier: 1, allowStairs: true, allowRamps: true,
})

export function createNavigationIndexV2(world: WorldModelV2): NavigationIndexV2 {
  const nodeById = new Map(world.navNodes.map((node) => [node.id, node]))
  const edgeById = new Map(world.navEdges.map((edge) => [edge.id, edge]))
  if (nodeById.size !== world.navNodes.length || edgeById.size !== world.navEdges.length) {
    throw new Error('Duplicate multi-level navigation ID')
  }
  const adjacency = new Map(world.navNodes.map((node) => [node.id, [] as Neighbour[]]))
  for (const edge of world.navEdges) {
    if (!nodeById.has(edge.fromNodeId) || !nodeById.has(edge.toNodeId) || edge.lengthMm <= 0) {
      throw new Error(`Invalid multi-level navigation edge ${edge.id}`)
    }
    adjacency.get(edge.fromNodeId)!.push({ edgeId: edge.id, toNodeId: edge.toNodeId })
    if (edge.direction === 'both') {
      adjacency.get(edge.toNodeId)!.push({ edgeId: edge.id, toNodeId: edge.fromNodeId })
    }
  }
  for (const neighbours of adjacency.values()) {
    neighbours.sort((a, b) => a.edgeId.localeCompare(b.edgeId) || a.toNodeId.localeCompare(b.toNodeId))
  }
  return { world, nodeById, edgeById, adjacency }
}

export function canTraverseV2(index: NavigationIndexV2, edge: NavEdgeV2, fromNodeId: string,
  toNodeId: string, modes: ReadonlyMap<string, AccessMode>): boolean {
  const from = index.nodeById.get(fromNodeId)!
  const to = index.nodeById.get(toNodeId)!
  return (edge.accessIds ?? (edge.accessId ? [edge.accessId] : [])).every((accessId) => {
    const mode = modes.get(accessId) ?? 'open'
    if (mode === 'closed' && accessId !== 'mall-entry') return false
    if (mode === 'open') return true
    if (accessId === 'mall-entry') {
      return (from.surfaceId.startsWith('galleria-') &&
        (to.surfaceId === 'ground' || to.surfaceId === 'skybridge')) ||
        (from.surfaceId.startsWith('galleria-shop-') &&
          (to.surfaceId === 'galleria-l0' || to.surfaceId === 'galleria-l1'))
    }
    if (accessId === 'bridge-entry') return from.surfaceId === 'skybridge'
    return false
  })
}

export function edgeCostMs(edge: NavEdgeV2, costs: TravellerCosts, crowdCount = 0): number {
  if (!Number.isFinite(costs.speedMmPerSecond) || costs.speedMmPerSecond <= 0 ||
    crowdCount < 0 || !Number.isSafeInteger(crowdCount)) throw new Error('Invalid route cost input')
  const multiplier = edge.kind === 'stair' ? costs.stairMultiplier :
    edge.kind === 'ramp' ? costs.rampMultiplier :
      edge.kind === 'escalator' ? costs.escalatorMultiplier :
        edge.id.startsWith('bridge:') ? costs.bridgeMultiplier : 1
  return Math.max(1, Math.ceil(edge.lengthMm * 1000 * multiplier / costs.speedMmPerSecond) +
    Math.min(6_000, crowdCount * 350))
}

export function findRouteV2(index: NavigationIndexV2, originNodeId: string,
  destinationNodeId: string, costs: TravellerCosts = DEFAULT_TRAVELLER_COSTS,
  accessModes: ReadonlyMap<string, AccessMode> = new Map(),
  priorCrowd: ReadonlyMap<string, number> = new Map()): RouteResultV2 {
  if (!index.nodeById.has(originNodeId) || !index.nodeById.has(destinationNodeId)) {
    return { status: 'unreachable', reason: 'unknown-node' }
  }
  if (originNodeId === destinationNodeId) return { status: 'ok', steps: [], lengthMm: 0, costMs: 0 }
  const costsByNode = new Map<string, number>([[originNodeId, 0]])
  const previous = new Map<string, { fromNodeId: string; edgeId: string }>()
  const pending = new Set<string>([originNodeId])
  while (pending.size > 0) {
    let nodeId: string | null = null
    for (const candidate of pending) {
      if (nodeId === null || costsByNode.get(candidate)! < costsByNode.get(nodeId)! ||
        (costsByNode.get(candidate) === costsByNode.get(nodeId) && candidate < nodeId)) nodeId = candidate
    }
    if (!nodeId) break
    pending.delete(nodeId)
    if (nodeId === destinationNodeId) break
    for (const neighbour of index.adjacency.get(nodeId) ?? []) {
      const edge = index.edgeById.get(neighbour.edgeId)!
      if ((edge.kind === 'stair' && !costs.allowStairs) ||
        (edge.kind === 'ramp' && !costs.allowRamps) ||
        !canTraverseV2(index, edge, nodeId, neighbour.toNodeId, accessModes)) continue
      const nextCost = costsByNode.get(nodeId)! + edgeCostMs(edge, costs,
        priorCrowd.get(edge.id) ?? 0)
      const oldCost = costsByNode.get(neighbour.toNodeId)
      const oldPredecessor = previous.get(neighbour.toNodeId)
      if (oldCost === undefined || nextCost < oldCost ||
        (nextCost === oldCost && oldPredecessor &&
          `${nodeId}:${edge.id}` < `${oldPredecessor.fromNodeId}:${oldPredecessor.edgeId}`)) {
        costsByNode.set(neighbour.toNodeId, nextCost)
        previous.set(neighbour.toNodeId, { fromNodeId: nodeId, edgeId: edge.id })
        pending.add(neighbour.toNodeId)
      }
    }
  }
  const costMs = costsByNode.get(destinationNodeId)
  if (costMs === undefined) return { status: 'unreachable', reason: 'disconnected' }
  const reversed: RouteStepV5[] = []
  let cursor = destinationNodeId
  while (cursor !== originNodeId) {
    const source = previous.get(cursor)
    if (!source) throw new Error('Missing multi-level route predecessor')
    reversed.push({ edgeId: source.edgeId, fromNodeId: source.fromNodeId,
      toNodeId: cursor, lengthMm: index.edgeById.get(source.edgeId)!.lengthMm })
    cursor = source.fromNodeId
  }
  const steps = reversed.reverse()
  return { status: 'ok', steps, lengthMm: steps.reduce((sum, step) => sum + step.lengthMm, 0), costMs }
}

export function orientedEdgePath(index: NavigationIndexV2, step: RouteStepV5): readonly WorldPointMm[] {
  const edge = index.edgeById.get(step.edgeId)
  if (!edge) throw new Error(`Missing route edge ${step.edgeId}`)
  if (step.fromNodeId === edge.fromNodeId && step.toNodeId === edge.toNodeId) return edge.path
  if (step.fromNodeId === edge.toNodeId && step.toNodeId === edge.fromNodeId &&
    edge.direction === 'both') return [...edge.path].reverse()
  throw new Error(`Invalid route direction ${step.edgeId}`)
}

export function pointAlongEdge(index: NavigationIndexV2, step: RouteStepV5,
  distanceMm: number): WorldPointMm {
  const path = orientedEdgePath(index, step)
  let remaining = Math.max(0, Math.min(step.lengthMm, distanceMm))
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1]
    const b = path[index]
    const segment = Math.round(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z))
    if (remaining <= segment || index === path.length - 1) {
      const fraction = segment === 0 ? 1 : remaining / segment
      return { x: Math.round(a.x + (b.x - a.x) * fraction),
        y: Math.round(a.y + (b.y - a.y) * fraction),
        z: Math.round(a.z + (b.z - a.z) * fraction) }
    }
    remaining -= segment
  }
  return path.at(-1)!
}
