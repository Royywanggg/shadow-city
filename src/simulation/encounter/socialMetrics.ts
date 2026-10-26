import { createCitizenIdentity } from '../population'
import type { SimulationConfigV5, SimulationStateV5 } from '../v5Types'
import { relationshipCategoryV1 } from './relationships'

export interface MetricCountV1 {
  readonly key: string
  readonly count: number
}

export interface PlaceMetricCountV1 {
  readonly placeId: string | null
  readonly count: number
}

export interface SocialMetricsSummaryV1 {
  readonly interval: Readonly<{
    /** From 0 for a cumulative summary, or the Tick after a supplied boundary state. */
    fromTick: number
    readonly toTick: number
    readonly population: number
    readonly simulationSeed: string
    readonly socialSeed: string
  }>
  readonly exposure: Readonly<{
    /** Canonical unordered pair-seconds, not unique pairs. */
    candidatePairSeconds: number
    perceivedPairSeconds: number
    encounterEpisodes: number
    uniqueEncounterPairs: number
    uniqueContactsPerAgent: readonly Readonly<{ agentId: string; count: number }>[]
    /** Fully observed started-and-ended cohort; active episodes are censored. */
    completedEpisodeDurationsSeconds: readonly MetricCountV1[]
    rightCensoredEpisodes: number
    encountersByLastRecordedPlace: readonly PlaceMetricCountV1[]
    encountersByStartHour: readonly MetricCountV1[]
    repeatedPairsWithinInterval: number
    additionalEpisodesForRepeatedPairs: number
  }>
  readonly interactions: Readonly<{
    decisionEvaluations: number
    attempts: number
    accepted: number
    completed: number
    interrupted: number
    acceptedByType: readonly MetricCountV1[]
    completedDurationTicks: readonly MetricCountV1[]
  }>
  readonly network: Readonly<{
    /** Current end-Tick owner-to-referent states, including only live residents. */
    directedRelations: number
    familiarDirectedTies: number
    knownContactDirectedTies: number
    newlyFamiliarDirectedTies: number
    possibleDirectedTies: number
    knownContactDensity: number | null
    /** All possible directed ties; absent relations count in the zero bucket. */
    familiarityDistribution: readonly MetricCountV1[]
  }>
  readonly perception: Readonly<{
    perceivedEncounterEpisodes: number
    mutuallyPerceivedEncounterEpisodes: number
    /** Current bounded knowledge records, not historical recognition events. */
    recognizedDirectedContactsCurrent: number
    retainedMemoriesCurrent: number
    retainedKnowledgeCurrent: number
    potentialWitnessAssessments: number
    actualWitnessObservations: number
    victimObservations: number
    /** Correct means a synthetic display-name string match, not verified unique identity. */
    identification: Readonly<{ correct: number; incorrect: number; unknown: number }>
  }>
  readonly crime: Readonly<{
    opportunitySeconds: number
    offenderAttempts: number
    completedOffences: number
    offencesPer1000OpportunitySeconds: number | null
    /** Full opportunity episode history is not retained by v5. */
    opportunityEpisodeConversion: null
    citizenTargetOffences: number
    witnessedOffences: number
    unwitnessedOffences: number
    reportedOffences: number
    unreportedOffences: number
    deliveredReports: number
    offencesByPlace: readonly PlaceMetricCountV1[]
  }>
}

function countBy(values: readonly string[]): MetricCountV1[] {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({ key, count }))
}

function countPlaces(values: readonly (string | null)[]): readonly PlaceMetricCountV1[] {
  const counts = new Map<string | null, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts].sort(([a], [b]) => (a ?? '').localeCompare(b ?? ''))
    .map(([placeId, count]) => ({ placeId, count }))
}

function difference(end: number, start: number): number {
  const value = end - start
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Social metric counter decreased')
  return value
}

/** Pure state-derived summary. A prior state denotes the exclusive interval boundary. */
export function summarizeSocialMetricsV1(end: SimulationStateV5,
  config: SimulationConfigV5, prior?: SimulationStateV5): SocialMetricsSummaryV1 {
  if (!end.social || !config.encounter || !Number.isSafeInteger(end.tick) || end.tick < 0 ||
    prior && (!prior.social || prior.fingerprint !== end.fingerprint ||
      !Number.isSafeInteger(prior.tick) || prior.tick > end.tick)) {
    throw new Error('Social metrics require compatible encounter states')
  }
  const fromTick = prior ? prior.tick + 1 : 0
  const within = (tick: number) => tick >= fromTick && tick <= end.tick
  const social = end.social
  const firstMetrics = prior?.social?.metrics
  const metricDelta = (key: keyof typeof social.metrics) =>
    difference(social.metrics[key], firstMetrics?.[key] ?? 0)
  const citizens = end.citizens.map((item) => item.id).sort()
  const citizenSet = new Set(citizens)
  if (citizenSet.size !== citizens.length) throw new Error('Duplicate resident in social metrics')
  const possibleDirectedTies = citizens.length * Math.max(0, citizens.length - 1)
  const episodes = [...social.encounters.active, ...social.encounters.completed]
    .filter((item) => within(item.startedTick))
  if (new Set(episodes.map((item) => item.id)).size !== episodes.length) {
    throw new Error('Duplicate encounter episode in social metrics')
  }
  const pairCounts = new Map<string, number>()
  const contacts = new Map(citizens.map((id) => [id, new Set<string>()]))
  for (const episode of episodes) {
    pairCounts.set(episode.pairKey, (pairCounts.get(episode.pairKey) ?? 0) + 1)
    const [first, second] = episode.participantIds
    contacts.get(first)?.add(second)
    contacts.get(second)?.add(first)
  }
  const hour = (tick: number) => String(Math.floor((config.startHour * 3600 +
    Math.max(0, tick - 1) * config.logicalSecondsPerTick) / 3600) % 24)
    .padStart(2, '0')
  const interactions = social.interactions
  const accepted = interactions.filter((item) => within(item.decisionTick))
  const completed = interactions.filter((item) => item.status === 'completed' &&
    item.endTick !== null && within(item.endTick))
  const interrupted = interactions.filter((item) => item.status === 'interrupted' &&
    item.endTick !== null && within(item.endTick))
  const relationships = social.relationships.filter((item) =>
    citizenSet.has(item.ownerAgentId) && citizenSet.has(item.referentAgentId) &&
    item.ownerAgentId !== item.referentAgentId)
  if (new Set(relationships.map((item) => JSON.stringify([
    item.ownerAgentId, item.referentAgentId]))).size !== relationships.length) {
    throw new Error('Duplicate directed relationship in social metrics')
  }
  const priorFamiliar = new Set(prior?.social?.relationships.filter((item) =>
    item.familiarity >= 0.25).map((item) =>
    JSON.stringify([item.ownerAgentId, item.referentAgentId])) ?? [])
  const familiar = relationships.filter((item) => item.familiarity >= 0.25)
  const known = relationships.filter((item) => relationshipCategoryV1(item) === 'knownContact')
  const familiarityBuckets = new Map<string, number>([
    ['zero', Math.max(0, possibleDirectedTies - relationships.length)],
    ['weak (0–<0.25)', 0], ['familiar (0.25–<0.50)', 0],
    ['strong (0.50–<0.75)', 0], ['very strong (0.75–1)', 0],
  ])
  for (const relation of relationships) {
    const f = relation.familiarity
    const bucket = f <= 0 ? 'zero' : f < 0.25 ? 'weak (0–<0.25)' :
      f < 0.5 ? 'familiar (0.25–<0.50)' : f < 0.75 ?
        'strong (0.50–<0.75)' : 'very strong (0.75–1)'
    familiarityBuckets.set(bucket, familiarityBuckets.get(bucket)! + 1)
  }
  const offences = end.offences.filter((item) => within(item.tick))
  const offencesById = new Map(end.offences.map((item) => [item.id, item]))
  const observations = social.witnessObservations.filter((item) => within(item.observedTick))
  const identification = { correct: 0, incorrect: 0, unknown: 0 }
  for (const observation of observations) {
    const truth = offencesById.get(observation.offenceId)
    if (!truth) throw new Error('Witness observation has no truth offence')
    if (!observation.believedIdentity?.trim()) identification.unknown += 1
    else if (observation.believedIdentity ===
      createCitizenIdentity(truth.offenderAgentId).displayName) identification.correct += 1
    else identification.incorrect += 1
  }
  const assessmentOffences = new Set(offences.map((item) => item.id))
  const delivered = new Set(end.reports.filter((report) => report.availableTick <= end.tick)
    .map((report) => report.id))
  const reportedOffenceIds = new Set(social.reportLinks.filter((link) =>
    delivered.has(link.reportId)).map((link) => link.offenceId))
  const witnessedOffenceIds = new Set(social.witnessObservations.filter((item) =>
    item.source === 'witness').map((item) => item.offenceId))
  const reportedOffences = offences.filter((item) => reportedOffenceIds.has(item.id)).length
  const witnessedOffences = offences.filter((item) => witnessedOffenceIds.has(item.id)).length
  const opportunitySeconds = metricDelta('opportunitySeconds')
  return {
    interval: { fromTick, toTick: end.tick, population: citizens.length,
      simulationSeed: config.simulationSeed, socialSeed: config.encounter.social.seed },
    exposure: {
      candidatePairSeconds: metricDelta('candidatePairSeconds'),
      perceivedPairSeconds: metricDelta('perceivedPairSeconds'),
      encounterEpisodes: episodes.length,
      uniqueEncounterPairs: pairCounts.size,
      uniqueContactsPerAgent: citizens.map((agentId) =>
        ({ agentId, count: contacts.get(agentId)?.size ?? 0 })),
      completedEpisodeDurationsSeconds: countBy(episodes.filter((item) =>
        item.status === 'ended').map((item) => String(item.contactSeconds)))
        .sort((a, b) => Number(a.key) - Number(b.key)),
      rightCensoredEpisodes: episodes.filter((item) => item.status === 'active').length,
      encountersByLastRecordedPlace: countPlaces(episodes.map((item) => item.placeId)),
      encountersByStartHour: countBy(episodes.map((item) => hour(item.startedTick))),
      repeatedPairsWithinInterval: [...pairCounts.values()].filter((count) => count >= 2).length,
      additionalEpisodesForRepeatedPairs: [...pairCounts.values()]
        .reduce((sum, count) => sum + Math.max(0, count - 1), 0),
    },
    interactions: {
      decisionEvaluations: social.interactionDecisions.filter((item) => within(item.tick)).length,
      attempts: social.interactionEvents.filter((item) => item.type === 'Attempted' &&
        within(item.tick)).length,
      accepted: accepted.length, completed: completed.length, interrupted: interrupted.length,
      acceptedByType: countBy(accepted.map((item) => item.type)),
      completedDurationTicks: countBy(completed.map((item) => String(item.type === 'greeting' ?
        0 : Math.max(0, item.plannedEndTick - item.startTick))))
        .sort((a, b) => Number(a.key) - Number(b.key)),
    },
    network: {
      directedRelations: relationships.length,
      familiarDirectedTies: familiar.length,
      knownContactDirectedTies: known.length,
      newlyFamiliarDirectedTies: familiar.filter((item) => !priorFamiliar.has(
        JSON.stringify([item.ownerAgentId, item.referentAgentId]))).length,
      possibleDirectedTies,
      knownContactDensity: possibleDirectedTies === 0 ? null : known.length / possibleDirectedTies,
      familiarityDistribution: [...familiarityBuckets]
        .map(([key, count]) => ({ key, count })),
    },
    perception: {
      perceivedEncounterEpisodes: episodes.filter((item) => item.perceivedBy.length > 0).length,
      mutuallyPerceivedEncounterEpisodes: episodes.filter((item) =>
        item.perceivedBy.length >= 2).length,
      recognizedDirectedContactsCurrent: new Set(social.knowledge.filter((item) =>
        item.kind === 'visualRecognition' && item.confidence > 0 && item.subjectToken !== null)
        .map((item) => JSON.stringify([item.ownerAgentId, item.subjectToken]))).size,
      retainedMemoriesCurrent: social.memories.length,
      retainedKnowledgeCurrent: social.knowledge.length,
      potentialWitnessAssessments: social.witnessAssessments.filter((item) =>
        item.source === 'witness' && item.potentiallyAbleToObserve &&
        assessmentOffences.has(item.offenceId)).length,
      actualWitnessObservations: observations.filter((item) => item.source === 'witness').length,
      victimObservations: observations.filter((item) => item.source === 'victim').length,
      identification,
    },
    crime: {
      opportunitySeconds, offenderAttempts: metricDelta('offenderAttempts'),
      completedOffences: offences.length,
      offencesPer1000OpportunitySeconds: opportunitySeconds === 0 ? null :
        offences.length * 1000 / opportunitySeconds,
      opportunityEpisodeConversion: null,
      citizenTargetOffences: offences.filter((item) => item.target.kind === 'citizen').length,
      witnessedOffences, unwitnessedOffences: offences.length - witnessedOffences,
      reportedOffences, unreportedOffences: offences.length - reportedOffences,
      deliveredReports: end.reports.filter((report) => within(report.availableTick)).length,
      offencesByPlace: countPlaces(offences.map((item) => item.placeId)),
    },
  }
}
