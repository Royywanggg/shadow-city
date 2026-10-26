import { useMemo } from 'react'
import { BufferGeometry, CatmullRomCurve3, DoubleSide, Float32BufferAttribute,
  TubeGeometry, Vector3 } from 'three'
import type { NavEdgeV2, WorldModelV2, WorldPointMm } from '../world/model'
import { InstancedBoxes, type BoxInstance } from './InstancedBoxes'

const metre = (value: number) => value / 1000

function tangent(path: readonly WorldPointMm[], index: number): readonly [number, number] {
  const before = path[Math.max(0, index - 1)]
  const after = path[Math.min(path.length - 1, index + 1)]
  const dx = after.x - before.x
  const dz = after.z - before.z
  const length = Math.hypot(dx, dz) || 1
  return [dx / length, dz / length]
}

/** Uses the authoritative simulation path as the deck's exact centerline. */
export function createWalkwayDeckGeometry(path: readonly WorldPointMm[], width: number): BufferGeometry {
  const vertices: number[] = []
  const indices: number[] = []
  for (let index = 0; index < path.length; index += 1) {
    const point = path[index]
    const [dx, dz] = tangent(path, index)
    const nx = -dz * width / 2
    const nz = dx * width / 2
    const x = metre(point.x)
    const y = metre(point.y) - 0.08
    const z = metre(point.z)
    vertices.push(x + nx, y, z + nz, x - nx, y, z - nz,
      x + nx, y - 0.32, z + nz, x - nx, y - 0.32, z - nz)
    if (index === 0) continue
    const a = (index - 1) * 4
    const b = index * 4
    indices.push(a, b, a + 1, a + 1, b, b + 1,
      a + 2, a + 3, b + 2, a + 3, b + 3, b + 2,
      a, a + 2, b, a + 2, b + 2, b,
      a + 1, b + 1, a + 3, a + 3, b + 1, b + 3)
  }
  const last = (path.length - 1) * 4
  indices.push(0, 1, 2, 1, 3, 2,
    last, last + 2, last + 1, last + 1, last + 2, last + 3)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function railingPoints(path: readonly WorldPointMm[], width: number, side: number): Vector3[] {
  return path.map((point, index) => {
    const [dx, dz] = tangent(path, index)
    return new Vector3(metre(point.x) - dz * width * 0.46 * side,
      metre(point.y) + 0.88, metre(point.z) + dx * width * 0.46 * side)
  })
}

function Structure({ edge, width, color, onPick }: { edge: NavEdgeV2;
  width: number; color: string; onPick: (surfaceId: string) => void }) {
  const deck = useMemo(() => createWalkwayDeckGeometry(edge.path, width), [edge.path, width])
  const railPath = useMemo(() => edge.id === 'bridge:deck'
    ? edge.path.slice(2, -2) : edge.path.slice(0, -2), [edge])
  const rails = useMemo(() => [-1, 1].map((side) => {
    const points = railingPoints(railPath, width, side)
    return new TubeGeometry(new CatmullRomCurve3(points, false, 'centripetal'),
      Math.max(24, railPath.length * 2), 0.052, 5, false)
  }), [railPath, width])
  const posts = useMemo<BoxInstance[]>(() => railPath.flatMap((point, index) => {
    if (index % 4 !== 0 && index !== railPath.length - 1) return []
    const [dx, dz] = tangent(railPath, index)
    return [-1, 1].map((side) => ({
      position: [metre(point.x) - dz * width * 0.46 * side,
        metre(point.y) + 0.42, metre(point.z) + dx * width * 0.46 * side],
      scale: [0.075, 0.88, 0.075],
    }))
  }), [railPath, width])
  const stairTreads = useMemo<BoxInstance[]>(() => edge.kind !== 'stair' ? [] :
    edge.path.flatMap((point, index) => {
      if (index === 0 || index === edge.path.length - 1 || index % 2 !== 0) return []
      const [dx, dz] = tangent(edge.path, index)
      return [{ position: [metre(point.x), metre(point.y) - 0.015, metre(point.z)],
        scale: [0.19, 0.055, width * 0.86], rotationY: Math.atan2(dz, dx) }]
    }), [edge, width])
  return <group>
    <mesh geometry={deck} castShadow receiveShadow onClick={(event) => {
      event.stopPropagation(); onPick(edge.surfaceId ?? `connector:${edge.connectorId}`)
    }}>
      <meshStandardMaterial color={color} roughness={0.72} metalness={0.12} side={DoubleSide} />
    </mesh>
    {rails.map((geometry, index) => <mesh key={index} geometry={geometry} castShadow>
      <meshStandardMaterial color="#b4c8c9" roughness={0.44} metalness={0.42} />
    </mesh>)}
    <InstancedBoxes items={posts} color="#8da8ac" roughness={0.6} />
    <InstancedBoxes items={stairTreads} color="#c2cbca" roughness={0.73} />
  </group>
}

export function WalkwayStructures({ world, onPickSurface }: { world: WorldModelV2;
  onPickSurface: (surfaceId: string | null) => void }) {
  const structures = useMemo(() => world.navEdges.filter((edge) =>
    edge.id === 'bridge:deck' || edge.id === 'connector:west-stair' ||
    edge.id === 'connector:east-ramp'), [world])
  if (!world.baseCity) return null
  return <>{structures.map((edge) => <Structure key={edge.id} edge={edge}
    width={edge.id === 'bridge:deck' ? 2.9 : edge.kind === 'ramp' ? 1.6 : 2.2}
    color={edge.id === 'bridge:deck' ? '#829aa5' : edge.kind === 'ramp' ? '#798f9b' : '#90a3ac'}
    onPick={onPickSurface} />)}
  </>
}
