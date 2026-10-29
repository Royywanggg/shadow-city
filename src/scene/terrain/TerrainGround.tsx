import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BufferGeometry, Color, Float32BufferAttribute, Object3D, type InstancedMesh } from 'three'
import type { DevTerrainV1 } from '../../world/terrain/devTerrain'
import type { CityModel } from '../../city/model'
import { channelCenterXAtMm, heightAtMm } from '../../world/terrain/devTerrain'
import { TerrainEscarpment } from './TerrainEscarpment'
import { TerrainValleyTrees } from './TerrainValleyTrees'
import { InstancedBoxes, type BoxInstance } from '../InstancedBoxes'

function skirtBase(terrain: DevTerrainV1): number {
  return Math.min(-3.5,
    terrain.grid.heightsMm.reduce((minimum, height) => Math.min(minimum, height), 0) / 1000 - 2)
}

function overlapsRoad(terrain: DevTerrainV1, x: number, z: number, margin = 1.5): boolean {
  for (const profile of terrain.roadProfiles) {
    for (let index = 1; index < profile.path.length; index += 1) {
      const a = profile.path[index - 1]
      const b = profile.path[index]
      const dx = (b.x - a.x) / 1000
      const dz = (b.z - a.z) / 1000
      const lengthSq = dx * dx + dz * dz
      const t = Math.max(0, Math.min(1,
        ((x - a.x / 1000) * dx + (z - a.z / 1000) * dz) / (lengthSq || 1)))
      const distance = Math.hypot(x - a.x / 1000 - dx * t,
        z - a.z / 1000 - dz * t)
      if (distance < 5.65 + margin) return true
    }
  }
  return false
}

function makeGround(terrain: DevTerrainV1): BufferGeometry {
  const { grid } = terrain
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const low = new Color('#3e6058')
  const middle = new Color('#4e6266')
  const high = new Color('#687773')
  const valley = new Color('#56745e')
  const color = new Color()
  for (let z = 0; z < grid.depth; z += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const xMm = grid.originXmm + x * grid.stepMm
      const zMm = grid.originZmm + z * grid.stepMm
      const height = heightAtMm(terrain, xMm, zMm) / 1000
      positions.push(xMm / 1000, height, zMm / 1000)
      const t = Math.max(0, Math.min(1, (height + 7) / 23))
      color.copy(t < 0.36 ? low : middle).lerp(t < 0.36 ? middle : high,
        t < 0.36 ? t / 0.36 : (t - 0.36) / 0.64)
      const along = Math.max(0, Math.min(1, (zMm - 28_000) / 14_000)) *
        Math.max(0, Math.min(1, (101_000 - zMm) / 14_000))
      const across = Math.max(0, Math.min(1,
        (22_000 - Math.abs(xMm - channelCenterXAtMm(terrain, zMm))) / 15_000))
      color.lerp(valley, along * across * 0.58)
      colors.push(color.r, color.g, color.b)
    }
  }
  for (let z = 0; z < grid.depth - 1; z += 1) {
    for (let x = 0; x < grid.width - 1; x += 1) {
      const a = z * grid.width + x
      const b = a + 1
      const c = a + grid.width
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function makeSkirt(terrain: DevTerrainV1): BufferGeometry {
  const { grid } = terrain
  const positions: number[] = []
  const indices: number[] = []
  const base = skirtBase(terrain)
  const addWall = (ax: number, az: number, bx: number, bz: number) => {
    const ay = heightAtMm(terrain, Math.round(ax * 1000), Math.round(az * 1000)) / 1000
    const by = heightAtMm(terrain, Math.round(bx * 1000), Math.round(bz * 1000)) / 1000
    const index = positions.length / 3
    positions.push(ax, ay, az, bx, by, bz, ax, base, az, bx, base, bz)
    indices.push(index, index + 2, index + 1, index + 1, index + 2, index + 3)
  }
  const minX = grid.originXmm / 1000
  const minZ = grid.originZmm / 1000
  const maxX = (grid.originXmm + (grid.width - 1) * grid.stepMm) / 1000
  const maxZ = (grid.originZmm + (grid.depth - 1) * grid.stepMm) / 1000
  const step = grid.stepMm / 1000
  for (let x = minX; x < maxX - 0.001; x += step) {
    addWall(x, minZ, Math.min(maxX, x + step), minZ)
    addWall(Math.min(maxX, x + step), maxZ, x, maxZ)
  }
  for (let z = minZ; z < maxZ - 0.001; z += step) {
    addWall(minX, Math.min(maxZ, z + step), minX, z)
    addWall(maxX, z, maxX, Math.min(maxZ, z + step))
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function makeChannel(terrain: DevTerrainV1): BufferGeometry {
  const control = terrain.channel.centerline
  const points = control.flatMap((from, index) => {
    const to = control[index + 1]
    if (!to) return [from]
    const count = Math.max(8, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 1_800))
    return Array.from({ length: count }, (_, step) => {
      const t = step / count
      const eased = t * t * (3 - 2 * t)
      return { x: Math.round(from.x + (to.x - from.x) * eased),
        z: Math.round(from.z + (to.z - from.z) * t) }
    })
  })
  const positions: number[] = []
  const indices: number[] = []
  const width = terrain.channel.halfWidthMm / 1000 * 0.67
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    const before = points[Math.max(0, index - 1)]
    const after = points[Math.min(points.length - 1, index + 1)]
    const dx = after.x - before.x
    const dz = after.z - before.z
    const length = Math.hypot(dx, dz) || 1
    const nx = -dz / length * width
    const nz = dx / length * width
    const variation = 1 + 0.08 * Math.sin(index * 0.82)
    const y = heightAtMm(terrain, point.x, point.z) / 1000 + 0.38
    positions.push(point.x / 1000 + nx * variation, y, point.z / 1000 + nz * variation,
      point.x / 1000 - nx * variation, y, point.z / 1000 - nz * variation)
    if (index > 0) {
      const a = (index - 1) * 2
      const b = index * 2
      indices.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function makeRockBanks(terrain: DevTerrainV1): BufferGeometry {
  const points = terrain.channel.centerline
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const tones = [new Color('#65777a'), new Color('#53656a'), new Color('#71807d')]
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index]
    const b = points[index + 1]
    const count = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2_000))
    const dx = b.x - a.x
    const dz = b.z - a.z
    const length = Math.hypot(dx, dz) || 1
    const nx = -dz / length
    const nz = dx / length
    for (const side of [-1, 1]) {
      for (let step = 0; step < count; step += 1) {
        const addPoint = (t: number, fraction: number) => {
          const x = a.x + dx * t + nx * side * (terrain.channel.halfWidthMm +
            terrain.channel.bankWidthMm * fraction)
          const z = a.z + dz * t + nz * side * (terrain.channel.halfWidthMm +
            terrain.channel.bankWidthMm * fraction)
          const y = heightAtMm(terrain, Math.round(x), Math.round(z)) / 1000 + 0.08
          positions.push(x / 1000, y, z / 1000)
          const tone = tones[(index + step + (side + 1)) % tones.length]
          colors.push(tone.r, tone.g, tone.b)
        }
        const start = positions.length / 3
        const midpointX = (a.x + dx * (step + 0.5) / count +
          nx * side * (terrain.channel.halfWidthMm + terrain.channel.bankWidthMm * 0.55)) / 1000
        const midpointZ = (a.z + dz * (step + 0.5) / count +
          nz * side * (terrain.channel.halfWidthMm + terrain.channel.bankWidthMm * 0.55)) / 1000
        if (overlapsRoad(terrain, midpointX, midpointZ, 0.4)) continue
        addPoint(step / count, 0.21)
        addPoint(step / count, 0.92)
        addPoint((step + 1) / count, 0.21)
        addPoint((step + 1) / count, 0.92)
        indices.push(start, start + 2, start + 1,
          start + 1, start + 2, start + 3)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

interface Rock {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly sx: number
  readonly sy: number
  readonly sz: number
  readonly angle: number
  readonly tone: string
}

function TerrainBankRocks({ terrain }: { terrain: DevTerrainV1 }) {
  const ref = useRef<InstancedMesh>(null)
  const rocks = useMemo(() => {
    const result: Rock[] = []
    const points = terrain.channel.centerline
    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index]
      const to = points[index + 1]
      const segments = Math.max(3, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 2_600))
      const dx = to.x - from.x
      const dz = to.z - from.z
      const length = Math.hypot(dx, dz) || 1
      const nx = -dz / length
      const nz = dx / length
      for (let step = 0; step < segments; step += 1) {
        const t = (step + 0.5) / segments
        const x = from.x + dx * t
        const z = from.z + dz * t
        for (const side of [-1, 1]) for (let row = 0; row < 2; row += 1) {
          const variation = Math.sin(index * 91 + step * 17 + side * 3 + row * 29)
          const offset = terrain.channel.halfWidthMm +
            terrain.channel.bankWidthMm * (0.24 + row * 0.43) + variation * 550
          const rx = x + nx * offset * side
          const rz = z + nz * offset * side
          if (overlapsRoad(terrain, rx / 1000, rz / 1000)) continue
          const elevation = heightAtMm(terrain, Math.round(rx), Math.round(rz)) / 1000
          const size = 0.66 + (variation + 1) * 0.3 + row * 0.12
          result.push({ x: rx / 1000, y: elevation - 0.18 + size * 0.28,
            z: rz / 1000, sx: size * 1.45, sy: size * 0.68, sz: size,
            angle: variation * 1.8, tone: row === 0 ? '#43575b' : '#526367' })
        }
      }
    }
    return result
  }, [terrain])
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const helper = new Object3D()
    const color = new Color()
    rocks.forEach((rock, index) => {
      helper.position.set(rock.x, rock.y, rock.z)
      helper.rotation.set(0.12 * Math.sin(index), rock.angle, 0.1 * Math.cos(index))
      helper.scale.set(rock.sx, rock.sy, rock.sz)
      helper.updateMatrix()
      mesh.setMatrixAt(index, helper.matrix)
      mesh.setColorAt(index, color.set(rock.tone))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [rocks])
  if (rocks.length === 0) return null
  return <instancedMesh ref={ref} args={[undefined, undefined, rocks.length]}
    castShadow receiveShadow>
    <icosahedronGeometry args={[1, 0]} />
    <meshStandardMaterial color="#ffffff" roughness={0.98} flatShading />
  </instancedMesh>
}

export function TerrainGround({ terrain, city }: { terrain: DevTerrainV1;
  city: CityModel }) {
  const ground = useMemo(() => makeGround(terrain), [terrain])
  const skirt = useMemo(() => makeSkirt(terrain), [terrain])
  const channel = useMemo(() => makeChannel(terrain), [terrain])
  const banks = useMemo(() => makeRockBanks(terrain), [terrain])
  const outfall = useMemo(() => {
    const outlet = terrain.channel.centerline.at(-1)!
    const x = terrain.grid.originXmm / 1000 - 0.075
    const z = outlet.z / 1000
    const base = skirtBase(terrain)
    const top = heightAtMm(terrain, outlet.x, outlet.z) / 1000 + 0.75
    const height = Math.max(0.6, top - base)
    const width = terrain.channel.halfWidthMm / 1000 * 1.5
    const panel: BoxInstance = { position: [x, base + height / 2, z],
      scale: [0.13, height, width], color: '#10262e' }
    const cap: BoxInstance = { position: [x - 0.015, top + 0.13, z],
      scale: [0.22, 0.25, width + 0.48], color: '#66767a' }
    return [panel, cap]
  }, [terrain])
  useEffect(() => () => {
    ground.dispose()
    skirt.dispose()
    channel.dispose()
    banks.dispose()
  }, [ground, skirt, channel, banks])
  return <>
    <mesh geometry={ground} receiveShadow castShadow>
      <meshStandardMaterial vertexColors roughness={0.97} metalness={0} />
    </mesh>
    <mesh geometry={skirt} castShadow receiveShadow>
      <meshStandardMaterial color="#273844" roughness={0.92} side={2} />
    </mesh>
    <InstancedBoxes items={outfall} receiveShadow roughness={0.9} />
    <mesh geometry={channel} receiveShadow>
      <meshStandardMaterial color="#468a96" roughness={0.27} metalness={0.15}
        emissive="#1d5360" emissiveIntensity={0.4} side={2} />
    </mesh>
    <mesh geometry={banks} castShadow receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.98} flatShading side={2} />
    </mesh>
    <TerrainBankRocks terrain={terrain} />
    <TerrainValleyTrees terrain={terrain} city={city} />
    <TerrainEscarpment terrain={terrain} />
  </>
}
