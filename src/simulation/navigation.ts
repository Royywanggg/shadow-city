import type { PedestrianAnchor, PedestrianEdge, PedestrianNetwork, PedestrianNode } from '../city/model'
import type { DeepReadonly, RouteStep, WorldPosition } from './types'

export interface NavigationIndex {
  readonly nodeById: ReadonlyMap<string, DeepReadonly<PedestrianNode>>
  readonly edgeById: ReadonlyMap<string, DeepReadonly<PedestrianEdge>>
  readonly anchorById: ReadonlyMap<string, DeepReadonly<PedestrianAnchor>>
  readonly adjacency: ReadonlyMap<string, readonly Neighbor[]>
}

interface Neighbor {
  readonly edgeId: string
  readonly toNodeId: string
  readonly costMm: number
  readonly length: number
}

interface QueueItem {
  readonly nodeId: string
  readonly costMm: number
}

class MinHeap {
  private data: QueueItem[] = []

  push(item: QueueItem): void {
    this.data.push(item)
    let index = this.data.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (compareQueue(this.data[parent], this.data[index]) <= 0) break
      ;[this.data[parent], this.data[index]] = [this.data[index], this.data[parent]]
      index = parent
    }
  }

  pop(): QueueItem | undefined {
    const first = this.data[0]
    const last = this.data.pop()
    if (!first || !last || this.data.length === 0) return first
    this.data[0] = last
    let index = 0
    while (true) {
      const left = index * 2 + 1
      const right = left + 1
      let smallest = index
      if (left < this.data.length && compareQueue(this.data[left], this.data[smallest]) < 0) smallest = left
      if (right < this.data.length && compareQueue(this.data[right], this.data[smallest]) < 0) smallest = right
      if (smallest === index) break
      ;[this.data[index], this.data[smallest]] = [this.data[smallest], this.data[index]]
      index = smallest
    }
    return first
  }

  get size(): number { return this.data.length }
}

function compareQueue(a: QueueItem, b: QueueItem): number {
  return a.costMm - b.costMm || a.nodeId.localeCompare(b.nodeId)
}

export function createNavigationIndex(graph: DeepReadonly<PedestrianNetwork>): NavigationIndex {
  const nodeById = new Map<string, DeepReadonly<PedestrianNode>>()
  const edgeById = new Map<string, DeepReadonly<PedestrianEdge>>()
  const anchorById = new Map<string, DeepReadonly<PedestrianAnchor>>()
  const adjacency = new Map<string, Neighbor[]>()

  for (const node of graph.nodes) {
    if (nodeById.has(node.id) || !Number.isFinite(node.x) || !Number.isFinite(node.z) ||
        !Number.isFinite(node.surfaceY)) throw new Error(`Invalid pedestrian node ${node.id}`)
    nodeById.set(node.id, node)
    adjacency.set(node.id, [])
  }
  for (const edge of graph.edges) {
    if (edgeById.has(edge.id) || edge.from === edge.to ||
        !nodeById.has(edge.from) || !nodeById.has(edge.to) ||
        !Number.isFinite(edge.length) || edge.length <= 0 ||
        !Number.isSafeInteger(edge.costMm) || edge.costMm <= 0) {
      throw new Error(`Invalid pedestrian edge ${edge.id}`)
    }
    edgeById.set(edge.id, edge)
    adjacency.get(edge.from)!.push({ edgeId: edge.id, toNodeId: edge.to, costMm: edge.costMm, length: edge.length })
    adjacency.get(edge.to)!.push({ edgeId: edge.id, toNodeId: edge.from, costMm: edge.costMm, length: edge.length })
  }
  for (const anchor of graph.anchors) {
    if (anchorById.has(anchor.id) || !nodeById.has(anchor.nodeId)) {
      throw new Error(`Invalid pedestrian anchor ${anchor.id}`)
    }
    anchorById.set(anchor.id, anchor)
  }
  for (const neighbors of adjacency.values()) {
    neighbors.sort((a, b) => a.edgeId.localeCompare(b.edgeId) || a.toNodeId.localeCompare(b.toNodeId))
  }
  return { nodeById, edgeById, anchorById, adjacency }
}

export type RouteResult =
  | { readonly status: 'ok'; readonly steps: readonly RouteStep[]; readonly length: number; readonly costMm: number }
  | { readonly status: 'unreachable'; readonly reason: 'unknown-origin' | 'unknown-destination' | 'disconnected' }

export function findRoute(index: NavigationIndex, originNodeId: string, destinationNodeId: string): RouteResult {
  if (!index.nodeById.has(originNodeId)) return { status: 'unreachable', reason: 'unknown-origin' }
  if (!index.nodeById.has(destinationNodeId)) return { status: 'unreachable', reason: 'unknown-destination' }
  if (originNodeId === destinationNodeId) return { status: 'ok', steps: [], length: 0, costMm: 0 }

  const costs = new Map<string, number>([[originNodeId, 0]])
  const previous = new Map<string, { fromNodeId: string; edgeId: string; length: number }>()
  const heap = new MinHeap()
  heap.push({ nodeId: originNodeId, costMm: 0 })
  while (heap.size > 0) {
    const item = heap.pop()!
    if (item.costMm !== costs.get(item.nodeId)) continue
    if (item.nodeId === destinationNodeId) break
    for (const neighbor of index.adjacency.get(item.nodeId) ?? []) {
      const cost = item.costMm + neighbor.costMm
      const oldCost = costs.get(neighbor.toNodeId)
      const oldPrevious = previous.get(neighbor.toNodeId)
      const betterTie = oldCost === cost && oldPrevious !== undefined &&
        (item.nodeId.localeCompare(oldPrevious.fromNodeId) < 0 ||
          (item.nodeId === oldPrevious.fromNodeId && neighbor.edgeId.localeCompare(oldPrevious.edgeId) < 0))
      if (oldCost === undefined || cost < oldCost || betterTie) {
        costs.set(neighbor.toNodeId, cost)
        previous.set(neighbor.toNodeId, { fromNodeId: item.nodeId, edgeId: neighbor.edgeId, length: neighbor.length })
        if (oldCost === undefined || cost < oldCost) heap.push({ nodeId: neighbor.toNodeId, costMm: cost })
      }
    }
  }

  const totalCost = costs.get(destinationNodeId)
  if (totalCost === undefined) return { status: 'unreachable', reason: 'disconnected' }
  const reversed: RouteStep[] = []
  let nodeId = destinationNodeId
  while (nodeId !== originNodeId) {
    const prior = previous.get(nodeId)
    if (!prior) throw new Error('Pedestrian route predecessor missing')
    reversed.push({ edgeId: prior.edgeId, fromNodeId: prior.fromNodeId, toNodeId: nodeId, length: prior.length })
    nodeId = prior.fromNodeId
  }
  reversed.reverse()
  return { status: 'ok', steps: reversed, length: reversed.reduce((sum, step) => sum + step.length, 0), costMm: totalCost }
}

export function routeLength(route: readonly RouteStep[]): number {
  return route.reduce((sum, step) => sum + step.length, 0)
}

export interface RouteLocation {
  readonly position: WorldPosition
  readonly routeIndex: number
  readonly distanceOnEdge: number
}

export function locateOnRoute(index: NavigationIndex, route: readonly RouteStep[], distanceAlongRoute: number): RouteLocation {
  if (route.length === 0 || !Number.isFinite(distanceAlongRoute)) throw new Error('Cannot locate an empty or invalid route')
  const total = routeLength(route)
  const distance = Math.max(0, Math.min(total, distanceAlongRoute))
  let consumed = 0
  for (let routeIndex = 0; routeIndex < route.length; routeIndex += 1) {
    const step = route[routeIndex]
    if (!Number.isFinite(step.length) || step.length <= 0) throw new Error('Invalid route step length')
    if (distance <= consumed + step.length || routeIndex === route.length - 1) {
      const from = index.nodeById.get(step.fromNodeId)
      const to = index.nodeById.get(step.toNodeId)
      const edge = index.edgeById.get(step.edgeId)
      if (!from || !to || !edge ||
          !((edge.from === step.fromNodeId && edge.to === step.toNodeId) ||
            (edge.to === step.fromNodeId && edge.from === step.toNodeId))) {
        throw new Error('Route step does not match the pedestrian graph')
      }
      const distanceOnEdge = Math.max(0, Math.min(step.length, distance - consumed))
      const fraction = distanceOnEdge / step.length
      return {
        position: {
          x: from.x + (to.x - from.x) * fraction,
          y: from.surfaceY + (to.surfaceY - from.surfaceY) * fraction,
          z: from.z + (to.z - from.z) * fraction,
        },
        routeIndex,
        distanceOnEdge,
      }
    }
    consumed += step.length
  }
  throw new Error('Route location could not be resolved')
}
