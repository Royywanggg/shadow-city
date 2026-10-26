import { describe, expect, it } from 'vitest'
import { FixedStepScheduler, type FrameHost } from './FixedStepScheduler'

class TestFrameHost implements FrameHost {
  time = 0
  hidden = false
  private nextHandle = 1
  private frames = new Map<number, FrameRequestCallback>()
  private visibilityListeners = new Set<() => void>()

  now() { return this.time }
  isHidden() { return this.hidden }
  requestFrame(callback: FrameRequestCallback) {
    const handle = this.nextHandle++
    this.frames.set(handle, callback)
    return handle
  }
  cancelFrame(handle: number) { this.frames.delete(handle) }
  onVisibilityChange(listener: () => void) {
    this.visibilityListeners.add(listener)
    return () => this.visibilityListeners.delete(listener)
  }
  advance(milliseconds: number) {
    this.time += milliseconds
    const frames = [...this.frames.values()]
    this.frames.clear()
    frames.forEach((callback) => callback(this.time))
  }
  setHidden(hidden: boolean) {
    this.hidden = hidden
    this.visibilityListeners.forEach((listener) => listener())
  }
}

function runAtFrameRate(fps: number): number {
  const host = new TestFrameHost()
  let ticks = 0
  const scheduler = new FixedStepScheduler(host, () => { ticks += 1 }, () => {})
  scheduler.play()
  for (let frame = 1; frame <= fps * 2; frame += 1) {
    host.advance(2000 / (fps * 2))
  }
  return ticks
}

describe('FixedStepScheduler', () => {
  it('exposes a clamped render-only phase and snaps when playback stops', () => {
    const host = new TestFrameHost()
    const scheduler = new FixedStepScheduler(host, () => {}, () => {})
    expect(scheduler.getInterpolationAlpha()).toBe(1)
    scheduler.play()
    host.time = 50
    expect(scheduler.getInterpolationAlpha()).toBeCloseTo(0.5)
    host.advance(50)
    expect(scheduler.getInterpolationAlpha()).toBe(0)
    scheduler.pause()
    expect(scheduler.getInterpolationAlpha()).toBe(1)
  })

  it('executes the same number of logical ticks at 30, 60, and 120 fps', () => {
    expect(runAtFrameRate(30)).toBe(20)
    expect(runAtFrameRate(60)).toBe(20)
    expect(runAtFrameRate(120)).toBe(20)
  })

  it('preserves short-stall debt and limits work in one frame', () => {
    const host = new TestFrameHost()
    let ticks = 0
    const scheduler = new FixedStepScheduler(host, () => { ticks += 1 }, () => {})
    scheduler.play()
    host.advance(900)
    expect(ticks).toBe(8)
    expect(scheduler.getSnapshot().status).toBe('playing')
    host.advance(16)
    expect(ticks).toBe(9)
  })

  it('settles elapsed time at the old speed before changing speed', () => {
    const host = new TestFrameHost()
    let ticks = 0
    const scheduler = new FixedStepScheduler(host, () => { ticks += 1 }, () => {})
    scheduler.play()
    host.advance(250)
    expect(ticks).toBe(2)
    host.time += 50
    scheduler.setSpeed(4)
    expect(ticks).toBe(3)
    host.advance(100)
    expect(ticks).toBe(7)
  })

  it('suspends on excessive debt without silently advancing partial state', () => {
    const host = new TestFrameHost()
    let ticks = 0
    const scheduler = new FixedStepScheduler(host, () => { ticks += 1 }, () => {})
    scheduler.setSpeed(4)
    scheduler.play()
    host.advance(600)
    expect(ticks).toBe(0)
    expect(scheduler.getSnapshot().status).toBe('suspended')
    expect(scheduler.getSnapshot().reason).toContain('could not keep up')
    scheduler.play()
    host.advance(100)
    expect(ticks).toBe(4)
  })

  it('suspends after a hidden tab or long frame gap and requires explicit resume', () => {
    const host = new TestFrameHost()
    let ticks = 0
    const scheduler = new FixedStepScheduler(host, () => { ticks += 1 }, () => {})
    const remove = host.onVisibilityChange(() => scheduler.handleVisibilityChange())
    scheduler.play()
    host.setHidden(true)
    host.advance(5000)
    expect(ticks).toBe(0)
    expect(scheduler.getSnapshot().status).toBe('suspended')
    host.setHidden(false)
    scheduler.play()
    host.advance(1100)
    expect(ticks).toBe(0)
    expect(scheduler.getSnapshot().status).toBe('suspended')
    remove()
  })

  it('pauses on transition failure and does not schedule another frame', () => {
    const host = new TestFrameHost()
    let calls = 0
    const scheduler = new FixedStepScheduler(host, () => {
      calls += 1
      throw new Error('history limit reached')
    }, () => {})
    scheduler.play()
    host.advance(100)
    expect(calls).toBe(1)
    expect(scheduler.getSnapshot()).toMatchObject({ status: 'paused', reason: 'history limit reached' })
    host.advance(100)
    expect(calls).toBe(1)
  })
})
