import { createInitialState, stepSimulation, validateCommand, validateConfig } from './engine'
import { createInitialCitizenState, stepCitizenSimulation } from './engineV2'
import { createSimulationEnvironment, validateCitizenConfig } from './environment'
import type {
  CommandEnvelope,
  ReplayResult,
  SimulationConfig,
  SimulationEvent,
  SimulationEnvironment,
  StaticCity,
} from './types'

// Replay reconstructs facts from accepted domain inputs; playback controls are absent.
export function replayToTick(
  city: StaticCity,
  config: SimulationConfig,
  acceptedCommands: readonly CommandEnvelope[],
  targetTick: number,
  suppliedEnvironment?: SimulationEnvironment | null,
): ReplayResult {
  if (config.version === 1) validateConfig(config)
  else validateCitizenConfig(config)
  if (!Number.isSafeInteger(targetTick) || targetTick < 0) {
    throw new Error('Invalid replay target tick')
  }
  const byTick = new Map<number, CommandEnvelope[]>()
  const seenSequences = new Set<number>()
  const seenIds = new Set<string>()
  for (const envelope of acceptedCommands) {
    validateCommand(envelope)
    if (seenSequences.has(envelope.submissionSequence) || seenIds.has(envelope.id)) {
      throw new Error('Duplicate command ordering key')
    }
    seenSequences.add(envelope.submissionSequence)
    seenIds.add(envelope.id)
    if (envelope.effectiveTick <= targetTick) {
      const commands = byTick.get(envelope.effectiveTick) ?? []
      commands.push(envelope)
      byTick.set(envelope.effectiveTick, commands)
    }
  }

  const events: SimulationEvent[] = []
  if (config.version === 1) {
    let state = createInitialState(config)
    for (let tick = 1; tick <= targetTick; tick += 1) {
      const transition = stepSimulation(city, config, state, byTick.get(tick) ?? [])
      state = transition.state
      events.push(...transition.events)
    }
    return { state, events }
  }
  const environment = suppliedEnvironment ?? createSimulationEnvironment(city, config)
  let state = createInitialCitizenState(environment, config)
  for (let tick = 1; tick <= targetTick; tick += 1) {
    const transition = stepCitizenSimulation(environment, config, state, byTick.get(tick) ?? [])
    state = transition.state
    events.push(...transition.events)
  }
  return { state, events }
}
