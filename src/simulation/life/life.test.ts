import { describe, expect, it } from 'vitest'
import { generateVerticalProofWorld } from '../../world/generation/generateWorldV2'
import { advanceStateV5, createEnvironmentV5, createInitialStateV5 } from '../engineV5'
import { observerViewV5 } from '../offending/opportunityV5'
import { projectObserverViewV5 } from '../encounter/observerProjection'
import { DEFAULT_SIMULATION_CONFIG_V5, type OffenceV5 } from '../v5Types'
import { applyLifeOutcomesV1, discoverLifeScenesV1, progressLifeRecoveryV1 } from './state'
import { computeLifeMetricsV1 } from './metrics'
import { DEFAULT_LIFE_SCENARIO_V1 } from './types'

const world = generateVerticalProofWorld()
const life = { ...DEFAULT_LIFE_SCENARIO_V1,
  injuryProbability: { minor: 1, serious: 1 },
  severityWeights: { minor: { minor: 1, serious: 0, critical: 0 },
    serious: { minor: 0, serious: 0, critical: 1 } },
  fatalProbabilityCritical: 1,
  discoveryProbabilityPerEligibleTick: 1,
  sceneReportProbability: 1,
  sceneReportDelayTicks: 2,
  incapacitatedTicks: { serious: 2, critical: 2 },
  recoveryTicks: { minor: 3, serious: 5, critical: 6 },
} as const
const config = { ...DEFAULT_SIMULATION_CONFIG_V5, populationSize: 2, life }
const environment = createEnvironmentV5(world, config)

function fixture(severity: 'minor' | 'serious', mechanism: 'physicalAssault' | 'nonPhysical',
  elevated = false) {
  const initial = createInitialStateV5(environment)
  const bridge = world.navNodes.find((item) => item.id === 'bridge:west')!
  const victim = { ...initial.citizens[1], ...(elevated ? {
    position: bridge.position, surfaceId: bridge.surfaceId,
    placeId: world.surfaces.find((item) => item.id === bridge.surfaceId)!.placeId,
    currentNodeId: bridge.id,
  } : {}) }
  const offence: OffenceV5 = {
    id: `test-offence:${severity}:${mechanism}:${elevated}`, incidentId: 'test-incident',
    tick: 1, second: 6, offenderAgentId: initial.citizens[0].id,
    target: { kind: 'citizen', id: victim.id }, severity, mechanism,
    position: victim.position, surfaceId: victim.surfaceId,
    levelId: world.surfaces.find((item) => item.id === victim.surfaceId)!.levelId,
    placeId: victim.placeId, encounterId: 'test-encounter',
    opportunity: { id: 'test-opportunity', offenderAgentId: initial.citizens[0].id,
      target: { kind: 'citizen', id: victim.id }, surfaceId: victim.surfaceId,
      levelId: world.surfaces.find((item) => item.id === victim.surfaceId)!.levelId,
      position: victim.position, placeId: victim.placeId, exposureSeconds: 6, perceivedRisk: 0,
      guardianship: 0 },
  }
  return { victim, offence, state: { ...initial, tick: 1,
    citizens: [initial.citizens[0], victim], offences: [offence] } }
}

describe('life-v1 persistent state', () => {
  it('does not infer harm from a serious nonphysical offence', () => {
    const { state } = fixture('serious', 'nonPhysical')
    const result = applyLifeOutcomesV1(state, environment)
    expect(result.life!.injuries).toHaveLength(0)
    expect(result.life!.deaths).toHaveLength(0)
  })

  it('creates a recoverable injury, reduces function, and recovers by fixed Tick', () => {
    const { state, victim } = fixture('minor', 'physicalAssault')
    const harmed = applyLifeOutcomesV1(state, environment)
    expect(harmed.life!.people[1]).toMatchObject({ agentId: victim.id,
      lifeStatus: 'alive', functionalStatus: 'impaired' })
    expect(harmed.life!.injuries[0]).toMatchObject({ sourceOffenceId: state.offences[0].id,
      recoveryTick: 4, status: 'active' })
    expect(progressLifeRecoveryV1(harmed, 3).life!.people[1]).toMatchObject({
      functionalStatus: 'impaired' })
    const recovered = progressLifeRecoveryV1(harmed, 4)
    expect(recovered.life!.people[1]).toMatchObject({ functionalStatus: 'unimpaired' })
    expect(recovered.life!.recoveryEvents).toHaveLength(1)
    expect(computeLifeMetricsV1(recovered)?.injuryToFatalRate).toBe(0)
  })

  it('holds an incapacitated resident and resumes only after the configured step-down', () => {
    const seriousLife = { ...life, fatalProbabilityCritical: 0 }
    const seriousEnvironment = createEnvironmentV5(world, { ...config, life: seriousLife })
    const { state, victim } = fixture('serious', 'physicalAssault')
    const compatible = { ...state, fingerprint: seriousEnvironment.fingerprint,
      life: createInitialStateV5(seriousEnvironment).life }
    const harmed = applyLifeOutcomesV1(compatible, seriousEnvironment)
    expect(harmed.life!.people[1]).toMatchObject({ functionalStatus: 'incapacitated' })
    expect(harmed.citizens[1].activity).toBe('incapacitated')
    const tick2 = advanceStateV5(harmed, seriousEnvironment)
    expect(tick2.citizens[1].position).toEqual(victim.position)
    expect(tick2.citizens[1].activity).toBe('incapacitated')
    const tick3 = advanceStateV5(tick2, seriousEnvironment)
    expect(tick3.life!.people[1]).toMatchObject({ functionalStatus: 'impaired' })
    expect(tick3.citizens[1]).toMatchObject({ activity: 'standingUp', position: victim.position })
    expect(tick3.life!.recoveryEvents.some((item) => item.kind === 'improved')).toBe(true)
    const tick4 = advanceStateV5(tick3, seriousEnvironment)
    expect(tick4.citizens[1].activity).not.toBe('standingUp')
    expect(progressLifeRecoveryV1(tick4, 7).life!.people[1]).toMatchObject({
      functionalStatus: 'unimpaired' })
  })

  it('rejects an attributed assault without a real victim or legal position', () => {
    const { state, offence } = fixture('serious', 'physicalAssault')
    expect(() => applyLifeOutcomesV1({ ...state,
      offences: [{ ...offence, target: { kind: 'citizen', id: 'missing-agent' } }] },
    environment)).toThrow(/no real victim/)
    expect(() => applyLifeOutcomesV1({ ...state,
      citizens: state.citizens.map((item) => item.id === offence.target.id ?
        { ...item, position: { x: 999_000_000, y: 250, z: 0 } } : item) },
    environment)).toThrow(/non-walkable position/)
  })

  it('retains elevated ground truth and stops deceased behavior without duplicating events', () => {
    const { state, victim } = fixture('serious', 'physicalAssault', true)
    const harmed = applyLifeOutcomesV1(state, environment)
    expect(harmed.life!.deaths).toHaveLength(1)
    expect(harmed.life!.deaths[0]).toMatchObject({ victimAgentId: victim.id,
      tick: 1, position: victim.position, surfaceId: victim.surfaceId,
      levelId: 'L1', relatedOffenceId: state.offences[0].id })
    expect(harmed.life!.scenes[0]).toMatchObject({ state: 'present', position: victim.position })
    expect(harmed.citizens[1].activity).toBe('deceased')
    expect(applyLifeOutcomesV1(harmed, environment).life!.deaths).toHaveLength(1)
    const next = advanceStateV5(harmed, environment)
    expect(next.citizens[1].position).toEqual(victim.position)
    expect(next.citizens[1].activity).toBe('deceased')
    expect(next.life!.people[1].lifeStatus).toBe('deceased')
    expect(next.life!.deaths).toEqual(harmed.life!.deaths)
    expect(createInitialStateV5(environment).life!.deaths).toHaveLength(0)
    expect(createInitialStateV5(environment).life!.people[1].lifeStatus).toBe('alive')
  })

  it('keeps discovery and delayed reports separate from truth', () => {
    const { state, victim } = fixture('serious', 'physicalAssault')
    const harmed = applyLifeOutcomesV1(state, environment)
    expect(observerViewV5(harmed).lifeReports).toEqual([])
    const observer = { ...harmed.citizens[0], position: victim.position,
      surfaceId: victim.surfaceId, placeId: victim.placeId, activity: 'atDestination' as const }
    const near = { ...harmed, tick: 2, citizens: [observer, harmed.citizens[1]] }
    const discovered = discoverLifeScenesV1(near, environment)
    expect(discovered.life!.observations).toHaveLength(1)
    expect(discovered.life!.observations[0].kind).toBe('discoveredDeathScene')
    expect(discovered.life!.knowledge[0]).not.toHaveProperty('deathEventId')
    expect(observerViewV5(discovered).lifeReports).toEqual([])
    const delivered = discoverLifeScenesV1({ ...discovered, tick: 4 }, environment)
    expect(observerViewV5(delivered).lifeReports).toHaveLength(1)
    expect(JSON.stringify(observerViewV5(delivered))).not.toContain(victim.id)
    expect(JSON.stringify(observerViewV5(delivered))).not.toContain(harmed.life!.deaths[0].id)
    expect(delivered.life!.deaths).toHaveLength(1)
    const malicious = { ...delivered, life: { ...delivered.life!, reports: [
      { ...delivered.life!.reports[0], victimAgentId: victim.id,
        deathEventId: harmed.life!.deaths[0].id, hiddenCause: 'secret' }] } }
    const projected = JSON.stringify(projectObserverViewV5(malicious))
    expect(projected).not.toContain('victimAgentId')
    expect(projected).not.toContain('deathEventId')
    expect(projected).not.toContain('hiddenCause')
  })

  it('does not discover a bridge death from the same X/Z on the ground', () => {
    const { state, victim } = fixture('serious', 'physicalAssault', true)
    const harmed = applyLifeOutcomesV1(state, environment)
    const ground = world.navNodes.find((item) => item.id === 'ground:-9:0')!
    expect(ground.position.x).toBe(victim.position.x)
    expect(ground.position.z).toBe(victim.position.z)
    const observer = { ...harmed.citizens[0], position: ground.position,
      surfaceId: ground.surfaceId, activity: 'atDestination' as const }
    const discovered = discoverLifeScenesV1({ ...harmed, tick: 2,
      citizens: [observer, harmed.citizens[1]] }, environment)
    expect(discovered.life!.observations).toHaveLength(0)
    expect(discovered.life!.knowledge).toHaveLength(0)
  })
})
