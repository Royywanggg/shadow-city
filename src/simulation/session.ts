import { createInitialState, stepSimulation, validateCommand, validateConfig } from './engine'
import { createInitialCitizenState, stepCitizenSimulation } from './engineV2'
import { createInitialStateV3, createSimulationEnvironmentV3, stepSimulationV3, type SimulationEnvironmentV3 } from './engineV3'
import { createSimulationEnvironment, validateCitizenConfig } from './environment'
import { selectGroundTruthView, selectObservedWorldView } from './observation'
import { replayToTick } from './replay'
import { DEFAULT_SIMULATION_CONFIG } from './types'
import type {
  CommandEnvelope,
  ReplayResult,
  SimulationCommand,
  SimulationConfig,
  SimulationEvent,
  SimulationEnvironment,
  SimulationSnapshot,
  SimulationState,
  StaticCity,
} from './types'
import type { GroundTruthView, IncidentOccurredEvent, ObservedWorldView, ObserverPort, ReportAvailableEvent } from './v3Types'

export interface SimulationHistoryLimits {
  readonly maxTicks: number
  readonly maxCommands: number
  readonly maxEvents: number
  readonly maxPendingActions: number
  readonly maxIncidents?: number
  readonly maxReports?: number
}

export const DEFAULT_HISTORY_LIMITS: Required<SimulationHistoryLimits> = Object.freeze({
  maxTicks: 50_000,
  maxCommands: 5_000,
  maxEvents: 10_000,
  maxPendingActions: 5_000,
  maxIncidents: 5_000,
  maxReports: 5_000,
})

function freezeState(state: SimulationState): SimulationState {
  if (state.version === 3) {
    freezeState(state.citizen)
    for (const incident of state.incidents) {
      Object.freeze(incident.position)
      Object.freeze(incident.involvedAgentIds)
      Object.freeze(incident.context)
      Object.freeze(incident.provenance)
      Object.freeze(incident)
    }
    Object.freeze(state.incidents)
    for (const outcome of state.reporting.outcomes) Object.freeze(outcome)
    for (const record of state.reporting.records) {
      Object.freeze(record.reportedPosition)
      Object.freeze(record)
    }
    Object.freeze(state.reporting.outcomes)
    Object.freeze(state.reporting.records)
    Object.freeze(state.reporting)
    return Object.freeze(state)
  }
  for (const action of state.pendingActions) Object.freeze(action)
  Object.freeze(state.pendingActions)
  Object.freeze(state.rng)
  if (state.version === 2) {
    for (const citizen of state.citizens) {
      Object.freeze(citizen.position)
      for (const step of citizen.route) Object.freeze(step)
      Object.freeze(citizen.route)
      Object.freeze(citizen)
    }
    Object.freeze(state.citizens)
  }
  return Object.freeze(state)
}

function validateLimits(limits: SimulationHistoryLimits): void {
  if (Object.values(limits).some((value) => value !== undefined && (!Number.isSafeInteger(value) || value < 1))) {
    throw new Error('Invalid simulation history limits')
  }
}

function freezeConfig(config: SimulationConfig): SimulationConfig {
  if (config.version !== 3) return Object.freeze({ ...config })
  return Object.freeze({
    version: 3,
    citizen: Object.freeze({ ...config.citizen }),
    incident: Object.freeze({
      ...config.incident,
      districtMultipliers: Object.freeze({ ...config.incident.districtMultipliers }),
      timeBandMultipliers: Object.freeze({ ...config.incident.timeBandMultipliers }),
    }),
    observation: Object.freeze({
      ...config.observation,
      severityExponent: Object.freeze({ ...config.observation.severityExponent }),
    }),
  })
}

export class SimulationSession {
  readonly city: StaticCity
  readonly config: SimulationConfig
  readonly environment: SimulationEnvironment | null
  readonly environmentV3: SimulationEnvironmentV3 | null
  readonly limits: Required<SimulationHistoryLimits>

  private liveState: SimulationState
  private previousLiveState: SimulationState | null = null
  private commandHistory: CommandEnvelope[] = []
  private commandsByTick = new Map<number, CommandEnvelope[]>()
  private eventHistory: SimulationEvent[] = []
  private truthEventHistory: IncidentOccurredEvent[] = []
  private observationEventHistory: ReportAvailableEvent[] = []
  private inspected: ReplayResult | null = null
  private snapshot: SimulationSnapshot
  private listeners = new Set<() => void>()

  constructor(
    city: StaticCity,
    config: SimulationConfig = DEFAULT_SIMULATION_CONFIG,
    limits: SimulationHistoryLimits = DEFAULT_HISTORY_LIMITS,
  ) {
    if (config.version === 1) validateConfig(config)
    else if (config.version === 2) validateCitizenConfig(config)
    validateLimits(limits)
    this.city = city
    this.config = freezeConfig(config)
    this.limits = Object.freeze({ ...DEFAULT_HISTORY_LIMITS, ...limits })
    this.environmentV3 = this.config.version === 3 ? createSimulationEnvironmentV3(city, this.config) : null
    this.environment = this.config.version === 2 ? createSimulationEnvironment(city, this.config)
      : this.environmentV3?.citizen ?? null
    this.liveState = freezeState(this.config.version === 3
      ? createInitialStateV3(this.environmentV3!)
      : this.config.version === 2
        ? createInitialCitizenState(this.environment!, this.config)
        : createInitialState(this.config))
    this.snapshot = this.buildSnapshot()
  }

  getSnapshot = (): SimulationSnapshot => this.snapshot

  getPreviousLiveState(): SimulationState | null {
    return this.previousLiveState
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getCommandHistory(): readonly CommandEnvelope[] {
    return [...this.commandHistory]
  }

  getEventHistory(): readonly SimulationEvent[] {
    return [...(this.inspected?.events ?? this.eventHistory)]
  }

  getLiveEventHistory(): readonly SimulationEvent[] {
    return [...this.eventHistory]
  }

  /** Researcher capability. Never pass the session itself to observer-only consumers. */
  getGroundTruthView(): GroundTruthView {
    const state = this.inspected?.state ?? this.liveState
    if (state.version !== 3 || this.config.version !== 3) throw new Error('Ground truth is unavailable in this simulation version')
    return selectGroundTruthView(state, this.config.observation)
  }

  getObservedWorldView(): ObservedWorldView {
    const state = this.inspected?.state ?? this.liveState
    if (state.version !== 3) throw new Error('Observed world is unavailable in this simulation version')
    return selectObservedWorldView(state)
  }

  /** A restricted object: no raw state, incident log, pending reports, or researcher view. */
  createObserverPort(): ObserverPort {
    if (this.config.version !== 3) throw new Error('Observer port requires a v3 scenario')
    let lastSnapshot = this.snapshot
    let lastView = this.getObservedWorldView()
    const getView = () => {
      if (this.snapshot !== lastSnapshot) {
        lastSnapshot = this.snapshot
        lastView = this.getObservedWorldView()
      }
      return lastView
    }
    return Object.freeze({
      getView,
      subscribe: (listener: () => void) => this.subscribe(listener),
    })
  }

  getTruthEventHistory(): readonly IncidentOccurredEvent[] {
    return [...(this.inspected?.truthEvents ?? this.truthEventHistory)]
  }

  getObservationEventHistory(): readonly ReportAvailableEvent[] {
    return [...(this.inspected?.observationEvents ?? this.observationEventHistory)]
  }

  submitCommand(
    command: SimulationCommand,
    options: { readonly effectiveTick?: number; readonly priority?: number } = {},
  ): CommandEnvelope {
    this.assertLive()
    if (this.commandHistory.length >= this.limits.maxCommands) {
      throw new Error('Command history limit reached; reset simulation to continue')
    }
    const submissionSequence = this.commandHistory.length
    const envelope: CommandEnvelope = {
      id: `command-${submissionSequence}`,
      effectiveTick: options.effectiveTick ?? this.liveState.tick + 1,
      priority: options.priority ?? 0,
      submissionSequence,
      command: { ...command },
    }
    validateCommand(envelope)
    if (envelope.effectiveTick <= this.liveState.tick ||
        envelope.effectiveTick > this.limits.maxTicks) {
      throw new Error('Command must target a future tick within the history limit')
    }
    if (envelope.effectiveTick + envelope.command.delayTicks > this.limits.maxTicks) {
      throw new Error('Scheduled action exceeds the tick history limit')
    }
    Object.freeze(envelope.command)
    this.commandHistory.push(Object.freeze(envelope))
    const commands = this.commandsByTick.get(envelope.effectiveTick) ?? []
    commands.push(envelope)
    this.commandsByTick.set(envelope.effectiveTick, commands)
    this.publish()
    return envelope
  }

  advanceOneTick(): void {
    this.assertLive()
    if (this.liveState.tick >= this.limits.maxTicks) {
      throw new Error('Tick history limit reached; reset simulation to continue')
    }
    const nextTick = this.liveState.tick + 1
    const commands = this.commandsByTick.get(nextTick) ?? []
    if (this.config.version === 3 && this.liveState.version === 3) {
      const transition = stepSimulationV3(this.environmentV3!, this.liveState, commands)
      if (this.eventHistory.length + transition.citizenEvents.length > this.limits.maxEvents ||
          transition.state.citizen.pendingActions.length > this.limits.maxPendingActions ||
          transition.state.incidents.length > this.limits.maxIncidents ||
          transition.state.reporting.records.length > this.limits.maxReports) {
        throw new Error('Simulation history limit reached; reset simulation to continue')
      }
      this.previousLiveState = this.liveState
      this.liveState = freezeState(transition.state)
      this.eventHistory.push(...transition.citizenEvents.map((event) => Object.freeze(event)))
      this.truthEventHistory.push(...transition.truthEvents.map((event) => Object.freeze(event)))
      this.observationEventHistory.push(...transition.observationEvents.map((event) => Object.freeze(event)))
      this.publish()
      return
    }
    const transition = this.config.version === 2 && this.liveState.version === 2
      ? stepCitizenSimulation(this.environment!, this.config, this.liveState, commands)
      : this.config.version === 1 && this.liveState.version === 1
        ? stepSimulation(this.city, this.config, this.liveState, commands)
        : (() => { throw new Error('Simulation config and state version mismatch') })()
    if (this.eventHistory.length + transition.events.length > this.limits.maxEvents ||
        transition.state.pendingActions.length > this.limits.maxPendingActions) {
      throw new Error('Simulation history limit reached; reset simulation to continue')
    }
    this.previousLiveState = this.liveState
    this.liveState = freezeState(transition.state)
    this.eventHistory.push(...transition.events.map((event) => Object.freeze(event)))
    this.publish()
  }

  inspectTick(tick: number): void {
    if (!Number.isSafeInteger(tick) || tick < 0 || tick > this.liveState.tick) {
      throw new Error('Inspection tick must be within the live history')
    }
    const replay = replayToTick(this.city, this.config, this.commandHistory, tick,
      this.environmentV3 ?? this.environment)
    this.inspected = {
      state: freezeState(replay.state),
      events: Object.freeze(replay.events.map((event) => Object.freeze(event))),
      truthEvents: replay.truthEvents && Object.freeze(replay.truthEvents.map((event) => Object.freeze(event))),
      observationEvents: replay.observationEvents && Object.freeze(replay.observationEvents.map((event) => Object.freeze(event))),
    }
    this.publish()
  }

  returnLive(): void {
    if (this.inspected === null) return
    this.inspected = null
    this.previousLiveState = null
    this.publish()
  }

  reset(): void {
    this.liveState = freezeState(this.config.version === 3
      ? createInitialStateV3(this.environmentV3!)
      : this.config.version === 2
        ? createInitialCitizenState(this.environment!, this.config)
        : createInitialState(this.config))
    this.previousLiveState = null
    this.commandHistory = []
    this.commandsByTick.clear()
    this.eventHistory = []
    this.truthEventHistory = []
    this.observationEventHistory = []
    this.inspected = null
    this.publish()
  }

  private assertLive(): void {
    if (this.inspected !== null) {
      throw new Error('Return to live simulation before advancing or submitting commands')
    }
  }

  private buildSnapshot(): SimulationSnapshot {
    const state = this.inspected?.state ?? this.liveState
    const events = this.inspected?.events ?? this.eventHistory
    return Object.freeze({
      state,
      tick: state.tick,
      liveTick: this.liveState.tick,
      isInspecting: this.inspected !== null,
      eventCount: events.length,
      commandCount: this.commandHistory.length,
      lastEvent: events.at(-1) ?? null,
    })
  }

  private publish(): void {
    this.snapshot = this.buildSnapshot()
    for (const listener of this.listeners) listener()
  }
}
