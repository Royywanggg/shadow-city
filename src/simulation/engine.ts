import { createRandomStream, hashSeed, nextRandom } from './rng'
import type {
  CommandEnvelope,
  ScheduledDiagnosticAction,
  SimulationConfig,
  SimulationEvent,
  SimulationState,
  SimulationTransition,
  StaticCity,
} from './types'

export const MAX_PROBE_DELAY_TICKS = 100_000
export const SIMULATION_ENGINE_VERSION = '0.2.0'

export function validateConfig(config: SimulationConfig): void {
  if (config.version !== 1 || !config.simulationSeed ||
      !Number.isSafeInteger(config.logicalSecondsPerTick) || config.logicalSecondsPerTick <= 0) {
    throw new Error('Invalid simulation configuration')
  }
}

export function validateCommand(envelope: CommandEnvelope): void {
  if (!envelope.id || !Number.isSafeInteger(envelope.effectiveTick) || envelope.effectiveTick < 1 ||
      !Number.isSafeInteger(envelope.priority) || !Number.isSafeInteger(envelope.submissionSequence) ||
      envelope.submissionSequence < 0 || envelope.command.type !== 'ScheduleDiagnosticProbe' ||
      !Number.isSafeInteger(envelope.command.delayTicks) || envelope.command.delayTicks < 0 ||
      envelope.command.delayTicks > MAX_PROBE_DELAY_TICKS ||
      (envelope.command.label !== undefined &&
        (envelope.command.label.length > 64 || /[\u0000-\u001f]/.test(envelope.command.label)))) {
    throw new Error('Invalid simulation command')
  }
}

export function createInitialState(config: SimulationConfig): SimulationState {
  validateConfig(config)
  return {
    version: 1,
    tick: 0,
    logicalTimeSeconds: 0,
    rng: { diagnostic: createRandomStream(config.simulationSeed, 'diagnostic') },
    pendingActions: [],
    nextActionSequence: 0,
    nextEventSequence: 0,
    diagnosticSampleCount: 0,
  }
}

export function compareCommands(a: CommandEnvelope, b: CommandEnvelope): number {
  return a.priority - b.priority || a.submissionSequence - b.submissionSequence
}

function compareActions(a: ScheduledDiagnosticAction, b: ScheduledDiagnosticAction): number {
  return a.dueTick - b.dueTick || a.priority - b.priority ||
    a.insertionSequence - b.insertionSequence
}

export function stepSimulation(
  city: StaticCity,
  config: SimulationConfig,
  state: SimulationState,
  commandsForTick: readonly CommandEnvelope[],
): SimulationTransition {
  validateConfig(config)
  if (state.version !== 1 || !Number.isSafeInteger(state.tick) || state.tick < 0) {
    throw new Error('Invalid simulation state')
  }
  const tick = state.tick + 1
  if (!Number.isSafeInteger(tick) || !Number.isSafeInteger(tick * config.logicalSecondsPerTick)) {
    throw new Error('Simulation time limit reached')
  }
  const commands = [...commandsForTick].sort(compareCommands)
  const seenSequences = new Set<number>()
  const seenIds = new Set<string>()
  for (const envelope of commands) {
    validateCommand(envelope)
    if (envelope.effectiveTick !== tick) {
      throw new Error('Command is not effective at this tick')
    }
    if (seenSequences.has(envelope.submissionSequence) || seenIds.has(envelope.id)) {
      throw new Error('Duplicate command ordering key')
    }
    seenSequences.add(envelope.submissionSequence)
    seenIds.add(envelope.id)
  }

  let nextActionSequence = state.nextActionSequence
  const actions: ScheduledDiagnosticAction[] = [...state.pendingActions]
  for (const envelope of commands) {
    const { command } = envelope
    actions.push({
      type: 'DiagnosticProbe',
      dueTick: tick + command.delayTicks,
      priority: envelope.priority,
      insertionSequence: nextActionSequence++,
      originCommandId: envelope.id,
      label: command.label ?? '',
    })
  }
  actions.sort(compareActions)
  const pendingActions: ScheduledDiagnosticAction[] = []
  const events: SimulationEvent[] = []
  let nextEventSequence = state.nextEventSequence
  let diagnosticRng = state.rng.diagnostic
  let diagnosticSampleCount = state.diagnosticSampleCount
  const runId = hashSeed(
    `${SIMULATION_ENGINE_VERSION}\u0000${city.seed}\u0000${config.simulationSeed}\u0000${config.logicalSecondsPerTick}`,
  ).toString(16).padStart(8, '0')

  for (const action of actions) {
    if (action.dueTick > tick) {
      pendingActions.push(action)
      continue
    }
    const random = nextRandom(diagnosticRng)
    diagnosticRng = random.state
    const nodeCount = city.roads.nodes.length
    const roadNodeId = nodeCount > 0
      ? city.roads.nodes[Math.floor(random.value * nodeCount)].id
      : null
    const sequence = nextEventSequence++
    events.push({
      id: `event-${runId}-${tick}-${sequence}`,
      tick,
      sequence,
      type: 'DiagnosticProbeSampled',
      source: 'diagnostic',
      originCommandId: action.originCommandId,
      label: action.label,
      sample: random.value,
      roadNodeId,
    })
    diagnosticSampleCount += 1
  }

  return {
    state: {
      version: 1,
      tick,
      logicalTimeSeconds: tick * config.logicalSecondsPerTick,
      rng: { diagnostic: diagnosticRng },
      pendingActions,
      nextActionSequence,
      nextEventSequence,
      diagnosticSampleCount,
    },
    events,
  }
}
