import type { CitizenState, RouteStep, WorldPosition } from './types'
import type { NavigationIndex } from './navigation'

const EPSILON = 1e-7

export interface MovementResult {
  readonly position: WorldPosition
  readonly routeIndex: number
  readonly distanceOnEdge: number
  readonly distanceAlongRoute: number
  readonly arrived: boolean
}

function positionOnStep(index: NavigationIndex, step: RouteStep, distanceOnEdge: number): WorldPosition {
  const from = index.nodeById.get(step.fromNodeId)
  const to = index.nodeById.get(step.toNodeId)
  const edge = index.edgeById.get(step.edgeId)
  if (!from || !to || !edge ||
      !((edge.from === step.fromNodeId && edge.to === step.toNodeId) ||
        (edge.to === step.fromNodeId && edge.from === step.toNodeId)) ||
      !Number.isFinite(step.length) || step.length <= 0) {
    throw new Error('Invalid route step')
  }
  const fraction = Math.max(0, Math.min(1, distanceOnEdge / step.length))
  return {
    x: from.x + (to.x - from.x) * fraction,
    y: from.surfaceY + (to.surfaceY - from.surfaceY) * fraction,
    z: from.z + (to.z - from.z) * fraction,
  }
}

export function advanceAlongRoute(index: NavigationIndex, citizen: CitizenState, distanceBudget: number): MovementResult {
  if (!Number.isFinite(distanceBudget) || distanceBudget < 0 ||
      citizen.route.length === 0 || citizen.routeIndex < 0 ||
      citizen.routeIndex >= citizen.route.length ||
      !Number.isFinite(citizen.distanceOnEdge) || citizen.distanceOnEdge < 0) {
    throw new Error('Invalid citizen movement input')
  }
  let routeIndex = citizen.routeIndex
  let distanceOnEdge = citizen.distanceOnEdge
  let remaining = distanceBudget
  let distanceAlongRoute = citizen.distanceAlongRoute
  for (let traversed = 0; traversed <= citizen.route.length && remaining > EPSILON; traversed += 1) {
    if (routeIndex >= citizen.route.length) break
    const step = citizen.route[routeIndex]
    if (!Number.isFinite(step.length) || step.length <= 0 || distanceOnEdge > step.length + EPSILON) {
      throw new Error('Invalid route progress')
    }
    const left = Math.max(0, step.length - distanceOnEdge)
    if (remaining < left - EPSILON) {
      distanceOnEdge += remaining
      distanceAlongRoute += remaining
      remaining = 0
      break
    }
    distanceAlongRoute += left
    remaining = Math.max(0, remaining - left)
    routeIndex += 1
    distanceOnEdge = 0
  }
  if (routeIndex >= citizen.route.length) {
    const last = citizen.route.at(-1)!
    const destination = index.nodeById.get(last.toNodeId)
    if (!destination) throw new Error('Route destination node is missing')
    return {
      position: { x: destination.x, y: destination.surfaceY, z: destination.z },
      routeIndex: citizen.route.length,
      distanceOnEdge: 0,
      distanceAlongRoute,
      arrived: true,
    }
  }
  const position = positionOnStep(index, citizen.route[routeIndex], distanceOnEdge)
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
    throw new Error('Non-finite citizen position')
  }
  return { position, routeIndex, distanceOnEdge, distanceAlongRoute, arrived: false }
}
