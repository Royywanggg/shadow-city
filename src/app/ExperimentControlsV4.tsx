import { useState } from 'react'
import type { GroundTruthViewV4, ObservedWorldViewV4 } from '../simulation/v4Types'
import type { ObservationMode, ReportingScenarioId } from './ExperimentControls'

interface CommonProps {
  readonly scenario: ReportingScenarioId
  readonly onModeChange: (mode: ObservationMode) => void
  readonly onScenarioChange: (scenario: ReportingScenarioId) => void
}

type Props = CommonProps & (
  | { readonly mode: 'groundTruth'; readonly groundTruth: GroundTruthViewV4; readonly observed?: never }
  | { readonly mode: 'observed'; readonly observed: ObservedWorldViewV4; readonly groundTruth?: never }
  | { readonly mode: 'comparison'; readonly groundTruth: GroundTruthViewV4; readonly observed: ObservedWorldViewV4 }
)

const modes: readonly { value: ObservationMode; label: string; aria: string }[] = [
  { value: 'groundTruth', label: 'TRUTH', aria: 'Ground Truth mode' },
  { value: 'observed', label: 'OBSERVED', aria: 'Observed mode' },
  { value: 'comparison', label: 'COMPARE', aria: 'Comparison mode' },
]
const scenarios: readonly { value: ReportingScenarioId; probability: string }[] = [
  { value: 'A', probability: '30%' }, { value: 'B', probability: '60%' }, { value: 'C', probability: '90%' },
]

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`
}

export function ExperimentControlsV4(props: Props) {
  const { mode, scenario, onModeChange, onScenarioChange } = props
  const metrics = mode === 'observed' ? null : props.groundTruth.metrics
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null)
  const publicReports = mode === 'observed' ? props.observed.reports : []
  const selectedReport = publicReports.find((report) => report.reportId === selectedReportId) ??
    publicReports[publicReports.length - 1]
  return (
    <section className="experiment-panel experiment-panel-v4" aria-label="Offence observation laboratory"
      data-testid="experiment-panel" data-mode={mode}>
      <header className="experiment-heading">
        <span className="experiment-kicker">OFFENDING / SYNTHETIC</span>
        <strong>Offences &amp; reports</strong>
      </header>
      <div className="experiment-mode-group" role="group" aria-label="Observation mode">
        {modes.map((item) => <button key={item.value} type="button" onClick={() => onModeChange(item.value)}
          aria-label={item.aria} aria-pressed={mode === item.value} data-testid={`mode-${item.value}`}>
          {item.label}
        </button>)}
      </div>
      <div className="experiment-scenario">
        <span className="experiment-label">REPORTING SCENARIO</span>
        <div role="group" aria-label="Reporting scenario">
          {scenarios.map((item) => <button key={item.value} type="button" onClick={() => onScenarioChange(item.value)}
            aria-label={`Reporting scenario ${item.value}, ${item.probability}`}
            aria-pressed={scenario === item.value} data-testid={`scenario-${item.value.toLowerCase()}`}>
            <strong>{item.value}</strong><span>{item.probability}</span>
          </button>)}
        </div>
        <p>Changing scenario resets the simulation to Tick 0.</p>
      </div>
      {mode === 'observed' ? (
        <div className="experiment-observed" aria-label="Available report summary">
          <div className="experiment-observed-title">
            <span className="experiment-label">AVAILABLE BY TICK {props.observed.asOfTick}</span>
            {selectedReport && <button type="button" className="experiment-scroll-cue"
              aria-label="Scroll to delivered reports" onClick={(event) => {
                event.currentTarget.closest('.experiment-panel')?.querySelector('#public-report-select')
                  ?.scrollIntoView({ block: 'start', behavior: 'auto' })
              }}>SCROLL FOR REPORTS ↓</button>}
          </div>
          <strong data-testid="observed-count">{props.observed.availableReportCount}</strong>
          <span>REPORTS</span>
          <p>Only delivered reports are visible. A named lead is unverified.</p>
          {props.observed.reports.length > 0 && <p data-testid="observed-leads">
            {props.observed.reports.filter((report) => report.suspect.status === 'namedLead').length} unverified named leads
          </p>}
          {selectedReport && <div className="experiment-public-reports" aria-label="Delivered report records">
            <label htmlFor="public-report-select" className="experiment-label">INSPECT DELIVERED REPORT</label>
            <select id="public-report-select" data-testid="public-report-select"
              value={selectedReport.reportId} onChange={(event) => setSelectedReportId(event.target.value)}>
              {publicReports.map((report) => <option key={report.reportId} value={report.reportId}>
                {report.reportId} · {report.reportedSeverity.toUpperCase()} · T{report.availableTick}
              </option>)}
            </select>
            <dl data-testid="public-report-detail">
              <div><dt>REPORT</dt><dd data-testid="public-report-id">{selectedReport.reportId}</dd></div>
              <div><dt>TYPE</dt><dd>{selectedReport.reportedType === 'minorOffence' ? 'MINOR OFFENCE' : 'SERIOUS OFFENCE'}</dd></div>
              <div><dt>LOCATION</dt><dd>{selectedReport.reportedDistrict.toUpperCase()}</dd></div>
              <div><dt>TICKS</dt><dd>Occurrence {selectedReport.reportedOccurrenceTick} · Available {selectedReport.availableTick}</dd></div>
              <div><dt>SUSPECT</dt><dd data-testid="public-report-suspect">{selectedReport.suspect.status === 'namedLead'
                ? `${selectedReport.suspect.candidateAgentId.toUpperCase()} · UNVERIFIED LEAD`
                : 'UNKNOWN'}</dd></div>
              <div><dt>EVIDENCE</dt><dd data-testid="public-report-evidence">{selectedReport.evidenceRefs.length
                ? selectedReport.evidenceRefs.map((reference) => reference.id).join(', ')
                : 'NONE AVAILABLE'}</dd></div>
            </dl>
          </div>}
        </div>
      ) : (
        <div className="experiment-research" aria-label="Researcher offence metrics">
          <div className="experiment-stat-grid">
            <div><span>TRUE OFFENCES</span><strong data-testid="truth-count">{metrics!.totalOffences}</strong></div>
            <div><span>AVAILABLE REPORTS</span><strong data-testid="available-count">{metrics!.availableReports}</strong></div>
            <div><span>PENDING</span><strong data-testid="pending-count">{metrics!.pendingReports}</strong></div>
            <div><span>UNREPORTED</span><strong data-testid="unreported-count">{metrics!.unreportedOffences}</strong></div>
          </div>
          <div className="experiment-severity" aria-label="Offence counts by severity">
            <span>MINOR {metrics!.minorOffences} / {metrics!.availableBySeverity.minor}</span>
            <span>SERIOUS {metrics!.seriousOffences} / {metrics!.availableBySeverity.serious}</span>
          </div>
          <div className="experiment-v4-profile-summary" aria-label="Offender frequency summary">
            <span>OFFENDERS <strong data-testid="offender-count">{metrics!.uniqueOffendingAgents}</strong></span>
            <span>REPEAT <strong data-testid="repeat-count">{metrics!.repeatOffendingAgents}</strong></span>
            <span>0 / 1 / 2+ <strong>{metrics!.frequency.zero} / {metrics!.frequency.one} / {metrics!.frequency.twoOrMore}</strong></span>
          </div>
          {mode === 'comparison' ? <div className="experiment-comparison">
            <span>AVAILABLE / TRUE <strong data-testid="current-coverage">{percent(metrics!.currentReportingCoverage)}</strong></span>
            <span>EVENTUAL SHARE <strong>{percent(metrics!.eventualReportingShare)}</strong></span>
            <span className="experiment-confirmed-count" data-testid="observer-view-count">
              Observer sees {props.observed.availableReportCount} reports
            </span>
            <span>SERIOUS | MINOR <strong>{percent(metrics!.association.seriousGivenMinor)}</strong></span>
            <span>SERIOUS | NO MINOR <strong>{percent(metrics!.association.seriousGivenNoMinor)}</strong></span>
          </div> : <p className="experiment-truth-note">Research labels describe latent profiles, not certain outcomes.</p>}
        </div>
      )}
      <footer>DECLARED SYNTHETIC MODEL · NOT EMPIRICAL CRIME RATES</footer>
    </section>
  )
}
