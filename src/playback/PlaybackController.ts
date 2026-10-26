import { SimulationSession } from '../simulation/session'
import {
  browserFrameHost,
  FixedStepScheduler,
  type FrameHost,
  type PlaybackSpeed,
  type SchedulerStatus,
} from './FixedStepScheduler'

export interface PlaybackSnapshot {
  status: SchedulerStatus
  speed: PlaybackSpeed
  reason: string | null
  tick: number
  liveTick: number
  isInspecting: boolean
  eventCount: number
  commandCount: number
}

/** Owns browser playback controls; the session owns all scientific state. */
export class PlaybackController {
  private readonly session: SimulationSession
  private readonly host: FrameHost
  private readonly scheduler: FixedStepScheduler
  private readonly listeners = new Set<() => void>()
  private snapshot: PlaybackSnapshot
  private connections = 0
  private detachSession: (() => void) | null = null
  private detachVisibility: (() => void) | null = null

  constructor(session: SimulationSession, host: FrameHost = browserFrameHost()) {
    this.session = session
    this.host = host
    this.scheduler = new FixedStepScheduler(host, () => session.advanceOneTick(), () => this.publish())
    this.snapshot = this.readSnapshot()
  }

  /** Attach browser listeners in an effect. Safe across React StrictMode remounts. */
  connect(): () => void {
    this.connections += 1
    if (this.connections === 1) {
      this.detachSession = this.session.subscribe(() => this.publish())
      this.detachVisibility = this.host.onVisibilityChange(() => this.scheduler.handleVisibilityChange())
      this.publish()
    }
    let disconnected = false
    return () => {
      if (disconnected) return
      disconnected = true
      this.connections -= 1
      if (this.connections > 0) return
      this.scheduler.pause()
      this.detachSession?.()
      this.detachVisibility?.()
      this.detachSession = null
      this.detachVisibility = null
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): PlaybackSnapshot => this.snapshot

  getInterpolationAlpha = (): number => this.scheduler.getInterpolationAlpha()

  play(): void {
    if (this.session.getSnapshot().isInspecting) {
      this.scheduler.pause('Return Live before playing.')
      return
    }
    this.scheduler.play()
  }

  pause(): void {
    this.scheduler.pause()
  }

  step(): void {
    this.scheduler.pause()
    if (this.session.getSnapshot().isInspecting) {
      this.scheduler.pause('Return Live before stepping the simulation.')
      return
    }
    try {
      this.session.advanceOneTick()
      if (this.connections === 0) this.publish()
    } catch (error) {
      this.scheduler.pause(error instanceof Error ? error.message : String(error))
    }
  }

  reset(): void {
    this.scheduler.pause()
    this.session.reset()
    if (this.connections === 0) this.publish()
  }

  setSpeed(speed: PlaybackSpeed): void {
    this.scheduler.setSpeed(speed)
  }

  queueDiagnosticProbe(): void {
    if (this.session.getSnapshot().isInspecting) {
      this.scheduler.pause('Return Live before queuing a diagnostic probe.')
      return
    }
    try {
      this.session.submitCommand({ type: 'ScheduleDiagnosticProbe', delayTicks: 1, label: 'Manual probe' })
      if (this.connections === 0) this.publish()
    } catch (error) {
      this.scheduler.pause(error instanceof Error ? error.message : String(error))
    }
  }

  inspectTick(tick: number): void {
    this.scheduler.pause()
    try {
      this.session.inspectTick(tick)
      if (this.connections === 0) this.publish()
    } catch (error) {
      this.scheduler.pause(error instanceof Error ? error.message : String(error))
    }
  }

  returnLive(): void {
    this.session.returnLive()
    if (this.connections === 0) this.publish()
  }

  private readSnapshot(): PlaybackSnapshot {
    const session = this.session.getSnapshot()
    const scheduler = this.scheduler.getSnapshot()
    return {
      status: scheduler.status,
      speed: scheduler.speed,
      reason: scheduler.reason,
      tick: session.tick,
      liveTick: session.liveTick,
      isInspecting: session.isInspecting,
      eventCount: session.eventCount,
      commandCount: session.commandCount,
    }
  }

  private publish(): void {
    this.snapshot = this.readSnapshot()
    this.listeners.forEach((listener) => listener())
  }
}
