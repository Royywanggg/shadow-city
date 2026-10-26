import { createInitialCitizenState, stepCitizenSimulation } from './engineV2'
import { createSimulationEnvironment } from './environment'
import {
  canonicalOffendingConfig,
  createInitialOffenderStates,
  createOffendingProfiles,
  createOffendingRunId,
  generateOffencesForTick,
} from './offending'
import { createInitialReportingStateV4, stepReportingV4, validateObservationConfigV4 } from './observation/v4'
import type { CommandEnvelope, SimulationEnvironment, StaticCity } from './types'
import type { ObservationConfigV4, ReportableOccurrenceV4, SimulationConfigV4, SimulationStateV4, SimulationTransitionV4, OffendingProfile } from './v4Types'

export interface SimulationEnvironmentV4 {
  readonly city: StaticCity
  readonly config: SimulationConfigV4
  readonly citizen: SimulationEnvironment
  readonly profiles: readonly OffendingProfile[]
  readonly worldFingerprint: string
  readonly scenarioFingerprint: string
  readonly worldRunId: string
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function canonicalObservationConfig(config: ObservationConfigV4): ObservationConfigV4 {
  validateObservationConfigV4(config)
  return {
    version: config.version,
    observationSeed: config.observationSeed,
    globalProbability: config.globalProbability,
    severityExponent: { minor: config.severityExponent.minor, serious: config.severityExponent.serious },
    minDelayTicks: config.minDelayTicks,
    maxDelayTicks: config.maxDelayTicks,
    ingestDelayTicks: config.ingestDelayTicks,
    identity: {
      noticeProbability: config.identity.noticeProbability,
      recognitionProbability: config.identity.recognitionProbability,
      accuracyProbability: config.identity.accuracyProbability,
    },
  }
}

export function createSimulationEnvironmentV4(city: StaticCity, config: SimulationConfigV4): SimulationEnvironmentV4 {
  if (config.version !== 4) throw new Error('Invalid v4 simulation configuration')
  const capturedConfig = deepFreeze({
    version: 4 as const,
    citizen: { ...config.citizen },
    offending: canonicalOffendingConfig(config.offending),
    observation: canonicalObservationConfig(config.observation),
  }) satisfies SimulationConfigV4
  const citizen = createSimulationEnvironment(city, capturedConfig.citizen)
  const profiles = Object.freeze(createOffendingProfiles(citizen.profiles, capturedConfig.offending))
  const worldFingerprint = JSON.stringify({
    version: 4,
    citizenFingerprint: citizen.fingerprint,
    offending: capturedConfig.offending,
  })
  const scenarioFingerprint = JSON.stringify({ worldFingerprint, observation: capturedConfig.observation })
  return Object.freeze({
    city,
    config: capturedConfig,
    citizen,
    profiles,
    worldFingerprint,
    scenarioFingerprint,
    worldRunId: createOffendingRunId(citizen.runId, capturedConfig.offending),
  })
}

export function createInitialStateV4(environment: SimulationEnvironmentV4): SimulationStateV4 {
  return {
    version: 4,
    tick: 0,
    logicalTimeSeconds: 0,
    worldFingerprint: environment.worldFingerprint,
    scenarioFingerprint: environment.scenarioFingerprint,
    citizen: createInitialCitizenState(environment.citizen, environment.config.citizen),
    offenderStates: createInitialOffenderStates(environment.profiles),
    offences: [],
    incidents: [],
    reporting: createInitialReportingStateV4(),
  }
}

/** Movement and offender choice update truth; reporting reads truth without feeding it back. */
export function stepSimulationV4(
  environment: SimulationEnvironmentV4,
  previous: SimulationStateV4,
  commandsForTick: readonly CommandEnvelope[],
): SimulationTransitionV4 {
  if (previous.version !== 4 || previous.worldFingerprint !== environment.worldFingerprint ||
      previous.scenarioFingerprint !== environment.scenarioFingerprint ||
      previous.tick !== previous.citizen.tick ||
      previous.logicalTimeSeconds !== previous.citizen.logicalTimeSeconds ||
      previous.offences.length !== previous.incidents.length) {
    throw new Error('Invalid or incompatible v4 simulation state')
  }
  const citizenTransition = stepCitizenSimulation(
    environment.citizen,
    environment.config.citizen,
    previous.citizen,
    commandsForTick,
  )
  const tick = citizenTransition.state.tick
  const offending = generateOffencesForTick(
    environment.city,
    citizenTransition.state.citizens,
    environment.profiles,
    previous.offenderStates,
    tick,
    environment.config.citizen.logicalSecondsPerTick,
    environment.config.offending,
    environment.worldRunId,
  )
  const newIncidents: ReportableOccurrenceV4[] = offending.offences.map((offence) => ({
    id: offence.incidentId,
    offenceId: offence.id,
    occurrenceTick: offence.occurrenceTick,
    position: offence.position,
    blockId: offence.blockId,
    district: offence.district,
    severity: offence.severity,
    offenderAgentId: offence.offenderAgentId,
    nearbyCitizenIds: offence.opportunity.nearbyCitizenIds,
  }))
  const incidents = [...previous.incidents, ...newIncidents]
  const reporting = stepReportingV4(
    previous.reporting,
    incidents,
    newIncidents,
    environment.config.observation,
    tick,
  )
  return {
    state: {
      version: 4,
      tick,
      logicalTimeSeconds: citizenTransition.state.logicalTimeSeconds,
      worldFingerprint: environment.worldFingerprint,
      scenarioFingerprint: environment.scenarioFingerprint,
      citizen: citizenTransition.state,
      offenderStates: offending.offenderStates,
      offences: [...previous.offences, ...offending.offences],
      incidents,
      reporting: reporting.state,
    },
    citizenEvents: citizenTransition.events,
    truthEvents: offending.offences.map((offence) => ({
      id: offence.truthEventId,
      tick,
      type: 'OffenceOccurred' as const,
      offenceId: offence.id,
      incidentId: offence.incidentId,
      offenderAgentId: offence.offenderAgentId,
    })),
    observationEvents: reporting.newlyAvailable.map((report) => ({
      id: `arrival-${report.reportId}`,
      tick,
      type: 'ReportAvailable' as const,
      reportId: report.reportId,
    })),
  }
}
