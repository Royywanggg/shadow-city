import { describe, expect, it } from 'vitest'
import { generateCity, HERO_SEED } from '../city/generation/generateCity'
import { SimulationSession } from '../simulation/session'
import { PlaybackController } from './PlaybackController'
import { type FrameHost } from './FixedStepScheduler'

class TestFrameHost implements FrameHost {
  time = 0
  hidden = false
  private nextHandle = 1
  private frames = new Map<number, FrameRequestCallback>()

  now() { return this.time }
  isHidden() { return this.hidden }
  requestFrame(callback: FrameRequestCallback) {
    const handle = this.nextHandle++
    this.frames.set(handle, callback)
    return handle
  }
  cancelFrame(handle: number) { this.frames.delete(handle) }
  onVisibilityChange() { return () => {} }
  advance(milliseconds: number) {
    this.time += milliseconds
    const frames = [...this.frames.values()]
    this.frames.clear()
    frames.forEach((callback) => callback(this.time))
  }
}

const city = generateCity(HERO_SEED)

function setup() {
  const session = new SimulationSession(city)
  const host = new TestFrameHost()
  const controller = new PlaybackController(session, host)
  const disconnect = controller.connect()
  return { session, host, controller, disconnect }
}

describe('PlaybackController', () => {
  it('pauses, steps exactly once, and resets only simulation state', () => {
    const { session, host, controller, disconnect } = setup()
    controller.play()
    host.advance(200)
    expect(session.getSnapshot().tick).toBe(2)
    controller.pause()
    host.advance(1000)
    expect(session.getSnapshot().tick).toBe(2)
    controller.step()
    expect(session.getSnapshot().tick).toBe(3)
    expect(controller.getSnapshot().status).toBe('paused')
    controller.reset()
    expect(session.getSnapshot().tick).toBe(0)
    expect(session.getSnapshot().state.logicalTimeSeconds).toBe(0)
    disconnect()
  })

  it('speed changes scheduling, not per-tick domain outcomes', () => {
    const slow = setup()
    const fast = setup()
    slow.session.submitCommand({ type: 'ScheduleDiagnosticProbe', delayTicks: 0 })
    fast.session.submitCommand({ type: 'ScheduleDiagnosticProbe', delayTicks: 0 })
    slow.controller.play()
    fast.controller.setSpeed(4)
    fast.controller.play()
    for (let index = 0; index < 4; index += 1) {
      slow.host.advance(100)
      fast.host.advance(25)
    }
    expect(slow.session.getSnapshot().tick).toBe(4)
    expect(fast.session.getSnapshot().tick).toBe(4)
    expect(fast.session.getSnapshot().state).toEqual(slow.session.getSnapshot().state)
    expect(fast.session.getEventHistory()).toEqual(slow.session.getEventHistory())
    slow.disconnect()
    fast.disconnect()
  })

  it('inspects a rebuilt tick without replacing live state or advancing during inspection', () => {
    const { session, controller, host, disconnect } = setup()
    controller.step()
    controller.step()
    controller.inspectTick(1)
    expect(controller.getSnapshot()).toMatchObject({ tick: 1, liveTick: 2, isInspecting: true })
    controller.play()
    host.advance(1000)
    controller.step()
    expect(session.getSnapshot().liveTick).toBe(2)
    expect(controller.getSnapshot().reason).toContain('Return Live')
    controller.returnLive()
    expect(controller.getSnapshot()).toMatchObject({ tick: 2, isInspecting: false })
    controller.step()
    expect(session.getSnapshot().tick).toBe(3)
    disconnect()
  })

  it('queues a diagnostic probe through the domain command pipeline', () => {
    const { session, controller, disconnect } = setup()
    controller.queueDiagnosticProbe()
    expect(controller.getSnapshot()).toMatchObject({ commandCount: 1, eventCount: 0 })
    controller.step()
    expect(controller.getSnapshot()).toMatchObject({ tick: 1, eventCount: 0 })
    controller.step()
    expect(controller.getSnapshot()).toMatchObject({ tick: 2, eventCount: 1 })
    expect(session.getSnapshot().lastEvent?.type).toBe('DiagnosticProbeSampled')
    controller.reset()
    expect(controller.getSnapshot()).toMatchObject({ commandCount: 0, eventCount: 0, tick: 0 })
    disconnect()
  })
})
