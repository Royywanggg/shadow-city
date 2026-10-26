import type { PedestrianNetwork, PedestrianNode } from '../city/model'

export interface AgentMotionState {
  readonly activity: string
  readonly position: Readonly<{ x: number; y: number; z: number }>
  readonly route: readonly Readonly<{
    edgeId: string
    fromNodeId: string
    toNodeId: string
    length: number
  }>[]
  readonly routeId: string | null
  readonly distanceAlongRoute: number
  readonly headingRadians?: number
}

export interface AgentRenderPose {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly yaw: number
  readonly visible: boolean
}

export interface PedestrianLookup {
  readonly nodes: ReadonlyMap<string, PedestrianNode>
}

export function createPedestrianLookup(network: PedestrianNetwork): PedestrianLookup {
  return { nodes: new Map(network.nodes.map((node) => [node.id, node])) }
}

function isOutdoor(activity: string): boolean {
  return activity === 'travelling' || activity === 'returningHome' || activity === 'atDestination'
}

function routeLength(route: AgentMotionState['route']): number {
  return route.reduce((length, step) => length + Math.max(0, step.length), 0)
}

function heading(a: PedestrianNode, b: PedestrianNode): number {
  return Math.atan2(b.x - a.x, b.z - a.z)
}

function blendHeading(from: number, to: number, progress: number): number {
  const eased = progress * progress * (3 - 2 * progress)
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return from + delta * eased
}

function sampleRoute(
  route: AgentMotionState['route'],
  distance: number,
  lookup: PedestrianLookup,
): Omit<AgentRenderPose, 'visible'> | null {
  let remainder = Math.max(0, Math.min(routeLength(route), distance))
  for (const [index, step] of route.entries()) {
    const from = lookup.nodes.get(step.fromNodeId)
    const to = lookup.nodes.get(step.toNodeId)
    if (!from || !to || !(step.length > 0)) return null
    if (remainder <= step.length || index === route.length - 1) {
      const amount = Math.max(0, Math.min(1, remainder / step.length))
      let yaw = heading(from, to)
      const turnWindow = Math.min(0.75, step.length * 0.4)
      if (amount * step.length < turnWindow && index > 0) {
        const before = lookup.nodes.get(route[index - 1].fromNodeId)
        if (before) yaw = blendHeading(blendHeading(heading(before, from), yaw, 0.5), yaw,
          amount * step.length / turnWindow)
      } else if ((1 - amount) * step.length < turnWindow && index < route.length - 1) {
        const after = lookup.nodes.get(route[index + 1].toNodeId)
        if (after) yaw = blendHeading(yaw, blendHeading(yaw, heading(to, after), 0.5),
          1 - (1 - amount) * step.length / turnWindow)
      }
      return {
        x: from.x + (to.x - from.x) * amount,
        y: from.surfaceY + (to.surfaceY - from.surfaceY) * amount,
        z: from.z + (to.z - from.z) * amount,
        yaw,
      }
    }
    remainder -= step.length
  }
  return null
}

function currentPose(state: AgentMotionState): AgentRenderPose {
  return {
    x: state.position.x,
    y: state.position.y,
    z: state.position.z,
    yaw: state.headingRadians ?? 0,
    visible: isOutdoor(state.activity),
  }
}

/** Visual sampling follows route edges; it never changes simulation state. */
export function interpolateAgentPose(
  previous: AgentMotionState | null,
  current: AgentMotionState,
  lookup: PedestrianLookup,
  alpha: number,
): AgentRenderPose {
  const exact = currentPose(current)
  if (!previous || !Number.isFinite(alpha)) return exact
  const phase = Math.max(0, Math.min(1, alpha))
  if (phase >= 1) return exact

  let route: AgentMotionState['route'] | null = null
  let startDistance = 0
  let endDistance = 0
  if (current.route.length > 0 && current.routeId !== null && current.routeId === previous.routeId) {
    route = current.route
    startDistance = previous.distanceAlongRoute
    endDistance = current.distanceAlongRoute
  } else if (current.route.length > 0 && previous.route.length === 0) {
    route = current.route
    endDistance = current.distanceAlongRoute
  } else if (previous.route.length > 0 && current.route.length === 0) {
    route = previous.route
    startDistance = previous.distanceAlongRoute
    endDistance = routeLength(route)
  }
  if (!route || endDistance < startDistance) return exact
  const point = sampleRoute(route, startDistance + (endDistance - startDistance) * phase, lookup)
  if (!point) return exact
  return { ...point, visible: isOutdoor(previous.activity) || isOutdoor(current.activity) }
}
