import type {
  ObservationRecordV4,
  ObservedWorldViewV4,
  PublicEvidenceRefV4,
  PublicSuspectV4,
  ReportingStateV4,
} from './v4Types'

function copyEvidence(record: PublicEvidenceRefV4): PublicEvidenceRefV4 {
  return Object.freeze({
    id: record.id,
    kind: record.kind,
    availableTick: record.availableTick,
  })
}

function copyPublicRecord(record: ObservationRecordV4, tick: number): ObservationRecordV4 {
  const evidenceRefs = Object.freeze(record.evidenceRefs
    .filter((evidence) => evidence.availableTick <= tick)
    .map(copyEvidence))
  const visibleEvidenceIds = new Set(evidenceRefs.map((evidence) => evidence.id))
  const named = record.suspect.status === 'namedLead' &&
    record.suspect.availableTick <= tick &&
    record.suspect.evidenceIds.length > 0 &&
    record.suspect.evidenceIds.every((id) => visibleEvidenceIds.has(id))
  const suspect: PublicSuspectV4 = named && record.suspect.status === 'namedLead'
    ? Object.freeze({
        status: 'namedLead',
        candidateAgentId: record.suspect.candidateAgentId,
        evidenceIds: Object.freeze([...record.suspect.evidenceIds]),
        availableTick: record.suspect.availableTick,
        verification: 'unverified',
      })
    : Object.freeze({ status: 'unknown' })
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
    reportedDistrict: record.reportedDistrict,
    reportedType: record.reportedType,
    reportedSeverity: record.reportedSeverity,
    suspect,
    evidenceRefs,
  })
}

/** Allowlisted public projection: private outcomes are used only to prove delivery. */
export function selectObservedWorldViewV4(
  state: Readonly<{ tick: number; reporting: ReportingStateV4 }>,
): ObservedWorldViewV4 {
  if (!Number.isSafeInteger(state.tick) || state.tick < 0) throw new Error('Invalid v4 observer tick')
  const deliveredIds = new Set(state.reporting.outcomes
    .filter((outcome): outcome is Extract<typeof outcome, { status: 'available' }> =>
      outcome.status === 'available' && outcome.availableTick <= state.tick)
    .map((outcome) => outcome.reportId))
  const reports = Object.freeze(state.reporting.records
    .filter((record) => record.availableTick <= state.tick && deliveredIds.has(record.reportId))
    .map((record) => copyPublicRecord(record, state.tick)))
  return Object.freeze({
    asOfTick: state.tick,
    reports,
    availableReportCount: reports.length,
  })
}
