import type { DistrictKind } from '../../city/model'
import type {
  GroundTruthMetrics,
  Incident,
  IncidentSeverity,
  ReportingConfig,
  ReportingState,
} from '../v3Types'

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator
}

function districtCounts(): Record<DistrictKind, number> {
  return { civic: 0, core: 0, residential: 0, works: 0 }
}

function severityCounts(): Record<IncidentSeverity, number> {
  return { minor: 0, serious: 0 }
}

/** Research metrics include hidden facts and must never be passed to an ObserverPort. */
export function deriveGroundTruthMetrics(
  incidents: readonly Incident[],
  reporting: ReportingState,
  config: ReportingConfig,
  asOfTick: number,
): GroundTruthMetrics {
  if (!Number.isSafeInteger(asOfTick) || asOfTick < 0) throw new Error('Invalid metrics tick')
  const incidentById = new Map<string, Incident>()
  const truthBySeverity = severityCounts()
  const truthByDistrict = districtCounts()
  const truthByBlock: Record<string, number> = {}
  for (const incident of incidents) {
    if (incidentById.has(incident.id) || incident.occurrenceTick > asOfTick) {
      throw new Error('Invalid ground truth incident history')
    }
    incidentById.set(incident.id, incident)
    truthBySeverity[incident.severity] += 1
    truthByDistrict[incident.district] += 1
    truthByBlock[incident.blockId] = (truthByBlock[incident.blockId] ?? 0) + 1
  }

  let unreportedIncidents = 0
  let pendingReports = 0
  let availableReports = 0
  let delayTotal = 0
  let maturedTruth = 0
  let maturedAvailable = 0
  const availableBySeverity = severityCounts()
  const availableByDistrict = districtCounts()
  const availableByBlock: Record<string, number> = {}
  const matchedIds = new Set<string>()
  const recordedIds = new Set(reporting.records.map((record) => record.reportId))
  if (recordedIds.size !== reporting.records.length) throw new Error('Duplicate public report IDs')
  const maximumDelay = config.maxDelayTicks + config.ingestDelayTicks

  for (const outcome of reporting.outcomes) {
    const incident = incidentById.get(outcome.incidentId)
    if (!incident || matchedIds.has(outcome.incidentId) || outcome.decisionTick !== incident.occurrenceTick) {
      throw new Error('Invalid reporting outcome provenance')
    }
    matchedIds.add(outcome.incidentId)
    const matured = incident.occurrenceTick <= asOfTick - maximumDelay
    if (matured) maturedTruth += 1
    if (outcome.status === 'notReported') {
      unreportedIncidents += 1
      continue
    }
    if (outcome.status === 'scheduled') {
      if (outcome.availableTick <= asOfTick) throw new Error('Undelivered due report')
      pendingReports += 1
      continue
    }
    if (outcome.availableTick > asOfTick || !recordedIds.has(outcome.reportId)) {
      throw new Error('Available report is missing or early')
    }
    availableReports += 1
    if (matured) maturedAvailable += 1
    delayTotal += outcome.availableTick - incident.occurrenceTick
    availableBySeverity[incident.severity] += 1
    availableByDistrict[incident.district] += 1
    availableByBlock[incident.blockId] = (availableByBlock[incident.blockId] ?? 0) + 1
  }
  if (matchedIds.size !== incidentById.size || availableReports !== reporting.records.length ||
      availableReports + pendingReports + unreportedIncidents !== incidents.length) {
    throw new Error('Ground truth and reporting partition mismatch')
  }

  return {
    totalIncidents: incidents.length,
    availableReports,
    pendingReports,
    unreportedIncidents,
    configuredGlobalProbability: config.globalProbability,
    currentCoverage: ratio(availableReports, incidents.length),
    eventuallyReportedShare: ratio(availableReports + pendingReports, incidents.length),
    maturedReportingShare: ratio(maturedAvailable, maturedTruth),
    meanReportDelayTicks: ratio(delayTotal, availableReports),
    truthBySeverity,
    availableBySeverity,
    truthByDistrict,
    availableByDistrict,
    truthByBlock,
    availableByBlock,
  }
}
