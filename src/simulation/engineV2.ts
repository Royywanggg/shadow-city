import { createInitialCitizens, stepCitizen } from './agents'
import { compareCommands, validateCommand } from './engine'
import { validateCitizenConfig } from './environment'
import { createRandomStream, nextRandom } from './rng'
import type {
  CitizenEvent,
  CommandEnvelope,
  ScheduledDiagnosticAction,
  SimulationConfigV2,
  SimulationEnvironment,
  SimulationEvent,
  SimulationStateV2,
  SimulationTransitionV2,
} from './types'

function compareActions(a: ScheduledDiagnosticAction, b: ScheduledDiagnosticAction): number {
  return a.dueTick - b.dueTick || a.priority - b.priority || a.insertionSequence - b.insertionSequence
}

function assertEnvironment(env: SimulationEnvironment, config: SimulationConfigV2): void {
  if (env.config.version !== config.version || env.config.simulationSeed !== config.simulationSeed ||
      env.config.logicalSecondsPerTick !== config.logicalSecondsPerTick ||
      env.config.populationSize !== config.populationSize || env.config.behaviorModel !== config.behaviorModel) {
    throw new Error('Simulation environment and configuration mismatch')
  }
}

export function createInitialCitizenState(env: SimulationEnvironment, config: SimulationConfigV2): SimulationStateV2 {
  validateCitizenConfig(config)
  assertEnvironment(env, config)
  return {
    version: 2,
    environmentFingerprint: env.fingerprint,
    tick: 0,
    logicalTimeSeconds: 0,
    rng: { diagnostic: createRandomStream(config.simulationSeed, 'diagnostic') },
    pendingActions: [],
    nextActionSequence: 0,
    nextEventSequence: 0,
    diagnosticSampleCount: 0,
    citizens: createInitialCitizens(env, config),
  }
}

export function stepCitizenSimulation(
  env: SimulationEnvironment,
  config: SimulationConfigV2,
  state: SimulationStateV2,
  commandsForTick: readonly CommandEnvelope[],
): SimulationTransitionV2 {
  validateCitizenConfig(config)
  assertEnvironment(env, config)
  if (state.version !== 2 || state.environmentFingerprint !== env.fingerprint ||
      !Number.isSafeInteger(state.tick) || state.tick < 0 || state.citizens.length !== env.profiles.length) {
    throw new Error('Invalid or incompatible citizen simulation state')
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
    if (envelope.effectiveTick !== tick || seenSequences.has(envelope.submissionSequence) || seenIds.has(envelope.id)) {
      throw new Error('Invalid command ordering at this tick')
    }
    seenSequences.add(envelope.submissionSequence)
    seenIds.add(envelope.id)
  }

  let nextActionSequence = state.nextActionSequence
  const actions: ScheduledDiagnosticAction[] = [...state.pendingActions]
  for (const envelope of commands) {
    actions.push({
      type: 'DiagnosticProbe',
      dueTick: tick + envelope.command.delayTicks,
      priority: envelope.priority,
      insertionSequence: nextActionSequence++,
      originCommandId: envelope.id,
      label: envelope.command.label ?? '',
    })
  }
  actions.sort(compareActions)
  const pendingActions: ScheduledDiagnosticAction[] = []
  const events: SimulationEvent[] = []
  let diagnosticRng = state.rng.diagnostic
  let diagnosticSampleCount = state.diagnosticSampleCount
  let nextEventSequence = state.nextEventSequence
  for (const action of actions) {
    if (action.dueTick > tick) {
      pendingActions.push(action)
      continue
    }
    const random = nextRandom(diagnosticRng)
    diagnosticRng = random.state
    const nodeCount = env.city.roads.nodes.length
    const roadNodeId = nodeCount > 0
      ? env.city.roads.nodes[Math.floor(random.value * nodeCount)].id
      : null
    const sequence = nextEventSequence++
    events.push({
      id: `event-${env.runId}-diagnostic-${sequence}`,
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

  const citizens = state.citizens.map((previous, index) => {
    const profile = env.profiles[index]
    const result = stepCitizen(env, config, profile, previous, tick)
    result.events.forEach((draft, eventIndex) => {
      const sequence = nextEventSequence++
      const ordinal = previous.nextEventOrdinal + eventIndex
      events.push({
        ...draft,
        id: `event-${env.runId}-${profile.id}-${ordinal}`,
        tick,
        sequence,
        source: 'citizen',
        agentId: profile.id,
      } as CitizenEvent)
    })
    return result.citizen
  })

  return {
    state: {
      version: 2,
      environmentFingerprint: env.fingerprint,
      tick,
      logicalTimeSeconds: tick * config.logicalSecondsPerTick,
      rng: { diagnostic: diagnosticRng },
      pendingActions,
      nextActionSequence,
      nextEventSequence,
      diagnosticSampleCount,
      citizens,
    },
    events,
  }
}
