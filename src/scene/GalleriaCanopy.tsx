import { useMemo } from 'react'
import { BufferGeometry, DoubleSide, Float32BufferAttribute, QuadraticBezierCurve3,
  TubeGeometry, Vector3 } from 'three'
import type { WorldModelV2 } from '../world/model'

function canopySurface(minX: number, maxX: number): BufferGeometry {
  const vertices: number[] = []
  const indices: number[] = []
  const columns = 16
  const rows = 12
  for (let row = 0; row <= rows; row += 1) {
    const z = -5 + row * 10 / rows
    for (let column = 0; column <= columns; column += 1) {
      const t = column / columns
      const x = minX + (maxX - minX) * t
      const y = 11.15 + 1.95 * 4 * t * (1 - t)
      vertices.push(x, y, z)
      if (row === 0 || column === 0) continue
      const current = row * (columns + 1) + column
      const before = current - columns - 1
      indices.push(before - 1, before, current - 1, before, current, current - 1)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** A glazed barrel canopy leaves the central atrium legible from the isometric view. */
export function GalleriaCanopy({ world, visible }: { world: WorldModelV2; visible: boolean }) {
  const surface = world.surfaces.find((item) => item.id === 'galleria-l1')
  const limits = useMemo(() => {
    if (!surface) return null
    const xs = surface.polygonXZ.map((point) => point.x / 1000)
    return { minX: Math.min(...xs) + 0.5, maxX: Math.max(...xs) - 0.5 }
  }, [surface])
  const glass = useMemo(() => limits ? canopySurface(limits.minX, limits.maxX) : null, [limits])
  const ribs = useMemo(() => limits ? [-5, -2.5, 0, 2.5, 5].map((z) => {
    const curve = new QuadraticBezierCurve3(
      new Vector3(limits.minX, 11.12, z),
      new Vector3((limits.minX + limits.maxX) / 2, 15.02, z),
      new Vector3(limits.maxX, 11.12, z))
    return new TubeGeometry(curve, 24, 0.1, 6, false)
  }) : [], [limits])
  if (!world.baseCity || !visible || !glass) return null
  return <group>
    <mesh geometry={glass}>
      <meshStandardMaterial color="#82adb5" transparent opacity={0.19}
        depthWrite={false} roughness={0.22} metalness={0.3} side={DoubleSide} />
    </mesh>
    {ribs.map((geometry, index) => <mesh key={index} geometry={geometry} castShadow>
      <meshStandardMaterial color="#819ca6" roughness={0.46} metalness={0.36} />
    </mesh>)}
  </group>
}

function pavilionRoof(minX: number, maxX: number, minZ: number, maxZ: number): BufferGeometry {
  const vertices: number[] = []
  const indices: number[] = []
  const sections = 16
  const rows = 8
  for (let row = 0; row <= rows; row += 1) {
    const x = minX + (maxX - minX) * row / rows
    for (let section = 0; section <= sections; section += 1) {
      const t = section / sections
      vertices.push(x, 9.12 + 1.22 * 4 * t * (1 - t), minZ + (maxZ - minZ) * t)
      if (row === 0 || section === 0) continue
      const current = row * (sections + 1) + section
      const before = current - sections - 1
      indices.push(before - 1, before, current - 1, before, current, current - 1)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** The plaza-side bridge entrance has a light arched canopy rather than a flat slab. */
export function PavilionCanopy({ world, visible }: { world: WorldModelV2; visible: boolean }) {
  const surface = world.surfaces.find((item) => item.id === 'pavilion-l0')
  const limits = useMemo(() => {
    if (!surface) return null
    const xs = surface.polygonXZ.map((point) => point.x / 1000)
    const zs = surface.polygonXZ.map((point) => point.z / 1000)
    return { minX: Math.min(...xs) - 0.25, maxX: Math.max(...xs) + 0.25,
      minZ: Math.min(...zs) - 0.25, maxZ: Math.max(...zs) + 0.25 }
  }, [surface])
  const roof = useMemo(() => limits ? pavilionRoof(limits.minX, limits.maxX,
    limits.minZ, limits.maxZ) : null, [limits])
  const arches = useMemo(() => limits ? [0, 0.5, 1].map((fraction) => {
    const x = limits.minX + (limits.maxX - limits.minX) * fraction
    return new TubeGeometry(new QuadraticBezierCurve3(
      new Vector3(x, 9.12, limits.minZ),
      new Vector3(x, 11.56, (limits.minZ + limits.maxZ) / 2),
      new Vector3(x, 9.12, limits.maxZ)), 24, 0.085, 6, false)
  }) : [], [limits])
  if (!world.baseCity || !visible || !roof) return null
  return <group>
    <mesh geometry={roof} castShadow receiveShadow>
      <meshStandardMaterial color="#6f8992" transparent opacity={0.72}
        depthWrite={false} roughness={0.48} metalness={0.16} side={DoubleSide} />
    </mesh>
    {arches.map((geometry, index) => <mesh key={index} geometry={geometry} castShadow>
      <meshStandardMaterial color="#a7b8b8" roughness={0.43} metalness={0.34} />
    </mesh>)}
  </group>
}
