import { hashSeed } from './rng'
import { createNavigationIndexV2, findRouteV2, findRoutesFromV2,
  type NavigationIndexV2, type AccessMode } from '../world/navigation/routeV2'
import type { ActivityKind, SemanticPlace, WorldModelV2 } from '../world/model'
import { createCitizenProfilesV5, activityDemand, localMinute, placeIsOpen } from './v5Profiles'
import { moveCitizenOneTick, initialTrace, completeTickTraces } from './movementV5'
import { updateOpportunityV5 } from './offending/opportunityV5'
import { validateSocialConfigV1 } from './encounter/interaction'
import { validateSocialEncounterConfig } from './encounter/lifecycle'
import { validatePerceptionConfig } from './encounter/perception'
import { validateWitnessModelConfig } from './encounter/crimeWitness'
import { validateOffendingConfig } from './offending/profiles'
import { createInitialSocialStateV1 } from './encounter/state'
import { advanceEncounterPipelineV1 } from './encounter/pipeline'
import { validateHabitConfig } from './habits/calendar'
import { createHabitProfilesV1 } from './habits/profiles'
import { createInitialHabitsStateV1, HabitTickV1 } from './habits/state'
import { validateLifeConfigV1 } from './life/outcome'
import { createInitialLifeStateV1 } from './life/types'
import { finalizeLifeTickV1, progressLifeRecoveryV1 } from './life/state'
import { chooseHabitDestinationV1, habitPlaceIsOpenV1, reportHabitReplanTimingV1,
  type HabitChoiceV1 } from './habits/decision'
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
    resources: world.resources, boxes: world.boxes, overpasses: world.overpasses }))
  const modelHash = hashSeed(JSON.stringify({ config, commands }))
  return `world-v2:${world.config.generatorVersion}:${worldHash.toString(16)}:sim-v5:${modelHash.toString(16)}`
}

export function createEnvironmentV5(world: WorldModelV2, config: SimulationConfigV5,
  commands: readonly AccessCommandV5[] = []): SimulationEnvironmentV5 {
  if (config.logicalSecondsPerTick !== 6 || !Number.isSafeInteger(config.startHour) ||
    config.startHour < 0 || config.startHour > 23 ||
    !Number.isFinite(config.reportingProbability) || config.reportingProbability < 0 ||
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
  if (config.encounter) {
    if (config.encounter.version !== 'encounter-v1' ||
      !['legacy', 'encounterAware'].includes(config.encounter.offenceMode) ||
      typeof config.encounter.interactionsEnabled !== 'boolean' ||
      ![config.encounter.offenceCompletionProbability,
        config.encounter.socialRestraintWeight].every((value) =>
        Number.isFinite(value) && value >= 0 && value <= 1)) {
      throw new Error('Invalid encounter mode')
    }
    validateSocialConfigV1(config.encounter.social)
    validateSocialEncounterConfig(config.encounter.lifecycle, config.logicalSecondsPerTick)
    validatePerceptionConfig(config.encounter.perception)
    validateOffendingConfig({ ...config.encounter.offending,
      offendingSeed: config.offendingSeed, startHour: config.startHour })
    validateWitnessModelConfig({ ...config.encounter.witness,
      observationSeed: config.observationSeed,
      reportingProbability: config.reportingProbability })
  }
  if (config.habit) validateHabitConfig(config.habit)
  if (config.life) validateLifeConfigV1(config.life)
  const ids = new Set<string>()
  for (const command of commands) {
    if (ids.has(command.id) || !Number.isSafeInteger(command.effectiveTick) ||
      command.effectiveTick < 1 || !['open', 'entryClosed', 'closed'].includes(command.mode) ||
      command.accessId.startsWith('place:') &&
      (!placeIds.has(command.accessId.slice(6)) || command.mode === 'entryClosed')) {
      throw new Error('Invalid v5 access command')
    }
    ids.add(command.id)
  }
  const profiles = createCitizenProfilesV5(world, config)
  return { world, config, profiles,
    ...(config.habit ? { habitProfiles: createHabitProfilesV1(world, profiles, config.habit) } : {}),
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
    offenderCooldowns: {}, resourceCooldowns: {}, commands: [...commands],
    ...(environment.config.encounter ? { social: createInitialSocialStateV1() } : {}),
    ...(environment.config.habit ? { habits: createInitialHabitsStateV1(
      environment.habitProfiles!, environment.profiles, environment.config,
      environment.config.habit) } : {}),
    ...(environment.config.life ? { life: createInitialLifeStateV1(citizens.map((item) => item.id)) } : {}) }
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
    activityKind: ActivityKind;
    score: number } | null = null
  const routes = findRoutesFromV2(index, citizen.currentNodeId!, profile.travellerCosts,
    accessModes, priorEdgeCrowd, returnHome ? profile.homeSlotNodeId : undefined)
  for (const place of candidates) {
    const slots = place.kind === 'home' ? [profile.homeSlotNodeId] :
      place.slotNodeIds.filter((id) => !occupied.has(id))
    if (slots.length === 0 || !citizen.currentNodeId) continue
    const tag = returnHome ? 'home' : place.activityTags.reduce((a, b) =>
      activityDemand(a, localMinute(environment.config, tick)) * profile.preferences[a] >=
      activityDemand(b, localMinute(environment.config, tick)) * profile.preferences[b] ? a : b)
    const chosenSlot = returnHome ? profile.homeSlotNodeId :
      slots[hashSeed(`${environment.config.simulationSeed}:${citizen.id}:${tick}:${place.id}:slot`) % slots.length]
    const routeCostMs = routes.costTo(chosenSlot)
    if (routeCostMs === null) continue
    const familiarity = profile.workPlaceId === place.id ? 0.35 : 0
    const score = returnHome ? -routeCostMs :
      activityDemand(tag, localMinute(environment.config, tick)) *
      profile.preferences[tag] * (environment.config.placeAttractiveness?.[place.id] ??
        place.attractiveness) * 130_000 + familiarity * 100_000 -
      routeCostMs * 0.55 - (priorPlaceCrowd.get(place.id) ?? 0) /
        Math.max(1, place.capacity) * 25_000 +
      unit(`${environment.config.simulationSeed}:${citizen.id}:${citizen.tripOrdinal}:${place.id}`) * 25_000
    if (!best || score > best.score || score === best.score && place.id < best.place.id) {
      best = { place, slotId: chosenSlot, activityKind: tag, score }
    }
  }
  if (!best) return null
  const route = routes.routeTo(best.slotId)
  if (route.status !== 'ok') throw new Error('Selected destination became unreachable')
  return { place: best.place, slotId: best.slotId, route, activityKind: best.activityKind }
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
  state = progressLifeRecoveryV1(state, tick)
  const modes = { ...state.accessModes }
  for (const command of state.commands) if (command.effectiveTick === tick) modes[command.accessId] = command.mode
  const accessModes = accessMap(modes)
  if (environment.config.habit) for (const place of environment.world.places) {
    if (place.kind !== 'home' && !habitPlaceIsOpenV1(place,
      environment.config, accessModes, tick)) accessModes.set(`place:${place.id}`, 'closed')
  }
  const profiles = new Map(environment.profiles.map((item) => [item.id, item]))
  const lifeById = new Map(state.life?.people.map((item) => [item.agentId, item]) ?? [])
  const habitProfiles = new Map(environment.habitProfiles?.map((item) =>
    [item.agentId, item]) ?? [])
  const habitTick = environment.config.habit ?
    new HabitTickV1(state, environment.habitProfiles!, environment.profiles,
      environment.config) : null
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
      (citizen.activity === 'atDestination' || citizen.activity === 'interacting' ? citizen.placeId : null)
    if (placeId) priorPlaceCrowd.set(placeId, (priorPlaceCrowd.get(placeId) ?? 0) + 1)
  }
  const events: CitizenEventV5[] = []
  const traces: MovementTracePoint[] = []
  const tracedCitizenIds = new Set<string>()
  const interruptedInteractionIds = new Set((state.social?.interactions ?? [])
    .filter((interaction) => interaction.status === 'active' && interaction.placeId &&
      (modes['mall-entry'] !== 'open' && (interaction.placeId === 'central-galleria' ||
        interaction.placeId.startsWith('galleria-')) ||
        !(environment.config.habit ? habitPlaceIsOpenV1(places.get(interaction.placeId)!,
          environment.config, accessModes, tick) :
          placeIsOpen(places.get(interaction.placeId)!, environment.config, tick))))
    .map((interaction) => interaction.id))
  const priority = [...state.citizens].sort((a, b) =>
    hashSeed(`${environment.config.simulationSeed}:${tick}:${a.id}:priority`) -
    hashSeed(`${environment.config.simulationSeed}:${tick}:${b.id}:priority`) || a.id.localeCompare(b.id))
  const nextById = new Map<string, CitizenStateV5>()
  const standingIds = new Set(state.life?.recoveryEvents.filter((item) =>
    item.kind === 'improved' && item.tick === tick).map((item) => item.agentId) ?? [])
  for (const prior of priority) {
    const life = lifeById.get(prior.id)
    if (life?.lifeStatus === 'deceased' || life?.functionalStatus === 'incapacitated' ||
      standingIds.has(prior.id)) {
      nextById.set(prior.id, prior)
      continue
    }
    const baseProfile = profiles.get(prior.id)!
    const profile = life?.lifeStatus === 'alive' && life.functionalStatus === 'impaired' ? {
      ...baseProfile, travellerCosts: { ...baseProfile.travellerCosts,
        speedMmPerSecond: Math.max(1, Math.round(baseProfile.travellerCosts.speedMmPerSecond *
          environment.config.life!.impairedSpeedFactor)) },
    } : baseProfile
    let citizen: CitizenStateV5 = prior.activity === 'standingUp' ? {
      ...prior, activity: prior.route.length ? 'travelling' : 'waitingForSpace',
      nextDecisionTick: tick,
    } : prior
    if (citizen.engagement) {
      const interaction = state.social?.interactions.find((item) =>
        item.id === citizen.engagement!.interactionId)
      if (!interaction || interruptedInteractionIds.has(citizen.engagement.interactionId) ||
        tick >= interaction.plannedEndTick) {
        const plannedDuration = interaction ? interaction.plannedEndTick - interaction.startTick : 0
        const elapsedDuration = interaction ? Math.max(0,
          Math.min(plannedDuration, tick - interaction.startTick)) : plannedDuration
        const resumeDecisionTick = interruptedInteractionIds.has(citizen.engagement.interactionId) ?
          citizen.engagement.resumeDecisionTick - plannedDuration + elapsedDuration :
          citizen.engagement.resumeDecisionTick
        citizen = { ...citizen, activity: 'atDestination', engagement: undefined,
          nextDecisionTick: resumeDecisionTick }
      } else citizen = { ...citizen, activity: 'interacting' }
    }
    const currentPlace = citizen.placeId ? places.get(citizen.placeId) : null
    const mustEvacuate = citizen.activity === 'atDestination' &&
      Boolean(currentPlace && (modes['mall-entry'] !== 'open' &&
        (currentPlace.id === 'central-galleria' || currentPlace.id.startsWith('galleria-')) ||
        !(environment.config.habit ? habitPlaceIsOpenV1(currentPlace,
          environment.config, accessModes, tick) :
          placeIsOpen(currentPlace, environment.config, tick))))
    if ((citizen.activity === 'atHome' || citizen.activity === 'atDestination' ||
      citizen.activity === 'waitingForSpace') && (tick >= citizen.nextDecisionTick || mustEvacuate)) {
      if (citizen.reservedSlotNodeId) occupied.delete(citizen.reservedSlotNodeId)
      if (citizen.activity === 'atDestination') events.push(event(tick, citizen, 'ActivityFinished', citizen.placeId))
      if (habitTick && (citizen.activity === 'atHome' ||
        citizen.activity === 'atDestination')) {
        const arrivedTick = habitTick.get(citizen.id).arrivedTick ?? tick
        const hadSocialInteraction = state.social?.interactions.some((item) =>
          item.participantIds.includes(citizen.id) && item.placeId === citizen.placeId &&
          item.startTick >= arrivedTick && item.endTick !== null &&
          item.endTick <= tick && item.status === 'completed') ?? false
        habitTick.finishActivity(citizen, mustEvacuate ? 'interrupted' : 'completed',
          mustEvacuate ? 'place closed or inaccessible' :
            'planned activity duration completed', hadSocialInteraction)
      }
      const goHome = mustEvacuate || citizen.activity === 'atDestination' &&
        citizen.placeId !== profile.homePlaceId && citizen.visitOrdinal % 3 === 0
      let habitChoice: HabitChoiceV1 | null = null
      let choice: NonNullable<ReturnType<typeof chooseDestination>> | HabitChoiceV1 | null
      if (habitTick) {
        const result = chooseHabitDestinationV1(citizen, profile, habitTick.get(citizen.id),
          habitProfiles.get(citizen.id)!, environment.world, environment.config,
          environment.config.habit!, index, occupied, accessModes, tick,
          priorEdgeCrowd, priorPlaceCrowd, state)
        habitTick.recordDecision(citizen.id, result.trace)
        habitChoice = result.choice
        choice = habitChoice
      } else choice = chooseDestination(citizen, profile, environment, index,
        occupied, accessModes, tick, priorEdgeCrowd, priorPlaceCrowd, goHome)
      if (choice) {
        if (habitChoice) habitTick!.startIntention(citizen.id,
          habitChoice.habitKind, choice.place.id, habitChoice.trace.id,
          choice.place.id === citizen.placeId)
        if (habitChoice && choice.place.id === citizen.placeId) {
          citizen = { ...citizen, activity: choice.place.kind === 'home' ?
            'atHome' : 'atDestination', activityKind: choice.activityKind,
          nextDecisionTick: tick + habitChoice.dwellTicks,
          reservedSlotNodeId: choice.place.kind === 'home' ? null : choice.slotId }
          if (citizen.reservedSlotNodeId) occupied.add(citizen.reservedSlotNodeId)
        } else {
          citizen = beginTrip(citizen, choice, tick)
          if (citizen.reservedSlotNodeId) occupied.add(citizen.reservedSlotNodeId)
          events.push(event(tick, citizen, 'TripStarted', choice.place.id))
        }
      } else {
        citizen = { ...citizen, reservedSlotNodeId: null, activity: 'waitingForSpace',
          nextDecisionTick: tick + 4 }
        events.push(event(tick, citizen, 'TripDeferred', null, 'No open reachable place with capacity'))
      }
    }
    if (life?.lifeStatus === 'alive' && life.functionalStatus === 'impaired' &&
      citizen.movementMode !== 'walk') {
      citizen = { ...citizen, movementMode: 'walk' }
    }
    if (citizen.activity === 'travelling' || citizen.activity === 'returningHome') {
      if (citizen.routeIndex < citizen.route.length) {
        const result = moveCitizenOneTick(citizen, profile, index, accessModes,
          environment.config.logicalSecondsPerTick, connectorAvailability)
        citizen = result.citizen
        traces.push(...result.trace)
        if (result.trace.length > 0) tracedCitizenIds.add(citizen.id)
        if (result.blocked === 'capacity') {
          habitTick?.delay(citizen.id, 'connector at capacity')
          events.push(event(tick, citizen, 'TripDeferred', citizen.destinationPlaceId,
            'Connector at capacity'))
        } else if (result.blocked === 'access' && citizen.currentNodeId && citizen.destinationNodeId) {
          const replanStarted = habitTick ? performance.now() : 0
          const route = findRouteV2(index, citizen.currentNodeId, citizen.destinationNodeId,
            profile.travellerCosts, accessModes, priorEdgeCrowd)
          if (habitTick) reportHabitReplanTimingV1(tick, citizen.id,
            performance.now() - replanStarted)
          if (route.status === 'ok') {
            citizen = { ...citizen, route: route.steps, routeIndex: 0, distanceOnEdgeMm: 0 }
            events.push(event(tick, citizen, 'TripRerouted', citizen.destinationPlaceId))
          } else {
            habitTick?.cancel(citizen.id, 'destination inaccessible')
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
        const habitState = habitTick?.get(citizen.id)
        const dwell = habitState?.intention ?
          habitProfiles.get(citizen.id)!.durations[habitState.intention.kind] :
          isHome ? profile.homeDwellTicks : profile.visitDwellTicks
        citizen = { ...citizen, activity: isHome ? 'atHome' : 'atDestination',
          placeId: place.id, activityKind: isHome ? 'home' : citizen.activityKind,
          currentNodeId: citizen.destinationNodeId, destinationNodeId: null,
          destinationPlaceId: null, route: [], routeIndex: 0, distanceOnEdgeMm: 0,
          movementMode: 'walk', visitOrdinal: citizen.visitOrdinal + (isHome ? 0 : 1),
          nextDecisionTick: tick + dwell, arrivedTick: tick }
        events.push(event(tick, citizen, 'DestinationReached', place.id))
        habitTick?.arrival(citizen.id)
      } else if (!citizen.destinationNodeId && citizen.routeIndex >= citizen.route.length) {
        citizen = { ...citizen, activity: 'waitingForSpace', route: [], routeIndex: 0,
          distanceOnEdgeMm: 0, nextDecisionTick: tick + 1 }
      }
    }
    if (!tracedCitizenIds.has(citizen.id)) {
      traces.push(initialTrace(citizen))
      for (let second = 1; second <= environment.config.logicalSecondsPerTick; second += 1) {
        traces.push({ ...initialTrace(citizen), second })
      }
    }
    nextById.set(citizen.id, citizen)
  }
  const citizens = state.citizens.map((citizen) => nextById.get(citizen.id)!)
  const next: SimulationStateV5 = { ...state, tick, citizens, accessModes: modes,
    events: [...state.events, ...events],
    ...(habitTick ? { habits: habitTick.finish() } : {}) }
  const eligible = new Set(citizens.filter((item) => {
    const life = lifeById.get(item.id)
    return item.activity !== 'standingUp' && life?.lifeStatus !== 'deceased' &&
      life?.functionalStatus !== 'incapacitated'
  }).map((item) => item.id))
  const activeTraces = traces.filter((item) => eligible.has(item.agentId))
  if (!environment.config.encounter) return finalizeLifeTickV1(
    updateOpportunityV5(next, environment, activeTraces), environment)
  const socialNext = advanceEncounterPipelineV1(next, environment,
    completeTickTraces(activeTraces, citizens.filter((item) => eligible.has(item.id)),
      environment.config.logicalSecondsPerTick),
    interruptedInteractionIds)
  return finalizeLifeTickV1(environment.config.encounter.offenceMode === 'legacy' ?
    updateOpportunityV5(socialNext, environment, activeTraces) : socialNext, environment)
}
