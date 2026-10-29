import { useEffect, useMemo } from 'react'
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from 'three'
import type { WorldModelV2 } from '../world/model'
import { getTerrainHeight } from '../world/terrain/terrainV1'
import { surfaceTextures } from './SurfaceTextures'

type Road = WorldModelV2['roadEdges'][number]

function appendRoad(vertices: number[], uvs: number[], indices: number[],
  road: Road, terrain: WorldModelV2['terrain'], widthExtraMm: number,
  elevationMm: number): void {
  const path = road.path
  if (!path || path.length < 4) return
  const start = vertices.length / 3
  let length = 0
  const first = 1; const last = path.length - 2
  for (let index = first; index <= last; index += 1) {
    const point = path[index]
    const before = path[index - 1]; const after = path[index + 1]
    const dx = after.x - before.x; const dz = after.z - before.z
    const scale = (road.widthMm + widthExtraMm) / 2 / (Math.hypot(dx, dz) || 1)
    const nx = -dz * scale; const nz = dx * scale
    const leftY = road.structure === 'viaduct' || !terrain ? point.y :
      getTerrainHeight(terrain, point.x + nx, point.z + nz) + 75
    const rightY = road.structure === 'viaduct' || !terrain ? point.y :
      getTerrainHeight(terrain, point.x - nx, point.z - nz) + 75
    if (index > first) length += Math.hypot(point.x - path[index - 1].x,
      point.z - path[index - 1].z)
    vertices.push((point.x + nx) / 1000, (leftY + elevationMm) / 1000,
      (point.z + nz) / 1000,
      (point.x - nx) / 1000, (rightY + elevationMm) / 1000,
      (point.z - nz) / 1000)
    uvs.push(0, length / 5_000, road.widthMm / 5_000, length / 5_000)
    if (index === first) continue
    const a = start + (index - first - 1) * 2
    const b = a + 2
    indices.push(a, b, a + 1, a + 1, b, b + 1)
  }
}

function geometry(vertices: number[], uvs: number[], indices: number[]): BufferGeometry {
  const result = new BufferGeometry()
  result.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  result.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  result.setIndex(indices)
  result.computeVertexNormals()
  return result
}

export function createOrganicRoadSurface(world: WorldModelV2,
  hierarchy: Road['hierarchy'], widthExtraMm = 0,
  elevationMm = 0): BufferGeometry {
  const vertices: number[] = []; const uvs: number[] = []; const indices: number[] = []
  for (const road of world.roadEdges) if (road.hierarchy === hierarchy) {
    appendRoad(vertices, uvs, indices, road, world.terrain, widthExtraMm, elevationMm)
  }
  return geometry(vertices, uvs, indices)
}

export function createOrganicJunctionSurface(world: WorldModelV2): BufferGeometry {
  const vertices: number[] = []; const uvs: number[] = []; const indices: number[] = []
  const roadsByNode = new Map(world.roadNodes.map((node) => [node.id, [] as Road[]]))
  for (const road of world.roadEdges) {
    roadsByNode.get(road.from)?.push(road)
    roadsByNode.get(road.to)?.push(road)
  }
  for (const node of world.roadNodes) {
    const roads = roadsByNode.get(node.id) ?? []
    if (roads.length < 2 || !world.terrain) continue
    const radius = Math.max(...roads.map((road) => road.widthMm)) / 2000 + 1.7
    const start = vertices.length / 3
    const x = node.position.x / 1000; const z = node.position.z / 1000
    const h = (px: number, pz: number) =>
      getTerrainHeight(world.terrain!, px * 1000, pz * 1000) / 1000 + 0.084
    vertices.push(x, h(x, z), z)
    uvs.push(x / 5, z / 5)
    const sides = 20
    for (let side = 0; side <= sides; side += 1) {
      const angle = 2 * Math.PI * side / sides
      const px = x + Math.cos(angle) * radius
      const pz = z + Math.sin(angle) * radius
      vertices.push(px, h(px, pz), pz)
      uvs.push(px / 5, pz / 5)
      if (side > 0) indices.push(start, start + side, start + side + 1)
    }
  }
  return geometry(vertices, uvs, indices)
}

export function OrganicRoadGeometry({ world, onPick }: { world: WorldModelV2;
  onPick: (surfaceId: string, x: number, z: number) => void }) {
  const roadGeometry = useMemo(() => (['arterial', 'collector', 'local'] as const)
    .map((hierarchy) => createOrganicRoadSurface(world, hierarchy, 0, 35)), [world])
  const shoulders = useMemo(() => (['arterial', 'collector', 'local'] as const)
    .map((hierarchy) => createOrganicRoadSurface(world, hierarchy, 3_000, 15)), [world])
  const junctions = useMemo(() => createOrganicJunctionSurface(world), [world])
  const maps = useMemo(() => surfaceTextures().asphalt, [])
  useEffect(() => () => { roadGeometry.forEach((item) => item.dispose())
    shoulders.forEach((item) => item.dispose()); junctions.dispose() },
    [roadGeometry, shoulders, junctions])
  return <group onClick={(event) => { event.stopPropagation();
    onPick('organic:ground', event.point.x, event.point.z) }}>
    {shoulders.map((item, index) => <mesh key={`shoulder:${index}`}
      geometry={item} receiveShadow>
      <meshStandardMaterial color="#596d70" roughness={0.98} side={DoubleSide} />
    </mesh>)}
    {roadGeometry.map((item, index) => <mesh key={index} geometry={item} receiveShadow>
      <meshStandardMaterial color={['#334957', '#3a505b', '#40555d'][index]}
        map={maps.color} normalMap={maps.normal} roughnessMap={maps.roughness}
        roughness={0.94} side={DoubleSide} polygonOffset polygonOffsetFactor={-1} />
    </mesh>)}
    <mesh geometry={junctions} receiveShadow>
      <meshStandardMaterial color="#354c58" map={maps.color} normalMap={maps.normal}
        roughnessMap={maps.roughness} roughness={0.94} side={DoubleSide} />
    </mesh>
  </group>
}
