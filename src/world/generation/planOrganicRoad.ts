import { hashSeed } from '../../simulation/rng'
import type { GroundPointMm, WorldPointMm } from '../model'

export interface RoadPlanningObstacle {
  readonly x: number
  readonly z: number
  readonly halfWidthMm: number
  readonly halfDepthMm: number
}

export interface RoadPlanningConfig {
  readonly maxGrade: number
  readonly clearanceMm: number
  readonly sampleSpacingMm: number
  readonly maxBendMm: number
}

export const ORGANIC_ROAD_PLANNING: RoadPlanningConfig = Object.freeze({
  maxGrade: 0.12, clearanceMm: 750, sampleSpacingMm: 3_000,
  maxBendMm: 22_000,
})

function candidate(a: GroundPointMm, b: GroundPointMm,
  height: (x: number, z: number) => number, offset: number,
  sBend: boolean, spacing: number): WorldPointMm[] {
  const dx = b.x - a.x; const dz = b.z - a.z
  const length = Math.hypot(dx, dz)
  const count = Math.max(12, Math.ceil(length / spacing))
  return Array.from({ length: count + 1 }, (_, index) => {
    const t = index / count
    const lateral = offset * (sBend ? Math.sin(Math.PI * t) *
      Math.sin(2 * Math.PI * t) : Math.sin(Math.PI * t) ** 2)
    const x = Math.round(a.x + dx * t - dz / length * lateral)
    const z = Math.round(a.z + dz * t + dx / length * lateral)
    return { x, y: height(x, z) + 75, z }
  })
}

function score(path: readonly WorldPointMm[], obstacles: readonly RoadPlanningObstacle[],
  roadWidthMm: number, config: RoadPlanningConfig): number {
  let cost = 0
  for (let index = 1; index < path.length; index += 1) {
    const a = path[index - 1]; const b = path[index]
    const planar = Math.hypot(b.x - a.x, b.z - a.z)
    const grade = Math.abs(b.y - a.y) / planar
    cost += planar / 1000 + (grade / config.maxGrade) ** 2 * planar / 1000 * 0.9
    if (grade > config.maxGrade) cost += 20_000 * (grade - config.maxGrade)
    if (index > 1) {
      const previous = path[index - 2]
      const ax = a.x - previous.x; const az = a.z - previous.z
      const bx = b.x - a.x; const bz = b.z - a.z
      const angle = Math.acos(Math.max(-1, Math.min(1,
        (ax * bx + az * bz) / (Math.hypot(ax, az) * Math.hypot(bx, bz)))))
      cost += angle * angle * 240
    }
    for (const obstacle of obstacles) {
      const halfX = obstacle.halfWidthMm + roadWidthMm / 2 + config.clearanceMm
      const halfZ = obstacle.halfDepthMm + roadWidthMm / 2 + config.clearanceMm
      if (Math.abs(b.x - obstacle.x) < halfX &&
        Math.abs(b.z - obstacle.z) < halfZ) cost += 200_000
    }
  }
  return cost
}

/** Score complete 3D corridors rather than perturbing a finished grid. */
export function planOrganicRoad(a: GroundPointMm, b: GroundPointMm, id: string,
  height: (x: number, z: number) => number,
  roadWidthMm: number, obstacles: readonly RoadPlanningObstacle[],
  hierarchy: 'arterial' | 'collector' | 'local',
  config: RoadPlanningConfig = ORGANIC_ROAD_PLANNING): WorldPointMm[] {
  const length = Math.hypot(b.x - a.x, b.z - a.z)
  const bend = Math.min(config.maxBendMm, length * 0.26)
  const midX = (a.x + b.x) / 2; const midZ = (a.z + b.z) / 2
  const nx = -(b.z - a.z) / length; const nz = (b.x - a.x) / length
  const left = height(midX + nx * 12_000, midZ + nz * 12_000)
  const right = height(midX - nx * 12_000, midZ - nz * 12_000)
  const preferred = (left <= right ? 1 : -1) * bend *
    (hierarchy === 'arterial' ? 0.4 : hierarchy === 'collector' ? 0.3 : 0.16)
  const offsets = [0, -0.35, 0.35, -0.7, 0.7, -1, 1]
  const variants = offsets.flatMap((factor) => [false, true].map((sBend) => {
    const path = candidate(a, b, height, factor * bend, sBend,
      config.sampleSpacingMm)
    return { path, cost: score(path, obstacles, roadWidthMm, config) +
      Math.abs(factor * bend - preferred) * 0.006 + (sBend ? 4 : 0),
      tie: hashSeed(`${id}:${factor}:${sBend}`) }
  }))
  variants.sort((left, right) => left.cost - right.cost || left.tie - right.tie)
  return variants[0].path
}
