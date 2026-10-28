import type { WorldModelV2 } from '../world/model'
import { createNavigationIndexV2 } from '../world/navigation/routeV2'
import { advanceStateV5, createEnvironmentV5, createInitialStateV5, worldFingerprintV5 } from './engineV5'
import { observerViewV5 } from './offending/opportunityV5'
import type { AccessCommandV5, SimulationConfigV5, SimulationEnvironmentV5,
  SimulationStateV5 } from './v5Types'

export interface SessionSnapshotV5 {
  readonly state: SimulationStateV5
  readonly liveTick: number
  readonly tick: number
  readonly isInspecting: boolean
}

export class SimulationSessionV5 {
  private readonly world: WorldModelV2
  private readonly config: SimulationConfigV5
  private readonly index
  private commands: AccessCommandV5[]
  private environment: SimulationEnvironmentV5
  private live: SimulationStateV5
  private viewed: SimulationStateV5
  private checkpoints = new Map<number, SimulationStateV5>()
  private listeners = new Set<() => void>()
  private snapshot: SessionSnapshotV5

  constructor(world: WorldModelV2, config: SimulationConfigV5,
    commands: readonly AccessCommandV5[] = []) {
    this.world = world
    this.config = config
    this.commands = [...commands]
    this.index = createNavigationIndexV2(world)
    this.environment = createEnvironmentV5(world, config, commands)
    this.live = createInitialStateV5(this.environment, commands)
    this.viewed = this.live
    this.checkpoints.set(0, this.live)
    this.snapshot = { state: this.live, liveTick: 0, tick: 0, isInspecting: false }
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  readonly getSnapshot = (): SessionSnapshotV5 => this.snapshot
  getObserverView() { return observerViewV5(this.viewed) }
  getWorld() { return this.world }
  getProfiles() { return this.environment.profiles }
  getHabitProfiles() { return this.environment.habitProfiles ?? [] }
  getConfig() { return this.config }
  getLiveState(): SimulationStateV5 { return this.live }

  /** Reconstruct a bounded historical window without changing the inspected or live Tick. */
  reconstructWindow(centerTick: number, agentIds: readonly string[],
    radiusTicks = 12): ReadonlyMap<string, readonly Readonly<{
      tick: number; position: SimulationStateV5['citizens'][number]['position'];
      surfaceId: string
    }>[]> {
    if (!Number.isSafeInteger(centerTick) || centerTick < 0 ||
      centerTick > this.live.tick || !Number.isSafeInteger(radiusTicks) ||
      radiusTicks < 0 || radiusTicks > 30) {
      throw new Error('Invalid reconstruction window')
    }
    const start = Math.max(0, centerTick - radiusTicks)
    const end = Math.min(this.live.tick, centerTick + radiusTicks)
    const checkpoint = Math.floor(start / 100) * 100
    let state = this.checkpoints.get(checkpoint)!
    const wanted = new Set(agentIds)
    const traces = new Map<string, { tick: number;
      position: SimulationStateV5['citizens'][number]['position'];
      surfaceId: string }[]>()
    for (const id of agentIds) traces.set(id, [])
    while (state.tick < start) state = advanceStateV5(state, this.environment, this.index)
    while (state.tick <= end) {
      for (const citizen of state.citizens) {
        if (wanted.has(citizen.id)) traces.get(citizen.id)!.push({
          tick: state.tick, position: citizen.position, surfaceId: citizen.surfaceId })
      }
      if (state.tick === end) break
      state = advanceStateV5(state, this.environment, this.index)
    }
    return traces
  }

  private publish(): void {
    this.snapshot = { state: this.viewed, liveTick: this.live.tick,
      tick: this.viewed.tick, isInspecting: this.viewed !== this.live }
    for (const listener of this.listeners) listener()
  }

  advanceOneTick(): SimulationStateV5 {
    this.live = advanceStateV5(this.live, this.environment, this.index)
    if (this.live.tick % 100 === 0) this.checkpoints.set(this.live.tick, this.live)
    if (!this.snapshot.isInspecting) this.viewed = this.live
    this.publish()
    return this.live
  }

  inspectTick(tick: number): SimulationStateV5 {
    if (!Number.isSafeInteger(tick) || tick < 0 || tick > this.live.tick) {
      throw new Error('V5 inspection tick out of range')
    }
    const checkpoint = Math.floor(tick / 100) * 100
    let result = this.checkpoints.get(checkpoint)!
    while (result.tick < tick) result = advanceStateV5(result, this.environment, this.index)
    this.viewed = result
    this.publish()
    return result
  }

  returnLive(): void { this.viewed = this.live; this.publish() }

  reset(): void {
    this.live = createInitialStateV5(this.environment, this.commands)
    this.viewed = this.live
    this.checkpoints = new Map([[0, this.live]])
    this.publish()
  }

  /** Commands are part of the experiment fingerprint; rebuild to preserve replay integrity. */
  scheduleAccessCommand(command: AccessCommandV5): void {
    if (command.effectiveTick <= this.live.tick || this.commands.some((item) => item.id === command.id)) {
      throw new Error('V5 commands must have unique IDs and future effective ticks')
    }
    this.commands = [...this.commands, command]
    const oldTick = this.live.tick
    const viewedTick = this.viewed.tick
    this.environment = createEnvironmentV5(this.world, this.config, this.commands)
    this.live = createInitialStateV5(this.environment, this.commands)
    this.checkpoints = new Map([[0, this.live]])
    while (this.live.tick < oldTick) {
      this.live = advanceStateV5(this.live, this.environment, this.index)
      if (this.live.tick % 100 === 0) this.checkpoints.set(this.live.tick, this.live)
    }
    this.viewed = this.live
    if (viewedTick !== oldTick) this.inspectTick(viewedTick)
    else this.publish()
  }

  exportReplay() { return { fingerprint: worldFingerprintV5(this.world, this.config, this.commands),
    config: this.config, commands: this.commands, targetTick: this.live.tick } }
}
