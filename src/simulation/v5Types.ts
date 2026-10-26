import type { ActivityKind, WorldModelV2, WorldPointMm } from '../world/model'
import type { AccessMode, RouteStepV5, TravellerCosts } from '../world/navigation/routeV2'

export type CitizenActivityV5 = 'atHome' | 'planningTrip' | 'waitingForSpace' |
  'travelling' | 'atDestination' | 'returningHome'

export interface CitizenProfileV5 {
  readonly id: string
  readonly homePlaceId: string
  readonly homeSlotNodeId: string
  readonly workPlaceId: string | null
  readonly firstDepartureTick: number
  readonly homeDwellTicks: number
  readonly visitDwellTicks: number
  readonly travellerCosts: TravellerCosts
  readonly preferences: Readonly<Record<ActivityKind, number>>
  readonly jogPreference: number
}

export interface CitizenStateV5 {
  readonly id: string
  readonly activity: CitizenActivityV5
  readonly activityKind: ActivityKind
  readonly movementMode: 'walk' | 'jog'
  readonly position: WorldPointMm
  readonly surfaceId: string
  readonly placeId: string | null
  readonly currentNodeId: string | null
  readonly destinationPlaceId: string | null
  readonly destinationNodeId: string | null
  readonly reservedSlotNodeId: string | null
  readonly route: readonly RouteStepV5[]
  readonly routeIndex: number
  readonly distanceOnEdgeMm: number
  readonly headingRadians: number
  readonly tripOrdinal: number
  readonly nextDecisionTick: number
  readonly visitOrdinal: number
  readonly arrivedTick: number
}

export interface MovementTracePoint {
  readonly agentId: string
  readonly second: number
  readonly position: WorldPointMm
  readonly surfaceId: string
  readonly placeId: string | null
  readonly edgeId: string | null
}

export type AccessCommandV5 = Readonly<{
  id: string
  effectiveTick: number
  accessId: 'bridge-entry' | 'mall-entry' | 'galleria-escalator'
  mode: AccessMode
}>

export interface CitizenEventV5 {
  readonly id: string
  readonly tick: number
  readonly agentId: string
  readonly type: 'TripStarted' | 'DestinationReached' | 'ActivityFinished' |
    'TripDeferred' | 'TripFailed' | 'TripRerouted'
  readonly placeId: string | null
  readonly reason?: string
}

export interface OpportunityTargetV5 {
  readonly kind: 'citizen' | 'placeResource'
  readonly id: string
}

export interface OpportunityEncounterV5 {
  readonly id: string
  readonly offenderAgentId: string
  readonly target: OpportunityTargetV5
  readonly surfaceId: string
  readonly levelId: string
  readonly placeId: string | null
  readonly position: WorldPointMm
  readonly exposureSeconds: number
  readonly perceivedRisk: number
  readonly guardianship: number
}

export interface EncounterEpisodeV5 {
  readonly id: string
  readonly offenderAgentId: string
  readonly target: OpportunityTargetV5
  readonly startedTick: number
  readonly lastContactTick: number
  readonly totalExposureSeconds: number
  readonly accumulatedHazard: number
  readonly threshold: number
  readonly consumed: boolean
}

export interface OffenceV5 {
  readonly id: string
  readonly incidentId: string
  readonly tick: number
  readonly second: number
  readonly offenderAgentId: string
  readonly target: OpportunityTargetV5
  readonly severity: 'minor' | 'serious'
  readonly position: WorldPointMm
  readonly surfaceId: string
  readonly levelId: string
  readonly placeId: string | null
  readonly encounterId: string
  readonly opportunity: OpportunityEncounterV5
}

export interface ReportV5 {
  readonly id: string
  readonly availableTick: number
  readonly reportedOccurrenceTick: number
  readonly reportedPosition: WorldPointMm
  readonly reportedLevelId: string | null
  readonly reportedPlaceId: string | null
  readonly reportedSeverity: 'minor' | 'serious'
  readonly suspect: Readonly<{ status: 'unknown' }> | Readonly<{
    status: 'namedLead'; candidateAgentId: string; verification: 'unverified'
  }>
}

export interface SimulationConfigV5 {
  readonly version: 5
  readonly simulationSeed: string
  readonly offendingSeed: string
  readonly observationSeed: string
  readonly populationSize: number
  readonly logicalSecondsPerTick: 6
  readonly startHour: number
  readonly reportingProbability: number
  readonly initialAccessModes: Readonly<Record<string, AccessMode>>
  readonly placeAttractiveness?: Readonly<Record<string, number>>
  readonly placeOpeningHours?: Readonly<Record<string,
    readonly Readonly<{ openMinute: number; closeMinute: number }>[]> >
}

export interface SimulationStateV5 {
  readonly version: 5
  readonly fingerprint: string
  readonly tick: number
  readonly citizens: readonly CitizenStateV5[]
  readonly accessModes: Readonly<Record<string, AccessMode>>
  readonly events: readonly CitizenEventV5[]
  readonly encounterEpisodes: readonly EncounterEpisodeV5[]
  readonly offences: readonly OffenceV5[]
  readonly reports: readonly ReportV5[]
  readonly pendingReports: readonly Readonly<{ offenceId: string; availableTick: number }>[]
  readonly offenderCooldowns: Readonly<Record<string, number>>
  readonly resourceCooldowns: Readonly<Record<string, number>>
  readonly commands: readonly AccessCommandV5[]
}

export interface SimulationEnvironmentV5 {
  readonly world: WorldModelV2
  readonly config: SimulationConfigV5
  readonly profiles: readonly CitizenProfileV5[]
  readonly fingerprint: string
}

export const DEFAULT_SIMULATION_CONFIG_V5: SimulationConfigV5 = Object.freeze({
  version: 5,
  simulationSeed: 'shadow-city-sim-01',
  offendingSeed: 'shadow-city-offending-01',
  observationSeed: 'shadow-city-observation-01',
  populationSize: 120,
  logicalSecondsPerTick: 6,
  startHour: 8,
  reportingProbability: 0.6,
  initialAccessModes: Object.freeze({
    'bridge-entry': 'open', 'mall-entry': 'open', 'galleria-escalator': 'open',
  }),
})
