import type { GroundTruthView, ObservedWorldView } from '../simulation/v3Types'

export type ObservationMode = 'groundTruth' | 'observed' | 'comparison'
export type ReportingScenarioId = 'A' | 'B' | 'C'

interface CommonProps {
  readonly scenario: ReportingScenarioId
  readonly onModeChange: (mode: ObservationMode) => void
  /** The owner creates a new fixed scenario and resets its simulation on change. */
  readonly onScenarioChange: (scenario: ReportingScenarioId) => void
}

export type ExperimentControlsProps = CommonProps & (
  | { readonly mode: 'groundTruth'; readonly groundTruth: GroundTruthView; readonly observed?: never }
  | { readonly mode: 'observed'; readonly observed: ObservedWorldView; readonly groundTruth?: never }
  | { readonly mode: 'comparison'; readonly groundTruth: GroundTruthView; readonly observed: ObservedWorldView }
)

const MODES: readonly { value: ObservationMode; label: string }[] = [
  { value: 'groundTruth', label: 'TRUTH' },
  { value: 'observed', label: 'OBSERVED' },
  { value: 'comparison', label: 'COMPARE' },
]

const SCENARIOS: readonly { value: ReportingScenarioId; probability: string }[] = [
  { value: 'A', probability: '30%' },
  { value: 'B', probability: '60%' },
  { value: 'C', probability: '90%' },
]

const DISTRICTS = ['civic', 'core', 'residential', 'works'] as const

function percent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`
}

function labelDistrict(value: string): string {
  return value === 'residential' ? 'RESIDENTIAL' : value.toUpperCase()
}

export function ExperimentControls(props: ExperimentControlsProps) {
  const { mode, scenario, onModeChange, onScenarioChange } = props
  const metrics = mode === 'observed' ? null : props.groundTruth.metrics
  const observedCount = mode === 'groundTruth' ? null : props.observed.availableReportCount

  return (
    <section className="experiment-panel" aria-label="Observation laboratory" data-testid="experiment-panel" data-mode={mode}>
      <header className="experiment-heading">
        <span className="experiment-kicker">OBSERVATION / SYNTHETIC</span>
        <strong>Truth &amp; reports</strong>
      </header>

      <div className="experiment-mode-group" role="group" aria-label="Observation mode">
        {MODES.map((item) => (
          <button key={item.value} type="button" onClick={() => onModeChange(item.value)}
            aria-label={`${item.value === 'groundTruth' ? 'Ground Truth' : item.value === 'comparison' ? 'Comparison' : 'Observed'} mode`}
            aria-pressed={mode === item.value} data-testid={`mode-${item.value}`}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="experiment-scenario">
        <span className="experiment-label">REPORTING SCENARIO</span>
        <div role="group" aria-label="Reporting scenario">
          {SCENARIOS.map((item) => (
            <button key={item.value} type="button" onClick={() => onScenarioChange(item.value)}
              aria-label={`Reporting scenario ${item.value}, ${item.probability}`}
              aria-pressed={scenario === item.value} data-testid={`scenario-${item.value.toLowerCase()}`}>
              <strong>{item.value}</strong><span>{item.probability}</span>
            </button>
          ))}
        </div>
        <p>Changing scenario resets the simulation to Tick 0.</p>
      </div>

      {mode === 'observed' ? (
        <div className="experiment-observed" aria-label="Available report summary">
          <span className="experiment-label">AVAILABLE BY TICK {props.observed.asOfTick}</span>
          <strong data-testid="observed-count">{props.observed.availableReportCount}</strong>
          <span>REPORTS</span>
          <p>Only reports already delivered to the observer are shown.</p>
        </div>
      ) : (
        <div className="experiment-research" aria-label="Researcher metrics">
          <div className="experiment-stat-grid">
            <div><span>TRUE INCIDENTS</span><strong data-testid="truth-count">{metrics!.totalIncidents}</strong></div>
            <div><span>AVAILABLE REPORTS</span><strong data-testid="available-count">{metrics!.availableReports}</strong></div>
            <div><span>PENDING</span><strong data-testid="pending-count">{metrics!.pendingReports}</strong></div>
            <div><span>UNREPORTED</span><strong data-testid="unreported-count">{metrics!.unreportedIncidents}</strong></div>
          </div>
          <div className="experiment-severity" aria-label="Incident counts by severity">
            <span>MINOR {metrics!.truthBySeverity.minor} / {metrics!.availableBySeverity.minor}</span>
            <span>SERIOUS {metrics!.truthBySeverity.serious} / {metrics!.availableBySeverity.serious}</span>
          </div>
          {mode === 'comparison' && (
            <div className="experiment-comparison">
              <span>AVAILABLE / TRUE <strong data-testid="current-coverage">{percent(metrics!.currentCoverage)}</strong></span>
              <span>EVENTUAL SHARE <strong>{percent(metrics!.eventuallyReportedShare)}</strong></span>
              <span className="experiment-confirmed-count" data-testid="observer-view-count">Observer sees {observedCount} reports</span>
              <div className="experiment-districts" aria-label="Incidents by district">
                {DISTRICTS.map((district) => (
                  <div key={district}>
                    <span>{labelDistrict(district)}</span>
                    <strong>{metrics!.truthByDistrict[district]} / {metrics!.availableByDistrict[district]}</strong>
                  </div>
                ))}
                <small>True / available</small>
              </div>
            </div>
          )}
          {mode === 'groundTruth' && (
            <p className="experiment-truth-note">Unreported incidents remain in ground truth.</p>
          )}
        </div>
      )}
      <footer>RESULTS FROM A SYNTHETIC MODEL</footer>
    </section>
  )
}
