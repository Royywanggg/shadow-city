import type { CityModel, PedestrianNetwork } from '../city/model'
import type { NavigationIndex } from './navigation'
import type {
  IncidentOccurredEvent,
  ReportAvailableEvent,
  SimulationConfigV3,
  SimulationStateV3,
  SimulationTransitionV3,
} from './v3Types'
import type {
  OffenceOccurredEvent,
  ReportAvailableEventV4,
  SimulationConfigV4,
  SimulationStateV4,
  SimulationTransitionV4,
} from './v4Types'

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T

export type StaticCity = DeepReadonly<CityModel>

export interface SimulationConfigV1 {
  readonly version: 1
  readonly simulationSeed: string
  readonly logicalSecondsPerTick: number
}

export interface SimulationConfigV2 {
  readonly version: 2
  readonly simulationSeed: string
  readonly logicalSecondsPerTick: number
  readonly populationSize: number
  readonly behaviorModel: 'synthetic-v1'
}

export type SimulationConfig = SimulationConfigV1 | SimulationConfigV2 | SimulationConfigV3 | SimulationConfigV4

export const DEFAULT_SIMULATION_CONFIG: SimulationConfigV2 = Object.freeze({
  version: 2,
  simulationSeed: 'shadow-city-sim-01',
  logicalSecondsPerTick: 6,
  populationSize: 80,
  behaviorModel: 'synthetic-v1',
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

interface SimulationStateBase {
  readonly tick: number
  readonly logicalTimeSeconds: number
  readonly rng: Readonly<{ diagnostic: number }>
  readonly pendingActions: readonly ScheduledDiagnosticAction[]
  readonly nextActionSequence: number
  readonly nextEventSequence: number
  readonly diagnosticSampleCount: number
}

export interface SimulationStateV1 extends SimulationStateBase {
  readonly version: 1
}

export type CitizenActivity = 'atHome' | 'planningTrip' | 'travelling' | 'atDestination' | 'returningHome'

export interface AgentProfile {
  readonly id: string
  readonly homeAnchorId: string
  readonly speedUnitsPerLogicalSecond: number
  readonly firstDepartureTick: number
  readonly homeDwellTicks: number
  readonly visitDwellTicks: number
}

export interface WorldPosition {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface RouteStep {
  readonly edgeId: string
  readonly fromNodeId: string
  readonly toNodeId: string
  readonly length: number
}

export interface CitizenState {
  readonly id: string
  readonly activity: CitizenActivity
  readonly position: WorldPosition
  readonly currentAnchorId: string | null
  readonly destinationAnchorId: string | null
  readonly route: readonly RouteStep[]
  readonly routeIndex: number
  readonly distanceOnEdge: number
  readonly distanceAlongRoute: number
  readonly routeId: string | null
  readonly tripOrdinal: number
  readonly nextDecisionTick: number
  readonly behaviorRngState: number
  readonly nextEventOrdinal: number
}

export interface SimulationStateV2 extends SimulationStateBase {
  readonly version: 2
  readonly environmentFingerprint: string
  readonly citizens: readonly CitizenState[]
}

export type SimulationState = SimulationStateV1 | SimulationStateV2 | SimulationStateV3 | SimulationStateV4

export function isCitizenSimulationState(state: SimulationState): state is SimulationStateV2 {
  return state.version === 2
}

export function getCitizenSimulationState(state: SimulationState): SimulationStateV2 | null {
  return state.version === 2 ? state : state.version === 3 || state.version === 4 ? state.citizen : null
}

export interface SimulationEnvironment {
  readonly city: StaticCity
  readonly config: SimulationConfigV2
  readonly pedestrianNetwork: DeepReadonly<PedestrianNetwork>
  readonly navigation: NavigationIndex
  readonly profiles: readonly AgentProfile[]
  readonly publicAnchorIds: readonly string[]
  readonly fingerprint: string
  readonly runId: string
}

interface SimulationEventBase {
  readonly id: string
  readonly tick: number
  readonly sequence: number
}

export interface DiagnosticProbeSampledEvent extends SimulationEventBase {
  readonly type: 'DiagnosticProbeSampled'
  readonly source: 'diagnostic'
  readonly originCommandId: string
  readonly label: string
  readonly sample: number
  readonly roadNodeId: string | null
}

interface CitizenEventBase extends SimulationEventBase {
  readonly source: 'citizen'
  readonly agentId: string
}

export interface TripStartedEvent extends CitizenEventBase {
  readonly type: 'TripStarted'
  readonly originAnchorId: string
  readonly destinationAnchorId: string
  readonly routeLength: number
}

export interface DestinationReachedEvent extends CitizenEventBase {
  readonly type: 'DestinationReached'
  readonly destinationAnchorId: string
}

export interface ActivityStartedEvent extends CitizenEventBase {
  readonly type: 'ActivityStarted'
  readonly destinationAnchorId: string
}

export interface ActivityFinishedEvent extends CitizenEventBase {
  readonly type: 'ActivityFinished'
  readonly destinationAnchorId: string
}

export interface TripFailedEvent extends CitizenEventBase {
  readonly type: 'TripFailed'
  readonly originAnchorId: string
  readonly destinationAnchorId: string
  readonly reason: 'unreachable' | 'invalid-anchor'
}

export type CitizenEvent = TripStartedEvent | DestinationReachedEvent |
  ActivityStartedEvent | ActivityFinishedEvent | TripFailedEvent

export type SimulationEvent = DiagnosticProbeSampledEvent | CitizenEvent

export interface SimulationTransitionV1 {
  readonly state: SimulationStateV1
  readonly events: readonly DiagnosticProbeSampledEvent[]
}

export interface SimulationTransitionV2 {
  readonly state: SimulationStateV2
  readonly events: readonly SimulationEvent[]
}

export type SimulationTransition = SimulationTransitionV1 | SimulationTransitionV2 | SimulationTransitionV3 | SimulationTransitionV4

export interface ReplayResult {
  readonly state: SimulationState
  readonly events: readonly SimulationEvent[]
  readonly truthEvents?: readonly (IncidentOccurredEvent | OffenceOccurredEvent)[]
  readonly observationEvents?: readonly (ReportAvailableEvent | ReportAvailableEventV4)[]
}

export interface SimulationSnapshot {
  readonly state: SimulationState
  readonly tick: number
  readonly liveTick: number
  readonly isInspecting: boolean
  readonly eventCount: number
  readonly commandCount: number
  readonly lastEvent: SimulationEvent | null
}
