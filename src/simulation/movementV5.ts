import type { NavEdgeV2, WorldPointMm } from '../world/model'
import { canTraverseV2, orientedEdgePath, pointAlongEdge, type NavigationIndexV2, type AccessMode } from '../world/navigation/routeV2'
import type { CitizenProfileV5, CitizenStateV5, MovementTracePoint } from './v5Types'

const heading = (a: WorldPointMm, b: WorldPointMm): number => Math.atan2(b.x - a.x, b.z - a.z)

function edgeSpatial(edge: NavEdgeV2, position: WorldPointMm, index: NavigationIndexV2,
  step: CitizenStateV5['route'][number], distance: number): { surfaceId: string; placeId: string | null } {
  const surfaceId = edge.connectorId && distance < edge.lengthMm
    ? `connector:${edge.connectorId}` : edge.surfaceId ?? (distance < edge.lengthMm / 2
    ? index.nodeById.get(step.fromNodeId)!.surfaceId : index.nodeById.get(step.toNodeId)!.surfaceId)
  const surface = index.surfaceById.get(surfaceId)
  if (!surface) throw new Error(`Unknown surface ${surfaceId}`)
  void position
  return { surfaceId, placeId: surface.placeId }
}

/** Advance only over authorized graph edges; sampled animation never changes simulation position. */
export function moveCitizenOneTick(citizen: CitizenStateV5, profile: CitizenProfileV5,
  index: NavigationIndexV2, accessModes: ReadonlyMap<string, AccessMode>,
  secondsPerTick: number, connectorAvailability: Map<string, number> = new Map()): {
    citizen: CitizenStateV5; trace: readonly MovementTracePoint[];
    blocked: 'access' | 'capacity' | null } {
  let current = citizen
  let blocked: 'access' | 'capacity' | null = null
  const trace: MovementTracePoint[] = []
  for (let second = 1; second <= secondsPerTick; second += 1) {
    let remaining = profile.travellerCosts.speedMmPerSecond * (citizen.movementMode === 'jog' ? 1.48 : 1)
    while (remaining > 0 && current.routeIndex < current.route.length) {
      const step = current.route[current.routeIndex]
      const edge = index.edgeById.get(step.edgeId)!
      if (current.distanceOnEdgeMm === 0 && !canTraverseV2(index, edge, step.fromNodeId,
        step.toNodeId, accessModes)) { blocked = 'access'; break }
      if (current.distanceOnEdgeMm === 0 && edge.connectorId) {
        const remainingSlots = connectorAvailability.get(edge.connectorId)
        if (remainingSlots !== undefined && remainingSlots <= 0) {
          blocked = 'capacity'; break
        }
        if (remainingSlots !== undefined) connectorAvailability.set(edge.connectorId, remainingSlots - 1)
      }
      const allowed = Math.min(remaining, step.lengthMm - current.distanceOnEdgeMm)
      const distance = current.distanceOnEdgeMm + allowed
      const position = pointAlongEdge(index, step, distance)
      const prior = current.position
      const spatial = edgeSpatial(edge, position, index, step, distance)
      const arrived = distance >= step.lengthMm
      if (arrived && edge.connectorId && connectorAvailability.has(edge.connectorId)) {
        connectorAvailability.set(edge.connectorId,
          connectorAvailability.get(edge.connectorId)! + 1)
      }
      current = { ...current, position, surfaceId: spatial.surfaceId, placeId: spatial.placeId,
        headingRadians: heading(prior, position), routeIndex: arrived ? current.routeIndex + 1 : current.routeIndex,
        distanceOnEdgeMm: arrived ? 0 : distance,
        currentNodeId: arrived ? step.toNodeId : null }
      remaining -= allowed
      if (allowed <= 0) break
    }
    trace.push({ agentId: current.id, second, position: current.position,
      surfaceId: current.surfaceId, placeId: current.placeId,
      edgeId: current.routeIndex < current.route.length ? current.route[current.routeIndex].edgeId : null })
    if (blocked) break
  }
  return { citizen: current, trace, blocked }
}

export function initialTrace(citizen: CitizenStateV5): MovementTracePoint {
  return { agentId: citizen.id, second: 0, position: citizen.position,
    surfaceId: citizen.surfaceId, placeId: citizen.placeId, edgeId: null }
}

export function pathHasVerticalContinuity(index: NavigationIndexV2, edgeId: string): boolean {
  const edge = index.edgeById.get(edgeId)
  if (!edge) return false
  const path = orientedEdgePath(index, { edgeId, fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId, lengthMm: edge.lengthMm })
  return path.length > 1 && path.every((point, i) => i === 0 ||
    Math.hypot(point.x - path[i - 1].x, point.y - path[i - 1].y,
      point.z - path[i - 1].z) <= edge.lengthMm)
}
