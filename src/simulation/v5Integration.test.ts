import { describe, expect, it } from 'vitest'
import { generateVerticalProofWorld, generateWorldV2 } from '../world/generation/generateWorldV2'
import { canTraverseV2, createNavigationIndexV2, findRouteV2 } from '../world/navigation/routeV2'
import { advanceStateV5, createEnvironmentV5, createInitialStateV5 } from './engineV5'
import { replayV5 } from './replayV5'
import { SimulationSessionV5 } from './sessionV5'
import { moveCitizenOneTick } from './movementV5'
import { updateOpportunityV5 } from './offending/opportunityV5'
import { DEFAULT_SIMULATION_CONFIG_V5 } from './v5Types'

const config = { ...DEFAULT_SIMULATION_CONFIG_V5, populationSize: 30 }

describe('multi-level v5 simulation', () => {
  it('keeps the same X/Z surfaces separate and preserves a ground alternative', () => {
    const world = generateVerticalProofWorld()
    const index = createNavigationIndexV2(world)
    const ground = index.nodeById.get('ground:-9:0')!
    const elevated = index.nodeById.get('bridge:west')!
    expect(ground.position.x).toBe(elevated.position.x)
    expect(ground.position.z).toBe(elevated.position.z)
    expect(ground.surfaceId).not.toBe(elevated.surfaceId)
    expect(findRouteV2(index, 'ground:-15:-15', 'galleria:l1:entry', undefined,
      new Map([['bridge-entry', 'entryClosed']])).status).toBe('ok')
    const upperPortal = index.edgeById.get('portal:galleria-upper')!
    expect(canTraverseV2(index, upperPortal, 'galleria:l1:entry', 'bridge:mall-approach',
      new Map([['bridge-entry', 'entryClosed']]))).toBe(false)
    expect(canTraverseV2(index, upperPortal, 'bridge:mall-approach', 'galleria:l1:entry',
      new Map([['bridge-entry', 'entryClosed']]))).toBe(true)
    expect(canTraverseV2(index, upperPortal, 'galleria:l1:entry', 'bridge:mall-approach',
      new Map([['mall-entry', 'closed']]))).toBe(true)
    expect(canTraverseV2(index, upperPortal, 'bridge:mall-approach', 'galleria:l1:entry',
      new Map([['mall-entry', 'closed']]))).toBe(false)
  })

  it('keeps identities, positions and replay deterministic through tick 100', () => {
    const world = generateWorldV2()
    const session = new SimulationSessionV5(world, config)
    for (let tick = 0; tick < 100; tick += 1) session.advanceOneTick()
    const state = session.getSnapshot().state
    expect(state.citizens).toHaveLength(30)
    expect(new Set(state.citizens.map((citizen) => citizen.id)).size).toBe(30)
    expect(state.citizens.some((citizen) => citizen.activity !== 'atHome')).toBe(true)
    expect(replayV5(world, session.exportReplay())).toEqual(state)
    const prior = session.inspectTick(50)
    expect(prior.tick).toBe(50)
    session.returnLive()
    expect(session.getSnapshot().tick).toBe(100)
  })

  it('keeps public reservations unique and records legal three-dimensional occupancy', () => {
    const world = generateWorldV2()
    const session = new SimulationSessionV5(world, { ...config, populationSize: 200 })
    const initial = session.getSnapshot().state.citizens
    expect(new Set(initial.map((citizen) => citizen.currentNodeId)).size).toBe(200)
    expect(initial.every((citizen) => world.surfaces.find((surface) =>
      surface.id === citizen.surfaceId)?.indoor)).toBe(true)
    for (let tick = 0; tick < 100; tick += 1) session.advanceOneTick()
    const citizens = session.getSnapshot().state.citizens
    const reservations = citizens.flatMap((citizen) => citizen.reservedSlotNodeId ?
      [citizen.reservedSlotNodeId] : [])
    expect(new Set(reservations).size).toBe(reservations.length)
    const nodes = new Map(world.navNodes.map((node) => [node.id, node]))
    for (const citizen of citizens.filter((item) => item.activity === 'atDestination')) {
      const node = nodes.get(citizen.currentNodeId!)!
      expect(citizen.position).toEqual(node.position)
      expect(citizen.surfaceId).toBe(node.surfaceId)
    }
    const atHome = citizens.filter((item) => item.activity === 'atHome')
    expect(new Set(atHome.map((citizen) => citizen.currentNodeId)).size).toBe(atHome.length)
  })

  it('moves continuously up a connector and finishes an occupied connector after closure', () => {
    const world = generateVerticalProofWorld()
    const index = createNavigationIndexV2(world)
    const env = createEnvironmentV5(world, { ...config, populationSize: 1 })
    const initial = createInitialStateV5(env).citizens[0]
    const edge = index.edgeById.get('connector:west-stair')!
    const route = [{ edgeId: edge.id, fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId, lengthMm: edge.lengthMm }]
    const start = index.nodeById.get(edge.fromNodeId)!
    const citizen = { ...initial, activity: 'travelling' as const,
      position: start.position, surfaceId: start.surfaceId, currentNodeId: start.id,
      route, routeIndex: 0, distanceOnEdgeMm: 0 }
    const first = moveCitizenOneTick(citizen, env.profiles[0], index, new Map(), 6)
    expect(first.citizen.position.y).toBeGreaterThan(start.position.y)
    expect(first.citizen.position.y).toBeLessThan(5500)
    expect(first.citizen.surfaceId).toBe('connector:west-stair')
    let moving = first.citizen
    for (let i = 0; i < 5 && moving.routeIndex === 0; i += 1) {
      moving = moveCitizenOneTick(moving, env.profiles[0], index,
        new Map([['bridge-entry', 'entryClosed']]), 6).citizen
    }
    expect(moving.routeIndex).toBe(1)
    expect(moving.position.y).toBe(5500)
    const full = moveCitizenOneTick(citizen, env.profiles[0], index,
      new Map(), 6, new Map([['west-stair', 0]]))
    expect(full.blocked).toBe('capacity')
    expect(full.citizen.position).toEqual(start.position)
  })

  it('evacuates an occupied shop after closing the mall without resetting position', () => {
    const world = generateWorldV2()
    const command = { id: 'close-mall', effectiveTick: 1,
      accessId: 'mall-entry' as const, mode: 'entryClosed' as const }
    const env = createEnvironmentV5(world, { ...config, populationSize: 1 }, [command])
    const initial = createInitialStateV5(env, [command])
    const node = world.navNodes.find((item) => item.id === 'shop:retail:l1:slot:0')!
    const citizen = { ...initial.citizens[0], activity: 'atDestination' as const,
      activityKind: 'shop' as const, position: node.position, surfaceId: node.surfaceId,
      placeId: 'galleria-retail-l1', currentNodeId: node.id,
      reservedSlotNodeId: node.id, nextDecisionTick: 200 }
    const result = advanceStateV5({ ...initial, citizens: [citizen] }, env)
    expect(result.citizens[0].activity).toBe('returningHome')
    expect(result.citizens[0].position.x).not.toBe(
      world.navNodes.find((item) => item.id === 'ground:-95:-15')?.position.x)
    expect(result.citizens[0].position.y).toBeGreaterThanOrEqual(250)
  })

  it('does not invent a contact between residents on different surfaces at identical X/Z', () => {
    const world = generateVerticalProofWorld()
    const env = createEnvironmentV5(world, { ...config, populationSize: 2 })
    const state = createInitialStateV5(env)
    const point = { x: -9000, y: 250, z: 0 }
    const elevated = { ...point, y: 5500 }
    const citizens = state.citizens.map((citizen, index) => ({ ...citizen,
      activity: 'atDestination' as const,
      surfaceId: index === 0 ? 'ground' : 'skybridge',
      position: index === 0 ? point : elevated }))
    const traces = citizens.flatMap((citizen) => Array.from({ length: 6 }, (_, i) => ({
      agentId: citizen.id, second: i + 1, position: citizen.position,
      surfaceId: citizen.surfaceId, placeId: null, edgeId: null })))
    const result = updateOpportunityV5({ ...state, tick: 1, citizens }, env, traces)
    expect(result.encounterEpisodes).toHaveLength(0)
    expect(result.offences).toHaveLength(0)
  })

  it('does not create offences with no agents or resource contact', () => {
    const world = generateVerticalProofWorld()
    const empty = { ...config, populationSize: 0 }
    const env = createEnvironmentV5(world, empty)
    let state = createInitialStateV5(env)
    for (let tick = 0; tick < 30; tick += 1) state = advanceStateV5(state, env)
    expect(state.offences).toHaveLength(0)
    expect(state.encounterEpisodes).toHaveLength(0)
  })

  it('changes reports without changing movement or truth', () => {
    const world = generateWorldV2()
    const a = createEnvironmentV5(world, { ...config, reportingProbability: 0 })
    const b = createEnvironmentV5(world, { ...config, reportingProbability: 1 })
    let first = createInitialStateV5(a)
    let second = createInitialStateV5(b)
    for (let tick = 0; tick < 120; tick += 1) {
      first = advanceStateV5(first, a)
      second = advanceStateV5(second, b)
    }
    expect(first.citizens).toEqual(second.citizens)
    expect(first.offences).toEqual(second.offences)
  })

  it('rejects a changed world or command history during replay', () => {
    const world = generateWorldV2()
    const session = new SimulationSessionV5(world, config)
    session.advanceOneTick()
    const record = session.exportReplay()
    expect(() => replayV5({ ...world, config: { ...world.config, seed: 'other' } }, record)).toThrow()
    expect(() => replayV5(world, { ...record, commands: [{ id: 'x', effectiveTick: 2,
      accessId: 'bridge-entry', mode: 'entryClosed' }] })).toThrow()
  })

  it('replays the same Tick 500 state from a checkpoint and from Tick 0', () => {
    const world = generateWorldV2()
    const session = new SimulationSessionV5(world, { ...config, populationSize: 20 })
    for (let tick = 0; tick < 500; tick += 1) session.advanceOneTick()
    const live = session.getSnapshot().state
    expect(session.inspectTick(499)).toEqual(replayV5(world,
      { ...session.exportReplay(), targetTick: 499 }))
    session.returnLive()
    expect(replayV5(world, session.exportReplay())).toEqual(live)
  })

  it('keeps long-range checkpoint inspection equal to a clean replay', () => {
    const world = generateWorldV2()
    const session = new SimulationSessionV5(world, { ...config, populationSize: 10 })
    for (let tick = 0; tick < 1_200; tick += 1) session.advanceOneTick()
    const live = session.getSnapshot().state
    expect(session.inspectTick(1_151)).toEqual(replayV5(world,
      { ...session.exportReplay(), targetTick: 1_151 }))
    session.returnLive()
    expect(replayV5(world, session.exportReplay())).toEqual(live)
  })
})
