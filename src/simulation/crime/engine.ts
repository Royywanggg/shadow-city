import { hashSeed, nextRandom } from '../rng'
import type { OffendingProfile, OpportunitySnapshot } from '../offending/types'
import type { MovementTracePoint, OffenceV5, SimulationEnvironmentV5,
  SimulationStateV5 } from '../v5Types'
import type { SpatialCandidateSample } from '../encounter/spatialTypes'
import type { CrimeAttemptV1, OpportunityEpisodeV1, PortableItemV1,
  TypedCrimeConfigV1, TypedCrimeStateV1, TypedOffenceKind,
  VictimAwarenessV1 } from './types'

/** A keyed stream with an avalanche step avoids FNV's adjacent-ID correlations. */
export const typedCrimeUnit = (key: string): number =>
  (Math.floor(nextRandom(hashSeed(key)).value * 0x1_0000_0000) + 0.5) /
  0x1_0000_0000
const unit = typedCrimeUnit

export interface TypedCrimeTimingSampleV1 {
  readonly tick: number
  readonly opportunityAndHazardMs: number
  readonly actionResolutionMs: number
  readonly itemUpdateMs: number
  readonly awarenessUpdateMs: number
  readonly ledgerCommitMs: number
  readonly episodeCount: number
  readonly attemptCount: number
}

let timingObserver: ((sample: TypedCrimeTimingSampleV1) => void) | null = null
export function setTypedCrimeTimingObserverV1(
  observer: ((sample: TypedCrimeTimingSampleV1) => void) | null): void {
  timingObserver = observer
}

export function validateTypedCrimeConfigV1(config: TypedCrimeConfigV1): void {
  if (config.version !== 'typed-crime-v1' ||
    ![config.theftHazardPerHour, config.assaultHazardPerHour].every((value) =>
      Number.isFinite(value) && value >= 0 && value <= 100) ||
    ![config.portableItemProbability, config.theftCompletionProbability,
      config.assaultCompletionProbability].every((value) =>
      Number.isFinite(value) && value >= 0 && value <= 1) ||
    !Number.isSafeInteger(config.maxRecentEpisodes) || config.maxRecentEpisodes < 1) {
    throw new Error('Invalid typed crime configuration')
  }
}

export function createInitialTypedCrimeStateV1(
  environment: SimulationEnvironmentV5): TypedCrimeStateV1 {
  const config = environment.config.typedCrime!
  const items: PortableItemV1[] = environment.profiles.filter((profile) =>
    unit(`${environment.config.simulationSeed}:portable-item:${profile.id}`) <
    config.portableItemProbability).map((profile) => ({
    id: `item:phone:${profile.id}`, type: 'phone', ownerAgentId: profile.id,
    possessorAgentId: profile.id, accessible: true }))
  return { version: 'typed-crime-v1', items, activeEpisodes: [], recentEpisodes: [],
    archivedThroughTick: null, attempts: [], awareness: [], eligibleExposureSeconds: 0,
    eligibleExposureSecondsByType: { personTheft: 0, physicalAssault: 0 },
    eligibleExposureSecondsByPlace: {},
    ineligibleContactSeconds: { crossSurface: 0, unavailableAgent: 0,
      noPortableItem: 0 } }
}

export function cumulativeAttemptProbability(ratePerSecond: number,
  exposureSeconds: number): number {
  if (!Number.isFinite(ratePerSecond) || ratePerSecond < 0 ||
    !Number.isFinite(exposureSeconds) || exposureSeconds < 0) {
    throw new Error('Invalid cumulative hazard input')
  }
  return -Math.expm1(-ratePerSecond * exposureSeconds)
}

export interface TypedCrimeStepResult {
  readonly state: SimulationStateV5
  readonly newOffences: readonly OffenceV5[]
  readonly acquiredAwareness: readonly VictimAwarenessV1[]
  readonly opportunitySeconds: number
  readonly offenderAttempts: number
}

/** Contact is sampled once per physical second; candidate order cannot alter a keyed draw. */
export function advanceTypedCrimeV1(state: SimulationStateV5,
  environment: SimulationEnvironmentV5,
  samples: readonly SpatialCandidateSample[],
  profiles: ReadonlyMap<string, OffendingProfile>,
  snapshotFor: (actor: MovementTracePoint, nearbyIds: readonly string[],
    risk: number) => OpportunitySnapshot): TypedCrimeStepResult {
  const config = environment.config.typedCrime
  const crime = state.typedCrime
  if (!config || !crime) throw new Error('Typed crime state and config must agree')
  const started = timingObserver ? performance.now() : 0
  const itemById = new Map(crime.items.map((item) => [item.id, item]))
  const heldBy = new Map(crime.items.filter((item) => item.accessible).map((item) =>
    [item.possessorAgentId, item]))
  const surfaceById = new Map(environment.world.surfaces.map((item) => [item.id, item]))
  const citizenById = new Map(state.citizens.map((citizen) => [citizen.id, citizen]))
  const lifeById = new Map(state.life?.people.map((person) =>
    [person.agentId, person]) ?? [])
  const availableAgents = new Set(state.citizens.filter((citizen) => {
    const life = lifeById.get(citizen.id)
    return !life || life.lifeStatus === 'alive' &&
      life.functionalStatus !== 'incapacitated'
  }).map((citizen) => citizen.id))
  const episodeKey = (item: OpportunityEpisodeV1) =>
    `episode:${item.actorAgentId}:${item.victimAgentId}:${item.offenceType}:` +
      `${item.itemId ?? 'person'}:${item.surfaceId}`
  const episodes = new Map(crime.activeEpisodes.map((item) => [episodeKey(item), item]))
  const completed: OpportunityEpisodeV1[] = []
  const attempts: CrimeAttemptV1[] = []
  const offences: OffenceV5[] = []
  const awareness: VictimAwarenessV1[] = []
  const exposureByType = { ...crime.eligibleExposureSecondsByType }
  const exposureByPlace = { ...crime.eligibleExposureSecondsByPlace }
  const ineligible = { ...crime.ineligibleContactSeconds }
  const cooldowns = { ...state.offenderCooldowns }
  const nearbyBySecond = new Map<number, Map<string, Set<string>>>()
  for (const sample of samples) {
    const map = nearbyBySecond.get(sample.second) ?? new Map<string, Set<string>>()
    for (const [a, b] of [[sample.first.agentId, sample.secondTrace.agentId],
      [sample.secondTrace.agentId, sample.first.agentId]]) {
      const group = map.get(a) ?? new Set<string>()
      group.add(b); map.set(a, group)
    }
    nearbyBySecond.set(sample.second, map)
  }
  type Crossing = { episode: OpportunityEpisodeV1; actor: MovementTracePoint;
    victim: MovementTracePoint; second: number; fraction: number;
    snapshot: OpportunitySnapshot }
  const crossings: Crossing[] = []
  let opportunitySeconds = 0
  for (const sample of samples) if (sample.distanceMm <= 1_800 &&
    sample.relation !== 'sameSurface') ineligible.crossSurface += 2
  const orderedSamples = samples.filter((sample) => sample.relation === 'sameSurface' &&
    sample.distanceMm <= 1_800).sort((a, b) => a.second - b.second ||
    a.pairKey.localeCompare(b.pairKey))
  for (const sample of orderedSamples) {
    for (const [actor, victim] of [[sample.first, sample.secondTrace],
      [sample.secondTrace, sample.first]] as const) {
      if (actor.agentId === victim.agentId || actor.surfaceId !== victim.surfaceId) continue
      if (!availableAgents.has(actor.agentId) || !availableAgents.has(victim.agentId) ||
        actor.activity === 'atHome' || actor.activity === 'waitingForSpace' ||
        victim.activity === 'atHome' || victim.activity === 'deceased') {
        ineligible.unavailableAgent += 1
        continue
      }
      const nearby = [...nearbyBySecond.get(sample.second)?.get(actor.agentId) ?? []].sort()
      const guardianship = Math.max(0, nearby.length - 1)
      const risk = Math.min(0.35, guardianship * 0.08)
      const snapshot = snapshotFor(actor, nearby, risk)
      const victimItem = heldBy.get(victim.agentId)
      if (!victimItem) ineligible.noPortableItem += 1
      const possibilities: readonly Readonly<{ type: TypedOffenceKind; itemId: string | null }>[] = [
        ...(victimItem ? [{ type: 'personTheft' as const, itemId: victimItem.id }] : []),
        { type: 'physicalAssault', itemId: null },
      ]
      for (const possibility of possibilities) {
        const id = `episode:${actor.agentId}:${victim.agentId}:${possibility.type}:` +
          `${possibility.itemId ?? 'person'}:${actor.surfaceId}`
        let episode = episodes.get(id)
        if (!episode || state.tick - episode.lastContactTick >= 2) {
          if (episode) completed.push({ ...episode, status: episode.status === 'attempted' ?
            'attempted' : 'ended', endTick: episode.endTick ?? episode.lastContactTick,
          endReason: episode.endReason ?? 'contactEnded' })
          const startId = `${id}:${state.tick}`
          episode = { id: startId, actorAgentId: actor.agentId,
            victimAgentId: victim.agentId, itemId: possibility.itemId,
            offenceType: possibility.type, placeId: actor.placeId,
            surfaceId: actor.surfaceId, levelId: surfaceById.get(actor.surfaceId)!.levelId,
            position: actor.position,
            startTick: state.tick, endTick: null, lastContactTick: state.tick,
            exposureSeconds: 0, accumulatedHazard: 0,
            threshold: -Math.log(unit(`${environment.config.offendingSeed}:threshold:${startId}`)),
            lastRatePerHour: 0, lastPerceivedRisk: 0, guardianship: 0,
            status: 'active', endReason: null }
          episodes.delete(id)
        }
        if (episode.status !== 'active') {
          episodes.set(id, { ...episode, lastContactTick: state.tick }); continue
        }
        const profile = profiles.get(actor.agentId)!
        const severityKey = possibility.type === 'personTheft' ? 'minor' : 'serious'
        const base = possibility.type === 'personTheft' ?
          config.theftHazardPerHour : config.assaultHazardPerHour
        const exposure = snapshot.exposureBySeverity[severityKey]
        const ratePerHour = Math.min(100, base * Math.exp(profile.logPropensity[severityKey]) *
          exposure * Math.exp(-profile.riskSensitivity * snapshot.perceivedRiskScore) *
          (1 + profile.rewardSensitivity * snapshot.rewardScore * 0.2))
        const previousHazard = episode.accumulatedHazard
        const increment = ratePerHour / 3_600
        episode = { ...episode, lastContactTick: state.tick, position: actor.position,
          exposureSeconds: episode.exposureSeconds + 1,
          accumulatedHazard: previousHazard + increment,
          lastRatePerHour: ratePerHour,
          lastPerceivedRisk: snapshot.perceivedRiskScore, guardianship }
        opportunitySeconds += 1
        exposureByType[possibility.type] += 1
        const exposurePlace = actor.placeId ?? `surface:${actor.surfaceId}`
        exposureByPlace[exposurePlace] = (exposureByPlace[exposurePlace] ?? 0) + 1
        if (increment > 0 && previousHazard < episode.threshold &&
          episode.accumulatedHazard >= episode.threshold) {
          crossings.push({ episode, actor, victim, second: sample.second,
            fraction: (episode.threshold - previousHazard) / increment, snapshot })
        }
        episodes.set(id, episode)
      }
    }
  }
  crossings.sort((a, b) => a.second - b.second || a.fraction - b.fraction ||
    a.episode.id.localeCompare(b.episode.id))
  const attemptedActors = new Set<string>()
  const hazardFinished = timingObserver ? performance.now() : 0
  let itemUpdateMs = 0
  for (const crossing of crossings) {
    const episode = crossing.episode
    const key = `episode:${episode.actorAgentId}:${episode.victimAgentId}:` +
      `${episode.offenceType}:${episode.itemId ?? 'person'}:${episode.surfaceId}`
    const current = episodes.get(key)!
    if (current.status !== 'active') continue
    if (attemptedActors.has(episode.actorAgentId) ||
      (cooldowns[episode.actorAgentId] ?? -1) >= state.tick) {
      episodes.set(key, { ...current, status: 'ended', endTick: state.tick,
        endReason: attemptedActors.has(episode.actorAgentId) ?
          'competingAttempt' : 'cooldown' })
      continue
    }
    const victimAlive = availableAgents.has(episode.victimAgentId)
    const actorAlive = availableAgents.has(episode.actorAgentId)
    const item = episode.itemId ? itemById.get(episode.itemId) : null
    const valid = actorAlive && victimAlive && crossing.actor.surfaceId ===
      crossing.victim.surfaceId && (episode.offenceType !== 'personTheft' ||
        item?.possessorAgentId === episode.victimAgentId && item.accessible)
    const attemptId = `attempt:${episode.id}`
    const completion = episode.offenceType === 'personTheft' ?
      config.theftCompletionProbability : config.assaultCompletionProbability
    const outcome = !valid ? 'invalidated' :
      unit(`${environment.config.offendingSeed}:completion:${attemptId}`) < completion ?
        'completed' : 'failed'
    const offenceId = outcome === 'completed' ? `offence:${attemptId}` : null
    attempts.push({ id: attemptId, episodeId: episode.id, offenceId,
      tick: state.tick, second: crossing.second,
      actorAgentId: episode.actorAgentId, victimAgentId: episode.victimAgentId,
      itemId: episode.itemId, type: episode.offenceType, outcome,
      reason: !valid ? 'action preconditions changed' :
        outcome === 'failed' ? 'attempt did not complete' : 'action completed',
      position: crossing.actor.position, surfaceId: episode.surfaceId,
      placeId: crossing.actor.placeId })
    episodes.set(key, { ...current, status: 'attempted', endTick: state.tick,
      endReason: 'attempted' })
    attemptedActors.add(episode.actorAgentId)
    cooldowns[episode.actorAgentId] = state.tick +
      environment.config.encounter!.offending.cooldownTicks
    if (outcome !== 'completed' || !offenceId) continue
    if (episode.offenceType === 'personTheft' && item) {
      const itemStarted = timingObserver ? performance.now() : 0
      const transferred = { ...item, possessorAgentId: episode.actorAgentId }
      itemById.set(item.id, transferred)
      heldBy.delete(episode.victimAgentId)
      heldBy.set(episode.actorAgentId, transferred)
      if (timingObserver) itemUpdateMs += performance.now() - itemStarted
      const draw = unit(`${environment.config.observationSeed}:self-check:${offenceId}`)
      const delay = draw < 0.2 ? 0 : 1 + Math.floor(draw * 24)
      awareness.push({ id: `awareness:${offenceId}:${episode.victimAgentId}`,
        offenceId, victimAgentId: episode.victimAgentId, itemId: item.id,
        kind: 'missingProperty', dueTick: state.tick + delay,
        acquiredTick: null, source: 'selfCheck' })
    }
    const target = { kind: 'citizen' as const, id: episode.victimAgentId }
    const severity = episode.offenceType === 'physicalAssault' ? 'serious' : 'minor'
    offences.push({ id: offenceId, incidentId: `incident:${offenceId}`,
      tick: state.tick, second: crossing.second,
      offenderAgentId: episode.actorAgentId, target, severity,
      offenceType: episode.offenceType, attemptId,
      ...(episode.itemId ? { itemId: episode.itemId } : {}),
      mechanism: episode.offenceType === 'physicalAssault' ?
        'physicalAssault' : 'nonPhysical',
      position: crossing.actor.position, surfaceId: episode.surfaceId,
      levelId: episode.levelId, placeId: crossing.actor.placeId,
      encounterId: episode.id,
      opportunity: { id: `opportunity:${episode.id}`,
        offenderAgentId: episode.actorAgentId, target,
        surfaceId: episode.surfaceId, levelId: episode.levelId,
        placeId: crossing.actor.placeId, position: crossing.actor.position,
        exposureSeconds: current.exposureSeconds,
        perceivedRisk: crossing.snapshot.perceivedRiskScore,
        guardianship: current.guardianship } })
  }
  for (const [key, episode] of episodes) {
    const actor = citizenById.get(episode.actorAgentId)
    const victim = citizenById.get(episode.victimAgentId)
    if (episode.status === 'active' &&
      (!availableAgents.has(episode.actorAgentId) ||
        !availableAgents.has(episode.victimAgentId))) {
      completed.push({ ...episode, status: 'ended', endTick: state.tick,
        endReason: 'actorUnavailable' })
      episodes.delete(key)
      continue
    }
    if (episode.status === 'active' && (actor?.surfaceId !== episode.surfaceId ||
      victim?.surfaceId !== episode.surfaceId)) {
      completed.push({ ...episode, status: 'ended', endTick: state.tick,
        endReason: 'surfaceChanged' })
      episodes.delete(key)
      continue
    }
    if (episode.status === 'active' && episode.itemId &&
      itemById.get(episode.itemId)?.possessorAgentId !== episode.victimAgentId) {
      completed.push({ ...episode, status: 'ended', endTick: state.tick,
        endReason: 'itemUnavailable' })
      episodes.delete(key)
      continue
    }
    if (state.tick - episode.lastContactTick < 2) continue
    completed.push({ ...episode, status: episode.status === 'attempted' ?
      'attempted' : 'ended', endTick: episode.endTick ?? episode.lastContactTick,
    endReason: episode.endReason ?? 'contactEnded' })
    episodes.delete(key)
  }
  const actionsFinished = timingObserver ? performance.now() : 0
  const acquiredAwareness: VictimAwarenessV1[] = []
  const allAwareness = [...crime.awareness, ...awareness].map((item) => {
    if (item.acquiredTick !== null || item.dueTick > state.tick) return item
    if (!availableAgents.has(item.victimAgentId)) return item
    const acquired = { ...item, acquiredTick: state.tick }
    acquiredAwareness.push(acquired)
    return acquired
  })
  const awarenessFinished = timingObserver ? performance.now() : 0
  const allRecent = [...crime.recentEpisodes, ...completed].sort((a, b) =>
    (a.endTick ?? 0) - (b.endTick ?? 0) || a.id.localeCompare(b.id))
  const overflow = Math.max(0, allRecent.length - config.maxRecentEpisodes)
  const archivedThroughTick = overflow ? allRecent[overflow - 1].endTick :
    crime.archivedThroughTick
  const nextCrime: TypedCrimeStateV1 = { ...crime,
    items: crime.items.map((item) => itemById.get(item.id)!),
    activeEpisodes: [...episodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    recentEpisodes: allRecent.slice(overflow), archivedThroughTick,
    attempts: [...crime.attempts, ...attempts], awareness: allAwareness,
    eligibleExposureSeconds: crime.eligibleExposureSeconds + opportunitySeconds,
    eligibleExposureSecondsByType: exposureByType,
    eligibleExposureSecondsByPlace: exposureByPlace,
    ineligibleContactSeconds: ineligible }
  if (timingObserver) timingObserver({ tick: state.tick,
    opportunityAndHazardMs: hazardFinished - started,
    actionResolutionMs: actionsFinished - hazardFinished,
    itemUpdateMs,
    awarenessUpdateMs: awarenessFinished - actionsFinished,
    ledgerCommitMs: performance.now() - awarenessFinished,
    episodeCount: nextCrime.activeEpisodes.length,
    attemptCount: attempts.length })
  return { state: { ...state, typedCrime: nextCrime,
    offences: [...state.offences, ...offences], offenderCooldowns: cooldowns },
  newOffences: offences, acquiredAwareness, opportunitySeconds,
  offenderAttempts: attempts.filter((item) => item.outcome !== 'invalidated').length }
}
