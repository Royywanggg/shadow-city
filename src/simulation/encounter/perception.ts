import { hashSeed } from '../rng'
import type { CitizenStateV5 } from '../v5Types'
import { compareEncounterIds, type DirectedPerceptionSample, type EncounterTracePoint,
  type SpatialCandidateSample } from './spatialTypes'

export interface PerceptionConfig {
  readonly fieldOfViewDegrees: number
  readonly travellingAttention: number
  readonly stationaryAttention: number
  readonly closeAwarenessMm: number
  readonly individualAttention?: Readonly<Record<string, number>>
}

export const DEFAULT_PERCEPTION_CONFIG: PerceptionConfig = Object.freeze({
  fieldOfViewDegrees: 220,
  travellingAttention: 0.52,
  stationaryAttention: 0.82,
  closeAwarenessMm: 900,
})

function unit(key: string): number { return (hashSeed(key) + 0.5) / 0x1_0000_0000 }

export function validatePerceptionConfig(config: PerceptionConfig): void {
  if (!Number.isFinite(config.fieldOfViewDegrees) ||
    config.fieldOfViewDegrees <= 0 || config.fieldOfViewDegrees > 360 ||
    ![config.travellingAttention, config.stationaryAttention].every((value) =>
      Number.isFinite(value) && value >= 0 && value <= 1) ||
    Object.values(config.individualAttention ?? {}).some((value) =>
      !Number.isFinite(value) || value < 0 || value > 1) ||
    !Number.isSafeInteger(config.closeAwarenessMm) || config.closeAwarenessMm < 0) {
    throw new Error('Invalid perception configuration')
  }
}

function facing(observer: EncounterTracePoint, target: EncounterTracePoint,
  fallbackHeading: number, fieldOfViewDegrees: number, closeAwarenessMm: number): boolean {
  const dx = target.position.x - observer.position.x
  const dz = target.position.z - observer.position.z
  const spatialDistance = Math.hypot(dx, target.position.y - observer.position.y, dz)
  if (spatialDistance <= closeAwarenessMm) return true
  const heading = observer.headingRadians ?? fallbackHeading
  if (!Number.isFinite(heading)) return false
  const direction = Math.atan2(dx, dz)
  const delta = Math.atan2(Math.sin(direction - heading), Math.cos(direction - heading))
  return Math.abs(delta) <= fieldOfViewDegrees * Math.PI / 360
}

/** A directed attention approximation; identity recognition is deliberately separate. */
export function evaluatePerception(samples: readonly SpatialCandidateSample[],
  citizens: readonly CitizenStateV5[], seed: string, tick: number,
  config: PerceptionConfig = DEFAULT_PERCEPTION_CONFIG): readonly DirectedPerceptionSample[] {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new Error('Invalid perception Tick')
  validatePerceptionConfig(config)
  const byId = new Map(citizens.map((citizen) => [citizen.id, citizen]))
  const results: DirectedPerceptionSample[] = []
  for (const sample of samples) {
    for (const [observer, target, speed] of [
      [sample.first, sample.secondTrace, sample.firstSpeedMmPerSecond],
      [sample.secondTrace, sample.first, sample.secondSpeedMmPerSecond],
    ] as const) {
      const citizen = byId.get(observer.agentId)
      if (!citizen || !byId.has(target.agentId)) throw new Error('Perception sample has unknown agent')
      const potentiallyVisible = facing(observer, target, citizen.headingRadians,
        config.fieldOfViewDegrees, config.closeAwarenessMm)
      const moving = speed > 200 || observer.activity === 'travelling' ||
        observer.activity === 'returningHome' ||
        (observer.activity === undefined && (citizen.activity === 'travelling' ||
          citizen.activity === 'returningHome'))
      const baselineAttention = moving ? config.travellingAttention : config.stationaryAttention
      const trait = config.individualAttention?.[observer.agentId]
      const attention = Math.min(1, baselineAttention * (trait === undefined ? 1 : 0.5 + trait))
      const actuallyPerceived = potentiallyVisible && unit(JSON.stringify([
        seed, 'perception', tick, sample.second, observer.agentId, target.agentId,
      ])) < attention
      results.push({ pairKey: sample.pairKey, second: sample.second,
        observerAgentId: observer.agentId, targetAgentId: target.agentId,
        distanceMm: sample.distanceMm, physicallyNear: true,
        potentiallyVisible, actuallyPerceived,
        approximation: 'surface-portal-blocker-heading' })
    }
  }
  return results.sort((a, b) => a.second - b.second ||
    compareEncounterIds(a.pairKey, b.pairKey) ||
    compareEncounterIds(a.observerAgentId, b.observerAgentId))
}
