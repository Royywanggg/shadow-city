import type { DistrictKind } from '../../city/model'
import type { IncidentSeverity } from '../v3Types'
import { validateObservationConfigV4 } from './v4Reporting'
import type {
  BehaviourGroupV4,
  GroundTruthMetricsV4,
  ObservationConfigV4,
  OffenceMetricFactV4,
  ReportingStateV4,
} from './v4Types'

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator
}

function districtCounts(): Record<DistrictKind, number> {
  return { civic: 0, core: 0, residential: 0, works: 0 }
}

function groupCounts(): Record<BehaviourGroupV4, number> {
  return { minorSpecialist: 0, seriousSpecialist: 0, generalist: 0 }
}

function severityCounts(): Record<IncidentSeverity, number> {
  return { minor: 0, serious: 0 }
}

/** Full-population descriptive metrics. These are not police detection measures. */
export function deriveGroundTruthMetricsV4(
  offences: readonly OffenceMetricFactV4[],
  reporting: ReportingStateV4,
  populationAgentIds: readonly string[],
  groupByAgentId: Readonly<Record<string, BehaviourGroupV4>>,
  config: ObservationConfigV4,
  asOfTick: number,
): GroundTruthMetricsV4 {
  validateObservationConfigV4(config)
  if (!Number.isSafeInteger(asOfTick) || asOfTick < 0) throw new Error('Invalid v4 metrics tick')
  const population = new Set(populationAgentIds)
  if (population.size !== populationAgentIds.length || populationAgentIds.some((id) => !id)) {
    throw new Error('Invalid v4 metric population')
  }
  const byIncidentId = new Map<string, OffenceMetricFactV4>()
  const offenceIds = new Set<string>()
  const countsByAgent = new Map<string, { minor: number; serious: number }>()
  const offencesByDistrict = districtCounts()
  const offencesByGroup = groupCounts()
  let minorOffences = 0
  let seriousOffences = 0

  for (const offence of offences) {
    const group = groupByAgentId[offence.offenderAgentId]
    if (!offence.id || !offence.incidentId || !population.has(offence.offenderAgentId) ||
        !['minorSpecialist', 'seriousSpecialist', 'generalist'].includes(group) ||
        !Number.isSafeInteger(offence.occurrenceTick) || offence.occurrenceTick < 1 ||
        offence.occurrenceTick > asOfTick ||
        (offence.severity !== 'minor' && offence.severity !== 'serious') ||
        !['civic', 'core', 'residential', 'works'].includes(offence.district) ||
        offenceIds.has(offence.id) || byIncidentId.has(offence.incidentId)) {
      throw new Error('Invalid v4 offence facts for metrics')
    }
    offenceIds.add(offence.id)
    byIncidentId.set(offence.incidentId, offence)
    const count = countsByAgent.get(offence.offenderAgentId) ?? { minor: 0, serious: 0 }
    count[offence.severity] += 1
    countsByAgent.set(offence.offenderAgentId, count)
    if (offence.severity === 'minor') minorOffences += 1
    else seriousOffences += 1
    offencesByDistrict[offence.district] += 1
    offencesByGroup[group] += 1
  }

  const recordsById = new Map(reporting.records.map((record) => [record.reportId, record]))
  if (recordsById.size !== reporting.records.length) throw new Error('Duplicate v4 public report IDs')
  const matchedIncidents = new Set<string>()
  const availableBySeverity = severityCounts()
  let availableReports = 0
  let pendingReports = 0
  let unreportedOffences = 0
  let totalAvailableDelay = 0

  for (const outcome of reporting.outcomes) {
    const offence = byIncidentId.get(outcome.incidentId)
    if (!offence || matchedIncidents.has(outcome.incidentId) || outcome.decisionTick !== offence.occurrenceTick) {
      throw new Error('Invalid v4 metric reporting outcome')
    }
    matchedIncidents.add(outcome.incidentId)
    if (outcome.status === 'notReported') {
      unreportedOffences += 1
      continue
    }
    if (outcome.status === 'scheduled') {
      if (outcome.availableTick <= asOfTick) throw new Error('Undelivered due v4 report')
      pendingReports += 1
      continue
    }
    const record = recordsById.get(outcome.reportId)
    if (!record || outcome.availableTick > asOfTick || record.availableTick !== outcome.availableTick ||
        record.reportedSeverity !== offence.severity) {
      throw new Error('Missing or inconsistent available v4 report')
    }
    availableReports += 1
    availableBySeverity[offence.severity] += 1
    totalAvailableDelay += outcome.availableTick - offence.occurrenceTick
  }
  if (matchedIncidents.size !== offences.length || availableReports !== reporting.records.length ||
      availableReports + pendingReports + unreportedOffences !== offences.length) {
    throw new Error('V4 truth and reporting partition mismatch')
  }

  let both = 0
  let minorOnly = 0
  let seriousOnly = 0
  let neither = 0
  let one = 0
  let twoOrMore = 0
  for (const id of populationAgentIds) {
    const count = countsByAgent.get(id) ?? { minor: 0, serious: 0 }
    const total = count.minor + count.serious
    if (count.minor > 0 && count.serious > 0) both += 1
    else if (count.minor > 0) minorOnly += 1
    else if (count.serious > 0) seriousOnly += 1
    else neither += 1
    if (total === 1) one += 1
    else if (total >= 2) twoOrMore += 1
  }
  const uniqueOffendingAgents = populationAgentIds.length - neither
  const seriousGivenMinor = ratio(both, both + minorOnly)
  const seriousGivenNoMinor = ratio(seriousOnly, seriousOnly + neither)
  return {
    totalOffences: offences.length,
    minorOffences,
    seriousOffences,
    uniqueOffendingAgents,
    repeatOffendingAgents: twoOrMore,
    meanOffencesPerOffender: ratio(offences.length, uniqueOffendingAgents),
    frequency: { zero: neither, one, twoOrMore },
    association: {
      both,
      minorOnly,
      seriousOnly,
      neither,
      seriousGivenMinor,
      seriousGivenNoMinor,
      riskDifference: seriousGivenMinor === null || seriousGivenNoMinor === null
        ? null : seriousGivenMinor - seriousGivenNoMinor,
    },
    crossSeverityRateAmongOffenders: ratio(both, uniqueOffendingAgents),
    offencesByDistrict,
    offencesByGroup,
    availableBySeverity,
    availableReports,
    pendingReports,
    unreportedOffences,
    currentReportingCoverage: ratio(availableReports, offences.length),
    eventualReportingShare: ratio(availableReports + pendingReports, offences.length),
    configuredGlobalReportingProbability: config.globalProbability,
    meanAvailableReportDelayTicks: ratio(totalAvailableDelay, availableReports),
  }
}
