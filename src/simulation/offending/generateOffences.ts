import type { CitizenState, StaticCity } from '../types'
import { chooseOffence } from './decision'
import { evaluateOpportunitiesForTick } from './opportunity'
import { validateOffendingConfig } from './profiles'
import type {
  Offence,
  OffenderDynamicState,
  OffenderStepResult,
  OffendingConfig,
  OffendingProfile,
} from './types'

export const OFFENDING_GENERATOR_VERSION = '0.5.0-offender-choice-v1'

/** One decision per citizen from one post-movement world snapshot. */
export function generateOffencesForTick(
  city: StaticCity,
  citizens: readonly CitizenState[],
  profiles: readonly OffendingProfile[],
  previousOffenderStates: readonly OffenderDynamicState[],
  tick: number,
  logicalSecondsPerTick: number,
  config: OffendingConfig,
  runId: string,
): OffenderStepResult {
  validateOffendingConfig(config)
  if (!Number.isSafeInteger(tick) || tick < 1 ||
      !Number.isSafeInteger(logicalSecondsPerTick) || logicalSecondsPerTick <= 0 ||
      !runId || profiles.length !== citizens.length || profiles.length !== previousOffenderStates.length) {
    throw new Error('Invalid offending step input')
  }
  const opportunities = evaluateOpportunitiesForTick(city, citizens, tick, logicalSecondsPerTick, config)
  const opportunityById = new Map(opportunities.map((opportunity) => [opportunity.agentId, opportunity]))
  const citizenIds = new Set(citizens.map((citizen) => citizen.id))
  const stateById = new Map(previousOffenderStates.map((state) => [state.agentId, state]))
  if (citizenIds.size !== citizens.length || stateById.size !== previousOffenderStates.length ||
      new Set(profiles.map((profile) => profile.agentId)).size !== profiles.length) {
    throw new Error('Duplicate offending population identity')
  }
  const orderedProfiles = [...profiles].sort((a, b) => a.agentId.localeCompare(b.agentId))
  const offences: Offence[] = []
  const offenderStates: OffenderDynamicState[] = []
  for (const profile of orderedProfiles) {
    const previous = stateById.get(profile.agentId)
    if (!previous || !citizenIds.has(profile.agentId) ||
        !Number.isSafeInteger(previous.cooldownUntilTick) || previous.cooldownUntilTick < 0) {
      throw new Error(`Invalid offending state for ${profile.agentId}`)
    }
    const opportunity = opportunityById.get(profile.agentId)
    if (!opportunity || tick < previous.cooldownUntilTick) {
      offenderStates.push(previous)
      continue
    }
    const severity = chooseOffence(profile, opportunity, config, logicalSecondsPerTick)
    if (!severity) {
      offenderStates.push(previous)
      continue
    }
    const cooldownUntilTick = tick + config.cooldownTicks + 1
    if (!Number.isSafeInteger(cooldownUntilTick)) throw new Error('Offender cooldown exceeds tick range')
    const id = `offence-${runId}-${tick}-${profile.agentId}`
    offences.push(Object.freeze({
      id,
      incidentId: `incident-${id}`,
      truthEventId: `truth-${id}`,
      occurrenceTick: tick,
      offenderAgentId: profile.agentId,
      type: severity === 'minor' ? 'minorOffence' : 'seriousOffence',
      severity,
      position: Object.freeze({ ...opportunity.position }),
      pedestrianAnchor: opportunity.pedestrianAnchor,
      blockId: opportunity.blockId,
      district: opportunity.district,
      opportunity,
      outcome: 'occurred',
      provenance: Object.freeze({ generatorVersion: OFFENDING_GENERATOR_VERSION }),
    }))
    offenderStates.push(Object.freeze({ agentId: profile.agentId, cooldownUntilTick }))
  }
  return Object.freeze({ offences: Object.freeze(offences), offenderStates: Object.freeze(offenderStates) })
}
