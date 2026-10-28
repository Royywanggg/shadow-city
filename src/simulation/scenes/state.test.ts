import { describe, expect, it } from 'vitest'
import { generateVerticalProofWorld } from '../../world/generation/generateWorldV2'
import { createEnvironmentV5, createInitialStateV5 } from '../engineV5'
import { DEFAULT_ENCOUNTER_SCENARIO_V1 } from '../encounter/config'
import { buildEventIndexV1 } from '../events/eventIndex'
import { applyLifeOutcomesV1, progressLifeRecoveryV1 } from '../life/state'
import { DEFAULT_LIFE_SCENARIO_V1 } from '../life/types'
import { observerViewV5 } from '../offending/opportunityV5'
import { DEFAULT_SIMULATION_CONFIG_V5, type OffenceV5 } from '../v5Types'
import { advanceSceneStateV1, assertSceneStateV1 } from './state'
import { DEFAULT_SCENE_SCENARIO_V1 } from './types'

const world = generateVerticalProofWorld()
const life = { ...DEFAULT_LIFE_SCENARIO_V1,
  assaultProbability: { minor: 1, serious: 1 },
  injuryProbability: { minor: 1, serious: 1 },
  severityWeights: { minor: { minor: 0, serious: 0, critical: 1 },
    serious: { minor: 0, serious: 0, critical: 1 } },
  fatalProbabilityCritical: 1,
  discoveryRadiusMm: 7_000,
  discoveryProbabilityPerEligibleTick: 1,
  sceneReportProbability: 1,
  sceneReportDelayTicks: 2,
  incapacitatedTicks: { serious: 2, critical: 2 },
  recoveryTicks: { minor: 5, serious: 5, critical: 5 },
} as const
const config = { ...DEFAULT_SIMULATION_CONFIG_V5, populationSize: 2,
  life, scene: DEFAULT_SCENE_SCENARIO_V1 }
const environment = createEnvironmentV5(world, config)

function harmFixture(fatal: boolean,
  baseEnvironment = environment) {
  const activeEnvironment = fatal ? baseEnvironment : createEnvironmentV5(world,
    { ...baseEnvironment.config, life: { ...life, fatalProbabilityCritical: 0 } })
  const initial = createInitialStateV5(activeEnvironment)
  const bridge = world.navNodes.find((item) => item.id === 'bridge:west')!
  const victim = { ...initial.citizens[1], position: bridge.position,
    surfaceId: bridge.surfaceId, currentNodeId: bridge.id,
    placeId: world.surfaces.find((item) => item.id === bridge.surfaceId)!.placeId }
  const offence: OffenceV5 = {
    id: 'test-offence:assault', incidentId: 'test-incident',
    tick: 1, second: 4, offenderAgentId: initial.citizens[0].id,
    target: { kind: 'citizen', id: victim.id }, severity: 'serious',
    mechanism: 'physicalAssault', position: victim.position,
    surfaceId: victim.surfaceId, levelId: 'L1', placeId: victim.placeId,
    encounterId: 'test-encounter',
    opportunity: { id: 'test-opportunity', offenderAgentId: initial.citizens[0].id,
      target: { kind: 'citizen', id: victim.id }, surfaceId: victim.surfaceId,
      levelId: 'L1', position: victim.position, placeId: victim.placeId,
      exposureSeconds: 6, perceivedRisk: 0, guardianship: 0 },
  }
  const state = { ...initial, tick: 1,
    citizens: initial.citizens.map((item, index) => index === 1 ? victim : item),
    offences: [offence] }
  return { activeEnvironment, state, victim, offence }
}

describe('scene-v1 persistent spatial evidence', () => {
  it('allows a legal no-event run and rejects an unversioned configuration', () => {
    const empty = createInitialStateV5(environment)
    expect(advanceSceneStateV1(empty, environment).scene!.entities).toHaveLength(0)
    expect(() => createEnvironmentV5(world, { ...config,
      scene: { ...DEFAULT_SCENE_SCENARIO_V1, version: 'wrong' as 'scene-v1' } }))
      .toThrow(/scene-v1/)
  })

  it('creates one death scene with exact spatial provenance, then discovers across valid space only', () => {
    const { state, victim } = harmFixture(true)
    const harmed = applyLifeOutcomesV1(state, environment)
    expect(harmed.life!.scenes).toHaveLength(0)
    const created = advanceSceneStateV1(harmed, environment)
    expect(created.scene!.entities).toHaveLength(1)
    const scene = created.scene!.entities[0]
    expect(scene).toMatchObject({ id: 'scene:' + harmed.life!.deaths[0].id,
      kind: 'deathAftermath', createdTick: 1, status: 'present',
      anchor: { position: victim.position, surfaceId: victim.surfaceId,
        levelId: 'L1' } })
    expect(created.scene!.transitions).toHaveLength(1)
    expect(buildEventIndexV1(created, world).find((item) =>
      item.kind === 'offence')?.sceneId).toBe(scene.id)
    expect(advanceSceneStateV1(created, environment).scene!.entities).toHaveLength(1)
    assertSceneStateV1(created, world)

    const groundObserver = { ...created.citizens[0], activity: 'atDestination' as const,
      position: { x: victim.position.x, y: 0, z: victim.position.z },
      surfaceId: 'ground' }
    const crossFloor = advanceSceneStateV1({ ...created, tick: 2,
      citizens: [groundObserver, created.citizens[1]] }, environment)
    expect(crossFloor.scene!.discoveries).toHaveLength(0)
    const bridgeObserver = { ...groundObserver, position: victim.position,
      surfaceId: victim.surfaceId }
    const discovered = advanceSceneStateV1({ ...created, tick: 2,
      citizens: [bridgeObserver, created.citizens[1]] }, environment)
    expect(discovered.scene!.discoveries).toHaveLength(1)
    expect(discovered.life!.knowledge).toHaveLength(1)
    expect(discovered.scene!.reportLinks).toHaveLength(1)
    expect(observerViewV5(discovered).lifeReports).toHaveLength(0)
    const t4 = advanceSceneStateV1({ ...discovered, tick: 4 }, environment)
    const reports = observerViewV5(t4).lifeReports!
    expect(reports).toHaveLength(1)
    expect(reports[0]).not.toHaveProperty('sceneId')
    expect(reports[0]).not.toHaveProperty('deathEventId')
    expect(reports[0]).not.toHaveProperty('victimAgentId')
    expect(t4.scene!.discoveries).toHaveLength(1)
  })

  it('resolves an incapacitation scene when mobility returns while preserving history', () => {
    const { state, activeEnvironment } = harmFixture(false)
    const created = advanceSceneStateV1(
      applyLifeOutcomesV1(state, activeEnvironment), activeEnvironment)
    expect(created.scene!.entities[0]).toMatchObject({
      kind: 'incapacitationAftermath', status: 'present' })
    const recovered = progressLifeRecoveryV1(created, 3)
    const resolved = advanceSceneStateV1({ ...recovered, tick: 3 },
      activeEnvironment)
    expect(resolved.scene!.entities[0]).toMatchObject({
      status: 'resolved', resolvedTick: 3, resolution: 'recoveredMobility' })
    expect(resolved.scene!.transitions.map((item) => item.kind))
      .toEqual(['created', 'resolved'])
    assertSceneStateV1(resolved, world)
  })

  it('uses a completed conversation for a second-hand claim without creating an observer report', () => {
    const socialEnvironment = createEnvironmentV5(world, { ...config,
      populationSize: 3,
      scene: { ...DEFAULT_SCENE_SCENARIO_V1,
        hearsayProbabilityPerConversation: 1 },
      encounter: DEFAULT_ENCOUNTER_SCENARIO_V1 })
    const { state } = harmFixture(true, socialEnvironment)
    let current = advanceSceneStateV1(
      applyLifeOutcomesV1(state, socialEnvironment), socialEnvironment)
    const sourceId = current.citizens[0].id
    const receiverId = current.citizens[2].id
    for (let tick = 2; tick <= 30 && current.scene!.discoveries.length === 0; tick += 1) {
      current = advanceSceneStateV1({ ...current, tick,
        citizens: current.citizens.map((item, index) => index === 0 ?
          { ...item, activity: 'atDestination', position: current.citizens[1].position,
            surfaceId: current.citizens[1].surfaceId } : item) }, socialEnvironment)
    }
    expect(current.scene!.discoveries).toHaveLength(1)
    expect(current.social!.memories.some((item) => item.ownerAgentId === sourceId &&
      item.observationCode === 'perceived-possible-death-aftermath')).toBe(true)
    const tick = current.tick + 1
    const participantIds = [sourceId, receiverId] as const
    const interaction = { id: 'fixture-conversation', encounterId: 'fixture-contact',
      participantIds, type: 'conversation' as const, status: 'completed' as const,
      decisionTick: tick - 1, startTick: tick - 1,
      plannedEndTick: tick, endTick: tick,
      placeId: null, surfaceId: current.scene!.entities[0].anchor.surfaceId }
    const shared = advanceSceneStateV1({ ...current, tick,
      social: { ...current.social!, interactions: [interaction],
        interactionEvents: [{ id: 'fixture-completed', tick,
          interactionId: interaction.id, participantIds, type: 'Completed' }] } },
    socialEnvironment)
    expect(shared.scene!.hearsay).toHaveLength(1)
    expect(shared.scene!.hearsay[0]).toMatchObject({ sourceAgentId: sourceId,
      receiverAgentId: receiverId, claimedName: null })
    expect(shared.social!.knowledge.some((item) =>
      item.ownerAgentId === receiverId && item.kind === 'hearsay' &&
      item.source === 'hearsay')).toBe(true)
    expect(advanceSceneStateV1(shared, socialEnvironment).scene!.hearsay)
      .toHaveLength(1)
    expect(observerViewV5(shared).lifeReports).toHaveLength(0)
  })
})
