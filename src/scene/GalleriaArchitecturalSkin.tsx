import { useMemo } from 'react'
import type { WorldBox, WorldModelV2 } from '../world/model'
import { InstancedBoxes, type BoxInstance } from './InstancedBoxes'

interface SkinParts {
  readonly frames: BoxInstance[]
  readonly darkGlass: BoxInstance[]
  readonly warmGlass: BoxInstance[]
  readonly floorBands: BoxInstance[]
  readonly roofPlant: BoxInstance[]
}

function addWindow(parts: SkinParts, x: number, y: number, z: number,
  width: number, face: 'x' | 'z', lit: boolean): void {
  const pane = face === 'x' ? [0.07, 2.25, width] : [width, 2.25, 0.07]
  const frame = face === 'x' ? [0.13, 2.48, width + 0.22] : [width + 0.22, 2.48, 0.13]
  parts.frames.push({ position: [x, y, z], scale: frame as [number, number, number], color: '#8b9da4' })
  ;(lit ? parts.warmGlass : parts.darkGlass).push({
    position: [x + (face === 'x' ? 0.075 : 0), y, z + (face === 'z' ? 0.075 : 0)],
    scale: pane as [number, number, number],
  })
}

function addSideWindows(parts: SkinParts, wall: WorldBox, outward: number): void {
  const length = wall.size.x / 1000
  const count = Math.max(2, Math.floor(length / 3.4))
  const startX = wall.center.x / 1000 - length / 2
  const z = wall.center.z / 1000 + outward * 0.25
  parts.floorBands.push({ position: [wall.center.x / 1000, 5.32, z],
    scale: [length, 0.22, 0.23], color: '#697f89' })
  for (let index = 0; index < count; index += 1) {
    const x = startX + length * (index + 0.5) / count
    for (const [floor, y] of [3.3, 7.75].entries()) {
      addWindow(parts, x, y, z + outward * 0.02,
        Math.min(2.15, length / count * 0.69), 'z', (index + floor * 2) % 4 === 1)
    }
  }
}

function addEastWindows(parts: SkinParts, wall: WorldBox): void {
  const length = wall.size.z / 1000
  const count = Math.max(3, Math.floor(length / 3.2))
  const startZ = wall.center.z / 1000 - length / 2
  const x = wall.center.x / 1000 + 0.23
  parts.floorBands.push({ position: [x, 5.32, wall.center.z / 1000],
    scale: [0.23, 0.22, length], color: '#697f89' })
  for (let index = 0; index < count; index += 1) {
    const z = startZ + length * (index + 0.5) / count
    for (const [floor, y] of [3.3, 7.75].entries()) {
      addWindow(parts, x, y, z, Math.min(2.1, length / count * 0.67),
        'x', (index * 2 + floor) % 5 === 1)
    }
  }
}

/** Decorative skin only; WorldModelV2 continues to own surfaces, portals, and collision semantics. */
export function GalleriaArchitecturalSkin({ world, showRoof }: {
  world: WorldModelV2
  showRoof: boolean
}) {
  const parts = useMemo(() => {
    const next: SkinParts = { frames: [], darkGlass: [], warmGlass: [], floorBands: [], roofPlant: [] }
    if (!world.baseCity) return next
    for (const wall of world.boxes) {
      if (wall.id.startsWith('galleria-plinth-z:')) {
        addSideWindows(next, wall, wall.id.endsWith('-1') ? -1 : 1)
      } else if (wall.id === 'galleria-wall-east') addEastWindows(next, wall)
      else if (wall.id.startsWith('galleria-roof-')) {
        const width = wall.size.x / 1000
        const depth = wall.size.z / 1000
        if (width < 4 || depth < 4) continue
        const x = wall.center.x / 1000 + width * 0.2
        const z = wall.center.z / 1000
        const y = wall.center.y / 1000 + 0.48
        next.roofPlant.push({ position: [x, y, z],
          scale: [Math.min(2.1, width * 0.22), 0.82, Math.min(2.4, depth * 0.33)],
          color: '#80919a' })
        next.roofPlant.push({ position: [x, y + 0.44, z],
          scale: [Math.min(2.1, width * 0.22) + 0.18, 0.11,
            Math.min(2.4, depth * 0.33) + 0.18], color: '#a1afb0' })
      }
    }
    return next
  }, [world])
  return <>
    <InstancedBoxes items={parts.floorBands} castShadow roughness={0.74} metalness={0.12} />
    <InstancedBoxes items={parts.frames} castShadow roughness={0.52} metalness={0.28} />
    <InstancedBoxes items={parts.darkGlass} color="#1a3441" roughness={0.31} metalness={0.14} />
    <InstancedBoxes items={parts.warmGlass} color="#bc8661" dayColor="#405b69" emissive="#dd985f"
      emissiveIntensity={0.92} roughness={0.36} />
    {showRoof && <InstancedBoxes items={parts.roofPlant} castShadow roughness={0.61}
      metalness={0.36} />}
  </>
}
