import { describe, expect, it } from 'vitest'
import { generateIntegratedWorld } from '../../world/generation/generateIntegratedWorld'
import { replayV5 } from '../replayV5'
import { SimulationSessionV5 } from '../sessionV5'
import { advanceStateV5, createEnvironmentV5, createInitialStateV5 } from '../engineV5'
import { DEFAULT_SIMULATION_CONFIG_V5 } from '../v5Types'
import { DEFAULT_ENCOUNTER_SCENARIO_V1 } from './config'

const world = generateIntegratedWorld()
const scenario = { ...DEFAULT_ENCOUNTER_SCENARIO_V1,
  social: { ...DEFAULT_ENCOUNTER_SCENARIO_V1.social, diagnosticTraces: true } }

describe('integrated encounter simulation', () => {
  it('forms only spatially grounded episodes and replays Tick 100 exactly', () => {
    const session = new SimulationSessionV5(world, { ...DEFAULT_SIMULATION_CONFIG_V5,
      populationSize: 80, encounter: scenario })
    for (let tick = 0; tick < 100; tick += 1) session.advanceOneTick()
    const live = session.getSnapshot().state
    const social = live.social!
    expect(social.metrics.candidatePairSeconds).toBeGreaterThan(0)
    expect(new Set(social.encounterEvents.map((item) => item.id)).size)
      .toBe(social.encounterEvents.length)
    expect(social.encounters.active.every((item) => item.contactSeconds >=
      scenario.lifecycle.minContactSeconds)).toBe(true)
    expect(replayV5(world, session.exportReplay())).toEqual(live)
    expect(session.inspectTick(50).social).toEqual(replayV5(world,
      { ...session.exportReplay(), targetTick: 50 }).social)
  }, 30_000)

  it('can disable interaction without fabricating an alternative story', () => {
    const session = new SimulationSessionV5(world, { ...DEFAULT_SIMULATION_CONFIG_V5,
      populationSize: 40, encounter: { ...scenario, interactionsEnabled: false } })
    for (let tick = 0; tick < 100; tick += 1) session.advanceOneTick()
    const social = session.getSnapshot().state.social!
    expect(social.interactions).toHaveLength(0)
    expect(social.interactionDecisions).toHaveLength(0)
    expect(social.encounters.active.length + social.encounters.completed.length)
      .toBeGreaterThan(0)
  })

  it('changes reports without changing movement, encounters, or ground truth', () => {
    const base = { ...DEFAULT_SIMULATION_CONFIG_V5, populationSize: 40,
      encounter: scenario }
    const first = new SimulationSessionV5(world, { ...base, reportingProbability: 0 })
    const second = new SimulationSessionV5(world, { ...base, reportingProbability: 1 })
    for (let tick = 0; tick < 100; tick += 1) {
      first.advanceOneTick(); second.advanceOneTick()
    }
    const a = first.getSnapshot().state
    const b = second.getSnapshot().state
    expect(a.citizens).toEqual(b.citizens)
    expect(a.social?.encounters).toEqual(b.social?.encounters)
    expect(a.offences).toEqual(b.offences)
  })

  it('reconstructs relationships and bounded memories at Tick 500 from a checkpoint', () => {
    const session = new SimulationSessionV5(world, { ...DEFAULT_SIMULATION_CONFIG_V5,
      populationSize: 30, encounter: scenario })
    for (let tick = 0; tick < 500; tick += 1) session.advanceOneTick()
    const live = session.getSnapshot().state
    expect(session.inspectTick(500)).toEqual(live)
    expect(replayV5(world, session.exportReplay())).toEqual(live)
    expect(live.social?.memories.length).toBeLessThanOrEqual(30 * scenario.social.memoryCapacity)
    expect(live.social?.knowledge.length).toBeLessThanOrEqual(30 * scenario.social.knowledgeCapacity)
    expect(live.social?.relationships.length).toBeGreaterThan(0)
  }, 30_000)

  it('keeps the same state when 1x, 2x, and 4x playback batch the same Tick count', () => {
    const config = { ...DEFAULT_SIMULATION_CONFIG_V5, populationSize: 24,
      encounter: scenario }
    const sessions = [1, 2, 4].map(() => new SimulationSessionV5(world, config))
    for (let index = 0; index < sessions.length; index += 1) {
      const batch = [1, 2, 4][index]
      for (let tick = 0; tick < 100; tick += batch) {
        for (let step = 0; step < batch && tick + step < 100; step += 1) {
          sessions[index].advanceOneTick()
        }
      }
    }
    expect(sessions[1].getSnapshot().state).toEqual(sessions[0].getSnapshot().state)
    expect(sessions[2].getSnapshot().state).toEqual(sessions[0].getSnapshot().state)
  })

  it('holds legal positions during conversation and interrupts on mall closure', () => {
    const command = { id: 'close-during-conversation', effectiveTick: 2,
      accessId: 'mall-entry' as const, mode: 'entryClosed' as const }
    const config = { ...DEFAULT_SIMULATION_CONFIG_V5, populationSize: 2,
      encounter: scenario }
    const environment = createEnvironmentV5(world, config, [command])
    const initial = createInitialStateV5(environment, [command])
    const place = world.places.find((item) => item.id === 'galleria-retail-l1')!
    const nodes = place.slotNodeIds.slice(0, 2).map((id) =>
      world.navNodes.find((node) => node.id === id)!)
    const interaction = { id: 'fixture-conversation', encounterId: 'fixture-encounter',
      participantIds: [initial.citizens[0].id, initial.citizens[1].id] as const,
      type: 'conversation' as const, status: 'active' as const,
      decisionTick: 0, startTick: 1, plannedEndTick: 5, endTick: null,
      placeId: place.id, surfaceId: nodes[0].surfaceId }
    const citizens = initial.citizens.map((citizen, index) => ({ ...citizen,
      activity: 'atDestination' as const, activityKind: 'shop' as const,
      placeId: place.id, surfaceId: nodes[index].surfaceId,
      position: nodes[index].position, currentNodeId: nodes[index].id,
      reservedSlotNodeId: nodes[index].id, nextDecisionTick: 20,
      engagement: { interactionId: interaction.id, resumeDecisionTick: 24 } }))
    const fixture = { ...initial, citizens, social: { ...initial.social!,
      interactions: [interaction] } }
    const first = advanceStateV5(fixture, environment)
    expect(first.citizens.map((citizen) => citizen.position))
      .toEqual(citizens.map((citizen) => citizen.position))
    expect(first.citizens.every((citizen) => citizen.activity === 'interacting')).toBe(true)
    const second = advanceStateV5(first, environment)
    expect(second.social!.interactions[0].status).toBe('interrupted')
    expect(second.citizens.every((citizen) => citizen.engagement === undefined)).toBe(true)
    expect(second.citizens.every((citizen) => citizen.activity !== 'interacting')).toBe(true)
    expect(second.citizens.every((citizen) => citizen.position.y >= 0)).toBe(true)
  })
})
