import { useSyncExternalStore } from 'react'
import type { SimulationSession } from '../simulation/session'
import type { ObserverPort } from '../simulation/v3Types'
import { IncidentLayer } from '../scene/IncidentLayer'
import {
  ExperimentControls,
  type ObservationMode,
  type ReportingScenarioId,
} from './ExperimentControls'

interface CommonPanelProps {
  readonly scenario: ReportingScenarioId
  readonly onModeChange: (mode: ObservationMode) => void
  readonly onScenarioChange: (scenario: ReportingScenarioId) => void
}

export function ObservedIncidentScene({ port }: { readonly port: ObserverPort }) {
  const view = useSyncExternalStore(port.subscribe, port.getView, port.getView)
  return <IncidentLayer view={{ mode: 'observed', tick: view.asOfTick, reports: view.reports }} />
}

export function ResearchIncidentScene({
  session,
  port,
  mode,
}: {
  readonly session: SimulationSession
  readonly port: ObserverPort
  readonly mode: 'groundTruth' | 'comparison'
}) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const truth = session.getGroundTruthView()
  if (mode === 'groundTruth') {
    return <IncidentLayer view={{ mode, tick: snapshot.tick, incidents: truth.incidents }} />
  }
  const observed = port.getView()
  return <IncidentLayer view={{ mode, tick: snapshot.tick, incidents: truth.incidents, reports: observed.reports }} />
}

export function ObservedExperimentPanel({ port, ...common }: CommonPanelProps & { readonly port: ObserverPort }) {
  const view = useSyncExternalStore(port.subscribe, port.getView, port.getView)
  return <ExperimentControls mode="observed" observed={view} {...common} />
}

export function ResearchExperimentPanel({
  session,
  port,
  mode,
  ...common
}: CommonPanelProps & {
  readonly session: SimulationSession
  readonly port: ObserverPort
  readonly mode: 'groundTruth' | 'comparison'
}) {
  useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const truth = session.getGroundTruthView()
  if (mode === 'groundTruth') {
    return <ExperimentControls mode={mode} groundTruth={truth} {...common} />
  }
  const observed = port.getView()
  return <ExperimentControls mode={mode} groundTruth={truth} observed={observed} {...common} />
}
