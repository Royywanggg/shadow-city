import { describe, expect, it } from 'vitest'
import { generateCity, HERO_SEED } from '../city/generation/generateCity'
import { createInitialStateV3, createSimulationEnvironmentV3, stepSimulationV3 } from './engineV3'
import { replayToTick } from './replay'
import { V04_REVIEW_SCENARIO_CONFIG, type SimulationConfigV3 } from './v3Types'

const city = generateCity(HERO_SEED)

function scenario(probability: number): SimulationConfigV3 {
  return {
    ...V04_REVIEW_SCENARIO_CONFIG,
    observation: { ...V04_REVIEW_SCENARIO_CONFIG.observation, globalProbability: probability },
  }
}

describe('v0.4 scenario boundaries', () => {
  it('rejects a supplied Replay environment from another observation scenario', () => {
    const low = scenario(0.3)
    const high = scenario(0.9)
    const lowEnvironment = createSimulationEnvironmentV3(city, low)
    const highEnvironment = createSimulationEnvironmentV3(city, high)
    expect(lowEnvironment.worldFingerprint).toBe(highEnvironment.worldFingerprint)
    expect(lowEnvironment.scenarioFingerprint).not.toBe(highEnvironment.scenarioFingerprint)
    expect(() => replayToTick(city, high, [], 10, lowEnvironment)).toThrow(/incompatible/i)
    expect(replayToTick(city, high, [], 10, highEnvironment).state)
      .toEqual(replayToTick(city, high, [], 10).state)
  })

  it('rejects v3 states from another scenario even when citizens and truth match', () => {
    const lowEnvironment = createSimulationEnvironmentV3(city, scenario(0.3))
    const highEnvironment = createSimulationEnvironmentV3(city, scenario(0.9))
    const lowState = createInitialStateV3(lowEnvironment)
    expect(() => stepSimulationV3(highEnvironment, lowState, [])).toThrow(/incompatible/i)
  })

  it('captures and freezes standalone environment configuration before callers mutate it', () => {
    const mutable: SimulationConfigV3 = {
      version: 3,
      citizen: { ...V04_REVIEW_SCENARIO_CONFIG.citizen },
      incident: {
        ...V04_REVIEW_SCENARIO_CONFIG.incident,
        districtMultipliers: { ...V04_REVIEW_SCENARIO_CONFIG.incident.districtMultipliers },
        timeBandMultipliers: { ...V04_REVIEW_SCENARIO_CONFIG.incident.timeBandMultipliers },
      },
      observation: {
        ...V04_REVIEW_SCENARIO_CONFIG.observation,
        severityExponent: { ...V04_REVIEW_SCENARIO_CONFIG.observation.severityExponent },
      },
    }
    const environment = createSimulationEnvironmentV3(city, mutable)
    const baseline = environment.config.incident.baselineRatePerOccupiedBlockHour
    const globalProbability = environment.config.observation.globalProbability
    const districtMultiplier = environment.config.incident.districtMultipliers.civic
    ;(mutable.incident as { baselineRatePerOccupiedBlockHour: number }).baselineRatePerOccupiedBlockHour = 100
    ;(mutable.observation as { globalProbability: number }).globalProbability = 0
    ;(mutable.incident.districtMultipliers as { civic: number }).civic = 50
    expect(environment.config.incident.baselineRatePerOccupiedBlockHour).toBe(baseline)
    expect(environment.config.observation.globalProbability).toBe(globalProbability)
    expect(environment.config.incident.districtMultipliers.civic).toBe(districtMultiplier)
    expect(Object.isFrozen(environment.config.incident.districtMultipliers)).toBe(true)
    expect(stepSimulationV3(environment, createInitialStateV3(environment), []).state.tick).toBe(1)
  })
})
