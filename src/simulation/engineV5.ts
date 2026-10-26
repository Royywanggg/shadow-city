import { hashSeed } from './rng'
import { createNavigationIndexV2, findRouteV2, findRoutesFromV2,
  type NavigationIndexV2, type AccessMode } from '../world/navigation/routeV2'
import type { ActivityKind, SemanticPlace, WorldModelV2 } from '../world/model'
import { createCitizenProfilesV5, activityDemand, localMinute, placeIsOpen } from './v5Profiles'
import { moveCitizenOneTick, initialTrace } from './movementV5'
import { updateOpportunityV5 } from './offending/opportunityV5'
import type { AccessCommandV5, CitizenEventV5, CitizenProfileV5, CitizenStateV5,
  MovementTracePoint, SimulationConfigV5, SimulationEnvironmentV5, SimulationStateV5 } from './v5Types'

const unit = (key: string) => hashSeed(key) / 0x1_0000_0000
const accessMap = (modes: Readonly<Record<string, AccessMode>>) => new Map(Object.entries(modes))
const event = (tick: number, citizen: CitizenStateV5, type: CitizenEventV5['type'],
  placeId: string | null, reason?: string): CitizenEventV5 => ({
  id: `v5:${tick}:${citizen.id}:${type}`, tick, agentId: citizen.id, type, placeId, reason,
})

export function worldFingerprintV5(world: WorldModelV2, config: SimulationConfigV5,
  commands: readonly AccessCommandV5[] = []): string {
  if (world.version !== 2 || config.version !== 5) throw new Error('V5 version mismatch')
  const worldHash = hashSeed(JSON.stringify({ config: world.config, bounds: world.bounds,
    baseCity: world.baseCity,
    districts: world.districts, roadNodes: world.roadNodes, roadEdges: world.roadEdges,
    surfaces: world.surfaces, navNodes: world.navNodes, navEdges: world.navEdges,
    connectors: world.connectors, places: world.places,
    resources: world.resources, boxes: world.boxes }))
  const modelHash = hashSeed(JSON.stringify({ config, commands }))
  return `world-v2:${world.config.generatorVersion}:${worldHash.toString(16)}:sim-v5:${modelHash.toString(16)}`
}

export function createEnvironmentV5(world: WorldModelV2, config: SimulationConfigV5,
  commands: readonly AccessCommandV5[] = []): SimulationEnvironmentV5 {
  if (config.logicalSecondsPerTick !== 6 || !Number.isSafeInteger(config.startHour) ||
    config.startHour < 0 || config.startHour > 23 || config.reportingProbability < 0 ||
    config.reportingProbability > 1) throw new Error('Invalid v5 simulation configuration')
  const placeIds = new Set(world.places.map((place) => place.id))
  for (const [id, value] of Object.entries(config.placeAttractiveness ?? {})) {
    if (!placeIds.has(id) || !Number.isFinite(value) || value < 0 || value > 2) {
      throw new Error(`Invalid attractiveness override ${id}`)
    }
  }
  for (const [id, hours] of Object.entries(config.placeOpeningHours ?? {})) {
    if (!placeIds.has(id) || hours.some((window) =>
      !Number.isSafeInteger(window.openMinute) || !Number.isSafeInteger(window.closeMinute) ||
      window.openMinute < 0 || window.closeMinute > 1440 ||
      window.openMinute === window.closeMinute)) {
      throw new Error(`Invalid opening hours override ${id}`)
    }
  }
  const ids = new Set<string>()
  for (const command of commands) {
    if (ids.has(command.id) || !Number.isSafeInteger(command.effectiveTick) ||
      command.effectiveTick < 1 || !['open', 'entryClosed', 'closed'].includes(command.mode)) {
      throw new Error('Invalid v5 access command')
    }
    ids.add(command.id)
  }
  return { world, config, profiles: createCitizenProfilesV5(world, config),
    fingerprint: worldFingerprintV5(world, config, commands) }
}

export function createInitialStateV5(environment: SimulationEnvironmentV5,
  commands: readonly AccessCommandV5[] = []): SimulationStateV5 {
  if (environment.fingerprint !== worldFingerprintV5(environment.world, environment.config, commands)) {
    throw new Error('V5 experiment fingerprint mismatch')
  }
  const places = new Map(environment.world.places.map((place) => [place.id, place]))
  const nodes = new Map(environment.world.navNodes.map((node) => [node.id, node]))
  const citizens = environment.profiles.map((profile): CitizenStateV5 => {
    const home = places.get(profile.homePlaceId)!
    const node = nodes.get(profile.homeSlotNodeId)!
    return { id: profile.id, activity: 'atHome', activityKind: 'home', movementMode: 'walk',
      position: node.position, surfaceId: node.surfaceId, placeId: home.id,
      currentNodeId: node.id, destinationPlaceId: null, destinationNodeId: null,
      reservedSlotNodeId: null, route: [], routeIndex: 0, distanceOnEdgeMm: 0,
      headingRadians: 0, tripOrdinal: 0, nextDecisionTick: profile.firstDepartureTick,
      visitOrdinal: 0, arrivedTick: 0 }
  })
  return { version: 5, fingerprint: environment.fingerprint, tick: 0, citizens,
    accessModes: { ...environment.config.initialAccessModes }, events: [],
    encounterEpisodes: [], offences: [], reports: [], pendingReports: [],
    offenderCooldowns: {}, resourceCooldowns: {}, commands: [...commands] }
}

function chooseDestination(citizen: CitizenStateV5, profile: CitizenProfileV5,
  environment: SimulationEnvironmentV5, index: NavigationIndexV2,
  occupied: Set<string>, accessModes: ReadonlyMap<string, AccessMode>, tick: number,
  priorEdgeCrowd: ReadonlyMap<string, number>, priorPlaceCrowd: ReadonlyMap<string, number>,
  returnHome: boolean): { place: SemanticPlace; slotId: string;
    route: ReturnType<typeof findRouteV2> & { status: 'ok' }; activityKind: ActivityKind } | null {
  const candidates = returnHome
    ? environment.world.places.filter((place) => place.id === profile.homePlaceId)
    : environment.world.places.filter((place) => place.kind !== 'home' && place.kind !== 'walkway' &&
      (accessModes.get('mall-entry') === 'open' || !place.id.startsWith('galleria-') &&
        place.id !== 'central-galleria') && placeIsOpen(place, environment.config, tick))
  let best: { place: SemanticPlace; slotId: string;
    route: ReturnType<typeof findRouteV2> & { status: 'ok' }; activityKind: ActivityKind;
    score: number } | null = null
  const routes = findRoutesFromV2(index, citizen.currentNodeId!, profile.travellerCosts,
    accessModes, priorEdgeCrowd)
  for (const place of candidates) {
    const slots = place.kind === 'home' ? [profile.homeSlotNodeId] :
      place.slotNodeIds.filter((id) => !occupied.has(id))
    if (slots.length === 0 || !citizen.currentNodeId) continue
    const tag = returnHome ? 'home' : place.activityTags.reduce((a, b) =>
      activityDemand(a, localMinute(environment.config, tick)) * profile.preferences[a] >=
      activityDemand(b, localMinute(environment.config, tick)) * profile.preferences[b] ? a : b)
    const chosenSlot = returnHome ? profile.homeSlotNodeId :
      slots[hashSeed(`${environment.config.simulationSeed}:${citizen.id}:${tick}:${place.id}:slot`) % slots.length]
    const route = routes.routeTo(chosenSlot)
    if (route.status !== 'ok') continue
    const familiarity = profile.workPlaceId === place.id ? 0.35 : 0
    const score = returnHome ? -route.costMs :
      activityDemand(tag, localMinute(environment.config, tick)) *
      profile.preferences[tag] * (environment.config.placeAttractiveness?.[place.id] ??
        place.attractiveness) * 130_000 + familiarity * 100_000 -
      route.costMs * 0.55 - (priorPlaceCrowd.get(place.id) ?? 0) /
        Math.max(1, place.capacity) * 25_000 +
      unit(`${environment.config.simulationSeed}:${citizen.id}:${citizen.tripOrdinal}:${place.id}`) * 25_000
    if (!best || score > best.score || score === best.score && place.id < best.place.id) {
      best = { place, slotId: chosenSlot, route, activityKind: tag, score }
    }
  }
  return best
}

function beginTrip(citizen: CitizenStateV5, destination: NonNullable<ReturnType<typeof chooseDestination>>,
  tick: number): CitizenStateV5 {
  return { ...citizen, activity: destination.place.kind === 'home' ? 'returningHome' : 'travelling',
    activityKind: destination.activityKind, destinationPlaceId: destination.place.id,
    destinationNodeId: destination.slotId, reservedSlotNodeId: destination.place.kind === 'home'
      ? null : destination.slotId, route: destination.route.steps,
    routeIndex: 0, distanceOnEdgeMm: 0, tripOrdinal: citizen.tripOrdinal + 1,
    movementMode: destination.place.kind !== 'home' && citizen.tripOrdinal % 7 === 3 ? 'jog' : 'walk',
    nextDecisionTick: tick + 1 }
}

export function advanceStateV5(state: SimulationStateV5, environment: SimulationEnvironmentV5,
  index: NavigationIndexV2 = createNavigationIndexV2(environment.world)): SimulationStateV5 {
  if (state.version !== 5 || state.fingerprint !== environment.fingerprint) {
    throw new Error('V5 replay requires identical world, model and command fingerprint')
  }
  const tick = state.tick + 1
  const modes = { ...state.accessModes }
  for (const command of state.commands) if (command.effectiveTick === tick) modes[command.accessId] = command.mode
  const accessModes = accessMap(modes)
  const profiles = new Map(environment.profiles.map((item) => [item.id, item]))
  const places = new Map(environment.world.places.map((item) => [item.id, item]))
  const occupied = new Set(state.citizens.flatMap((item) => item.reservedSlotNodeId ?
    [item.reservedSlotNodeId] : []))
  const priorEdgeCrowd = new Map<string, number>()
  const priorPlaceCrowd = new Map<string, number>()
  const connectorAvailability = new Map(environment.world.connectors.map((connector) =>
    [connector.id, connector.capacity]))
  for (const citizen of state.citizens) {
    const edgeId = citizen.route[citizen.routeIndex]?.edgeId
    if (edgeId && citizen.distanceOnEdgeMm > 0) {
      priorEdgeCrowd.set(edgeId, (priorEdgeCrowd.get(edgeId) ?? 0) + 1)
      const connectorId = index.edgeById.get(edgeId)?.connectorId
      if (connectorId) connectorAvailability.set(connectorId,
        (connectorAvailability.get(connectorId) ?? 0) - 1)
    }
    const placeId = citizen.destinationPlaceId ??
      (citizen.activity === 'atDestination' ? citizen.placeId : null)
    if (placeId) priorPlaceCrowd.set(placeId, (priorPlaceCrowd.get(placeId) ?? 0) + 1)
  }
  const events: CitizenEventV5[] = []
  const traces: MovementTracePoint[] = []
  const priority = [...state.citizens].sort((a, b) =>
    hashSeed(`${environment.config.simulationSeed}:${tick}:${a.id}:priority`) -
    hashSeed(`${environment.config.simulationSeed}:${tick}:${b.id}:priority`) || a.id.localeCompare(b.id))
  const nextById = new Map<string, CitizenStateV5>()
  for (const prior of priority) {
    const profile = profiles.get(prior.id)!
    let citizen = prior
    const currentPlace = citizen.placeId ? places.get(citizen.placeId) : null
    const mustEvacuate = citizen.activity === 'atDestination' &&
      Boolean(currentPlace && (modes['mall-entry'] !== 'open' &&
        (currentPlace.id === 'central-galleria' || currentPlace.id.startsWith('galleria-')) ||
        !placeIsOpen(currentPlace, environment.config, tick)))
    if ((citizen.activity === 'atHome' || citizen.activity === 'atDestination' ||
      citizen.activity === 'waitingForSpace') && (tick >= citizen.nextDecisionTick || mustEvacuate)) {
      if (citizen.reservedSlotNodeId) occupied.delete(citizen.reservedSlotNodeId)
      if (citizen.activity === 'atDestination') events.push(event(tick, citizen, 'ActivityFinished', citizen.placeId))
      const goHome = mustEvacuate || citizen.activity === 'atDestination' &&
        citizen.placeId !== profile.homePlaceId && citizen.visitOrdinal % 3 === 0
      const choice = chooseDestination(citizen, profile, environment, index,
        occupied, accessModes, tick, priorEdgeCrowd, priorPlaceCrowd, goHome)
      if (choice) {
        citizen = beginTrip(citizen, choice, tick)
        if (citizen.reservedSlotNodeId) occupied.add(citizen.reservedSlotNodeId)
        events.push(event(tick, citizen, 'TripStarted', choice.place.id))
      } else {
        citizen = { ...citizen, reservedSlotNodeId: null, activity: 'waitingForSpace',
          nextDecisionTick: tick + 4 }
        events.push(event(tick, citizen, 'TripDeferred', null, 'No open reachable place with capacity'))
      }
    }
    if (citizen.activity === 'travelling' || citizen.activity === 'returningHome') {
      if (citizen.routeIndex < citizen.route.length) {
        const result = moveCitizenOneTick(citizen, profile, index, accessModes,
          environment.config.logicalSecondsPerTick, connectorAvailability)
        citizen = result.citizen
        traces.push(...result.trace)
        if (result.blocked === 'capacity') {
          events.push(event(tick, citizen, 'TripDeferred', citizen.destinationPlaceId,
            'Connector at capacity'))
        } else if (result.blocked === 'access' && citizen.currentNodeId && citizen.destinationNodeId) {
          const route = findRouteV2(index, citizen.currentNodeId, citizen.destinationNodeId,
            profile.travellerCosts, accessModes, priorEdgeCrowd)
          if (route.status === 'ok') {
            citizen = { ...citizen, route: route.steps, routeIndex: 0, distanceOnEdgeMm: 0 }
            events.push(event(tick, citizen, 'TripRerouted', citizen.destinationPlaceId))
          } else {
            if (citizen.reservedSlotNodeId) occupied.delete(citizen.reservedSlotNodeId)
            citizen = { ...citizen, route: [], routeIndex: 0, distanceOnEdgeMm: 0,
              reservedSlotNodeId: null, destinationPlaceId: null, destinationNodeId: null,
              activity: 'waitingForSpace', nextDecisionTick: tick + 3 }
            events.push(event(tick, citizen, 'TripFailed', null, 'Destination inaccessible'))
          }
        }
      }
      if (citizen.destinationNodeId && citizen.routeIndex >= citizen.route.length) {
        const place = places.get(citizen.destinationPlaceId!)!
        const isHome = place.kind === 'home'
        const dwell = isHome ? profile.homeDwellTicks : profile.visitDwellTicks
        citizen = { ...citizen, activity: isHome ? 'atHome' : 'atDestination',
          placeId: place.id, activityKind: isHome ? 'home' : citizen.activityKind,
          currentNodeId: citizen.destinationNodeId, destinationNodeId: null,
          destinationPlaceId: null, route: [], routeIndex: 0, distanceOnEdgeMm: 0,
          movementMode: 'walk', visitOrdinal: citizen.visitOrdinal + (isHome ? 0 : 1),
          nextDecisionTick: tick + dwell, arrivedTick: tick }
        events.push(event(tick, citizen, 'DestinationReached', place.id))
      }
    }
    if (!traces.some((trace) => trace.agentId === citizen.id)) {
      traces.push(initialTrace(citizen))
      for (let second = 1; second <= environment.config.logicalSecondsPerTick; second += 1) {
        traces.push({ ...initialTrace(citizen), second })
      }
    }
    nextById.set(citizen.id, citizen)
  }
  const citizens = state.citizens.map((citizen) => nextById.get(citizen.id)!)
  const next: SimulationStateV5 = { ...state, tick, citizens, accessModes: modes,
    events: [...state.events, ...events] }
  return updateOpportunityV5(next, environment, traces)
}
