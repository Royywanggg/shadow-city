import type { ReportV5 } from '../v5Types'
import type { LifeSceneReportV1, LifeStateV1 } from '../life/types'

export interface ObserverReportViewV5 extends ReportV5 {
  readonly source?: 'victim' | 'witness'
}

/** A runtime allowlist blocks private simulation fields even when callers cast types. */
export function projectObserverViewV5(state: Readonly<{
  tick: number
  reports: readonly (ReportV5 & Readonly<{ source?: 'victim' | 'witness' }>)[]
  life?: LifeStateV1
}>): Readonly<{ tick: number; reports: readonly ObserverReportViewV5[];
  lifeReports?: readonly LifeSceneReportV1[] }> {
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
  const lifeReports = state.life?.reports.filter((item) => item.availableTick <= state.tick)
    .map((item): LifeSceneReportV1 => Object.freeze({
      id: item.id, availableTick: item.availableTick,
      reportedPosition: Object.freeze({ x: item.reportedPosition.x,
        y: item.reportedPosition.y, z: item.reportedPosition.z }),
      reportedLevelId: item.reportedLevelId,
      reportedPlaceId: item.reportedPlaceId,
      reportedStatus: item.reportedStatus, source: item.source,
    }))
  return Object.freeze({ tick: state.tick, reports: Object.freeze(reports),
    ...(lifeReports ? { lifeReports: Object.freeze(lifeReports) } : {}) })
}
