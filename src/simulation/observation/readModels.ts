import { deriveGroundTruthMetrics } from './metrics'
import type {
  GroundTruthView,
  ObservationRecord,
  ObservedWorldView,
  ReportingConfig,
  SimulationStateV3,
} from '../v3Types'

function copyPublicRecord(record: ObservationRecord): ObservationRecord {
  return Object.freeze({
    reportId: record.reportId,
    reportedOccurrenceTick: record.reportedOccurrenceTick,
    availableTick: record.availableTick,
    reportedPosition: Object.freeze({
      x: record.reportedPosition.x,
      y: record.reportedPosition.y,
      z: record.reportedPosition.z,
    }),
    reportedBlockId: record.reportedBlockId,
    reportedType: record.reportedType,
    reportedSeverity: record.reportedSeverity,
  })
}

/** Explicit allowlist: pending outcomes, incident IDs, and truth metrics cannot cross this boundary. */
export function selectObservedWorldView(state: SimulationStateV3): ObservedWorldView {
  const deliveredIds = new Set(state.reporting.outcomes
    .filter((outcome): outcome is Extract<typeof outcome, { status: 'available' }> =>
      outcome.status === 'available' && outcome.availableTick <= state.tick)
    .map((outcome) => outcome.reportId))
  const reports = state.reporting.records
    .filter((record) => record.availableTick <= state.tick && deliveredIds.has(record.reportId))
    .map(copyPublicRecord)
  return Object.freeze({
    asOfTick: state.tick,
    reports: Object.freeze(reports),
    availableReportCount: reports.length,
  })
}

/** Researcher-only read model. UI code must not hand this to an ObserverPort. */
export function selectGroundTruthView(state: SimulationStateV3, config: ReportingConfig): GroundTruthView {
  return Object.freeze({
    asOfTick: state.tick,
    incidents: Object.freeze(state.incidents.map((incident) => Object.freeze({
      ...incident,
      position: Object.freeze({ ...incident.position }),
      involvedAgentIds: Object.freeze([...incident.involvedAgentIds]),
      context: Object.freeze({ ...incident.context }),
      provenance: Object.freeze({ ...incident.provenance }),
    }))),
    outcomes: Object.freeze(state.reporting.outcomes.map((outcome) => Object.freeze({ ...outcome }))),
    metrics: deriveGroundTruthMetrics(state.incidents, state.reporting, config, state.tick),
  })
}
