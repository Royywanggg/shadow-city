import type { ReportV5 } from '../v5Types'

export interface ObserverReportViewV5 extends ReportV5 {
  readonly source?: 'victim' | 'witness'
}

/** A runtime allowlist blocks private simulation fields even when callers cast types. */
export function projectObserverViewV5(state: Readonly<{
  tick: number
  reports: readonly (ReportV5 & Readonly<{ source?: 'victim' | 'witness' }>)[]
}>): Readonly<{ tick: number; reports: readonly ObserverReportViewV5[] }> {
  const reports = state.reports.filter((report) => report.availableTick <= state.tick)
    .map((report): ObserverReportViewV5 => Object.freeze({
      id: report.id,
      availableTick: report.availableTick,
      reportedOccurrenceTick: report.reportedOccurrenceTick,
      reportedPosition: Object.freeze({ x: report.reportedPosition.x,
        y: report.reportedPosition.y, z: report.reportedPosition.z }),
      reportedLevelId: report.reportedLevelId,
      reportedPlaceId: report.reportedPlaceId,
      reportedSeverity: report.reportedSeverity,
      suspect: report.suspect.status === 'nameClaim' ? Object.freeze({
        status: 'nameClaim' as const,
        claimedName: report.suspect.claimedName,
        verification: 'unverified' as const,
      }) : report.suspect.status === 'namedLead' ? Object.freeze({
        status: 'namedLead' as const,
        candidateAgentId: report.suspect.candidateAgentId,
        verification: 'unverified' as const,
      }) : Object.freeze({ status: 'unknown' as const }),
      ...(report.source === 'victim' || report.source === 'witness' ?
        { source: report.source } : {}),
    }))
  return Object.freeze({ tick: state.tick, reports: Object.freeze(reports) })
}
