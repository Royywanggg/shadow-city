import { createRandomStream, nextRandom } from '../rng'
import type {
  Incident,
  ObservationRecord,
  ReportingConfig,
  ReportingOutcome,
  ReportingState,
} from '../v3Types'

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function keyedSample(seed: string, incidentId: string, purpose: 'decision' | 'delay'): number {
  return nextRandom(createRandomStream(seed, `v0.4-report:${purpose}:${incidentId}`)).value
}

export function validateReportingConfig(config: ReportingConfig): void {
  if (config.version !== 'synthetic-reporting-v1' || !config.observationSeed ||
      !Number.isFinite(config.globalProbability) || config.globalProbability < 0 ||
      config.globalProbability > 1 ||
      ![config.severityExponent.minor, config.severityExponent.serious]
        .every((value) => Number.isFinite(value) && value > 0) ||
      !Number.isSafeInteger(config.minDelayTicks) || config.minDelayTicks < 0 ||
      !Number.isSafeInteger(config.maxDelayTicks) || config.maxDelayTicks < config.minDelayTicks ||
      !Number.isSafeInteger(config.ingestDelayTicks) || config.ingestDelayTicks < 0 ||
      !Number.isSafeInteger(config.maxDelayTicks + config.ingestDelayTicks)) {
    throw new Error('Invalid synthetic reporting configuration')
  }
}

export function effectiveReportingProbability(config: ReportingConfig, severity: Incident['severity']): number {
  validateReportingConfig(config)
  return 1 - (1 - config.globalProbability) ** config.severityExponent[severity]
}

export function createInitialReportingState(): ReportingState {
  return { outcomes: [], records: [], nextReportOrdinal: 0 }
}

/** Reporting decisions use samples keyed by incident ID, never a shared mutable RNG stream. */
export function decideReport(incident: Incident, config: ReportingConfig): ReportingOutcome {
  const probability = effectiveReportingProbability(config, incident.severity)
  if (keyedSample(config.observationSeed, incident.id, 'decision') >= probability) {
    return { status: 'notReported', incidentId: incident.id, decisionTick: incident.occurrenceTick }
  }
  const delayRange = config.maxDelayTicks - config.minDelayTicks + 1
  const delay = config.minDelayTicks + Math.floor(keyedSample(config.observationSeed, incident.id, 'delay') * delayRange)
  const createdTick = incident.occurrenceTick + delay
  const availableTick = createdTick + config.ingestDelayTicks
  if (!Number.isSafeInteger(createdTick) || !Number.isSafeInteger(availableTick)) {
    throw new Error('Report arrival exceeds the simulation tick range')
  }
  return {
    status: 'scheduled',
    incidentId: incident.id,
    decisionTick: incident.occurrenceTick,
    createdTick,
    availableTick,
  }
}

export interface ReportingTransition {
  readonly state: ReportingState
  readonly newlyAvailable: readonly ObservationRecord[]
}

/** One private outcome per incident. Only delivered records receive public IDs. */
export function stepReporting(
  previous: ReportingState,
  allIncidents: readonly Incident[],
  newIncidents: readonly Incident[],
  config: ReportingConfig,
  tick: number,
): ReportingTransition {
  validateReportingConfig(config)
  if (!Number.isSafeInteger(tick) || tick < 1 ||
      !Number.isSafeInteger(previous.nextReportOrdinal) || previous.nextReportOrdinal < 0 ||
      previous.nextReportOrdinal !== previous.records.length) {
    throw new Error('Invalid reporting state or tick')
  }

  const incidentById = new Map<string, Incident>()
  for (const incident of allIncidents) {
    if (incidentById.has(incident.id) || incident.occurrenceTick > tick) {
      throw new Error('Invalid or duplicate incident in reporting input')
    }
    incidentById.set(incident.id, incident)
  }
  const previousIds = new Set<string>()
  for (const outcome of previous.outcomes) {
    if (previousIds.has(outcome.incidentId) || !incidentById.has(outcome.incidentId)) {
      throw new Error('Invalid or duplicate previous reporting outcome')
    }
    previousIds.add(outcome.incidentId)
  }
  const orderedNew = [...newIncidents].sort((a, b) => compareIds(a.id, b.id))
  const newOutcomes = orderedNew.map((incident) => {
    if (incident.occurrenceTick !== tick || !incidentById.has(incident.id) || previousIds.has(incident.id)) {
      throw new Error('Invalid newly occurred incident for reporting')
    }
    previousIds.add(incident.id)
    return decideReport(incident, config)
  })
  if (previousIds.size !== incidentById.size) {
    throw new Error('Every occurred incident needs exactly one reporting outcome')
  }

  const outcomes = [...previous.outcomes, ...newOutcomes]
  const due = outcomes.filter((outcome): outcome is Extract<ReportingOutcome, { status: 'scheduled' }> =>
    outcome.status === 'scheduled' && outcome.availableTick <= tick)
    .sort((a, b) => a.availableTick - b.availableTick ||
      incidentById.get(a.incidentId)!.occurrenceTick - incidentById.get(b.incidentId)!.occurrenceTick ||
      compareIds(a.incidentId, b.incidentId))

  const delivered = new Map<string, Extract<ReportingOutcome, { status: 'available' }>>()
  const newlyAvailable: ObservationRecord[] = []
  let nextReportOrdinal = previous.nextReportOrdinal
  for (const outcome of due) {
    const incident = incidentById.get(outcome.incidentId)!
    const reportId = `report-${String(++nextReportOrdinal).padStart(6, '0')}`
    delivered.set(outcome.incidentId, { ...outcome, status: 'available', reportId })
    newlyAvailable.push({
      reportId,
      reportedOccurrenceTick: incident.occurrenceTick,
      availableTick: outcome.availableTick,
      reportedPosition: { x: incident.position.x, y: incident.position.y, z: incident.position.z },
      reportedBlockId: incident.blockId,
      reportedType: incident.type,
      reportedSeverity: incident.severity,
    })
  }
  return {
    state: {
      outcomes: outcomes.map((outcome) => delivered.get(outcome.incidentId) ?? outcome),
      records: [...previous.records, ...newlyAvailable],
      nextReportOrdinal,
    },
    newlyAvailable,
  }
}
