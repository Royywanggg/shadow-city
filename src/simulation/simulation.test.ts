import { describe, expect, it, vi } from 'vitest'
import { generateCity, HERO_SEED } from '../city/generation/generateCity'
import { createInitialState, stepSimulation } from './engine'
import { nextRandom } from './rng'
import { replayToTick } from './replay'
import { SimulationSession } from './session'
import type { CommandEnvelope, SimulationConfig } from './types'

const city = generateCity(HERO_SEED)
const config: SimulationConfig = {
  version: 1,
  simulationSeed: 'shadow-city-sim-01',
  logicalSecondsPerTick: 6,
}

function command(
  sequence: number,
  effectiveTick: number,
  priority = 0,
  delayTicks = 0,
): CommandEnvelope {
  return {
    id: `command-${sequence}`,
    effectiveTick,
    priority,
    submissionSequence: sequence,
    command: { type: 'ScheduleDiagnosticProbe', delayTicks, label: `probe-${sequence}` },
  }
}

function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return
  for (const child of Object.values(value)) deepFreeze(child)
  Object.freeze(value)
}

describe('deterministic simulation', () => {
  it('has serializable initial RNG state and an explicit logical time scale', () => {
    expect(createInitialState(config)).toEqual(createInitialState(config))
    expect(createInitialState(config).logicalTimeSeconds).toBe(0)
    expect(createInitialState({ ...config, simulationSeed: 'other-sim' }).rng)
      .not.toEqual(createInitialState(config).rng)
    expect(nextRandom(123)).toEqual(nextRandom(123))
    expect(nextRandom(123).state).toBeGreaterThanOrEqual(0)
    const first = stepSimulation(city, config, createInitialState(config), [command(0, 1)])
    const secondConfig = { ...config, simulationSeed: 'other-sim' }
    const second = stepSimulation(city, secondConfig, createInitialState(secondConfig), [command(0, 1)])
    expect(first.events[0].sample).not.toBe(second.events[0].sample)
  })

  it('applies commands by priority and submission sequence, then orders due events', () => {
    const commands = [command(2, 1, 1), command(1, 1, -1), command(0, 1, -1)]
    const first = stepSimulation(city, config, createInitialState(config), commands)
    expect(first.events.map((event) => event.originCommandId))
      .toEqual(['command-0', 'command-1', 'command-2'])
    expect(first.events.map((event) => event.sequence)).toEqual([0, 1, 2])
    expect(first.state.tick).toBe(1)
    expect(first.state.logicalTimeSeconds).toBe(6)
    expect(first.state.diagnosticSampleCount).toBe(3)
    expect(first.events).toEqual(stepSimulation(city, config, createInitialState(config), [...commands].reverse()).events)
    expect(() => stepSimulation(city, config, createInitialState(config), [command(0, 1), command(0, 1)]))
      .toThrow(/Duplicate command ordering key/)
  })

  it('schedules delayed actions at exact ticks with reproducible event IDs', () => {
    const first = stepSimulation(city, config, createInitialState(config), [command(0, 1, 0, 2)])
    expect(first.events).toEqual([])
    expect(first.state.pendingActions).toHaveLength(1)
    const second = stepSimulation(city, config, first.state, [])
    expect(second.events).toEqual([])
    const third = stepSimulation(city, config, second.state, [])
    expect(third.events).toHaveLength(1)
    expect(third.events[0].tick).toBe(3)
    expect(third.events[0].id).toEqual(
      replayToTick(city, config, [command(0, 1, 0, 2)], 3).events[0].id,
    )
  })

  it('rebuilds state and event history at a target tick without changing live state', () => {
    const session = new SimulationSession(city, config)
    session.submitCommand({ type: 'ScheduleDiagnosticProbe', delayTicks: 2, label: 'first' })
    session.submitCommand({ type: 'ScheduleDiagnosticProbe', delayTicks: 0, label: 'second' },
      { effectiveTick: 4, priority: -1 })
    for (let index = 0; index < 7; index += 1) session.advanceOneTick()
    const liveSnapshot = session.getSnapshot()
    const commands = session.getCommandHistory()
    expect(replayToTick(city, config, commands, 7)).toEqual({
      state: liveSnapshot.state,
      events: session.getLiveEventHistory(),
    })
    session.inspectTick(2)
    expect(session.getSnapshot().tick).toBe(2)
    expect(session.getSnapshot().liveTick).toBe(7)
    expect(session.getSnapshot().isInspecting).toBe(true)
    expect(() => session.advanceOneTick()).toThrow(/Return to live/)
    expect(() => session.submitCommand({ type: 'ScheduleDiagnosticProbe', delayTicks: 0 }))
      .toThrow(/Return to live/)
    session.returnLive()
    expect(session.getSnapshot().state).toEqual(liveSnapshot.state)
    expect(session.getSnapshot().isInspecting).toBe(false)
    expect(replayToTick(city, config, commands, 0)).toEqual({
      state: createInitialState(config),
      events: [],
    })
  })

  it('rejects invalid commands without changing accepted history', () => {
    const session = new SimulationSession(city, config)
    expect(() => session.submitCommand({ type: 'ScheduleDiagnosticProbe', delayTicks: -1 }))
      .toThrow(/Invalid simulation command/)
    expect(() => session.submitCommand({ type: 'ScheduleDiagnosticProbe', delayTicks: 0 },
      { effectiveTick: 0 })).toThrow(/Invalid simulation command/)
    expect(() => session.submitCommand({ type: 'ScheduleDiagnosticProbe', delayTicks: 50_000 },
      { effectiveTick: 1 })).toThrow(/Scheduled action exceeds/)
    expect(session.getSnapshot().commandCount).toBe(0)
    expect(session.getSnapshot().tick).toBe(0)
  })

  it('resets state and histories without changing the city', () => {
    const session = new SimulationSession(city, config)
    session.submitCommand({ type: 'ScheduleDiagnosticProbe', delayTicks: 0 })
    session.advanceOneTick()
    session.reset()
    expect(session.getSnapshot().state).toEqual(createInitialState(config))
    expect(session.getSnapshot().eventCount).toBe(0)
    expect(session.getSnapshot().commandCount).toBe(0)
  })

  it('stops at a history cap before committing a partial tick', () => {
    const session = new SimulationSession(city, config, {
      maxTicks: 3,
      maxCommands: 3,
      maxEvents: 1,
      maxPendingActions: 3,
    })
    session.submitCommand({ type: 'ScheduleDiagnosticProbe', delayTicks: 0 })
    session.submitCommand({ type: 'ScheduleDiagnosticProbe', delayTicks: 0 })
    const before = session.getSnapshot()
    expect(() => session.advanceOneTick()).toThrow(/history limit reached/)
    expect(session.getSnapshot()).toBe(before)
    expect(session.getLiveEventHistory()).toEqual([])
  })

  it('does not mutate frozen CityModel or depend on Math.random or Date.now', () => {
    const frozenCity = structuredClone(city)
    deepFreeze(frozenCity)
    const before = JSON.stringify(frozenCity)
    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('hidden RNG') })
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('wall clock') })
    try {
      const initial = createInitialState(config)
      const result = stepSimulation(frozenCity, config, initial, [command(0, 1)])
      expect(result.events).toHaveLength(1)
    } finally {
      randomSpy.mockRestore()
      dateSpy.mockRestore()
    }
    expect(JSON.stringify(frozenCity)).toBe(before)
  })
})
