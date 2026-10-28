import type { WorldModelV2 } from '../../world/model'
import { hasClearSurfaceSegment } from '../encounter/spatial'
import { createRecognitionTokenV1 } from '../encounter/memory'
import { createSocialProfileV1 } from '../encounter/socialProfiles'
import { interruptHabitForLifeV1 } from '../habits/state'
import { hashSeed } from '../rng'
import type { CitizenStateV5, SimulationEnvironmentV5, SimulationStateV5 } from '../v5Types'
import { evaluateHarmOutcomeV1 } from './outcome'
import { advanceSceneStateV1 } from '../scenes/state'
import type { DeathEventV1, DeathKnowledgeV1, DeathSceneV1,
  FunctionalStatusV1, InjuryRecordV1, LifeObservationV1, LifePersonV1,
  LifeRecoveryEventV1, LifeSceneReportV1,
  PendingLifeReportV1 } from './types'

const unit = (key: string): number => (hashSeed(key) + 0.5) / 0x1_0000_0000
const distance = (a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

export interface LifeTimingSampleV1 {
  readonly tick: number
  readonly outcomeMs: number
  readonly discoveryMs: number
  readonly evaluatedOffences: number
  readonly newInjuries: number
  readonly newDeaths: number
}
let timingObserver: ((sample: LifeTimingSampleV1) => void) | null = null
export function setLifeTimingObserverV1(
  observer: ((sample: LifeTimingSampleV1) => void) | null): void {
  timingObserver = observer
}

export function lifePersonV1(state: SimulationStateV5, agentId: string): LifePersonV1 | null {
  return state.life?.people.find((item) => item.agentId === agentId) ?? null
}

export function livingPopulationV1(state: SimulationStateV5): number {
  return state.life?.people.filter((item) => item.lifeStatus === 'alive').length ??
    state.citizens.length
}

/** Reject invalid life/activity combinations at the state transition boundary. */
export function assertLifeStateInvariantsV1(state: SimulationStateV5): void {
  if (!state.life) return
  const life = state.life
  const people = new Map(life.people.map((item) => [item.agentId, item]))
  const injuries = new Map(life.injuries.map((item) => [item.id, item]))
  const deaths = new Map(life.deaths.map((item) => [item.id, item]))
  if (people.size !== state.citizens.length ||
    injuries.size !== life.injuries.length || deaths.size !== life.deaths.length ||
    new Set(life.scenes.map((item) => item.id)).size !== life.scenes.length) {
    throw new Error('Duplicate or missing life-state entities')
  }
  for (const citizen of state.citizens) {
    const person = people.get(citizen.id)
    if (!person) throw new Error(`Missing life-state person ${citizen.id}`)
    if (person.lifeStatus === 'deceased') {
      const death = deaths.get(person.deathEventId)
      if (person.functionalStatus !== null || person.activeInjuryIds.length ||
        citizen.activity !== 'deceased' || !death || death.tick !== person.deathTick ||
        death.victimAgentId !== citizen.id) {
        throw new Error(`Invalid deceased state ${citizen.id}`)
      }
    } else {
      if (citizen.activity === 'deceased' ||
        person.activeInjuryIds.some((id) => injuries.get(id)?.status !== 'active') ||
        (person.functionalStatus === 'incapacitated' && citizen.activity !== 'incapacitated') ||
        (citizen.activity === 'standingUp' && person.functionalStatus !== 'impaired')) {
        throw new Error(`Invalid living state ${citizen.id}`)
      }
    }
  }
  for (const scene of life.scenes) {
    const death = deaths.get(scene.deathEventId)
    if (!death || scene.agentId !== death.victimAgentId ||
      scene.surfaceId !== death.surfaceId || scene.levelId !== death.levelId ||
      distance(scene.position, death.position) !== 0) {
      throw new Error(`Invalid death scene ${scene.id}`)
    }
  }
}

function functionFromInjuries(injuries: readonly InjuryRecordV1[], tick: number): FunctionalStatusV1 {
  if (injuries.some((item) => item.status === 'active' && item.stepDownTick !== null &&
    tick < item.stepDownTick)) return 'incapacitated'
  return injuries.some((item) => item.status === 'active') ? 'impaired' : 'unimpaired'
}

/** Recovery occurs before movement; the previous replay snapshot remains immutable. */
export function progressLifeRecoveryV1(state: SimulationStateV5,
  tick: number): SimulationStateV5 {
  if (!state.life || !state.life.injuries.length) return state
  if (!state.life.injuries.some((item) => item.status === 'active' &&
    (item.recoveryTick !== null && tick >= item.recoveryTick ||
      item.stepDownTick === tick))) return state
  const injuries = state.life.injuries.map((item): InjuryRecordV1 =>
    item.status === 'active' && item.recoveryTick !== null &&
    tick >= item.recoveryTick ? { ...item, status: 'recovered' } : item)
  const byId = new Map(injuries.map((item) => [item.id, item]))
  const events: LifeRecoveryEventV1[] = []
  const citizenById = new Map(state.citizens.map((item) => [item.id, item]))
  const people = state.life.people.map((person): LifePersonV1 => {
    if (person.lifeStatus === 'deceased') return person
    const active = person.activeInjuryIds.map((id) => byId.get(id)!)
      .filter((item) => item.status === 'active')
    const nextStatus = functionFromInjuries(active, tick)
    const ended = person.activeInjuryIds.map((id) => byId.get(id)!)
      .filter((item) => item.status === 'recovered' && item.recoveryTick === tick)
    for (const injury of ended) events.push({ id: `life-recovery:${injury.id}`,
      agentId: person.agentId, injuryId: injury.id, tick,
      kind: 'recovered', before: person.functionalStatus,
      after: nextStatus })
    if (person.functionalStatus === 'incapacitated' &&
      nextStatus === 'impaired') {
      for (const injury of active.filter((item) => item.stepDownTick === tick)) {
        events.push({ id: `life-improved:${injury.id}`, agentId: person.agentId,
          injuryId: injury.id, tick, kind: 'improved',
          before: 'incapacitated', after: 'impaired' })
      }
      const citizen = citizenById.get(person.agentId)!
      citizenById.set(person.agentId, { ...citizen,
        activity: 'standingUp', nextDecisionTick: tick + 1,
      })
    }
    return { ...person, functionalStatus: nextStatus,
      activeInjuryIds: active.map((item) => item.id),
      resumeToSafeNode: nextStatus === 'incapacitated' && person.resumeToSafeNode }
  })
  const next: SimulationStateV5 = { ...state, citizens: state.citizens.map((item) => citizenById.get(item.id)!),
    life: { ...state.life, people, injuries,
      recoveryEvents: [...state.life.recoveryEvents, ...events] } }
  assertLifeStateInvariantsV1(next)
  return next
}

function interruptSocial(state: SimulationStateV5, affectedId: string,
  tick: number): SimulationStateV5 {
  if (!state.social) return state
  const interrupted = state.social.interactions.filter((item) =>
    item.status === 'active' && item.participantIds.includes(affectedId))
  if (!interrupted.length && !state.social.encounters.active.some((item) =>
    item.participantIds.includes(affectedId))) return state
  const ids = new Set(interrupted.map((item) => item.id))
  const participants = new Set(interrupted.flatMap((item) => item.participantIds))
  const encounters = state.social.encounters
  const ending = encounters.active.filter((item) => item.participantIds.includes(affectedId))
  const active = encounters.active.filter((item) => !item.participantIds.includes(affectedId))
  return { ...state,
    citizens: state.citizens.map((citizen) =>
      participants.has(citizen.id) && citizen.engagement ? {
        ...citizen, engagement: undefined,
        activity: citizen.id === affectedId ? citizen.activity : 'atDestination',
        nextDecisionTick: citizen.id === affectedId ? citizen.nextDecisionTick : tick + 1,
      } : citizen),
    social: { ...state.social,
      interactions: state.social.interactions.map((item) => ids.has(item.id) ?
        { ...item, status: 'interrupted' as const, endTick: tick } : item),
      interactionEvents: [...state.social.interactionEvents,
        ...interrupted.map((item) => ({ id: `Interrupted:${item.id}:${tick}`,
          tick, interactionId: item.id, participantIds: item.participantIds,
          type: 'Interrupted' as const }))],
      encounters: { ...encounters, active,
        pending: encounters.pending.filter((item) =>
          !item.participantIds.includes(affectedId)),
        completed: [...encounters.completed, ...ending.map((item) => ({
          ...item, status: 'ended' as const, endedTick: tick, endedSecond: 6 }))] },
      encounterEvents: [...state.social.encounterEvents,
        ...ending.map((item) => ({ id: `ended:${item.id}`,
          type: 'EncounterEnded' as const, episodeId: item.id,
          tick, second: 6 }))],
    } }
}

function stopCitizen(citizen: CitizenStateV5, deceased: boolean,
  nextDecisionTick: number): CitizenStateV5 {
  const currentStep = citizen.route[citizen.routeIndex]
  const mustReachNode = !deceased && citizen.currentNodeId === null &&
    currentStep !== undefined
  return { ...citizen, activity: deceased ? 'deceased' : 'incapacitated',
    movementMode: 'walk', engagement: undefined,
    destinationPlaceId: null, destinationNodeId: null,
    reservedSlotNodeId: null,
    route: mustReachNode ? [currentStep] : [], routeIndex: 0,
    distanceOnEdgeMm: mustReachNode ? citizen.distanceOnEdgeMm : 0,
    nextDecisionTick }
}

function positionIsLegal(world: WorldModelV2, citizen: CitizenStateV5): string {
  const surface = world.surfaces.find((item) => item.id === citizen.surfaceId)
  if (!surface) throw new Error(`Life outcome has invalid surface for ${citizen.id}`)
  if (!Number.isSafeInteger(citizen.position.x) ||
    !Number.isSafeInteger(citizen.position.y) ||
    !Number.isSafeInteger(citizen.position.z)) {
    throw new Error(`Life outcome has invalid position for ${citizen.id}`)
  }
  const connectorId = citizen.surfaceId.startsWith('connector:') ?
    citizen.surfaceId.slice('connector:'.length) : null
  const onConnector = connectorId && world.navEdges.some((edge) =>
    edge.connectorId === connectorId && edge.path.slice(1).some((end, index) => {
      const start = edge.path[index]
      const delta = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z }
      const lengthSquared = delta.x ** 2 + delta.y ** 2 + delta.z ** 2
      const fraction = lengthSquared ? Math.max(0, Math.min(1,
        ((citizen.position.x - start.x) * delta.x +
          (citizen.position.y - start.y) * delta.y +
          (citizen.position.z - start.z) * delta.z) / lengthSquared)) : 0
      return distance(citizen.position, { x: start.x + fraction * delta.x,
        y: start.y + fraction * delta.y, z: start.z + fraction * delta.z }) <= 350
    }))
  if (!(connectorId ? onConnector : hasClearSurfaceSegment(world,
    citizen.surfaceId, citizen.position, citizen.position))) {
    throw new Error(`Life outcome has non-walkable position for ${citizen.id}`)
  }
  return surface.levelId
}

/** Completed, attributed assaults are the only v1 cause of physical harm. */
export function applyLifeOutcomesV1(state: SimulationStateV5,
  environment: SimulationEnvironmentV5): SimulationStateV5 {
  const config = environment.config.life
  if (!config || !state.life) return state
  const newOffences = state.offences.filter((item) => item.tick === state.tick &&
    item.mechanism === 'physicalAssault').sort((a, b) => a.id.localeCompare(b.id))
  if (!newOffences.length) return state
  const priorSources = new Set(state.life.injuries.map((item) => item.sourceOffenceId))
  const people = new Map(state.life.people.map((item) => [item.agentId, item]))
  const citizens = new Map(state.citizens.map((item) => [item.id, item]))
  const injuries = [...state.life.injuries]
  const deaths = [...state.life.deaths]
  const scenes = [...state.life.scenes]
  const observations = [...state.life.observations]
  let result = state
  let applied = false
  for (const offence of newOffences) {
    if (offence.target.kind !== 'citizen') throw new Error('Assault requires a citizen victim')
    const victim = people.get(offence.target.id)
    const citizen = citizens.get(offence.target.id)
    if (!victim || !citizen) throw new Error(`Assault has no real victim ${offence.id}`)
    if (victim.lifeStatus === 'deceased' || priorSources.has(offence.id)) continue
    const outcome = evaluateHarmOutcomeV1(offence, config)
    if (!outcome) continue
    applied = true
    const levelId = positionIsLegal(environment.world, citizen)
    const id = `injury:${offence.id}:${citizen.id}`
    const stepDownTick = outcome.severity === 'minor' || outcome.fatal ? null :
      state.tick + config.incapacitatedTicks[outcome.severity]
    const recoveryTick = outcome.fatal ? null :
      state.tick + config.recoveryTicks[outcome.severity]
    const injury: InjuryRecordV1 = { id, victimAgentId: citizen.id,
      sourceOffenceId: offence.id, onsetTick: state.tick, severity: outcome.severity,
      position: citizen.position, surfaceId: citizen.surfaceId,
      levelId, placeId: citizen.placeId, stepDownTick, recoveryTick,
      status: outcome.fatal ? 'fatal' : 'active' }
    injuries.push(injury)
    priorSources.add(offence.id)
    for (const witness of state.social?.witnessObservations.filter((item) =>
      item.offenceId === offence.id && item.source === 'witness') ?? []) {
      observations.push({ id: `life-witness:${witness.id}`,
        observerAgentId: witness.ownerAgentId, kind: 'witnessedHarmfulOffence',
        observedTick: witness.observedTick, surfaceId: offence.surfaceId,
        position: witness.perceivedPosition, sourceOffenceId: offence.id,
        sourceDeathEventId: null, subjectToken: witness.subjectToken,
        believedIdentity: witness.believedIdentity })
    }
    if (outcome.fatal) {
      for (let index = 0; index < injuries.length; index += 1) {
        const priorInjury = injuries[index]
        if (priorInjury.victimAgentId === citizen.id && priorInjury.status === 'active') {
          injuries[index] = { ...priorInjury, status: 'closedByDeath',
            stepDownTick: null, recoveryTick: null }
        }
      }
      const death: DeathEventV1 = { id: `death:${id}`, victimAgentId: citizen.id,
        tick: state.tick, position: citizen.position, surfaceId: citizen.surfaceId,
        levelId, placeId: citizen.placeId, relatedInjuryId: id,
        relatedOffenceId: offence.id,
        causeClassification: 'immediatePhysicalAssaultOutcome',
        provenance: 'harmOutcomeV1' }
      deaths.push(death)
      const scene: DeathSceneV1 = { id: `scene:${death.id}`,
        deathEventId: death.id, agentId: citizen.id, position: citizen.position,
        surfaceId: citizen.surfaceId, levelId, placeId: citizen.placeId,
        createdTick: state.tick, state: 'present', policy: config.scenePolicy }
      if (!environment.config.scene) scenes.push(scene)
      people.set(citizen.id, { agentId: citizen.id, lifeStatus: 'deceased',
        functionalStatus: null, activeInjuryIds: [],
        deathEventId: death.id, deathTick: state.tick,
        resumeToSafeNode: false })
      citizens.set(citizen.id, stopCitizen(citizen, true, Number.MAX_SAFE_INTEGER))
      result = interruptSocial(result, citizen.id, state.tick)
    } else if (outcome.severity === 'minor') {
      people.set(citizen.id, { ...victim,
        functionalStatus: victim.functionalStatus === 'incapacitated' ?
          'incapacitated' : 'impaired',
        activeInjuryIds: [...victim.activeInjuryIds, id] })
    } else {
      people.set(citizen.id, { ...victim, functionalStatus: 'incapacitated',
        activeInjuryIds: [...victim.activeInjuryIds, id],
        resumeToSafeNode: citizen.currentNodeId === null &&
          citizen.route[citizen.routeIndex] !== undefined })
      citizens.set(citizen.id, stopCitizen(citizen, false, stepDownTick!))
      result = interruptSocial(result, citizen.id, state.tick)
    }
    if ((outcome.fatal || outcome.severity !== 'minor') && result.habits) {
      result = { ...result, habits: interruptHabitForLifeV1(result.habits,
        citizen.id, state.tick, `life event ${id}`, outcome.fatal) }
    }
  }
  if (!applied) return state
  const stoppedIds = new Set([...people.values()].filter((item) =>
    item.lifeStatus === 'deceased' || item.functionalStatus === 'incapacitated')
    .map((item) => item.agentId))
  const mergedCitizens = result.citizens.map((item) => stoppedIds.has(item.id) ?
    citizens.get(item.id)! : item)
  const next: SimulationStateV5 = { ...result, citizens: mergedCitizens,
    encounterEpisodes: result.encounterEpisodes.filter((item) =>
      !stoppedIds.has(item.offenderAgentId) &&
      (item.target.kind !== 'citizen' || !stoppedIds.has(item.target.id))),
    life: { ...state.life, people: state.life.people.map((item) => people.get(item.agentId)!),
      injuries, deaths, scenes, observations } }
  assertLifeStateInvariantsV1(next)
  return next
}

function sceneReport(observation: LifeObservationV1,
  scene: DeathSceneV1, environment: SimulationEnvironmentV5): LifeSceneReportV1 {
  const seed = environment.config.observationSeed
  const round = (value: number) => Math.round(value / 2_000) * 2_000
  return { id: `life-report:${hashSeed(`${seed}:${observation.id}`).toString(16)}`,
    availableTick: observation.observedTick +
      environment.config.life!.sceneReportDelayTicks,
    reportedPosition: { x: round(scene.position.x), y: round(scene.position.y),
      z: round(scene.position.z) },
    reportedLevelId: unit(`${seed}:life-level:${observation.id}`) < 0.8 ?
      scene.levelId : null,
    reportedPlaceId: unit(`${seed}:life-place:${observation.id}`) < 0.7 ?
      scene.placeId : null,
    reportedStatus: 'possibleDeathScene', source: 'sceneDiscovery' }
}

/** Scene discovery is separate from witnessing the original harmful event. */
export function discoverLifeScenesV1(state: SimulationStateV5,
  environment: SimulationEnvironmentV5): SimulationStateV5 {
  const config = environment.config.life
  if (!config || !state.life) return state
  if (!state.life.scenes.length && !state.life.pendingReports.length) return state
  const observed = new Set(state.life.observations.filter((item) =>
    item.kind === 'discoveredDeathScene').map((item) =>
    `${item.sourceDeathEventId}:${item.observerAgentId}`))
  const newObservations: LifeObservationV1[] = []
  const newKnowledge: DeathKnowledgeV1[] = []
  const newPending: PendingLifeReportV1[] = []
  const newReports: LifeSceneReportV1[] = []
  const people = new Map(state.life.people.map((item) => [item.agentId, item]))
  const socialSeed = environment.config.encounter?.social.seed ?? config.seed
  for (const scene of state.life.scenes) {
    if (scene.state !== 'present' || scene.createdTick >= state.tick) continue
    for (const citizen of state.citizens) {
      if (citizen.id === scene.agentId || citizen.activity === 'atHome' ||
        people.get(citizen.id)?.lifeStatus !== 'alive' ||
        people.get(citizen.id)?.functionalStatus === 'incapacitated' ||
        citizen.surfaceId !== scene.surfaceId ||
        observed.has(`${scene.deathEventId}:${citizen.id}`) ||
        distance(citizen.position, scene.position) > config.discoveryRadiusMm ||
        !hasClearSurfaceSegment(environment.world, scene.surfaceId,
          citizen.position, scene.position)) continue
      const attention = environment.config.encounter ?
        createSocialProfileV1(citizen.id, environment.config.encounter.social.seed).attention : 1
      if (unit(`${config.seed}:discover:${scene.id}:${citizen.id}:${state.tick}`) >=
        config.discoveryProbabilityPerEligibleTick * attention) continue
      const token = createRecognitionTokenV1(socialSeed, citizen.id, scene.agentId)
      const believedIdentity = state.social?.knowledge.find((item) =>
        item.ownerAgentId === citizen.id && item.subjectToken === token &&
        item.kind === 'identityBelief')?.believedIdentity ?? null
      const item: LifeObservationV1 = { id: `life-observation:${scene.id}:${citizen.id}`,
        observerAgentId: citizen.id, kind: 'discoveredDeathScene',
        observedTick: state.tick, surfaceId: scene.surfaceId,
        position: citizen.position, sourceOffenceId: null,
        sourceDeathEventId: scene.deathEventId, subjectToken: token,
        believedIdentity }
      newObservations.push(item)
      observed.add(`${scene.deathEventId}:${citizen.id}`)
      const claim: DeathKnowledgeV1 = { id: `death-knowledge:${item.id}`,
        ownerAgentId: citizen.id, subjectToken: token, believedIdentity,
        acquiredTick: state.tick, source: 'sceneDiscovery',
        sourceObservationId: item.id, confidence: 0.8 }
      newKnowledge.push(claim)
      if (unit(`${config.seed}:report:${item.id}`) < config.sceneReportProbability) {
        newPending.push({ deathEventId: scene.deathEventId, observationId: item.id,
          report: sceneReport(item, scene, environment) })
      }
    }
  }
  const stillPending: PendingLifeReportV1[] = []
  for (const item of [...state.life.pendingReports, ...newPending]) {
    if (item.report.availableTick <= state.tick) newReports.push(item.report)
    else stillPending.push(item)
  }
  if (!newObservations.length && !newReports.length && !newPending.length) return state
  return { ...state, life: { ...state.life,
    observations: newObservations.length ? [...state.life.observations, ...newObservations] :
      state.life.observations,
    knowledge: newKnowledge.length ? [...state.life.knowledge, ...newKnowledge] :
      state.life.knowledge,
    pendingReports: stillPending,
    reports: newReports.length ? [...state.life.reports, ...newReports] :
      state.life.reports } }
}

export function finalizeLifeTickV1(state: SimulationStateV5,
  environment: SimulationEnvironmentV5): SimulationStateV5 {
  if (!state.life || !environment.config.life) return state
  const started = timingObserver ? performance.now() : 0
  const harmed = applyLifeOutcomesV1(state, environment)
  const afterOutcomes = timingObserver ? performance.now() : 0
  const observed = environment.config.scene ? advanceSceneStateV1(harmed, environment) :
    discoverLifeScenesV1(harmed, environment)
  if (timingObserver) timingObserver({ tick: state.tick,
    outcomeMs: afterOutcomes - started,
    discoveryMs: performance.now() - afterOutcomes,
    evaluatedOffences: state.offences.filter((item) => item.tick === state.tick &&
      item.mechanism === 'physicalAssault').length,
    newInjuries: (observed.life?.injuries.length ?? 0) -
      (state.life?.injuries.length ?? 0),
    newDeaths: (observed.life?.deaths.length ?? 0) -
      (state.life?.deaths.length ?? 0) })
  return observed
}
