import { useEffect, useMemo } from 'react'
import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, TubeGeometry,
  Vector3 } from 'three'
import type { DevTerrainV1 } from '../../world/terrain/devTerrain'
import type { WorldPointMm } from '../../world/model'
import { DEV_UPPER_CONTOUR_ROAD_EDGE_ID } from '../../world/generation/devUpperRoadPlan'
import { InstancedBoxes, type BoxInstance } from '../InstancedBoxes'

function pathRibbon(path: readonly WorldPointMm[], widthM: number): BufferGeometry {
  const vertices: number[] = []
  const indices: number[] = []
  for (let index = 0; index < path.length; index += 1) {
    const point = path[index]
    const before = path[Math.max(0, index - 1)]
    const after = path[Math.min(path.length - 1, index + 1)]
    const dx = after.x - before.x
    const dz = after.z - before.z
    const distance = Math.hypot(dx, dz) || 1
    const sideX = -dz / distance * widthM / 2
    const sideZ = dx / distance * widthM / 2
    vertices.push(point.x / 1000 + sideX, point.y / 1000 - 0.16,
      point.z / 1000 + sideZ,
    point.x / 1000 - sideX, point.y / 1000 - 0.16,
      point.z / 1000 - sideZ)
    if (index > 0) {
      const a = (index - 1) * 2
      const b = index * 2
      indices.push(a, a + 1, b, b, a + 1, b + 1)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function TerrainTerraceAccess({ terrain }: { terrain: DevTerrainV1 }) {
  const access = terrain.terraceAccess
  const roadHasSouthSidewalk = terrain.roadProfiles.some((profile) =>
    profile.edgeId === DEV_UPPER_CONTOUR_ROAD_EDGE_ID)
  const trail = useMemo(() => access && !roadHasSouthSidewalk
    ? pathRibbon(access.trail, 2.4) : null,
  [access, roadHasSouthSidewalk])
  const walkways = useMemo(() => {
    if (!access || access.walkways.length === 0) return null
    const paths = access.walkways.map((walkway) =>
      pathRibbon(walkway.path, walkway.widthMm / 1_000))
    const positions: number[] = []
    const indices: number[] = []
    for (const path of paths) {
      const offset = positions.length / 3
      positions.push(...Array.from(path.getAttribute('position').array))
      indices.push(...Array.from(path.getIndex()!.array, (index) => index + offset))
      path.dispose()
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
  }, [access])
  const foot = useMemo(() => access ? pathRibbon(access.crossing, 2.2) : null,
    [access])
  const stairTreads = useMemo((): BoxInstance[] => access ?
    access.stair.slice(1).map((to, index) => {
      const from = access.stair[index]
      const low = Math.min(from.y, to.y) / 1000 - 0.26
      const top = Math.max(from.y, to.y) / 1000 - 0.19
      return { position: [(from.x + to.x) / 2000,
        (low + top) / 2, (from.z + to.z) / 2000],
      scale: [2.15, Math.max(0.08, top - low),
        Math.abs(to.z - from.z) / 1000 + 0.03],
      color: index % 5 === 0 ? '#8d9b99' : '#788a8b' }
    }) : [], [access])
  const posts = useMemo((): BoxInstance[] => access ?
    access.stair.filter((_, index) => index % 5 === 0 ||
      index === access.stair.length - 1).flatMap((point) =>
      [-1, 1].map((side) => ({
        position: [point.x / 1000 + side * 1.18,
          point.y / 1000 + 0.28, point.z / 1000],
        scale: [0.065, 1.05, 0.065], color: '#6d8589',
      }))) : [], [access])
  const handrails = useMemo(() => access ? [-1, 1].map((side) => {
    const points = access.stair.filter((_, index) => index % 3 === 0 ||
      index === access.stair.length - 1).map((point) =>
      new Vector3(point.x / 1000 + side * 1.18,
        point.y / 1000 + 0.82, point.z / 1000))
    return new TubeGeometry(new CatmullRomCurve3(points),
      Math.max(32, points.length * 4), 0.04, 5, false)
  }) : [], [access])
  useEffect(() => () => {
    trail?.dispose()
    walkways?.dispose()
    foot?.dispose()
    handrails.forEach((rail) => rail.dispose())
  }, [trail, walkways, foot, handrails])
  if (!access) return null
  return <>
    {trail && <mesh geometry={trail} receiveShadow>
      <meshStandardMaterial color="#4c6067" roughness={0.94} side={2} />
    </mesh>}
    {walkways && <mesh geometry={walkways} receiveShadow>
      <meshStandardMaterial color="#71858a" roughness={0.92} side={2} />
    </mesh>}
    {foot && <mesh geometry={foot} receiveShadow>
      <meshStandardMaterial color="#849395" roughness={0.91} side={2} />
    </mesh>}
    <InstancedBoxes items={stairTreads} castShadow receiveShadow roughness={0.93} />
    <InstancedBoxes items={posts} castShadow roughness={0.55} metalness={0.35} />
    {handrails.map((rail, index) => <mesh key={index} geometry={rail} castShadow>
      <meshStandardMaterial color="#7a969b" roughness={0.49} metalness={0.42} />
    </mesh>)}
  </>
}
