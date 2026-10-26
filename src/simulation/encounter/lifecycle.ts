import { compareEncounterIds, type DirectedPerceptionSample, type EncounterPair,
  type SpatialCandidateSample } from './spatialTypes'

export interface SocialEncounterConfig {
  readonly enterDistanceMm: number
  readonly exitDistanceMm: number
  readonly minContactSeconds: number
  readonly exitGraceSeconds: number
  readonly cooldownSeconds: number
}

export const DEFAULT_SOCIAL_ENCOUNTER_CONFIG: SocialEncounterConfig = Object.freeze({
  enterDistanceMm: 2_400,
  exitDistanceMm: 3_200,
  minContactSeconds: 2,
  exitGraceSeconds: 12,
  cooldownSeconds: 12,
})

export interface PendingSocialEncounter {
  readonly pairKey: string
  readonly participantIds: EncounterPair
  readonly firstContactGlobalSecond: number
  readonly lastContactGlobalSecond: number
  readonly contactSeconds: number
  readonly perceivedSeconds: number
  readonly perceivedBy: readonly string[]
  readonly minDistanceMm: number
  readonly surfaceId: string | null
  readonly placeId: string | null
}

export interface SocialEncounterEpisode {
  readonly id: string
  readonly pairKey: string
  readonly participantIds: EncounterPair
  readonly startedTick: number
  readonly startedSecond: number
  readonly endedTick: number | null
  readonly endedSecond: number | null
  readonly status: 'active' | 'ended'
  readonly contactSeconds: number
  readonly proximityDurationTicks: number
  readonly lastContactGlobalSecond: number
  readonly minDistanceMm: number
  readonly surfaceId: string | null
  readonly placeId: string | null
  readonly perceivedBy: readonly string[]
  readonly interactionIds: readonly string[]
}

export interface SocialEncounterEvent {
  readonly id: string
  readonly type: 'EncounterStarted' | 'EncounterEnded'
  readonly episodeId: string
  readonly tick: number
  readonly second: number
}

export interface SocialEncounterLifecycleState {
  readonly pending: readonly PendingSocialEncounter[]
  readonly active: readonly SocialEncounterEpisode[]
  readonly completed: readonly SocialEncounterEpisode[]
  readonly cooldownUntilSecond: Readonly<Record<string, number>>
}

export const EMPTY_SOCIAL_ENCOUNTERS: SocialEncounterLifecycleState = Object.freeze({
  pending: [], active: [], completed: [], cooldownUntilSecond: {},
})

export function validateSocialEncounterConfig(config: SocialEncounterConfig,
  secondsPerTick: number): void {
  const values = [config.enterDistanceMm, config.exitDistanceMm, config.minContactSeconds,
    config.exitGraceSeconds, config.cooldownSeconds, secondsPerTick]
  if (!values.every((value) => Number.isSafeInteger(value) && value >= 0) ||
    config.enterDistanceMm <= 0 || config.exitDistanceMm < config.enterDistanceMm ||
    config.minContactSeconds <= 0 || config.exitGraceSeconds < config.minContactSeconds ||
    secondsPerTick <= 0) {
    throw new Error('Invalid social encounter configuration')
  }
}

function globalSecond(tick: number, second: number, secondsPerTick: number): number {
  return (tick - 1) * secondsPerTick + second
}

/** Contact episodes are updated once per simulation second; only transitions become events. */
export function updateSocialEncounterLifecycle(previous: SocialEncounterLifecycleState,
  samples: readonly SpatialCandidateSample[], perceptions: readonly DirectedPerceptionSample[],
  tick: number, secondsPerTick: number,
  config: SocialEncounterConfig = DEFAULT_SOCIAL_ENCOUNTER_CONFIG): Readonly<{
    state: SocialEncounterLifecycleState; events: readonly SocialEncounterEvent[]
  }> {
  validateSocialEncounterConfig(config, secondsPerTick)
  if (!Number.isSafeInteger(tick) || tick < 1) throw new Error('Invalid social encounter tick')
  const pending = new Map(previous.pending.map((item) => [item.pairKey, item]))
  const active = new Map(previous.active.map((item) => [item.pairKey, item]))
  const completed = [...previous.completed]
  const cooldownUntilSecond = { ...previous.cooldownUntilSecond }
  const events: SocialEncounterEvent[] = []
  const perceived = new Map<string, string[]>()
  for (const item of perceptions) if (item.actuallyPerceived) {
    const key = JSON.stringify([item.second, item.pairKey])
    const by = perceived.get(key) ?? []
    by.push(item.observerAgentId)
    perceived.set(key, by)
  }
  const sampleByTime = new Map<string, SpatialCandidateSample>()
  for (const sample of samples) {
    if (!Number.isSafeInteger(sample.second) || sample.second < 1 ||
      sample.second > secondsPerTick) throw new Error('Invalid encounter sample second')
    const key = JSON.stringify([sample.second, sample.pairKey])
    if (sampleByTime.has(key)) throw new Error(`Duplicate social encounter sample ${key}`)
    sampleByTime.set(key, sample)
  }
  for (let second = 1; second <= secondsPerTick; second += 1) {
    const currentSecond = globalSecond(tick, second, secondsPerTick)
    for (const [pairKey, item] of active) {
      if (currentSecond - item.lastContactGlobalSecond < config.exitGraceSeconds) continue
      const ended = { ...item, status: 'ended' as const, endedTick: tick, endedSecond: second }
      active.delete(pairKey)
      completed.push(ended)
      cooldownUntilSecond[pairKey] = currentSecond + config.cooldownSeconds
      events.push({ id: `ended:${item.id}`, type: 'EncounterEnded', episodeId: item.id,
        tick, second })
    }
    for (const [pairKey, item] of pending) if (
      currentSecond - item.lastContactGlobalSecond >= config.exitGraceSeconds) pending.delete(pairKey)
    const atSecond = [...samples].filter((sample) => sample.second === second)
      .sort((a, b) => compareEncounterIds(a.pairKey, b.pairKey))
    for (const sample of atSecond) {
      const prior = active.get(sample.pairKey)
      const within = sample.distanceMm <= (prior ? config.exitDistanceMm : config.enterDistanceMm)
      if (!within) continue
      if ((cooldownUntilSecond[sample.pairKey] ?? -1) > currentSecond) continue
      const noticed = [...new Set(perceived.get(JSON.stringify([second, sample.pairKey])) ?? [])]
        .sort(compareEncounterIds)
      if (prior) {
        active.set(sample.pairKey, { ...prior,
          contactSeconds: prior.contactSeconds + 1,
          proximityDurationTicks: Math.floor((prior.lastContactGlobalSecond - 1) / secondsPerTick) < tick - 1 ?
            prior.proximityDurationTicks + 1 : prior.proximityDurationTicks,
          lastContactGlobalSecond: currentSecond,
          minDistanceMm: Math.min(prior.minDistanceMm, sample.distanceMm),
          surfaceId: sample.surfaceId, placeId: sample.placeId,
          perceivedBy: [...new Set([...prior.perceivedBy, ...noticed])].sort(compareEncounterIds) })
      } else {
        const old = pending.get(sample.pairKey)
        const contiguous = old && old.lastContactGlobalSecond === currentSecond - 1
        const first = contiguous ? old.firstContactGlobalSecond : currentSecond
        const count = (contiguous ? old.contactSeconds : 0) + 1
        const perceivedCount = (contiguous ? old.perceivedSeconds : 0) + (noticed.length > 0 ? 1 : 0)
        const perceivedBy = [...new Set([...(contiguous ? old.perceivedBy : []), ...noticed])]
          .sort(compareEncounterIds)
        if (count >= config.minContactSeconds && perceivedCount > 0) {
          const startedTick = Math.floor((first - 1) / secondsPerTick) + 1
          const startedSecond = (first - 1) % secondsPerTick + 1
          const id = `social-encounter:${sample.pairKey}:${first}`
          const episode: SocialEncounterEpisode = { id, pairKey: sample.pairKey,
            participantIds: sample.participantIds, startedTick, startedSecond,
            endedTick: null, endedSecond: null, status: 'active', contactSeconds: count,
            proximityDurationTicks: tick - startedTick + 1,
            lastContactGlobalSecond: currentSecond,
            minDistanceMm: Math.min(contiguous ? old.minDistanceMm : sample.distanceMm,
              sample.distanceMm), surfaceId: sample.surfaceId, placeId: sample.placeId,
            perceivedBy, interactionIds: [] }
          active.set(sample.pairKey, episode)
          pending.delete(sample.pairKey)
          events.push({ id: `started:${id}`, type: 'EncounterStarted', episodeId: id,
            tick, second })
        } else pending.set(sample.pairKey, { pairKey: sample.pairKey,
          participantIds: sample.participantIds, firstContactGlobalSecond: first,
          lastContactGlobalSecond: currentSecond, contactSeconds: count,
          perceivedSeconds: perceivedCount, perceivedBy,
          minDistanceMm: Math.min(contiguous ? old.minDistanceMm : sample.distanceMm,
            sample.distanceMm), surfaceId: sample.surfaceId, placeId: sample.placeId })
      }
    }
  }
  return { state: { pending: [...pending.values()].sort((a, b) => compareEncounterIds(a.pairKey, b.pairKey)),
    active: [...active.values()].sort((a, b) => compareEncounterIds(a.pairKey, b.pairKey)),
    completed, cooldownUntilSecond },
  events: events.sort((a, b) => a.second - b.second ||
    compareEncounterIds(a.episodeId, b.episodeId)) }
}
