import type { CityModel } from '../city/model'

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T

export type StaticCity = DeepReadonly<CityModel>

export interface SimulationConfig {
  readonly version: 1
  readonly simulationSeed: string
  readonly logicalSecondsPerTick: number
}

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = Object.freeze({
  version: 1,
  simulationSeed: 'shadow-city-sim-01',
  logicalSecondsPerTick: 6,
})

export interface SimulationCommand {
  readonly type: 'ScheduleDiagnosticProbe'
  readonly delayTicks: number
  readonly label?: string
}

export interface CommandEnvelope {
  readonly id: string
  readonly effectiveTick: number
  readonly priority: number
  readonly submissionSequence: number
  readonly command: SimulationCommand
}

export interface ScheduledDiagnosticAction {
  readonly type: 'DiagnosticProbe'
  readonly dueTick: number
  readonly priority: number
  readonly insertionSequence: number
  readonly originCommandId: string
  readonly label: string
}

export interface SimulationState {
  readonly version: 1
  readonly tick: number
  readonly logicalTimeSeconds: number
  readonly rng: Readonly<{ diagnostic: number }>
  readonly pendingActions: readonly ScheduledDiagnosticAction[]
  readonly nextActionSequence: number
  readonly nextEventSequence: number
  readonly diagnosticSampleCount: number
}

export interface DiagnosticProbeSampledEvent {
  readonly id: string
  readonly tick: number
  readonly sequence: number
  readonly type: 'DiagnosticProbeSampled'
  readonly source: 'diagnostic'
  readonly originCommandId: string
  readonly label: string
  readonly sample: number
  readonly roadNodeId: string | null
}

export type SimulationEvent = DiagnosticProbeSampledEvent

export interface SimulationTransition {
  readonly state: SimulationState
  readonly events: readonly SimulationEvent[]
}

export interface ReplayResult extends SimulationTransition {}

export interface SimulationSnapshot {
  readonly state: SimulationState
  readonly tick: number
  readonly liveTick: number
  readonly isInspecting: boolean
  readonly eventCount: number
  readonly commandCount: number
  readonly lastEvent: SimulationEvent | null
}
