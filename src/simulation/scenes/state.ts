import type { WorldModelV2, WorldPointMm } from '../../world/model'
import { hasClearSurfaceSegment } from '../encounter/spatial'
import { createRecognitionTokenV1 } from '../encounter/memory'
import { rememberExperienceV1, upsertKnowledgeV1 } from '../encounter/memory'
import { createSocialProfileV1 } from '../encounter/socialProfiles'
import type { AgentKnowledgeV1, AgentMemoryV1 } from '../encounter/socialTypes'
import { hashSeed } from '../rng'
import type { DeathKnowledgeV1, LifeObservationV1, LifeSceneReportV1 } from '../life/types'
import type { CitizenStateV5, SimulationEnvironmentV5, SimulationStateV5 } from '../v5Types'
import type { SceneDiscoveryV1, SceneEntityV1, SceneHearsayV1, SceneStructureRefV1,
  SceneTransitionV1 } from './types'

const unit = (key: string): number => (hashSeed(key) + 0.5) / 0x1_0000_0000
const gridKey = (surfaceId: string, x: number, z: number): string =>
  surfaceId + ':' + x + ':' + z

function structureFor(world: WorldModelV2, placeId: string | null,
  surfaceId: string): SceneStructureRefV1 {
  if (placeId?.startsWith('building:')) {
    const buildingId = placeId.slice('building:'.length)
    if (world.baseCity?.buildings.some((item) => item.id === buildingId)) {
      return { kind: 'building', id: buildingId }
    }
  }
  if (placeId?.startsWith('galleria') || placeId === 'central-galleria' ||
    surfaceId.startsWith('galleria')) {
    return { kind: 'galleria', id: 'central-galleria' }
  }
  const overpass = world.overpasses?.find((item) =>
    item.surfaceId === surfaceId || item.landingSurfaceIds.includes(surfaceId))
  return overpass ? { kind: 'overpass', id: overpass.id } : null
}

function sceneAnchor(world: WorldModelV2, source: Readonly<{
  position: WorldPointMm; surfaceId: string; levelId: string; placeId: string | null
}>) {
  return { position: source.position, surfaceId: source.surfaceId,
    levelId: source.levelId, placeId: source.placeId,
    structure: structureFor(world, source.placeId, source.surfaceId) }
}

function createNewScenes(state: SimulationStateV5, world: WorldModelV2):
  Readonly<{ entities: SceneEntityV1[]; transitions: SceneTransitionV1[] }> {
  const entities = [...state.scene!.entities]
  const transitions = [...state.scene!.transitions]
  const existing = new Set(entities.map((scene) => scene.id))
  const add = (scene: SceneEntityV1, sourceId: string): void => {
    if (existing.has(scene.id)) return
    entities.push(scene)
    transitions.push({ id: 'scene-transition:created:' + scene.id, sceneId: scene.id,
      tick: state.tick, kind: 'created', sourceId })
    existing.add(scene.id)
  }
  const offenceById = new Map(state.offences.map((item) => [item.id, item]))
  for (const death of state.life!.deaths.filter((item) => item.tick === state.tick)) {
    const offence = offenceById.get(death.relatedOffenceId)
    if (!offence) throw new Error('Death scene has no source offence ' + death.id)
    add({ id: 'scene:' + death.id, kind: 'deathAftermath',
      origin: { kind: 'death', deathEventId: death.id,
        injuryId: death.relatedInjuryId, offenceId: death.relatedOffenceId,
        incidentId: offence.incidentId },
      createdTick: state.tick, anchor: sceneAnchor(world, death),
      associatedAgentIds: [death.victimAgentId, offence.offenderAgentId],
      status: 'present', resolvedTick: null, resolution: null }, death.id)
  }
  for (const injury of state.life!.injuries.filter((item) =>
    item.onsetTick === state.tick && item.status === 'active' &&
    item.stepDownTick !== null)) {
    const offence = offenceById.get(injury.sourceOffenceId)
    if (!offence) throw new Error('Incapacitation scene has no source offence ' + injury.id)
    add({ id: 'scene:incapacitation:' + injury.id,
      kind: 'incapacitationAftermath',
      origin: { kind: 'incapacitation', injuryId: injury.id,
        offenceId: injury.sourceOffenceId, incidentId: offence.incidentId },
      createdTick: state.tick, anchor: sceneAnchor(world, injury),
      associatedAgentIds: [injury.victimAgentId, offence.offenderAgentId],
      status: 'present', resolvedTick: null, resolution: null }, injury.id)
  }
  const injuryById = new Map(state.life!.injuries.map((item) => [item.id, item]))
  const people = new Map(state.life!.people.map((item) => [item.agentId, item]))
  const updated = entities.map((scene): SceneEntityV1 => {
    if (scene.status !== 'present' || scene.origin.kind !== 'incapacitation') return scene
    const injury = injuryById.get(scene.origin.injuryId)
    const person = people.get(injury?.victimAgentId ?? '')
    if (!injury || !person || injury.status !== 'active' ||
      person.lifeStatus === 'deceased' ||
      person.functionalStatus !== 'incapacitated') {
      transitions.push({ id: 'scene-transition:resolved:' + scene.id,
        sceneId: scene.id, tick: state.tick, kind: 'resolved',
        sourceId: injury?.id ?? scene.origin.injuryId })
      return { ...scene, status: 'resolved', resolvedTick: state.tick,
        resolution: 'recoveredMobility' }
    }
    return scene
  })
  return { entities: updated, transitions }
}

function residentGrid(citizens: readonly CitizenStateV5[], cellSizeMm: number):
  Map<string, CitizenStateV5[]> {
  const grid = new Map<string, CitizenStateV5[]>()
  for (const citizen of citizens) {
    const key = gridKey(citizen.surfaceId,
      Math.floor(citizen.position.x / cellSizeMm),
      Math.floor(citizen.position.z / cellSizeMm))
    const bucket = grid.get(key) ?? []
    bucket.push(citizen)
    grid.set(key, bucket)
  }
  return grid
}

function nearbyResidents(grid: ReadonlyMap<string, CitizenStateV5[]>,
  scene: SceneEntityV1, cellSizeMm: number, radiusMm: number): CitizenStateV5[] {
  const cellX = Math.floor(scene.anchor.position.x / cellSizeMm)
  const cellZ = Math.floor(scene.anchor.position.z / cellSizeMm)
  const spread = Math.ceil(radiusMm / cellSizeMm)
  const candidates: CitizenStateV5[] = []
  for (let dx = -spread; dx <= spread; dx += 1) {
    for (let dz = -spread; dz <= spread; dz += 1) {
      candidates.push(...(grid.get(gridKey(scene.anchor.surfaceId,
        cellX + dx, cellZ + dz)) ?? []))
    }
  }
  return candidates.sort((a, b) => a.id.localeCompare(b.id))
}

function makeReport(discovery: SceneDiscoveryV1,
  environment: SimulationEnvironmentV5): LifeSceneReportV1 {
  const seed = environment.config.observationSeed
  const round = (value: number) => Math.round(value / 2_000) * 2_000
  const position = discovery.perceivedScenePosition
  return { id: 'scene-report:' + hashSeed(seed + ':' + discovery.id).toString(16),
    availableTick: discovery.tick + environment.config.life!.sceneReportDelayTicks,
    reportedPosition: { x: round(position.x), y: round(position.y),
      z: round(position.z) },
    reportedLevelId: unit(seed + ':scene-level:' + discovery.id) < 0.8 ?
      discovery.perceivedLevelId : null,
    reportedPlaceId: unit(seed + ':scene-place:' + discovery.id) < 0.7 ?
      discovery.perceivedPlaceId : null,
    reportedStatus: discovery.perceivedStatus,
    source: 'sceneDiscovery' }
}

function shareAftermath(state: SimulationStateV5,
  entities: readonly SceneEntityV1[],
  environment: SimulationEnvironmentV5): SceneHearsayV1[] {
  if (!state.social || !environment.config.encounter ||
    !state.scene!.discoveries.length) return []
  const completedIds: string[] = []
  for (let index = state.social.interactionEvents.length - 1; index >= 0; index -= 1) {
    const event = state.social.interactionEvents[index]
    if (event.tick < state.tick) break
    if (event.tick === state.tick && event.type === 'Completed') {
      completedIds.push(event.interactionId)
    }
  }
  if (!completedIds.length) return []
  const sceneById = new Map(entities.map((item) => [item.id, item]))
  const known = new Set([
    ...state.scene!.discoveries.map((item) =>
      item.sceneId + ':' + item.observerAgentId),
    ...state.scene!.hearsay.map((item) =>
      item.sceneId + ':' + item.receiverAgentId),
  ])
  const discoveriesByOwner = new Map<string, SceneDiscoveryV1[]>()
  for (const discovery of state.scene!.discoveries) {
    const list = discoveriesByOwner.get(discovery.observerAgentId) ?? []
    list.push(discovery)
    discoveriesByOwner.set(discovery.observerAgentId, list)
  }
  const result: SceneHearsayV1[] = []
  for (const interactionId of completedIds.sort()) {
    const interaction = state.social.interactions.find((item) => item.id === interactionId)
    if (!interaction || interaction.type !== 'conversation' ||
      interaction.status !== 'completed' || interaction.endTick !== state.tick) continue
    for (const [sourceId, receiverId] of [
      interaction.participantIds,
      [interaction.participantIds[1], interaction.participantIds[0]],
    ]) {
      const source = (discoveriesByOwner.get(sourceId) ?? [])
        .filter((item) => item.tick < state.tick &&
          !known.has(item.sceneId + ':' + receiverId))
        .sort((a, b) => b.tick - a.tick || a.id.localeCompare(b.id))[0]
      if (!source || unit(environment.config.life!.seed + ':hearsay:' +
        interaction.id + ':' + source.id + ':' + receiverId) >=
        environment.config.scene!.hearsayProbabilityPerConversation) continue
      const scene = sceneById.get(source.sceneId)!
      result.push({ id: 'scene-hearsay:' +
        hashSeed(interaction.id + ':' + source.id + ':' + receiverId).toString(16),
        sceneId: scene.id, sourceAgentId: sourceId, receiverAgentId: receiverId,
        interactionId: interaction.id, tick: state.tick,
        claimedStatus: source.perceivedStatus,
        claimedPlaceId: source.perceivedPlaceId,
        claimedLevelId: source.perceivedLevelId,
        claimedName: source.believedIdentity })
      known.add(scene.id + ':' + receiverId)
    }
  }
  return result
}

function rememberScenes(state: SimulationStateV5,
  observations: readonly LifeObservationV1[], hearsay: readonly SceneHearsayV1[],
  environment: SimulationEnvironmentV5) {
  if (!state.social || !environment.config.encounter ||
    (!observations.length && !hearsay.length)) return state.social
  const config = environment.config.encounter.social
  const memories = new Map<string, AgentMemoryV1[]>()
  const knowledge = new Map<string, AgentKnowledgeV1[]>()
  for (const item of state.social.memories) {
    const list = memories.get(item.ownerAgentId) ?? []
    list.push(item); memories.set(item.ownerAgentId, list)
  }
  for (const item of state.social.knowledge) {
    const list = knowledge.get(item.ownerAgentId) ?? []
    list.push(item); knowledge.set(item.ownerAgentId, list)
  }
  const add = (ownerId: string, id: string, subjectToken: string | null,
    placeId: string | null, surfaceId: string | null, source: 'direct' | 'hearsay',
    code: string, believedIdentity: string | null): void => {
    const memory: AgentMemoryV1 = { id: 'memory:' + id, ownerAgentId: ownerId,
      category: source === 'direct' ? 'witness' : 'hearsay',
      subjectToken, placeId, surfaceId, createdTick: state.tick,
      lastUpdatedTick: state.tick, source, provenanceId: id,
      observationCode: code, confidence: source === 'direct' ? 0.8 : 0.45,
      salience: source === 'direct' ? 0.7 : 0.45 }
    memories.set(ownerId, [...rememberExperienceV1(memories.get(ownerId) ?? [],
      memory, config, state.tick)])
    const claim: AgentKnowledgeV1 = {
      id: 'knowledge:' + id, ownerAgentId: ownerId,
      kind: source === 'direct' ? 'event' : 'hearsay', subjectToken,
      acquiredTick: state.tick, source, provenanceId: id,
      confidence: memory.confidence, believedIdentity,
      expiresTick: source === 'hearsay' ? state.tick + 1_200 : null }
    knowledge.set(ownerId, [...upsertKnowledgeV1(knowledge.get(ownerId) ?? [],
      claim, config, state.tick)])
  }
  for (const observation of observations) {
    const scene = state.scene!.entities.find((item) =>
      observation.sourceDeathEventId ?
        item.origin.kind === 'death' &&
        item.origin.deathEventId === observation.sourceDeathEventId :
        item.id === state.scene!.discoveries.find((record) =>
          'life-observation:' + record.id === observation.id)?.sceneId)
    add(observation.observerAgentId, observation.id,
      observation.subjectToken, scene?.anchor.placeId ?? null,
      observation.surfaceId, 'direct',
      observation.kind === 'discoveredDeathScene' ?
        'perceived-possible-death-aftermath' :
        'perceived-possible-incapacitation-aftermath',
      observation.believedIdentity)
  }
  for (const item of hearsay) {
    add(item.receiverAgentId, item.id, null, item.claimedPlaceId,
      null, 'hearsay', 'heard-' + item.claimedStatus,
      item.claimedName)
  }
  return { ...state.social, memories: [...memories.values()].flat(),
    knowledge: [...knowledge.values()].flat() }
}

/** Advance spatial evidence after life outcomes, without exposing provenance to ObserverPort. */
export function advanceSceneStateV1(state: SimulationStateV5,
  environment: SimulationEnvironmentV5): SimulationStateV5 {
  if (!state.scene || !state.life || !environment.config.scene) return state
  if (!state.scene.entities.length && !state.scene.pendingReports.length &&
    !state.life.deaths.some((item) => item.tick === state.tick) &&
    !state.life.injuries.some((item) => item.onsetTick === state.tick &&
      item.status === 'active' && item.stepDownTick !== null)) return state
  const lifeConfig = environment.config.life!
  const { entities, transitions } = createNewScenes(state, environment.world)
  const known = new Set(state.scene.discoveries.map((item) =>
    item.sceneId + ':' + item.observerAgentId))
  const discoveries: SceneDiscoveryV1[] = []
  const observations: LifeObservationV1[] = []
  const knowledge: DeathKnowledgeV1[] = []
  const pending = [...state.scene.pendingReports]
  const reportLinks = [...state.scene.reportLinks]
  const activeScenes = entities.filter((item) =>
    item.status === 'present' && item.createdTick < state.tick)
  const grid = activeScenes.length ?
    residentGrid(state.citizens, environment.config.scene.cellSizeMm) :
    new Map<string, CitizenStateV5[]>()
  const people = new Map(state.life.people.map((item) => [item.agentId, item]))
  const radius = lifeConfig.discoveryRadiusMm
  const socialSeed = environment.config.encounter?.social.seed ??
    lifeConfig.seed
  for (const scene of activeScenes) {
    const victimId = scene.associatedAgentIds[0]
    for (const citizen of nearbyResidents(grid, scene,
      environment.config.scene.cellSizeMm, radius)) {
      const person = people.get(citizen.id)
      if (citizen.id === victimId || citizen.activity === 'atHome' ||
        person?.lifeStatus !== 'alive' ||
        person.functionalStatus === 'incapacitated' ||
        known.has(scene.id + ':' + citizen.id)) continue
      const position = scene.anchor.position
      if (Math.hypot(citizen.position.x - position.x,
        citizen.position.y - position.y, citizen.position.z - position.z) > radius ||
        !hasClearSurfaceSegment(environment.world, scene.anchor.surfaceId,
          citizen.position, position)) continue
      const attention = environment.config.encounter ?
        createSocialProfileV1(citizen.id,
          environment.config.encounter.social.seed).attention : 1
      if (unit(lifeConfig.seed + ':discover:' + scene.id + ':' +
        citizen.id + ':' + state.tick) >=
        lifeConfig.discoveryProbabilityPerEligibleTick * attention) continue
      const token = createRecognitionTokenV1(socialSeed, citizen.id, victimId)
      const believedIdentity = state.social?.knowledge.find((item) =>
        item.ownerAgentId === citizen.id && item.subjectToken === token &&
        item.kind === 'identityBelief')?.believedIdentity ?? null
      const discovery: SceneDiscoveryV1 = {
        id: 'scene-discovery:' + hashSeed(lifeConfig.seed + ':' +
          scene.id + ':' + citizen.id).toString(16),
        sceneId: scene.id, observerAgentId: citizen.id, tick: state.tick,
        observerPosition: citizen.position, observedSurfaceId: citizen.surfaceId,
        perceivedScenePosition: scene.anchor.position,
        perceivedLevelId: scene.anchor.levelId,
        perceivedPlaceId: scene.anchor.placeId,
        perceivedStatus: scene.kind === 'deathAftermath' ?
          'possibleDeathScene' : 'possibleIncapacitatedPerson',
        subjectToken: token, believedIdentity }
      discoveries.push(discovery)
      known.add(scene.id + ':' + citizen.id)
      const observation: LifeObservationV1 = {
        id: 'life-observation:' + discovery.id, observerAgentId: citizen.id,
        kind: scene.kind === 'deathAftermath' ? 'discoveredDeathScene' :
          'discoveredIncapacitationScene',
        observedTick: state.tick, surfaceId: citizen.surfaceId,
        position: citizen.position, sourceOffenceId: null,
        sourceDeathEventId: scene.origin.kind === 'death' ?
          scene.origin.deathEventId : null,
        subjectToken: token, believedIdentity }
      observations.push(observation)
      if (scene.origin.kind === 'death') {
        knowledge.push({ id: 'death-knowledge:' + observation.id,
          ownerAgentId: citizen.id, subjectToken: token, believedIdentity,
          acquiredTick: state.tick, source: 'sceneDiscovery',
          sourceObservationId: observation.id, confidence: 0.8 })
      }
      if (unit(lifeConfig.seed + ':report:' + discovery.id) <
        lifeConfig.sceneReportProbability) {
        const report = makeReport(discovery, environment)
        pending.push({ sceneId: scene.id, discoveryId: discovery.id, report })
        reportLinks.push({ sceneId: scene.id, discoveryId: discovery.id,
          reportId: report.id })
      }
    }
  }
  const ready = pending.filter((item) => item.report.availableTick <= state.tick)
  const stillPending = pending.filter((item) => item.report.availableTick > state.tick)
  const hearsay = shareAftermath(state, entities, environment)
  if (entities.length === state.scene.entities.length &&
    transitions.length === state.scene.transitions.length &&
    !discoveries.length && !hearsay.length && !ready.length) return state
  const updated: SimulationStateV5 = { ...state,
    scene: { ...state.scene, entities, transitions,
      discoveries: [...state.scene.discoveries, ...discoveries],
      hearsay: [...state.scene.hearsay, ...hearsay],
      pendingReports: stillPending, reportLinks },
    life: { ...state.life,
      observations: [...state.life.observations, ...observations],
      knowledge: [...state.life.knowledge, ...knowledge],
      reports: [...state.life.reports, ...ready.map((item) => item.report)] } }
  const next = { ...updated,
    social: rememberScenes(updated, observations, hearsay, environment) }
  assertSceneStateV1(next, environment.world)
  return next
}

export function assertSceneStateV1(state: SimulationStateV5,
  world: WorldModelV2): void {
  if (!state.scene) return
  const ids = new Set<string>()
  const sceneById = new Map(state.scene.entities.map((item) => [item.id, item]))
  const offenceById = new Map(state.offences.map((item) => [item.id, item]))
  const surfaceById = new Map(world.surfaces.map((item) => [item.id, item]))
  for (const scene of state.scene.entities) {
    if (ids.has(scene.id)) throw new Error('Duplicate scene ID ' + scene.id)
    ids.add(scene.id)
    const surface = surfaceById.get(scene.anchor.surfaceId)
    if (!surface || surface.levelId !== scene.anchor.levelId ||
      scene.createdTick > state.tick ||
      (scene.status === 'present') !== (scene.resolvedTick === null)) {
      throw new Error('Invalid scene anchor or lifecycle ' + scene.id)
    }
    if (scene.anchor.structure?.kind === 'building' &&
      !world.baseCity?.buildings.some((item) =>
        item.id === scene.anchor.structure?.id)) {
      throw new Error('Scene refers to a missing building ' + scene.id)
    }
    const offence = offenceById.get(scene.origin.offenceId)
    if (!offence || offence.incidentId !== scene.origin.incidentId ||
      offence.offenderAgentId !== scene.associatedAgentIds[1]) {
      throw new Error('Scene incident provenance mismatch ' + scene.id)
    }
    if (scene.origin.kind === 'death') {
      const origin = scene.origin
      const death = state.life?.deaths.find((item) =>
        item.id === origin.deathEventId)
      if (!death || death.position.x !== scene.anchor.position.x ||
        death.position.y !== scene.anchor.position.y ||
        death.position.z !== scene.anchor.position.z ||
        death.surfaceId !== scene.anchor.surfaceId ||
        death.levelId !== scene.anchor.levelId ||
        death.placeId !== scene.anchor.placeId ||
        death.tick !== scene.createdTick ||
        death.victimAgentId !== scene.associatedAgentIds[0]) {
        throw new Error('Scene death provenance mismatch ' + scene.id)
      }
    } else {
      const injury = state.life?.injuries.find((item) =>
        item.id === scene.origin.injuryId)
      if (!injury || injury.position.x !== scene.anchor.position.x ||
        injury.position.y !== scene.anchor.position.y ||
        injury.position.z !== scene.anchor.position.z ||
        injury.surfaceId !== scene.anchor.surfaceId ||
        injury.levelId !== scene.anchor.levelId ||
        injury.placeId !== scene.anchor.placeId ||
        injury.onsetTick !== scene.createdTick ||
        injury.victimAgentId !== scene.associatedAgentIds[0]) {
        throw new Error('Scene injury provenance mismatch ' + scene.id)
      }
    }
  }
  for (const discovery of state.scene.discoveries) {
    const scene = sceneById.get(discovery.sceneId)
    if (!scene || discovery.tick <= scene.createdTick ||
      discovery.observedSurfaceId !== scene.anchor.surfaceId ||
      discovery.tick > state.tick) {
      throw new Error('Invalid scene discovery ' + discovery.id)
    }
  }
}
