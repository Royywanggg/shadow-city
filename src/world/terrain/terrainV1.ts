import { hashSeed } from '../../simulation/rng'
import type { TerrainFieldV1, WalkableSurface, WorldPointMm } from '../model'

const unit = (seed: string) => hashSeed(seed) / 0x1_0000_0000

function heightFunction(seed: string, x: number, z: number): number {
  const phase = unit(`${seed}:phase`) * 6.283185307179586
  const hill = 7.5 * Math.exp(-((x + 79) ** 2 + (z + 62) ** 2) / (2 * 69 ** 2))
  const ridge = 3.5 * Math.exp(-((x + 96) ** 2) / (2 * 52 ** 2))
  const valley = -3.8 * Math.exp(-((x - 82) ** 2 + (z - 72) ** 2) / (2 * 66 ** 2))
  const broad = 1.1 * Math.sin(x / 71 + phase) * Math.cos(z / 82 - phase * 0.5)
  const centerBlend = 1 - 0.75 * Math.exp(-((x - 12) ** 2 + (z - 5) ** 2) / (2 * 49 ** 2))
  return 0.35 + (hill + ridge + valley + broad) * centerBlend
}

export function generateTerrainV1(seed: string, extentMm: number, stepMm = 5_000): TerrainFieldV1 {
  const columns = Math.ceil(extentMm / stepMm) + 1
  const rows = columns
  const originX = -Math.floor(extentMm / 2)
  const originZ = originX
  const heightsMm = Array.from({ length: columns * rows }, (_, index) => {
    const x = (originX + index % columns * stepMm) / 1000
    const z = (originZ + Math.floor(index / columns) * stepMm) / 1000
    return Math.round(heightFunction(seed, x, z) * 1000)
  })
  return { originX, originZ, stepMm, columns, rows, heightsMm }
}

/** Grade a protected landmark plateau without altering the source terrain generator. */
export function gradeTerrainPlateau(terrain: TerrainFieldV1,
  bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>,
  featherMm: number, targetHeightMm = 0): TerrainFieldV1 {
  const smooth = (t: number) => t * t * (3 - 2 * t)
  const heightsMm = terrain.heightsMm.map((height, index) => {
    const x = terrain.originX + index % terrain.columns * terrain.stepMm
    const z = terrain.originZ + Math.floor(index / terrain.columns) * terrain.stepMm
    const outside = Math.hypot(Math.max(bounds.minX - x, 0, x - bounds.maxX),
      Math.max(bounds.minZ - z, 0, z - bounds.maxZ))
    const blend = 1 - smooth(Math.min(1, outside / featherMm))
    return Math.round(height * (1 - blend) + targetHeightMm * blend)
  })
  return { ...terrain, heightsMm }
}

export function getTerrainHeight(terrain: TerrainFieldV1, x: number, z: number): number {
  const fx = Math.max(0, Math.min(terrain.columns - 1, (x - terrain.originX) / terrain.stepMm))
  const fz = Math.max(0, Math.min(terrain.rows - 1, (z - terrain.originZ) / terrain.stepMm))
  const ix = Math.min(terrain.columns - 2, Math.floor(fx))
  const iz = Math.min(terrain.rows - 2, Math.floor(fz))
  const tx = fx - ix; const tz = fz - iz
  const at = (column: number, row: number) => terrain.heightsMm[row * terrain.columns + column]
  return Math.round((1 - tz) * ((1 - tx) * at(ix, iz) + tx * at(ix + 1, iz)) +
    tz * ((1 - tx) * at(ix, iz + 1) + tx * at(ix + 1, iz + 1)))
}

export function getTerrainGradient(terrain: TerrainFieldV1, x: number, z: number): Readonly<{ x: number; z: number }> {
  const span = Math.round(terrain.stepMm / 2)
  return { x: (getTerrainHeight(terrain, x + span, z) - getTerrainHeight(terrain, x - span, z)) / (2 * span),
    z: (getTerrainHeight(terrain, x, z + span) - getTerrainHeight(terrain, x, z - span)) / (2 * span) }
}

export function surfaceHeight(surface: WalkableSurface, terrain: TerrainFieldV1 | undefined,
  point: Pick<WorldPointMm, 'x' | 'z'>): number {
  return surface.elevationMode === 'terrain' && terrain
    ? getTerrainHeight(terrain, point.x, point.z) + surface.elevationMm : surface.elevationMm
}
