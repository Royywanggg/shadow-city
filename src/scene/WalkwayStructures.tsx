import { useMemo } from 'react'
import { BufferGeometry, CatmullRomCurve3, DoubleSide, Float32BufferAttribute,
  TubeGeometry, Vector3 } from 'three'
import type { NavEdgeV2, OverpassInstance, WorldModelV2, WorldPointMm } from '../world/model'
import { InstancedBoxes, type BoxInstance } from './InstancedBoxes'

const metre = (value: number) => value / 1000
const BLUE = '#1684b4'

function tangent(path: readonly WorldPointMm[], index: number): readonly [number, number] {
  const before = path[Math.max(0, index - 1)]
  const after = path[Math.min(path.length - 1, index + 1)]
  const dx = after.x - before.x
  const dz = after.z - before.z
  const length = Math.hypot(dx, dz) || 1
  return [dx / length, dz / length]
}

/** The top face shares the authoritative navigation elevation. */
export function createWalkwayDeckGeometry(path: readonly WorldPointMm[], width: number,
  topOffset = 0): BufferGeometry {
  const vertices: number[] = []
  const indices: number[] = []
  for (let index = 0; index < path.length; index += 1) {
    const point = path[index]
    const [dx, dz] = tangent(path, index)
    const nx = -dz * width / 2
    const nz = dx * width / 2
    const x = metre(point.x)
    const y = metre(point.y) + topOffset
    const z = metre(point.z)
    vertices.push(x + nx, y, z + nz, x - nx, y, z - nz,
      x + nx, y - 0.28, z + nz, x - nx, y - 0.28, z - nz)
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

function sidePoints(path: readonly WorldPointMm[], width: number, side: number,
  rise: number): Vector3[] {
  return path.map((point, index) => {
    const [dx, dz] = tangent(path, index)
    return new Vector3(metre(point.x) - dz * width * 0.5 * side,
      metre(point.y) + rise, metre(point.z) + dx * width * 0.5 * side)
  })
}

function sidePanel(path: readonly WorldPointMm[], width: number, side: number,
  bottom: number, top: number): BufferGeometry {
  const low = sidePoints(path, width, side, bottom)
  const high = sidePoints(path, width, side, top)
  const vertices: number[] = []
  const indices: number[] = []
  for (let index = 0; index < path.length; index += 1) {
    vertices.push(low[index].x, low[index].y, low[index].z,
      high[index].x, high[index].y, high[index].z)
    if (index === 0) continue
    const before = (index - 1) * 2
    const current = index * 2
    indices.push(before, current, before + 1, before + 1, current, current + 1)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function Guard({ path, width, side }: { path: readonly WorldPointMm[];
  width: number; side: number }) {
  const lower = useMemo(() => sidePanel(path, width, side, -0.14, 0.55), [path, width, side])
  const upper = useMemo(() => sidePanel(path, width, side, 0.55, 1.22), [path, width, side])
  const rail = useMemo(() => new TubeGeometry(new CatmullRomCurve3(
    sidePoints(path, width, side, 1.22), false, 'centripetal'),
  Math.max(12, path.length * 2), 0.052, 5, false), [path, width, side])
  const posts = useMemo<BoxInstance[]>(() => path.flatMap((point, index) => {
    if (index !== 0 && index !== path.length - 1 && index % 5 !== 0) return []
    const [dx, dz] = tangent(path, index)
    return [{ position: [metre(point.x) - dz * width * 0.5 * side,
      metre(point.y) + 0.57, metre(point.z) + dx * width * 0.5 * side],
    scale: [0.075, 1.32, 0.075] }]
  }), [path, width, side])
  return <group>
    <mesh geometry={lower} castShadow>
      <meshStandardMaterial color={BLUE} roughness={0.6} metalness={0.3} side={DoubleSide} />
    </mesh>
    <mesh geometry={upper}>
      <meshStandardMaterial color="#79b2c2" roughness={0.7} metalness={0.1}
        transparent opacity={0.28} depthWrite={false} side={DoubleSide} />
    </mesh>
    <mesh geometry={rail} castShadow>
      <meshStandardMaterial color="#73c2d9" roughness={0.45} metalness={0.48} />
    </mesh>
    <InstancedBoxes items={posts} color="#52add0" metalness={0.4} roughness={0.58} />
  </group>
}

function StairFlight({ edge, width, onPick }: { edge: NavEdgeV2; width: number;
  onPick: (surfaceId: string) => void }) {
  const start = edge.path[0]
  const end = edge.path.at(-1)!
  const dx = metre(end.x - start.x)
  const dz = metre(end.z - start.z)
  const run = Math.hypot(dx, dz)
  const steps = 30
  const rotationY = -Math.atan2(dz, dx)
  const stringer = useMemo(() => createWalkwayDeckGeometry(edge.path, width, -0.19),
    [edge.path, width])
  const treads = useMemo<BoxInstance[]>(() => Array.from({ length: steps }, (_, index) => {
    const fraction = (index + 0.5) / steps
    const topY = metre(start.y + (end.y - start.y) * (index + 1) / steps)
    return { position: [metre(start.x) + dx * fraction, topY - 0.085,
      metre(start.z) + dz * fraction], scale: [run / steps + 0.006, 0.17,
      width - 0.08], rotationY }
  }), [start, end, dx, dz, run, rotationY, width])
  const nosings = useMemo<BoxInstance[]>(() => Array.from({ length: steps }, (_, index) => {
    const fraction = (index + 0.88) / steps
    const topY = metre(start.y + (end.y - start.y) * (index + 1) / steps)
    return { position: [metre(start.x) + dx * fraction, topY + 0.005,
      metre(start.z) + dz * fraction], scale: [0.032, 0.01,
      width - 0.16], rotationY }
  }), [start, end, dx, dz, rotationY, width])
  return <group onClick={(event) => {
    event.stopPropagation(); onPick(edge.id)
  }}>
    <mesh geometry={stringer} castShadow receiveShadow>
      <meshStandardMaterial color="#126f9c" roughness={0.6} metalness={0.3} side={DoubleSide} />
    </mesh>
    <InstancedBoxes items={treads} color="#72a9c0" metalness={0.28}
      roughness={0.72} castShadow receiveShadow />
    <InstancedBoxes items={nosings} color="#b9d4dc" metalness={0.18} roughness={0.68} />
    <Guard path={edge.path} width={width} side={-1} />
    <Guard path={edge.path} width={width} side={1} />
  </group>
}

function InteriorRamp({ edge, onPick }: { edge: NavEdgeV2;
  onPick: (surfaceId: string) => void }) {
  const deck = useMemo(() => createWalkwayDeckGeometry(edge.path, 1.6), [edge.path])
  const railPath = useMemo(() => edge.path.slice(0, -2), [edge.path])
  const rails = useMemo(() => [-1, 1].map((side) => new TubeGeometry(new CatmullRomCurve3(
    sidePoints(railPath, 1.6, side, 0.9), false, 'centripetal'),
  Math.max(24, railPath.length * 2), 0.05, 5, false)), [railPath])
  return <group>
    <mesh geometry={deck} castShadow receiveShadow onClick={(event) => {
      event.stopPropagation(); onPick(`connector:${edge.connectorId}`)
    }}>
      <meshStandardMaterial color="#798f9b" roughness={0.72} metalness={0.12} side={DoubleSide} />
    </mesh>
    {rails.map((geometry, index) => <mesh key={index} geometry={geometry} castShadow>
      <meshStandardMaterial color="#b4c8c9" roughness={0.44} metalness={0.42} />
    </mesh>)}
  </group>
}

function interpolate(a: WorldPointMm, b: WorldPointMm, distanceMm: number): WorldPointMm {
  const length = Math.hypot(b.x - a.x, b.z - a.z)
  return { x: Math.round(a.x + (b.x - a.x) * distanceMm / length), y: a.y,
    z: Math.round(a.z + (b.z - a.z) * distanceMm / length) }
}

/** The visual deck ends at the facade threshold; the interior floor owns the portal span. */
export function overpassDeckPath(instance: OverpassInstance,
  edges: ReadonlyMap<string, NavEdgeV2>): WorldPointMm[] {
  const bridge = edges.get(instance.deckEdgeIds[0])!
  const first = bridge.path[0]
  const last = bridge.path.at(-1)!
  const start = interpolate(first, last, -instance.widthMm / 2)
  return [start, ...instance.deckEdgeIds.flatMap((id, index) =>
    index === 0 ? edges.get(id)!.path : edges.get(id)!.path.slice(1))]
}

/** Guard gaps occur only where a stair physically joins the near edge. */
export function overpassGuardPaths(instance: OverpassInstance,
  edges: ReadonlyMap<string, NavEdgeV2>): Readonly<{ full: WorldPointMm[];
  stairSide: WorldPointMm[][] }> {
  const path = overpassDeckPath(instance, edges)
  const bridge = edges.get(instance.deckEdgeIds[0])!
  const start = bridge.path[0]
  const end = bridge.path.at(-1)!
  const half = instance.widthMm / 2
  const middle = [interpolate(start, end, half), interpolate(start, end, Math.hypot(
    end.x - start.x, end.z - start.z) - half)]
  const terminal = path.at(-1)!
  const tailStart = interpolate(start, end, Math.hypot(
    end.x - start.x, end.z - start.z) + half)
  const forward = (terminal.x - tailStart.x) * (end.x - start.x) +
    (terminal.z - tailStart.z) * (end.z - start.z)
  const tail = forward > 30 * Math.hypot(end.x - start.x, end.z - start.z)
    ? [[tailStart, terminal]] : []
  return { full: path, stairSide: [middle, ...tail] }
}

function Overpass({ world, instance, onPick }: { world: WorldModelV2;
  instance: OverpassInstance;
  onPick: (surfaceId: string) => void }) {
  const edges = useMemo(() => new Map(world.navEdges.map((edge) => [edge.id, edge])), [world])
  const width = instance.widthMm / 1000
  const deckPath = useMemo(() => overpassDeckPath(instance, edges), [instance, edges])
  const guardPaths = useMemo(() => overpassGuardPaths(instance, edges), [instance, edges])
  const mainDeck = useMemo(() => createWalkwayDeckGeometry(deckPath, width), [deckPath, width])
  return <group>
    <mesh geometry={mainDeck} castShadow receiveShadow onClick={(event) => {
      event.stopPropagation(); onPick(instance.surfaceId)
    }}>
      <meshStandardMaterial color={BLUE} roughness={0.67} metalness={0.2} side={DoubleSide} />
    </mesh>
    <Guard path={guardPaths.full} width={width} side={-instance.stairSide} />
    {guardPaths.stairSide.map((path, index) =>
      <Guard key={index} path={path} width={width} side={instance.stairSide} />)}
    {instance.stairEdgeIds.map((id) =>
      <StairFlight key={id} edge={edges.get(id)!} width={width} onPick={onPick} />)}
  </group>
}

export function WalkwayStructures({ world, onPickSurface }: { world: WorldModelV2;
  onPickSurface: (surfaceId: string | null) => void }) {
  if (!world.overpasses?.length) return null
  const ramp = world.navEdges.find((edge) => edge.id === 'connector:east-ramp')
  return <group>
    {world.overpasses.map((instance) => <Overpass key={instance.id} world={world}
      instance={instance} onPick={onPickSurface} />)}
    {ramp && <InteriorRamp edge={ramp} onPick={onPickSurface} />}
  </group>
}
