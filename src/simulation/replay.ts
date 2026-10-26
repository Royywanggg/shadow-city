import { createInitialState, stepSimulation, validateCommand, validateConfig } from './engine'
import { createInitialCitizenState, stepCitizenSimulation } from './engineV2'
import { createInitialStateV3, createSimulationEnvironmentV3, stepSimulationV3, type SimulationEnvironmentV3 } from './engineV3'
import { createSimulationEnvironment, validateCitizenConfig } from './environment'
import type {
  CommandEnvelope,
  ReplayResult,
  SimulationConfig,
  SimulationEvent,
  SimulationEnvironment,
  StaticCity,
} from './types'
import type { IncidentOccurredEvent, ReportAvailableEvent } from './v3Types'

// Replay reconstructs facts from accepted domain inputs; playback controls are absent.
export function replayToTick(
  city: StaticCity,
  config: SimulationConfig,
  acceptedCommands: readonly CommandEnvelope[],
  targetTick: number,
  suppliedEnvironment?: SimulationEnvironment | SimulationEnvironmentV3 | null,
): ReplayResult {
  if (config.version === 1) validateConfig(config)
  else if (config.version === 2) validateCitizenConfig(config)
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
  if (config.version === 3) {
    const expected = createSimulationEnvironmentV3(city, config)
    if (suppliedEnvironment &&
        (!('worldFingerprint' in suppliedEnvironment) ||
          suppliedEnvironment.worldFingerprint !== expected.worldFingerprint ||
          suppliedEnvironment.scenarioFingerprint !== expected.scenarioFingerprint)) {
      throw new Error('Supplied replay environment is incompatible with the v3 scenario')
    }
    const environment = suppliedEnvironment && 'worldFingerprint' in suppliedEnvironment
      ? suppliedEnvironment : expected
    const truthEvents: IncidentOccurredEvent[] = []
    const observationEvents: ReportAvailableEvent[] = []
    let state = createInitialStateV3(environment)
    for (let tick = 1; tick <= targetTick; tick += 1) {
      const transition = stepSimulationV3(environment, state, byTick.get(tick) ?? [])
      state = transition.state
      events.push(...transition.citizenEvents)
      truthEvents.push(...transition.truthEvents)
      observationEvents.push(...transition.observationEvents)
    }
    return { state, events, truthEvents, observationEvents }
  }
  const environment = suppliedEnvironment && !('worldFingerprint' in suppliedEnvironment)
    ? suppliedEnvironment
    : createSimulationEnvironment(city, config)
  let state = createInitialCitizenState(environment, config)
  for (let tick = 1; tick <= targetTick; tick += 1) {
    const transition = stepCitizenSimulation(environment, config, state, byTick.get(tick) ?? [])
    state = transition.state
    events.push(...transition.events)
  }
  return { state, events }
}
