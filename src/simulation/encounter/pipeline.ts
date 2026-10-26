import type { MovementTracePoint, SimulationEnvironmentV5, SimulationStateV5 } from '../v5Types'
import { createSocialProfilesV1 } from './socialProfiles'
import { querySpatialCandidates } from './spatial'
import { evaluatePerception } from './perception'
import { updateSocialEncounterLifecycle } from './lifecycle'
import { advanceEncounterCrimeV1 } from './crimeTick'
import { advanceSocialTickV1 } from './socialTick'

export interface EncounterTimingSampleV1 {
  readonly tick: number
  readonly spatialQueryMs: number
  readonly perceptionMs: number
  readonly lifecycleMs: number
  readonly crimeAndWitnessMs: number
  readonly socialDecisionAndMemoryMs: number
  readonly candidatePairSeconds: number
}

let timingObserver: ((sample: EncounterTimingSampleV1) => void) | null = null

/** Measurement only; the observer cannot change authoritative simulation state. */
export function setEncounterTimingObserverV1(observer: ((sample: EncounterTimingSampleV1) => void) | null): void {
  timingObserver = observer
}

/** Run the opt-in social pipeline from authoritative movement traces, never render state. */
export function advanceEncounterPipelineV1(state: SimulationStateV5,
  environment: SimulationEnvironmentV5, traces: readonly MovementTracePoint[],
  interruptedInteractionIds: ReadonlySet<string>): SimulationStateV5 {
  const scenario = environment.config.encounter
  if (!scenario || !state.social) throw new Error('Encounter state and config must agree')
  const socialProfiles = createSocialProfilesV1(state.citizens.map((citizen) => citizen.id),
    scenario.social.seed)
  const attention = Object.fromEntries(socialProfiles.map((profile) =>
    [profile.agentId, profile.attention]))
  const started = timingObserver ? performance.now() : 0
  const nearby = querySpatialCandidates(environment.world, traces, state.accessModes,
    { radiusMm: Math.max(5_000, scenario.lifecycle.exitDistanceMm) })
  const candidates = nearby.filter((sample) =>
    sample.distanceMm <= scenario.lifecycle.exitDistanceMm)
  const queried = timingObserver ? performance.now() : 0
  const perceptions = evaluatePerception(candidates, state.citizens,
    scenario.social.seed, state.tick, { ...scenario.perception, individualAttention: attention })
  const perceived = timingObserver ? performance.now() : 0
  const lifecycle = updateSocialEncounterLifecycle(state.social.encounters,
    candidates, perceptions, state.tick, environment.config.logicalSecondsPerTick,
    scenario.lifecycle)
  const lifecycled = timingObserver ? performance.now() : 0
  const withLifecycle: SimulationStateV5 = { ...state, social: { ...state.social,
    encounters: lifecycle.state,
    metrics: { ...state.social.metrics,
      candidatePairSeconds: state.social.metrics.candidatePairSeconds + candidates.length,
      perceivedPairSeconds: state.social.metrics.perceivedPairSeconds +
        new Set(perceptions.filter((item) => item.actuallyPerceived)
          .map((item) => JSON.stringify([item.second, item.pairKey]))).size } } }
  const afterCrime = scenario.offenceMode === 'encounterAware' ?
    advanceEncounterCrimeV1(withLifecycle, environment, traces, perceptions, nearby) : withLifecycle
  const criminallyEvaluated = timingObserver ? performance.now() : 0
  const socialTick = advanceSocialTickV1({ world: environment.world,
    config: scenario.social, tick: state.tick, citizens: afterCrime.citizens,
    previous: { ...afterCrime.social!, encounters: state.social.encounters,
      encounterEvents: state.social.encounterEvents }, lifecycle: lifecycle.state,
    lifecycleEvents: lifecycle.events, candidates, perceptions,
    interruptedInteractionIds, interactionsEnabled: scenario.interactionsEnabled })
  if (timingObserver) {
    const ended = performance.now()
    timingObserver({ tick: state.tick, spatialQueryMs: queried - started,
      perceptionMs: perceived - queried, lifecycleMs: lifecycled - perceived,
      crimeAndWitnessMs: criminallyEvaluated - lifecycled,
      socialDecisionAndMemoryMs: ended - criminallyEvaluated,
      candidatePairSeconds: candidates.length })
  }
  return { ...afterCrime, citizens: socialTick.citizens, social: socialTick.social }
}
