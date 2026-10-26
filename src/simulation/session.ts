import { createInitialState, stepSimulation, validateCommand, validateConfig } from './engine'
import { createInitialCitizenState, stepCitizenSimulation } from './engineV2'
import { createSimulationEnvironment, validateCitizenConfig } from './environment'
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

export interface SimulationHistoryLimits {
  readonly maxTicks: number
  readonly maxCommands: number
  readonly maxEvents: number
  readonly maxPendingActions: number
}

export const DEFAULT_HISTORY_LIMITS: SimulationHistoryLimits = Object.freeze({
  maxTicks: 50_000,
  maxCommands: 5_000,
  maxEvents: 10_000,
  maxPendingActions: 5_000,
})

function freezeState(state: SimulationState): SimulationState {
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
  if (Object.values(limits).some((value) => !Number.isSafeInteger(value) || value < 1)) {
    throw new Error('Invalid simulation history limits')
  }
}

export class SimulationSession {
  readonly city: StaticCity
  readonly config: SimulationConfig
  readonly environment: SimulationEnvironment | null
  readonly limits: SimulationHistoryLimits

  private liveState: SimulationState
  private previousLiveState: SimulationState | null = null
  private commandHistory: CommandEnvelope[] = []
  private commandsByTick = new Map<number, CommandEnvelope[]>()
  private eventHistory: SimulationEvent[] = []
  private inspected: ReplayResult | null = null
  private snapshot: SimulationSnapshot
  private listeners = new Set<() => void>()

  constructor(
    city: StaticCity,
    config: SimulationConfig = DEFAULT_SIMULATION_CONFIG,
    limits: SimulationHistoryLimits = DEFAULT_HISTORY_LIMITS,
  ) {
    if (config.version === 1) validateConfig(config)
    else validateCitizenConfig(config)
    validateLimits(limits)
    this.city = city
    this.config = Object.freeze({ ...config })
    this.limits = Object.freeze({ ...limits })
    this.environment = this.config.version === 2 ? createSimulationEnvironment(city, this.config) : null
    this.liveState = freezeState(this.config.version === 2
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
    const replay = replayToTick(this.city, this.config, this.commandHistory, tick, this.environment)
    this.inspected = {
      state: freezeState(replay.state),
      events: Object.freeze(replay.events.map((event) => Object.freeze(event))),
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
    this.liveState = freezeState(this.config.version === 2
      ? createInitialCitizenState(this.environment!, this.config)
      : createInitialState(this.config))
    this.previousLiveState = null
    this.commandHistory = []
    this.commandsByTick.clear()
    this.eventHistory = []
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
