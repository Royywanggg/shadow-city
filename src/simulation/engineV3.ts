import { createInitialCitizenState, stepCitizenSimulation } from './engineV2'
import { createSimulationEnvironment } from './environment'
import {
  createIncidentWorldRunId,
  generateIncidentsForTick,
  validateIncidentConfig,
} from './incidents'
import {
  createInitialReportingState,
  stepReporting,
  validateReportingConfig,
} from './observation'
import type { CommandEnvelope, SimulationEnvironment, StaticCity } from './types'
import type {
  SimulationConfigV3,
  SimulationStateV3,
  SimulationTransitionV3,
} from './v3Types'

export interface SimulationEnvironmentV3 {
  readonly city: StaticCity
  readonly config: SimulationConfigV3
  readonly citizen: SimulationEnvironment
  readonly worldFingerprint: string
  readonly scenarioFingerprint: string
  readonly worldRunId: string
}

function canonicalIncidentConfig(config: SimulationConfigV3['incident']) {
  return {
    version: config.version,
    baselineRatePerOccupiedBlockHour: config.baselineRatePerOccupiedBlockHour,
    densitySlope: config.densitySlope,
    maxDensityCount: config.maxDensityCount,
    seriousProbability: config.seriousProbability,
    districtMultipliers: {
      civic: config.districtMultipliers.civic,
      core: config.districtMultipliers.core,
      residential: config.districtMultipliers.residential,
      works: config.districtMultipliers.works,
    },
    timeBandMultipliers: {
      day: config.timeBandMultipliers.day,
      evening: config.timeBandMultipliers.evening,
      night: config.timeBandMultipliers.night,
    },
    publicSpaceMultiplier: config.publicSpaceMultiplier,
    startHour: config.startHour,
  }
}

function canonicalReportingConfig(config: SimulationConfigV3['observation']) {
  return {
    version: config.version,
    observationSeed: config.observationSeed,
    globalProbability: config.globalProbability,
    severityExponent: {
      minor: config.severityExponent.minor,
      serious: config.severityExponent.serious,
    },
    minDelayTicks: config.minDelayTicks,
    maxDelayTicks: config.maxDelayTicks,
    ingestDelayTicks: config.ingestDelayTicks,
  }
}

export function createSimulationEnvironmentV3(
  city: StaticCity,
  config: SimulationConfigV3,
): SimulationEnvironmentV3 {
  if (config.version !== 3) throw new Error('Invalid v3 simulation configuration')
  validateIncidentConfig(config.incident)
  validateReportingConfig(config.observation)
  // Capture values once so an external config object cannot change a running
  // scenario after its compatibility fingerprints have been computed.
  const incidentFields = canonicalIncidentConfig(config.incident)
  const observationFields = canonicalReportingConfig(config.observation)
  const capturedConfig: SimulationConfigV3 = Object.freeze({
    version: 3,
    citizen: Object.freeze({ ...config.citizen }),
    incident: Object.freeze({
      ...incidentFields,
      districtMultipliers: Object.freeze(incidentFields.districtMultipliers),
      timeBandMultipliers: Object.freeze(incidentFields.timeBandMultipliers),
    }),
    observation: Object.freeze({
      ...observationFields,
      severityExponent: Object.freeze(observationFields.severityExponent),
    }),
  })
  const citizen = createSimulationEnvironment(city, capturedConfig.citizen)
  const worldFingerprint = JSON.stringify({
    version: 3,
    citizenFingerprint: citizen.fingerprint,
    incident: incidentFields,
  })
  const scenarioFingerprint = JSON.stringify({
    worldFingerprint,
    observation: observationFields,
  })
  return Object.freeze({
    city,
    config: capturedConfig,
    citizen,
    worldFingerprint,
    scenarioFingerprint,
    worldRunId: createIncidentWorldRunId(citizen.runId, capturedConfig.incident),
  })
}

export function createInitialStateV3(environment: SimulationEnvironmentV3): SimulationStateV3 {
  return {
    version: 3,
    tick: 0,
    logicalTimeSeconds: 0,
    worldFingerprint: environment.worldFingerprint,
    scenarioFingerprint: environment.scenarioFingerprint,
    citizen: createInitialCitizenState(environment.citizen, environment.config.citizen),
    incidents: [],
    reporting: createInitialReportingState(),
  }
}

/** The reporting branch reads completed incidents but never feeds the world branch. */
export function stepSimulationV3(
  environment: SimulationEnvironmentV3,
  previous: SimulationStateV3,
  commandsForTick: readonly CommandEnvelope[],
): SimulationTransitionV3 {
  if (previous.version !== 3 || previous.worldFingerprint !== environment.worldFingerprint ||
      previous.scenarioFingerprint !== environment.scenarioFingerprint ||
      previous.tick !== previous.citizen.tick ||
      previous.logicalTimeSeconds !== previous.citizen.logicalTimeSeconds) {
    throw new Error('Invalid or incompatible v3 simulation state')
  }
  const citizenTransition = stepCitizenSimulation(
    environment.citizen,
    environment.config.citizen,
    previous.citizen,
    commandsForTick,
  )
  const tick = citizenTransition.state.tick
  const newIncidents = generateIncidentsForTick(
    environment.city,
    citizenTransition.state.citizens,
    tick,
    environment.config,
    environment.worldRunId,
  )
  const incidents = [...previous.incidents, ...newIncidents]
  const reportingTransition = stepReporting(
    previous.reporting,
    incidents,
    newIncidents,
    environment.config.observation,
    tick,
  )
  return {
    state: {
      version: 3,
      tick,
      logicalTimeSeconds: citizenTransition.state.logicalTimeSeconds,
      worldFingerprint: environment.worldFingerprint,
      scenarioFingerprint: environment.scenarioFingerprint,
      citizen: citizenTransition.state,
      incidents,
      reporting: reportingTransition.state,
    },
    citizenEvents: citizenTransition.events,
    truthEvents: newIncidents.map((incident) => ({
      id: `truth-${incident.id}`,
      tick,
      type: 'IncidentOccurred' as const,
      incidentId: incident.id,
    })),
    observationEvents: reportingTransition.newlyAvailable.map((report) => ({
      id: `arrival-${report.reportId}`,
      tick,
      type: 'ReportAvailable' as const,
      reportId: report.reportId,
    })),
  }
}
