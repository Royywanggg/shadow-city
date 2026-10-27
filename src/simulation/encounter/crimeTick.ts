import { syntheticTimeBand } from '../incidents'
import { hashSeed } from '../rng'
import { createOffendingProfiles } from '../offending/profiles'
import type { OffendingConfig, OffendingProfile, OpportunitySnapshot } from '../offending/types'
import type { WorldModelV2, WorldPointMm } from '../../world/model'
import type { MovementTracePoint, OffenceV5, OpportunityTargetV5,
  SimulationEnvironmentV5, SimulationStateV5 } from '../v5Types'
import { hasClearSurfaceSegment, querySpatialCandidates } from './spatial'
import { evaluatePerception } from './perception'
import { assessWitnessesForOffence, createWitnessObservations,
  decideEncounterAwareOffence, resolveSubjectiveRecognitionV1,
  scheduleWitnessReports } from './crimeWitness'
import { rememberExperienceV1, upsertKnowledgeV1 } from './memory'
import { createSocialProfilesV1 } from './socialProfiles'
import type { PerceivedPlaceRiskV1, SocialStateV1 } from './state'
import type { OffenderDecisionTraceV1 } from './state'
import type { DirectedPerceptionSample, SpatialCandidateSample } from './spatialTypes'
import type { AgentKnowledgeV1, AgentMemoryV1 } from './socialTypes'

const unit = (key: string): number => (hashSeed(key) + 0.5) / 0x1_0000_0000
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))
const distance = (a: WorldPointMm, b: WorldPointMm): number =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const episodeKey = (offenderId: string, target: OpportunityTargetV5, surfaceId: string) =>
  JSON.stringify([offenderId, target.kind, target.id, surfaceId])
const offenderProfiles = new WeakMap<SimulationEnvironmentV5, ReadonlyMap<string, OffendingProfile>>()
const modelConfigs = new WeakMap<SimulationEnvironmentV5, OffendingConfig>()

function modelConfig(environment: SimulationEnvironmentV5): OffendingConfig {
  let cached = modelConfigs.get(environment)
  if (!cached) {
    cached = { ...environment.config.encounter!.offending,
      offendingSeed: environment.config.offendingSeed, startHour: environment.config.startHour }
    modelConfigs.set(environment, cached)
  }
  return cached
}

function profilesFor(environment: SimulationEnvironmentV5): ReadonlyMap<string, OffendingProfile> {
  let cached = offenderProfiles.get(environment)
  if (!cached) {
    cached = new Map(createOffendingProfiles(environment.profiles, modelConfig(environment))
      .map((profile) => [profile.agentId, profile]))
    offenderProfiles.set(environment, cached)
  }
  return cached
}

function districtFor(world: WorldModelV2, point: WorldPointMm): Readonly<{
  id: string; kind: 'civic' | 'core' | 'residential' | 'works'
}> {
  if (world.baseCity?.blocks.length) {
    let nearest = world.baseCity.blocks[0]
    let best = Number.POSITIVE_INFINITY
    for (const block of world.baseCity.blocks) {
      const dx = Math.max(0, Math.abs(point.x / 1000 - block.x) - block.width / 2)
      const dz = Math.max(0, Math.abs(point.z / 1000 - block.z) - block.depth / 2)
      const cost = dx * dx + dz * dz
      if (cost < best || cost === best && block.id < nearest.id) {
        nearest = block; best = cost
      }
    }
    return { id: nearest.id, kind: nearest.district }
  }
  let nearest = world.districts[0]
  let best = Number.POSITIVE_INFINITY
  for (const district of world.districts) {
    const dx = Math.max(0, Math.abs(point.x - district.center.x) - district.widthMm / 2)
    const dz = Math.max(0, Math.abs(point.z - district.center.z) - district.depthMm / 2)
    const cost = dx * dx + dz * dz
    if (cost < best || cost === best && district.id < nearest.id) {
      nearest = district; best = cost
    }
  }
  if (!nearest) throw new Error('Encounter offence requires a world district')
  return { id: nearest.id, kind: nearest.kind === 'public' ? 'civic' :
    nearest.kind === 'mixedUse' ? 'core' : nearest.kind === 'residential' ?
      'residential' : 'works' }
}

function opportunitySnapshot(environment: SimulationEnvironmentV5, offender: MovementTracePoint,
  tick: number, nearbyIds: readonly string[], risk: number): OpportunitySnapshot {
  const config = modelConfig(environment)
  const district = districtFor(environment.world, offender.position)
  const timeBand = syntheticTimeBand(tick,
    environment.config.habit?.calendarSecondsPerTick ?? environment.config.logicalSecondsPerTick,
    environment.config.startHour)
  const crowd = Math.min(1, nearbyIds.length / config.nearbySaturation)
  const minorFactor = config.minorCrowdFloor + (1 - config.minorCrowdFloor) * crowd
  const seriousFactor = nearbyIds.length < config.seriousMinimumNearby ? 0 :
    Math.max(1 / config.nearbySaturation, crowd)
  return { agentId: offender.agentId, tick,
    position: { x: offender.position.x / 1000, y: offender.position.y / 1000,
      z: offender.position.z / 1000 },
    activity: offender.activity === 'interacting' ? 'atDestination' :
      offender.activity ?? 'atDestination',
    pedestrianAnchor: offender.edgeId ? { kind: 'edge', id: offender.edgeId } :
      { kind: 'publicAnchor', id: offender.surfaceId },
    blockId: district.id, district: district.kind, timeBand,
    nearbyCitizenIds: nearbyIds, nearbyOutdoorCount: nearbyIds.length,
    exposureBySeverity: {
      minor: clamp01(config.districtExposure[district.kind].minor *
        config.timeBandExposure[timeBand].minor * minorFactor),
      serious: clamp01(config.districtExposure[district.kind].serious *
        config.timeBandExposure[timeBand].serious * seriousFactor),
    }, rewardScore: config.rewardByDistrict[district.kind],
    perceivedRiskScore: clamp01(config.perceivedRiskByDistrict[district.kind] + risk) }
}

function updateSubjectiveWitnessState(social: SocialStateV1,
  observations: ReturnType<typeof createWitnessObservations>,
  environment: SimulationEnvironmentV5, tick: number): SocialStateV1 {
  const socialConfig = environment.config.encounter!.social
  const memoriesByOwner = new Map<string, AgentMemoryV1[]>()
  const knowledgeByOwner = new Map<string, AgentKnowledgeV1[]>()
  const risks = new Map<string, PerceivedPlaceRiskV1>(social.perceivedPlaceRisks.map((item) =>
    [JSON.stringify([item.ownerAgentId, item.placeId]), item]))
  for (const record of social.memories) {
    const list = memoriesByOwner.get(record.ownerAgentId) ?? []
    list.push(record); memoriesByOwner.set(record.ownerAgentId, list)
  }
  for (const record of social.knowledge) {
    const list = knowledgeByOwner.get(record.ownerAgentId) ?? []
    list.push(record); knowledgeByOwner.set(record.ownerAgentId, list)
  }
  for (const observation of observations) {
    const owner = observation.ownerAgentId
    const memory: AgentMemoryV1 = { id: `memory:${observation.id}`,
      ownerAgentId: owner, category: observation.source === 'victim' ?
        'victimExperience' : 'witness', subjectToken: observation.subjectToken,
      placeId: observation.perceivedPlaceId, surfaceId: null,
      createdTick: tick, lastUpdatedTick: tick,
      source: observation.source === 'victim' ? 'direct' : 'witness',
      provenanceId: observation.id,
      observationCode: observation.source === 'victim' ? 'perceived-personal-incident' :
        'perceived-possible-incident', confidence: observation.confidence,
      salience: observation.source === 'victim' ? 0.9 : 0.72 }
    memoriesByOwner.set(owner, [...rememberExperienceV1(memoriesByOwner.get(owner) ?? [],
      memory, socialConfig, tick)])
    const knowledge: AgentKnowledgeV1 = { id: `knowledge:${observation.id}`,
      ownerAgentId: owner, kind: 'event', subjectToken: observation.subjectToken,
      acquiredTick: tick, source: observation.source === 'victim' ? 'direct' : 'witness',
      provenanceId: observation.id,
      confidence: observation.confidence, believedIdentity: observation.believedIdentity,
      expiresTick: null }
    knowledgeByOwner.set(owner, [...upsertKnowledgeV1(knowledgeByOwner.get(owner) ?? [],
      knowledge, socialConfig, tick)])
    if (observation.perceivedPlaceId) {
      const key = JSON.stringify([owner, observation.perceivedPlaceId])
      const prior = risks.get(key)
      const priorScore = prior ? prior.score * Math.pow(0.5,
        (tick - prior.lastUpdatedTick) / socialConfig.memoryHalfLifeTicks) : 0
      const shock = observation.source === 'victim' ? 0.7 : 0.4
      risks.set(key, { ownerAgentId: owner, placeId: observation.perceivedPlaceId,
        score: Math.min(1, 1 - (1 - priorScore) * (1 - shock * observation.confidence)),
        lastUpdatedTick: tick, sourceObservationId: observation.id })
    }
  }
  const boundedRisks = new Map<string, PerceivedPlaceRiskV1[]>()
  for (const risk of risks.values()) {
    const list = boundedRisks.get(risk.ownerAgentId) ?? []
    list.push(risk); boundedRisks.set(risk.ownerAgentId, list)
  }
  return { ...social, memories: [...memoriesByOwner.values()].flat().sort((a, b) =>
    a.ownerAgentId.localeCompare(b.ownerAgentId) || a.createdTick - b.createdTick ||
    a.id.localeCompare(b.id)),
  knowledge: [...knowledgeByOwner.values()].flat().sort((a, b) =>
    a.ownerAgentId.localeCompare(b.ownerAgentId) || a.acquiredTick - b.acquiredTick ||
    a.id.localeCompare(b.id)),
  perceivedPlaceRisks: [...boundedRisks.values()].flatMap((list) => list.sort((a, b) =>
    b.score - a.score || b.lastUpdatedTick - a.lastUpdatedTick ||
    a.placeId.localeCompare(b.placeId)).slice(0, 16)).sort((a, b) =>
    a.ownerAgentId.localeCompare(b.ownerAgentId) || a.placeId.localeCompare(b.placeId)) }
}

/** One exclusive, second-resolved crime pipeline for the encounter-aware mode. */
export function advanceEncounterCrimeV1(state: SimulationStateV5,
  environment: SimulationEnvironmentV5,
  traces: readonly MovementTracePoint[],
  socialPerceptions: readonly DirectedPerceptionSample[] = [],
  sharedCandidates?: readonly SpatialCandidateSample[]): SimulationStateV5 {
  const scenario = environment.config.encounter
  if (!scenario || !state.social || scenario.offenceMode !== 'encounterAware') {
    throw new Error('Encounter crime requires an active encounter-aware scenario')
  }
  const crimeCandidates = (sharedCandidates ?? querySpatialCandidates(environment.world, traces,
    state.accessModes, { radiusMm: 5_000 })).filter((sample) => sample.distanceMm <= 5_000)
  const bySecond = new Map<number, MovementTracePoint[]>()
  for (const trace of traces) {
    const items = bySecond.get(trace.second) ?? []
    items.push(trace); bySecond.set(trace.second, items)
  }
  const bySurfaceResource = new Map<string, typeof environment.world.resources[number][]>()
  for (const resource of environment.world.resources) {
    const list = bySurfaceResource.get(resource.surfaceId) ?? []
    list.push(resource); bySurfaceResource.set(resource.surfaceId, list)
  }
  const profiles = profilesFor(environment)
  const surfaceById = new Map(environment.world.surfaces.map((surface) => [surface.id, surface]))
  const episodes = new Map(state.encounterEpisodes.map((item) =>
    [episodeKey(item.offenderAgentId, item.target, item.id.split('@').at(-1)!), item]))
  const cooldowns = { ...state.offenderCooldowns }
  const resourceCooldowns = { ...state.resourceCooldowns }
  const offences = [...state.offences]
  const newOffences: OffenceV5[] = []
  let opportunitySeconds = 0
  let offenderAttempts = 0
  const decisionTraces = new Map<string, OffenderDecisionTraceV1>()
  const firstPerceivedSecond = new Map<string, number>()
  for (const item of socialPerceptions) if (item.actuallyPerceived) {
    const key = JSON.stringify([item.observerAgentId, item.targetAgentId])
    firstPerceivedSecond.set(key, Math.min(item.second,
      firstPerceivedSecond.get(key) ?? Number.POSITIVE_INFINITY))
  }
  const socialEpisodeByPair = new Map([...state.social.encounters.completed
    .filter((item) => item.endedTick === state.tick), ...state.social.encounters.active]
    .map((item) => [item.pairKey, item]))
  const relationshipByDirection = new Map(state.social.relationships.map((item) =>
    [JSON.stringify([item.ownerAgentId, item.referentAgentId]), item]))
  const evaluateContact = (offender: MovementTracePoint, target: OpportunityTargetV5,
    nearbyIds: readonly string[]) => {
    if (offender.activity === 'atHome' || offender.activity === 'waitingForSpace') return
    const key = episodeKey(offender.agentId, target, offender.surfaceId)
    let episode = episodes.get(key)
    if (!episode || state.tick - episode.lastContactTick >= 2) {
      const id = `${offender.agentId}:${target.kind}:${target.id}:${state.tick}@${offender.surfaceId}`
      episode = { id, offenderAgentId: offender.agentId, target, startedTick: state.tick,
        lastContactTick: state.tick, totalExposureSeconds: 0, accumulatedHazard: 0,
        threshold: unit(`${environment.config.offendingSeed}:encounter-choice:${id}`),
        consumed: false }
    }
    opportunitySeconds += 1
    if (episode.consumed) {
      episodes.set(key, { ...episode, lastContactTick: state.tick }); return
    }
    const nextExposure = episode.totalExposureSeconds + 1
    const guardianCount = Math.max(0, nearbyIds.length -
      (target.kind === 'citizen' && nearbyIds.includes(target.id) ? 1 : 0))
    const pairKey = target.kind === 'citizen' ? JSON.stringify(
      [offender.agentId, target.id].sort()) : null
    const possibleEpisode = pairKey ? socialEpisodeByPair.get(pairKey) : null
    const socialEpisode = possibleEpisode && (possibleEpisode.endedTick === null ||
      possibleEpisode.endedTick > state.tick ||
      (possibleEpisode.endedSecond ?? 0) >= offender.second) &&
      (possibleEpisode.startedTick < state.tick ||
      possibleEpisode.startedTick === state.tick &&
      possibleEpisode.startedSecond <= offender.second) ? possibleEpisode : null
    const offenderPerceivedTarget = target.kind === 'citizen' &&
      (firstPerceivedSecond.get(JSON.stringify([offender.agentId, target.id])) ??
        Number.POSITIVE_INFINITY) <= offender.second
    const relation = target.kind === 'citizen' ? relationshipByDirection.get(
      JSON.stringify([offender.agentId, target.id])) : null
    const directedFamiliarity = offenderPerceivedTarget ? relation?.familiarity ?? 0 : 0
    const risk = Math.min(0.35, guardianCount * 0.08) +
      scenario.socialRestraintWeight * directedFamiliarity
    const snapshot = opportunitySnapshot(environment, offender, state.tick, nearbyIds, risk)
    const choice = decideEncounterAwareOffence({ encounterId: episode.id,
      profile: profiles.get(offender.agentId)!, opportunity: snapshot,
      config: modelConfig(environment), exposureSeconds: nextExposure })
    episode = { ...episode, totalExposureSeconds: nextExposure,
      accumulatedHazard: 1 - choice.probabilities.none, lastContactTick: state.tick }
    let completed = false
    let attempted = false
    if (choice.severity !== null) {
      episode = { ...episode, consumed: true }
      const eligible = (cooldowns[offender.agentId] ?? -1) < state.tick &&
        (target.kind !== 'placeResource' || (resourceCooldowns[target.id] ?? -1) < state.tick)
      if (eligible) {
        attempted = true
        offenderAttempts += 1
        cooldowns[offender.agentId] = state.tick + scenario.offending.cooldownTicks
        if (target.kind === 'placeResource') resourceCooldowns[target.id] = state.tick + 30
        completed = unit(`${environment.config.offendingSeed}:completion:${episode.id}`) <
          scenario.offenceCompletionProbability
        if (completed) {
          const surface = surfaceById.get(offender.surfaceId)
          if (!surface) throw new Error('Crime contact has unknown surface')
          const opportunity = { id: `opportunity:${episode.id}`,
            offenderAgentId: offender.agentId, target, surfaceId: offender.surfaceId,
            levelId: surface.levelId, placeId: offender.placeId, position: offender.position,
            exposureSeconds: nextExposure, guardianship: guardianCount,
            perceivedRisk: snapshot.perceivedRiskScore,
            socialContext: { encounterId: socialEpisode?.id ?? null,
              contactSeconds: nextExposure, offenderPerceivedTarget,
              directedFamiliarity } }
          const id = `offence:${episode.id}`
          const offence: OffenceV5 = { id, incidentId: `incident:${id}`,
            tick: state.tick, second: offender.second, offenderAgentId: offender.agentId,
            target, severity: choice.severity, position: offender.position,
            surfaceId: offender.surfaceId, levelId: surface.levelId,
            placeId: offender.placeId, encounterId: socialEpisode?.id ?? episode.id,
            opportunity }
          offences.push(offence); newOffences.push(offence)
        }
      }
    }
    if (scenario.social.diagnosticTraces) decisionTraces.set(episode.id, {
      episodeId: episode.id, tick: state.tick, second: offender.second,
      offenderAgentId: offender.agentId, target,
      socialEncounterId: socialEpisode?.id ?? null,
      exposureSeconds: nextExposure, perceivedRisk: snapshot.perceivedRiskScore,
      noneProbability: choice.probabilities.none, draw: choice.draw,
      attempted, completed })
    episodes.set(key, episode)
  }
  const candidatesBySecond = new Map<number, SpatialCandidateSample[]>()
  for (const candidate of crimeCandidates) {
    const list = candidatesBySecond.get(candidate.second) ?? []
    list.push(candidate); candidatesBySecond.set(candidate.second, list)
  }
  for (let second = 1; second <= environment.config.logicalSecondsPerTick; second += 1) {
    const points = (bySecond.get(second) ?? []).sort((a, b) => a.agentId.localeCompare(b.agentId))
    const secondCandidates = candidatesBySecond.get(second) ?? []
    const nearby = new Map<string, Set<string>>()
    for (const sample of secondCandidates) {
      for (const [a, b] of [[sample.first, sample.secondTrace],
        [sample.secondTrace, sample.first]] as const) {
        const neighbours = nearby.get(a.agentId) ?? new Set<string>()
        neighbours.add(b.agentId); nearby.set(a.agentId, neighbours)
      }
    }
    for (const sample of secondCandidates.filter((item) => item.distanceMm <= 1_800)) {
      for (const [offender, target] of [[sample.first, sample.secondTrace],
        [sample.secondTrace, sample.first]] as const) {
        if (target.activity === 'atHome') continue
        evaluateContact(offender, { kind: 'citizen', id: target.agentId },
          [...nearby.get(offender.agentId) ?? []].sort())
      }
    }
    for (const offender of points) {
      for (const resource of bySurfaceResource.get(offender.surfaceId) ?? []) {
        if (distance(offender.position, resource.position) > 1_800 ||
          !hasClearSurfaceSegment(environment.world, offender.surfaceId,
            offender.position, resource.position)) continue
        evaluateContact(offender, { kind: 'placeResource', id: resource.id },
          [...nearby.get(offender.agentId) ?? []].sort())
      }
    }
  }
  const witnessConfig = { ...scenario.witness,
    observationSeed: environment.config.observationSeed,
    reportingProbability: environment.config.reportingProbability }
  let social = state.social
  let pending = [...social.pendingWitnessReports]
  let reports = [...state.reports]
  let potentialWitnesses = 0
  let actualWitnesses = 0
  if (newOffences.length > 0) {
    const candidates = querySpatialCandidates(environment.world, traces, state.accessModes,
      { radiusMm: witnessConfig.witnessRadiusMm })
    const attention = Object.fromEntries(createSocialProfilesV1(
      state.citizens.map((citizen) => citizen.id), scenario.social.seed)
      .map((profile) => [profile.agentId, profile.attention]))
    const perceptions = evaluatePerception(candidates, state.citizens,
      scenario.social.seed, state.tick, { ...scenario.perception,
        individualAttention: attention })
    for (const offence of newOffences) {
      const recognition = state.citizens.filter((citizen) => citizen.id !== offence.offenderAgentId)
        .flatMap((citizen) => {
          const known = resolveSubjectiveRecognitionV1(citizen.id,
            offence.offenderAgentId, social.knowledge, scenario.social.seed, state.tick)
          return known ? [known] : []
        })
      const assessments = assessWitnessesForOffence(offence, candidates, perceptions,
        recognition, witnessConfig, attention, bySecond.get(offence.second) ?? [])
      const observations = createWitnessObservations(offence, assessments, witnessConfig)
      const scheduled = scheduleWitnessReports(observations, witnessConfig)
      social = updateSubjectiveWitnessState(social, observations, environment, state.tick)
      social = { ...social, witnessAssessments: [...social.witnessAssessments, ...assessments],
        witnessObservations: [...social.witnessObservations, ...observations],
        reportLinks: [...social.reportLinks, ...scheduled.map((item) => ({
          offenceId: item.offenceId, reportId: item.report.id }))] }
      pending.push(...scheduled)
      potentialWitnesses += assessments.filter((item) => item.potentiallyAbleToObserve).length
      actualWitnesses += observations.length
    }
  }
  pending = pending.filter((item) => {
    if (item.report.availableTick > state.tick) return true
    reports.push(item.report)
    return false
  })
  reports = reports.sort((a, b) => a.availableTick - b.availableTick || a.id.localeCompare(b.id))
  social = { ...social, pendingWitnessReports: pending,
    offenderDecisionTraces: scenario.social.diagnosticTraces ?
      [...social.offenderDecisionTraces, ...decisionTraces.values()]
        .sort((a, b) => a.tick - b.tick || a.second - b.second ||
          a.episodeId.localeCompare(b.episodeId)).slice(-512) : social.offenderDecisionTraces,
    metrics: { ...social.metrics,
      opportunitySeconds: social.metrics.opportunitySeconds + opportunitySeconds,
      offenderAttempts: social.metrics.offenderAttempts + offenderAttempts,
      potentialWitnesses: social.metrics.potentialWitnesses + potentialWitnesses,
      actualWitnesses: social.metrics.actualWitnesses + actualWitnesses } }
  return { ...state, social,
    encounterEpisodes: [...episodes.values()].filter((item) => state.tick - item.lastContactTick < 2)
      .sort((a, b) => a.id.localeCompare(b.id)),
    offenderCooldowns: cooldowns, resourceCooldowns, offences, reports }
}
