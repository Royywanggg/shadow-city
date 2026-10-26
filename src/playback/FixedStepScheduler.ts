export type PlaybackSpeed = 1 | 2 | 4
export type SchedulerStatus = 'paused' | 'playing' | 'suspended'

export interface SchedulerSnapshot {
  status: SchedulerStatus
  speed: PlaybackSpeed
  reason: string | null
}

export interface FrameHost {
  now(): number
  requestFrame(callback: FrameRequestCallback): number
  cancelFrame(handle: number): void
  isHidden(): boolean
  onVisibilityChange(listener: () => void): () => void
}

export function browserFrameHost(): FrameHost {
  return {
    now: () => performance.now(),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (handle) => cancelAnimationFrame(handle),
    isHidden: () => document.hidden,
    onVisibilityChange(listener) {
      document.addEventListener('visibilitychange', listener)
      return () => document.removeEventListener('visibilitychange', listener)
    },
  }
}

export interface SchedulerOptions {
  baseTicksPerSecond?: number
  maximumStepsPerFrame?: number
  maximumDebtTicks?: number
  longGapMs?: number
}

/** Wall time only selects how many identical fixed transitions to execute. */
export class FixedStepScheduler {
  private readonly host: FrameHost
  private readonly onTick: () => void
  private readonly onChange: () => void
  private readonly baseTicksPerSecond: number
  private readonly maximumStepsPerFrame: number
  private readonly maximumDebtTicks: number
  private readonly longGapMs: number
  private status: SchedulerStatus = 'paused'
  private speed: PlaybackSpeed = 1
  private reason: string | null = null
  private accumulatorTicks = 0
  private lastTime = 0
  private frameHandle: number | null = null

  constructor(host: FrameHost, onTick: () => void, onChange: () => void, options: SchedulerOptions = {}) {
    this.host = host
    this.onTick = onTick
    this.onChange = onChange
    this.baseTicksPerSecond = options.baseTicksPerSecond ?? 10
    this.maximumStepsPerFrame = options.maximumStepsPerFrame ?? 8
    this.maximumDebtTicks = options.maximumDebtTicks ?? 20
    this.longGapMs = options.longGapMs ?? 1000
  }

  getSnapshot(): SchedulerSnapshot {
    return { status: this.status, speed: this.speed, reason: this.reason }
  }

  play(): void {
    if (this.status === 'playing') return
    if (this.host.isHidden()) {
      this.suspend('Tab is hidden. Press Play when visible.')
      return
    }
    this.accumulatorTicks = 0
    this.lastTime = this.host.now()
    this.status = 'playing'
    this.reason = null
    this.onChange()
    this.queueFrame()
  }

  pause(reason: string | null = null): void {
    this.cancelFrame()
    this.status = 'paused'
    this.reason = reason
    this.accumulatorTicks = 0
    this.onChange()
  }

  suspend(reason: string): void {
    this.cancelFrame()
    this.status = 'suspended'
    this.reason = reason
    this.accumulatorTicks = 0
    this.onChange()
  }

  setSpeed(speed: PlaybackSpeed): void {
    if (this.speed === speed) return
    // Settle elapsed wall time at the old speed before changing the rate.
    if (this.status === 'playing') this.advanceWallTime(this.host.now())
    this.speed = speed
    this.onChange()
  }

  handleVisibilityChange(): void {
    if (this.host.isHidden() && this.status === 'playing') {
      this.suspend('Tab was hidden. Press Play to resume.')
    }
  }

  private queueFrame(): void {
    if (this.status !== 'playing' || this.frameHandle !== null) return
    this.frameHandle = this.host.requestFrame((time) => {
      this.frameHandle = null
      this.advanceWallTime(time)
      this.queueFrame()
    })
  }

  private cancelFrame(): void {
    if (this.frameHandle === null) return
    this.host.cancelFrame(this.frameHandle)
    this.frameHandle = null
  }

  private advanceWallTime(now: number): void {
    if (this.status !== 'playing') return
    if (this.host.isHidden()) {
      this.suspend('Tab was hidden. Press Play to resume.')
      return
    }
    const elapsedMs = Math.max(0, now - this.lastTime)
    this.lastTime = now
    if (elapsedMs > this.longGapMs) {
      this.suspend('Long browser pause. Press Play to resume; no simulation ticks were skipped.')
      return
    }

    this.accumulatorTicks += elapsedMs * this.baseTicksPerSecond * this.speed / 1000
    if (this.accumulatorTicks > this.maximumDebtTicks + 1e-9) {
      this.suspend('Playback could not keep up. Press Play to resume; no simulation ticks were skipped.')
      return
    }

    const due = Math.min(this.maximumStepsPerFrame, Math.floor(this.accumulatorTicks + 1e-9))
    for (let index = 0; index < due; index += 1) {
      try {
        this.onTick()
      } catch (error) {
        this.pause(error instanceof Error ? error.message : String(error))
        return
      }
      this.accumulatorTicks -= 1
      if (this.status !== 'playing') return
    }
  }
}
