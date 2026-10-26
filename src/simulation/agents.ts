import { advanceAlongRoute } from './movement'
import { findRoute, locateOnRoute, type RouteResult } from './navigation'
import { createRandomStream, nextRandom } from './rng'
import type {
  AgentProfile,
  CitizenState,
  SimulationConfigV2,
  SimulationEnvironment,
  WorldPosition,
} from './types'

export type CitizenEventDraft =
  | { readonly type: 'TripStarted'; readonly originAnchorId: string; readonly destinationAnchorId: string; readonly routeLength: number }
  | { readonly type: 'DestinationReached'; readonly destinationAnchorId: string }
  | { readonly type: 'ActivityStarted'; readonly destinationAnchorId: string }
  | { readonly type: 'ActivityFinished'; readonly destinationAnchorId: string }
  | { readonly type: 'TripFailed'; readonly originAnchorId: string; readonly destinationAnchorId: string;
      readonly reason: 'unreachable' | 'invalid-anchor' }

export interface CitizenStepResult {
  readonly citizen: CitizenState
  readonly events: readonly CitizenEventDraft[]
}

function anchorPosition(env: SimulationEnvironment, anchorId: string): WorldPosition {
  const anchor = env.navigation.anchorById.get(anchorId)
  const node = anchor && env.navigation.nodeById.get(anchor.nodeId)
  if (!node) throw new Error(`Unknown pedestrian anchor ${anchorId}`)
  return { x: node.x, y: node.surfaceY, z: node.z }
}

function routeBetween(env: SimulationEnvironment, originAnchorId: string, destinationAnchorId: string): RouteResult {
  const origin = env.navigation.anchorById.get(originAnchorId)
  const destination = env.navigation.anchorById.get(destinationAnchorId)
  if (!origin) return { status: 'unreachable', reason: 'unknown-origin' }
  if (!destination) return { status: 'unreachable', reason: 'unknown-destination' }
  return findRoute(env.navigation, origin.nodeId, destination.nodeId)
}

function failureReason(result: Extract<RouteResult, { status: 'unreachable' }>): 'unreachable' | 'invalid-anchor' {
  return result.reason === 'disconnected' ? 'unreachable' : 'invalid-anchor'
}

export function createInitialCitizens(env: SimulationEnvironment, config: SimulationConfigV2): readonly CitizenState[] {
  return env.profiles.map((profile, index) => {
    let behaviorRngState = createRandomStream(config.simulationSeed, `behavior:${profile.id}`)
    const homePosition = anchorPosition(env, profile.homeAnchorId)
    const base: CitizenState = {
      id: profile.id,
      activity: 'atHome',
      position: homePosition,
      currentAnchorId: profile.homeAnchorId,
      destinationAnchorId: null,
      route: [],
      routeIndex: 0,
      distanceOnEdge: 0,
      distanceAlongRoute: 0,
      routeId: null,
      tripOrdinal: 0,
      nextDecisionTick: profile.firstDepartureTick,
      behaviorRngState,
      nextEventOrdinal: 0,
    }
    // Outdoor occupancy is an explicit synthetic initial condition, not an event.
    if (index % 4 !== 0 || env.publicAnchorIds.length === 0) return base
    const selection = nextRandom(behaviorRngState)
    behaviorRngState = selection.state
    const destinationAnchorId = env.publicAnchorIds[Math.floor(selection.value * env.publicAnchorIds.length)]
    const route = routeBetween(env, profile.homeAnchorId, destinationAnchorId)
    if (route.status !== 'ok' || route.steps.length === 0) return { ...base, behaviorRngState }
    const progress = nextRandom(behaviorRngState)
    behaviorRngState = progress.state
    const distanceAlongRoute = route.length * (0.1 + progress.value * 0.7)
    const location = locateOnRoute(env.navigation, route.steps, distanceAlongRoute)
    return {
      ...base,
      activity: 'travelling',
      position: location.position,
      currentAnchorId: null,
      destinationAnchorId,
      route: route.steps,
      routeIndex: location.routeIndex,
      distanceOnEdge: location.distanceOnEdge,
      distanceAlongRoute,
      routeId: `${profile.id}-trip-1`,
      tripOrdinal: 1,
      nextDecisionTick: 0,
      behaviorRngState,
    }
  })
}

function finish(citizen: CitizenState, events: readonly CitizenEventDraft[]): CitizenStepResult {
  if (events.length === 0) return { citizen, events }
  return { citizen: { ...citizen, nextEventOrdinal: citizen.nextEventOrdinal + events.length }, events }
}

export function stepCitizen(
  env: SimulationEnvironment,
  config: SimulationConfigV2,
  profile: AgentProfile,
  previous: CitizenState,
  tick: number,
): CitizenStepResult {
  if (previous.id !== profile.id) throw new Error('Citizen profile order mismatch')
  switch (previous.activity) {
    case 'atHome': {
      if (tick < previous.nextDecisionTick) return { citizen: previous, events: [] }
      return { citizen: { ...previous, activity: 'planningTrip', nextDecisionTick: tick + 1 }, events: [] }
    }
    case 'planningTrip': {
      if (tick < previous.nextDecisionTick) return { citizen: previous, events: [] }
      const selection = nextRandom(previous.behaviorRngState)
      const destinationAnchorId = env.publicAnchorIds[Math.floor(selection.value * env.publicAnchorIds.length)]
      if (!destinationAnchorId) throw new Error('No public destination available')
      const route = routeBetween(env, profile.homeAnchorId, destinationAnchorId)
      if (route.status !== 'ok' || route.steps.length === 0) {
        const reason = route.status === 'ok' ? 'unreachable' : failureReason(route)
        return finish({
          ...previous,
          activity: 'atHome',
          destinationAnchorId: null,
          nextDecisionTick: tick + 20,
          behaviorRngState: selection.state,
        }, [{ type: 'TripFailed', originAnchorId: profile.homeAnchorId, destinationAnchorId, reason }])
      }
      const tripOrdinal = previous.tripOrdinal + 1
      return finish({
        ...previous,
        activity: 'travelling',
        position: anchorPosition(env, profile.homeAnchorId),
        currentAnchorId: null,
        destinationAnchorId,
        route: route.steps,
        routeIndex: 0,
        distanceOnEdge: 0,
        distanceAlongRoute: 0,
        routeId: `${profile.id}-trip-${tripOrdinal}`,
        tripOrdinal,
        nextDecisionTick: 0,
        behaviorRngState: selection.state,
      }, [{ type: 'TripStarted', originAnchorId: profile.homeAnchorId, destinationAnchorId, routeLength: route.length }])
    }
    case 'travelling':
    case 'returningHome': {
      const budget = profile.speedUnitsPerLogicalSecond * config.logicalSecondsPerTick
      const movement = advanceAlongRoute(env.navigation, previous, budget)
      if (!movement.arrived) {
        return { citizen: {
          ...previous,
          position: movement.position,
          routeIndex: movement.routeIndex,
          distanceOnEdge: movement.distanceOnEdge,
          distanceAlongRoute: movement.distanceAlongRoute,
        }, events: [] }
      }
      const destinationAnchorId = previous.destinationAnchorId
      if (!destinationAnchorId) throw new Error('Travelling citizen has no destination')
      const destinationPosition = anchorPosition(env, destinationAnchorId)
      const atPublicDestination = previous.activity === 'travelling'
      const next: CitizenState = {
        ...previous,
        activity: atPublicDestination ? 'atDestination' : 'atHome',
        position: destinationPosition,
        currentAnchorId: destinationAnchorId,
        destinationAnchorId: null,
        route: [],
        routeIndex: 0,
        distanceOnEdge: 0,
        distanceAlongRoute: 0,
        routeId: null,
        nextDecisionTick: tick + (atPublicDestination ? profile.visitDwellTicks : profile.homeDwellTicks),
      }
      const events: CitizenEventDraft[] = [{ type: 'DestinationReached', destinationAnchorId }]
      if (atPublicDestination) events.push({ type: 'ActivityStarted', destinationAnchorId })
      return finish(next, events)
    }
    case 'atDestination': {
      if (tick < previous.nextDecisionTick) return { citizen: previous, events: [] }
      const originAnchorId = previous.currentAnchorId
      if (!originAnchorId) throw new Error('Citizen at destination has no anchor')
      const route = routeBetween(env, originAnchorId, profile.homeAnchorId)
      if (route.status !== 'ok' || route.steps.length === 0) {
        const reason = route.status === 'ok' ? 'unreachable' : failureReason(route)
        return finish({ ...previous, nextDecisionTick: tick + 20 }, [
          { type: 'TripFailed', originAnchorId, destinationAnchorId: profile.homeAnchorId, reason },
        ])
      }
      const tripOrdinal = previous.tripOrdinal + 1
      return finish({
        ...previous,
        activity: 'returningHome',
        currentAnchorId: null,
        destinationAnchorId: profile.homeAnchorId,
        route: route.steps,
        routeIndex: 0,
        distanceOnEdge: 0,
        distanceAlongRoute: 0,
        routeId: `${profile.id}-trip-${tripOrdinal}`,
        tripOrdinal,
        nextDecisionTick: 0,
      }, [
        { type: 'ActivityFinished', destinationAnchorId: originAnchorId },
        { type: 'TripStarted', originAnchorId, destinationAnchorId: profile.homeAnchorId, routeLength: route.length },
      ])
    }
  }
}
