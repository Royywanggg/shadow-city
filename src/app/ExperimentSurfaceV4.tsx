import { useSyncExternalStore } from 'react'
import type { SimulationSession } from '../simulation/session'
import type { ObserverPortV4 } from '../simulation/v4Types'
import { OffenceLayer } from '../scene/OffenceLayer'
import { ExperimentControlsV4 } from './ExperimentControlsV4'
import type { ObservationMode, ReportingScenarioId } from './ExperimentControls'

interface CommonPanelProps {
  readonly scenario: ReportingScenarioId
  readonly onModeChange: (mode: ObservationMode) => void
  readonly onScenarioChange: (scenario: ReportingScenarioId) => void
}

/** This component receives only the public observer capability. */
export function ObservedOffenceSceneV4({ port }: { readonly port: ObserverPortV4 }) {
  const view = useSyncExternalStore(port.subscribe, port.getView, port.getView)
  return <OffenceLayer view={{ mode: 'observed', tick: view.asOfTick, reports: view.reports }} />
}

export function ResearchOffenceSceneV4({ session, port, mode }: {
  readonly session: SimulationSession
  readonly port: ObserverPortV4
  readonly mode: 'groundTruth' | 'comparison'
}) {
  useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const truth = session.getGroundTruthViewV4()
  if (mode === 'groundTruth') {
    return <OffenceLayer view={{ mode, tick: truth.asOfTick, incidents: truth.incidents }} />
  }
  const observed = port.getView()
  return <OffenceLayer view={{ mode, tick: truth.asOfTick, incidents: truth.incidents, reports: observed.reports }} />
}

export function ObservedExperimentPanelV4({ port, ...common }: CommonPanelProps & { readonly port: ObserverPortV4 }) {
  const view = useSyncExternalStore(port.subscribe, port.getView, port.getView)
  return <ExperimentControlsV4 mode="observed" observed={view} {...common} />
}

export function ResearchExperimentPanelV4({ session, port, mode, ...common }: CommonPanelProps & {
  readonly session: SimulationSession
  readonly port: ObserverPortV4
  readonly mode: 'groundTruth' | 'comparison'
}) {
  useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const truth = session.getGroundTruthViewV4()
  if (mode === 'groundTruth') return <ExperimentControlsV4 mode={mode} groundTruth={truth} {...common} />
  return <ExperimentControlsV4 mode={mode} groundTruth={truth} observed={port.getView()} {...common} />
}
