import { describe, expect, it, vi } from 'vitest'
import { generateCity, HERO_SEED } from '../city/generation/generateCity'
import { createInitialCitizenState, stepCitizenSimulation } from './engineV2'
import { createSimulationEnvironment } from './environment'
import { advanceAlongRoute } from './movement'
import { createNavigationIndex, findRoute, locateOnRoute, routeLength } from './navigation'
import { replayToTick } from './replay'
import { SimulationSession } from './session'
import type { SimulationConfigV2, SimulationEvent, StaticCity } from './types'

const city = generateCity(HERO_SEED)
const config: SimulationConfigV2 = {
  version: 2,
  simulationSeed: 'shadow-city-sim-01',
  logicalSecondsPerTick: 6,
  populationSize: 80,
  behaviorModel: 'synthetic-v1',
}

function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return
  for (const child of Object.values(value)) deepFreeze(child)
  Object.freeze(value)
}

describe('citizen population and navigation', () => {
  it('creates stable profiles, IDs, legal positions, and independent first-N citizens', () => {
    const first = createSimulationEnvironment(city, config)
    const repeated = createSimulationEnvironment(city, config)
    const larger = createSimulationEnvironment(city, { ...config, populationSize: 100 })
    expect(first.fingerprint).toBe(repeated.fingerprint)
    expect(first.profiles).toEqual(repeated.profiles)
    expect(larger.profiles.slice(0, 80)).toEqual(first.profiles)
    const initial = createInitialCitizenState(first, config)
    expect(initial.citizens).toHaveLength(80)
    expect(new Set(initial.citizens.map((citizen) => citizen.id)).size).toBe(80)
    expect(initial.citizens).toEqual(createInitialCitizenState(repeated, config).citizens)
    expect(createInitialCitizenState(larger, { ...config, populationSize: 100 }).citizens.slice(0, 80))
      .toEqual(initial.citizens)
    expect(initial.citizens.filter((citizen) => citizen.activity === 'travelling').length).toBe(20)
    for (const citizen of initial.citizens) {
      expect(Object.values(citizen.position).every(Number.isFinite)).toBe(true)
      if (citizen.activity === 'travelling') {
        expect(citizen.route.length).toBeGreaterThan(0)
        expect(locateOnRoute(first.navigation, citizen.route, citizen.distanceAlongRoute).position)
          .toEqual(citizen.position)
      } else {
        const anchor = first.navigation.anchorById.get(citizen.currentAnchorId!)!
        const node = first.navigation.nodeById.get(anchor.nodeId)!
        expect(citizen.position.x).toBe(node.x)
        expect(citizen.position.z).toBe(node.z)
      }
    }
  })

  it('routes deterministically with an explicit equal-cost tie and typed unreachable result', () => {
    const graph = {
      nodes: [
        { id: 'a', x: 0, z: 0, surfaceY: 0.2, kind: 'sidewalk' as const },
        { id: 'b', x: 1, z: 1, surfaceY: 0.2, kind: 'sidewalk' as const },
        { id: 'c', x: 1, z: -1, surfaceY: 0.2, kind: 'sidewalk' as const },
        { id: 'd', x: 2, z: 0, surfaceY: 0.2, kind: 'sidewalk' as const },
        { id: 'isolated', x: 9, z: 9, surfaceY: 0.2, kind: 'sidewalk' as const },
      ],
      edges: [
        { id: 'a-c', from: 'a', to: 'c', length: 1.414, costMm: 1414, kind: 'sidewalk' as const },
        { id: 'c-d', from: 'c', to: 'd', length: 1.414, costMm: 1414, kind: 'sidewalk' as const },
        { id: 'a-b', from: 'a', to: 'b', length: 1.414, costMm: 1414, kind: 'sidewalk' as const },
        { id: 'b-d', from: 'b', to: 'd', length: 1.414, costMm: 1414, kind: 'sidewalk' as const },
      ],
      anchors: [],
    }
    const index = createNavigationIndex(graph)
    const route = findRoute(index, 'a', 'd')
    expect(route).toMatchObject({ status: 'ok', costMm: 2828 })
    if (route.status === 'ok') {
      expect(route.steps.map((step) => step.edgeId)).toEqual(['a-b', 'b-d'])
      expect(route.steps[0].toNodeId).toBe(route.steps[1].fromNodeId)
    }
    expect(findRoute(index, 'a', 'isolated')).toEqual({ status: 'unreachable', reason: 'disconnected' })
    expect(findRoute(index, 'missing', 'd')).toEqual({ status: 'unreachable', reason: 'unknown-origin' })
  })

  it('consumes a fixed distance budget across multiple legal edges and snaps on arrival', () => {
    const env = createSimulationEnvironment(city, config)
    const citizen = createInitialCitizenState(env, config).citizens.find((item) => item.activity === 'travelling')!
    expect(citizen.route.length).toBeGreaterThan(2)
    const start = citizen.distanceAlongRoute
    const budget = citizen.route[citizen.routeIndex].length + citizen.route[citizen.routeIndex + 1].length + 2
    const middle = advanceAlongRoute(env.navigation, citizen, budget)
    expect(middle.distanceAlongRoute).toBeGreaterThan(start)
    expect(middle.distanceAlongRoute).toBeLessThanOrEqual(routeLength(citizen.route))
    expect(Object.values(middle.position).every(Number.isFinite)).toBe(true)
    const arrival = advanceAlongRoute(env.navigation, citizen, routeLength(citizen.route) + 100)
    const last = env.navigation.nodeById.get(citizen.route.at(-1)!.toNodeId)!
    expect(arrival.arrived).toBe(true)
    expect(arrival.position).toEqual({ x: last.x, y: last.surfaceY, z: last.z })
    expect(() => advanceAlongRoute(env.navigation, citizen, Number.NaN)).toThrow()
  })
})

describe('v2 fixed-tick behavior and replay', () => {
  it('reconstructs tick 500 and event history, then resets exact initial conditions', () => {
    const session = new SimulationSession(city, config)
    session.submitCommand({ type: 'ScheduleDiagnosticProbe', delayTicks: 2, label: 'v2' }, { effectiveTick: 12 })
    for (let tick = 0; tick < 500; tick += 1) session.advanceOneTick()
    const live = session.getSnapshot()
    expect(live.tick).toBe(500)
    expect(live.state.version).toBe(2)
    const events = session.getLiveEventHistory()
    expect(events.some((event) => event.type === 'TripStarted')).toBe(true)
    expect(events.some((event) => event.type === 'DestinationReached')).toBe(true)
    expect(events.some((event) => event.type === 'ActivityStarted')).toBe(true)
    expect(events.some((event) => event.type === 'ActivityFinished')).toBe(true)
    expect(events.some((event) => event.type === 'DiagnosticProbeSampled')).toBe(true)
    expect(events.every((event, index) => index === 0 || event.sequence === events[index - 1].sequence + 1)).toBe(true)
    const replay = replayToTick(city, config, session.getCommandHistory(), 500, session.environment)
    expect(replay.state).toEqual(live.state)
    expect(replay.events).toEqual(events)
    session.inspectTick(100)
    expect(session.getSnapshot()).toMatchObject({ tick: 100, liveTick: 500, isInspecting: true })
    expect(session.getSnapshot().state).toEqual(replayToTick(city, config, session.getCommandHistory(), 100).state)
    session.returnLive()
    expect(session.getSnapshot().state).toEqual(live.state)
    session.reset()
    expect(session.getSnapshot().state).toEqual(createInitialCitizenState(session.environment!, config))
    expect(session.getSnapshot().eventCount).toBe(0)
  })

  it('preserves each existing citizen trajectory and event ID when population grows', () => {
    const smaller = new SimulationSession(city, { ...config, populationSize: 4 })
    const larger = new SimulationSession(city, { ...config, populationSize: 5 })
    for (let tick = 0; tick < 350; tick += 1) {
      smaller.advanceOneTick()
      larger.advanceOneTick()
    }
    const smallState = smaller.getSnapshot().state
    const largeState = larger.getSnapshot().state
    if (smallState.version !== 2 || largeState.version !== 2) throw new Error('Expected v2 state')
    expect(largeState.citizens.slice(0, 4)).toEqual(smallState.citizens)
    const subset = (events: readonly SimulationEvent[]) => events
      .filter((event) => event.source === 'citizen' && event.agentId < 'citizen-0004')
      .map(({ id, tick, type }) => ({ id, tick, type }))
    expect(subset(larger.getLiveEventHistory())).toEqual(subset(smaller.getLiveEventHistory()))
  })

  it('keeps every moving citizen on connected pedestrian edges through 100-agent runs', () => {
    const hundred = { ...config, populationSize: 100 }
    const env = createSimulationEnvironment(city, hundred)
    let state = createInitialCitizenState(env, hundred)
    for (let tick = 0; tick < 500; tick += 1) {
      state = stepCitizenSimulation(env, hundred, state, []).state
      if (tick % 25 !== 0 && tick !== 499) continue
      for (const citizen of state.citizens) {
        expect(Object.values(citizen.position).every(Number.isFinite)).toBe(true)
        if (citizen.activity !== 'travelling' && citizen.activity !== 'returningHome') continue
        expect(citizen.routeIndex).toBeGreaterThanOrEqual(0)
        expect(citizen.routeIndex).toBeLessThan(citizen.route.length)
        expect(citizen.distanceOnEdge).toBeGreaterThanOrEqual(0)
        expect(citizen.distanceOnEdge).toBeLessThanOrEqual(citizen.route[citizen.routeIndex].length + 1e-6)
        expect(citizen.distanceAlongRoute).toBeLessThanOrEqual(routeLength(citizen.route) + 1e-6)
        for (let index = 0; index < citizen.route.length; index += 1) {
          const step = citizen.route[index]
          const edge = env.navigation.edgeById.get(step.edgeId)
          expect(edge).toBeDefined()
          expect([edge?.from, edge?.to].sort()).toEqual([step.fromNodeId, step.toNodeId].sort())
          if (index > 0) expect(citizen.route[index - 1].toNodeId).toBe(step.fromNodeId)
        }
        const point = locateOnRoute(env.navigation, citizen.route, citizen.distanceAlongRoute).position
        expect(Math.hypot(point.x - citizen.position.x, point.y - citizen.position.y, point.z - citizen.position.z))
          .toBeLessThan(1e-5)
      }
    }
  })

  it('continues from serialized state and refuses environment mismatch', () => {
    const env = createSimulationEnvironment(city, config)
    let state = createInitialCitizenState(env, config)
    for (let tick = 0; tick < 20; tick += 1) state = stepCitizenSimulation(env, config, state, []).state
    const serialized = JSON.parse(JSON.stringify(state)) as typeof state
    expect(stepCitizenSimulation(env, config, serialized, [])).toEqual(stepCitizenSimulation(env, config, state, []))
    expect(() => stepCitizenSimulation(env, config, { ...state, environmentFingerprint: 'wrong' }, []))
      .toThrow(/incompatible/)
  })

  it('rejects same-size state from another seed or logical tick duration', () => {
    const baseline = createSimulationEnvironment(city, config)
    const changedSeedConfig = { ...config, simulationSeed: 'another-simulation-seed' }
    const changedTimeConfig = { ...config, logicalSecondsPerTick: 12 }
    const changedPopulationConfig = { ...config, populationSize: 81 }
    for (const variant of [changedSeedConfig, changedTimeConfig, changedPopulationConfig]) {
      const other = createSimulationEnvironment(city, variant)
      const otherState = createInitialCitizenState(other, variant)
      expect(other.fingerprint).not.toBe(baseline.fingerprint)
      expect(() => stepCitizenSimulation(baseline, config, otherState, [])).toThrow(/incompatible/)
    }
    const extraCitizen = createSimulationEnvironment(city, changedPopulationConfig)
    expect(extraCitizen.runId).toBe(baseline.runId)
  })

  it('keeps a citizen at a legal anchor and emits TripFailed when the destination is unreachable', () => {
    const disconnected = structuredClone(city)
    disconnected.pedestrian.edges = disconnected.pedestrian.edges.filter((edge) => edge.kind !== 'crossing')
    const oneCitizen = { ...config, populationSize: 1 }
    const env = createSimulationEnvironment(disconnected, oneCitizen)
    let state = createInitialCitizenState(env, oneCitizen)
    const home = env.profiles[0].homeAnchorId
    const origin = state.citizens[0].position
    const events: SimulationEvent[] = []
    for (let tick = 0; tick < env.profiles[0].firstDepartureTick + 2; tick += 1) {
      const transition = stepCitizenSimulation(env, oneCitizen, state, [])
      state = transition.state
      events.push(...transition.events)
    }
    expect(events.some((event) => event.type === 'TripFailed')).toBe(true)
    expect(state.citizens[0].activity).toBe('atHome')
    expect(state.citizens[0].currentAnchorId).toBe(home)
    expect(state.citizens[0].position).toEqual(origin)
  })

  it('does not mutate the static city or use hidden wall time or randomness', () => {
    const frozen = structuredClone(city) as StaticCity
    deepFreeze(frozen)
    const before = JSON.stringify(frozen)
    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('hidden RNG') })
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('wall clock') })
    try {
      const env = createSimulationEnvironment(frozen, config)
      const initial = createInitialCitizenState(env, config)
      expect(stepCitizenSimulation(env, config, initial, []).state.tick).toBe(1)
    } finally {
      randomSpy.mockRestore()
      dateSpy.mockRestore()
    }
    expect(JSON.stringify(frozen)).toBe(before)
  })

  it('rejects a v2 event-cap overflow atomically', () => {
    const session = new SimulationSession(city, { ...config, populationSize: 1 }, {
      maxTicks: 100,
      maxCommands: 3,
      maxEvents: 1,
      maxPendingActions: 3,
    })
    session.submitCommand({ type: 'ScheduleDiagnosticProbe', delayTicks: 0 })
    session.submitCommand({ type: 'ScheduleDiagnosticProbe', delayTicks: 0 })
    const before = session.getSnapshot()
    expect(() => session.advanceOneTick()).toThrow(/history limit/)
    expect(session.getSnapshot()).toBe(before)
    expect(session.getLiveEventHistory()).toEqual([])
  })
})
