import { describe, expect, it } from 'vitest'
import { generateIntegratedWorld } from '../../world/generation/generateIntegratedWorld'
import { DEFAULT_ENCOUNTER_SCENARIO_V1 } from '../encounter/config'
import { DEFAULT_HABIT_SCENARIO_V1 } from '../habits/types'
import { DEFAULT_LIFE_SCENARIO_V1 } from '../life/types'
import { observerViewV5 } from '../offending/opportunityV5'
import { replayV5 } from '../replayV5'
import { SimulationSessionV5 } from '../sessionV5'
import { DEFAULT_SIMULATION_CONFIG_V5 } from '../v5Types'
import { assertSceneStateV1 } from './state'
import { DEFAULT_SCENE_SCENARIO_V1 } from './types'

const world = generateIntegratedWorld('shadow-city-hero-01')
const config = { ...DEFAULT_SIMULATION_CONFIG_V5, populationSize: 120,
  habit: DEFAULT_HABIT_SCENARIO_V1,
  life: { ...DEFAULT_LIFE_SCENARIO_V1,
    seed: 'shadow-city-life-fatal-diagnostic-01',
    assaultProbability: { minor: 1, serious: 1 },
    injuryProbability: { minor: 1, serious: 1 },
    severityWeights: { minor: { minor: 0, serious: 0, critical: 1 },
      serious: { minor: 0, serious: 0, critical: 1 } },
    fatalProbabilityCritical: 1,
  },
  scene: DEFAULT_SCENE_SCENARIO_V1,
  encounter: { ...DEFAULT_ENCOUNTER_SCENARIO_V1,
    social: { ...DEFAULT_ENCOUNTER_SCENARIO_V1.social,
      greetingWillingness: 0.7, conversationWillingness: 0.85,
      diagnosticTraces: true } } }

describe('scene-v1 deterministic reconstruction', () => {
  it('reconstructs a naturally generated event chain without changing the live Tick', () => {
    const session = new SimulationSessionV5(world, config)
    for (let tick = 0; tick < 500; tick += 1) session.advanceOneTick()
    const final = session.getSnapshot().state
    expect(final.life!.deaths.length).toBeGreaterThan(0)
    expect(final.scene!.entities.filter((item) =>
      item.kind === 'deathAftermath')).toHaveLength(final.life!.deaths.length)
    assertSceneStateV1(final, world)
    const death = final.life!.deaths[0]
    const sceneId = 'scene:' + death.id
    const scene = final.scene!.entities.find((item) => item.id === sceneId)!
    expect(scene.origin).toMatchObject({ kind: 'death',
      offenceId: death.relatedOffenceId, injuryId: death.relatedInjuryId })
    const before = session.inspectTick(death.tick - 1)
    expect(before.scene!.entities.find((item) => item.id === sceneId)).toBeUndefined()
    expect(before.life!.people.find((item) =>
      item.agentId === death.victimAgentId)).toMatchObject({ lifeStatus: 'alive' })
    const during = session.inspectTick(death.tick)
    expect(during.scene!.entities.find((item) => item.id === sceneId))
      .toMatchObject({ createdTick: death.tick, status: 'present' })
    const after = session.inspectTick(death.tick + 1)
    expect(after.scene!.entities.find((item) => item.id === sceneId))
      .toMatchObject({ status: 'present' })
    const snapshotBeforeWindow = session.getSnapshot()
    const trails = session.reconstructWindow(death.tick,
      [death.victimAgentId], 3)
    expect(session.getSnapshot()).toBe(snapshotBeforeWindow)
    expect(trails.get(death.victimAgentId)!.find((item) =>
      item.tick === death.tick)!.position).toEqual(during.citizens.find((item) =>
        item.id === death.victimAgentId)!.position)
    const discovery = final.scene!.discoveries[0]
    expect(discovery).toBeDefined()
    const beforeDiscovery = session.inspectTick(discovery.tick - 1)
    expect(beforeDiscovery.scene!.discoveries.some((item) =>
      item.id === discovery.id)).toBe(false)
    const atDiscovery = session.inspectTick(discovery.tick)
    expect(atDiscovery.scene!.discoveries.some((item) =>
      item.id === discovery.id)).toBe(true)
    expect(atDiscovery.social!.memories.some((item) =>
      item.ownerAgentId === discovery.observerAgentId &&
      item.observationCode.startsWith('perceived-possible-'))).toBe(true)
    const delivered = final.scene!.reportLinks.map((link) => ({
      link, report: final.life!.reports.find((item) => item.id === link.reportId),
    })).find((item) => item.report)
    expect(delivered).toBeDefined()
    const priorReport = session.inspectTick(delivered!.report!.availableTick - 1)
    expect(observerViewV5(priorReport).lifeReports?.some((item) =>
      item.id === delivered!.report!.id)).toBe(false)
    const atReport = session.inspectTick(delivered!.report!.availableTick)
    expect(observerViewV5(atReport).lifeReports?.some((item) =>
      item.id === delivered!.report!.id)).toBe(true)
    expect(replayV5(world, session.exportReplay())).toEqual(final)
  }, 120_000)
})
