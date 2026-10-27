import { describe, expect, it } from 'vitest'
import { generateIntegratedWorld } from '../../world/generation/generateIntegratedWorld'
import { DEFAULT_ENCOUNTER_SCENARIO_V1 } from '../encounter/config'
import { DEFAULT_HABIT_SCENARIO_V1 } from '../habits/types'
import { replayV5 } from '../replayV5'
import { SimulationSessionV5 } from '../sessionV5'
import { DEFAULT_SIMULATION_CONFIG_V5 } from '../v5Types'
import { DEFAULT_LIFE_SCENARIO_V1 } from './types'

const world = generateIntegratedWorld('shadow-city-hero-01')
const life = { ...DEFAULT_LIFE_SCENARIO_V1,
  seed: 'shadow-city-life-fatal-diagnostic-01',
  assaultProbability: { minor: 1, serious: 1 },
  injuryProbability: { minor: 1, serious: 1 },
  severityWeights: { minor: { minor: 0, serious: 0, critical: 1 },
    serious: { minor: 0, serious: 0, critical: 1 } },
  fatalProbabilityCritical: 1,
} as const
const config = { ...DEFAULT_SIMULATION_CONFIG_V5, populationSize: 120,
  habit: { ...DEFAULT_HABIT_SCENARIO_V1 }, life,
  encounter: { ...DEFAULT_ENCOUNTER_SCENARIO_V1,
    social: { ...DEFAULT_ENCOUNTER_SCENARIO_V1.social,
      greetingWillingness: 0.7, conversationWillingness: 0.85,
      diagnosticTraces: true } } }

describe('life-v1 deterministic product integration', () => {
  it('derives fatal events from ordinary simulation offences and replays both sides of death', () => {
    const session = new SimulationSessionV5(world, config)
    for (let tick = 0; tick < 500; tick += 1) session.advanceOneTick()
    const final = session.getSnapshot().state
    expect(final.life!.deaths.length).toBeGreaterThan(0)
    expect(final.life!.deaths.length).toBe(final.life!.scenes.length)
    const death = final.life!.deaths.find((item) => item.surfaceId === 'ground') ??
      final.life!.deaths[0]
    const offence = final.offences.find((item) => item.id === death.relatedOffenceId)
    expect(offence).toMatchObject({ mechanism: 'physicalAssault',
      target: { kind: 'citizen', id: death.victimAgentId } })
    expect(death.position).toEqual(final.life!.scenes.find((item) =>
      item.deathEventId === death.id)!.position)
    const before = session.inspectTick(death.tick - 1)
    expect(before.life!.people.find((item) => item.agentId === death.victimAgentId))
      .toMatchObject({ lifeStatus: 'alive' })
    const at = session.inspectTick(death.tick)
    expect(at.life!.people.find((item) => item.agentId === death.victimAgentId))
      .toMatchObject({ lifeStatus: 'deceased', deathEventId: death.id })
    const victimPosition = at.citizens.find((item) => item.id === death.victimAgentId)!.position
    expect(final.citizens.find((item) => item.id === death.victimAgentId))
      .toMatchObject({ activity: 'deceased', position: victimPosition })
    expect(final.events.filter((item) => item.agentId === death.victimAgentId &&
      item.tick > death.tick)).toHaveLength(0)
    expect(final.offences.filter((item) => item.offenderAgentId === death.victimAgentId &&
      item.tick > death.tick)).toHaveLength(0)
    expect(replayV5(world, session.exportReplay())).toEqual(final)
    session.reset()
    expect(session.getSnapshot().state.life!.deaths).toHaveLength(0)
  }, 120_000)
})
