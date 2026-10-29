import { useEffect, useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import type { CityModel } from '../../city/model'
import type { DevTerrainV1 } from '../../world/terrain/devTerrain'
import { heightAtMm } from '../../world/terrain/devTerrain'
import type { WorldPointMm } from '../../world/model'
import { InstancedBoxes, type BoxInstance } from '../InstancedBoxes'
import { surfaceTextures } from '../SurfaceTextures'
import { junctionTrimKey, planCurvedJunctions, trimRoadPath,
  type JunctionPlan } from './roadJunctions'

type RoadProfile = DevTerrainV1['roadProfiles'][number]

interface SurfaceVertex {
  readonly x: number
  readonly y: number
  readonly z: number
}

type SurfaceQuad = readonly [SurfaceVertex, SurfaceVertex, SurfaceVertex, SurfaceVertex]

function tangent(path: readonly WorldPointMm[], index: number): readonly [number, number] {
  const before = path[Math.max(0, index - 1)]
  const after = path[Math.min(path.length - 1, index + 1)]
  const dx = after.x - before.x
  const dz = after.z - before.z
  const length = Math.hypot(dx, dz) || 1
  return [dx / length, dz / length]
}

interface RibbonInput {
  path: readonly WorldPointMm[]
  width: number
  sideOffset: number
  lift: number
  terrain?: DevTerrainV1
  deckSpan?: Readonly<{ startIndex: number; endIndex: number }>
}

function ribbon(inputs: readonly RibbonInput[], quads: readonly SurfaceQuad[] = []): BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (const { path, width, sideOffset, lift, terrain, deckSpan } of inputs) {
    if (path.length < 2) continue
    const start = positions.length / 3
    let distance = 0
    for (let index = 0; index < path.length; index += 1) {
      const point = path[index]
      if (index > 0) distance += Math.hypot(point.x - path[index - 1].x,
        point.y - path[index - 1].y, point.z - path[index - 1].z) / 1000
      const [dx, dz] = tangent(path, index)
      const nx = -dz
      const nz = dx
      for (const side of [1, -1]) {
        const offset = sideOffset + side * width / 2
        const x = point.x / 1000 + nx * offset
        const z = point.z / 1000 + nz * offset
        const isDeck = deckSpan && index >= deckSpan.startIndex && index <= deckSpan.endIndex
        const crossfall = terrain && !isDeck ? (heightAtMm(terrain,
          Math.round(x * 1000), Math.round(z * 1000)) -
          heightAtMm(terrain, point.x, point.z)) / 1000 : 0
        positions.push(x, point.y / 1000 + lift + crossfall, z)
        uvs.push(side === 1 ? 0 : width / 5, distance / 5)
      }
      if (index === 0) continue
      const a = start + (index - 1) * 2
      const b = start + index * 2
      indices.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  for (const quad of quads) {
    const start = positions.length / 3
    for (const vertex of quad) {
      positions.push(vertex.x, vertex.y, vertex.z)
      uvs.push(vertex.x / 5, vertex.z / 5)
    }
    indices.push(start, start + 1, start + 2,
      start, start + 2, start + 3)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function spanSidePanels(profiles: readonly RoadProfile[], widths: ReadonlyMap<string, number>,
  mode: 'bridge' | 'culvert'): BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  for (const profile of profiles) {
    const span = mode === 'bridge' ? profile.bridgeSpan : profile.culvertSpan
    if (!span) continue
    const width = (widths.get(profile.edgeId) ?? 5) + 3.3
    const { startIndex, endIndex } = span
    const first = mode === 'bridge' ? startIndex + 1 : startIndex
    const last = mode === 'bridge' ? endIndex - 1 : endIndex
    for (const side of [-1, 1]) {
      for (let index = first; index < last; index += 1) {
        const a = profile.path[index]
        const b = profile.path[index + 1]
        if (!a || !b) continue
        const [adx, adz] = tangent(profile.path, index)
        const [bdx, bdz] = tangent(profile.path, index + 1)
        const ax = a.x / 1000 - adz * side * width / 2
        const az = a.z / 1000 + adx * side * width / 2
        const bx = b.x / 1000 - bdz * side * width / 2
        const bz = b.z / 1000 + bdx * side * width / 2
        const base = positions.length / 3
        const capHeight = (at: number) => mode === 'bridge'
          ? 0.22 + 0.7 * Math.min(1, (at - first) / 2, (last - at) / 2)
          : 0.32
        const bottom = mode === 'bridge' ? -0.52 : -0.78
        positions.push(ax, a.y / 1000 + capHeight(index), az,
          bx, b.y / 1000 + capHeight(index + 1), bz,
          ax, a.y / 1000 + bottom, az,
          bx, b.y / 1000 + bottom, bz)
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function junctionPatches(city: CityModel, terrain: DevTerrainV1,
  widths: ReadonlyMap<string, number>, plan: JunctionPlan): BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const add = (x: number, z: number) => {
    positions.push(x, heightAtMm(terrain, Math.round(x * 1000),
      Math.round(z * 1000)) / 1000 + 0.095, z)
    uvs.push(x / 5, z / 5)
  }
  const degree = new Map<string, number>()
  for (const edge of city.roads.edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1)
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1)
  }
  for (const node of city.roads.nodes) {
    const width = widths.get(node.id)
    if (!width) continue
    const half = width / 2
    const start = positions.length / 3
    add(node.x, node.z)
    const fitted = plan.cornersByNode.get(node.id)
    if (fitted) {
      const corners = [...fitted].sort((a, b) =>
        Math.atan2(a.point.z - node.z, a.point.x - node.x) -
        Math.atan2(b.point.z - node.z, b.point.x - node.x))
      for (const corner of corners) add(corner.point.x, corner.point.z)
      for (let index = 0; index < corners.length; index += 1) {
        indices.push(start, start + 1 + index,
          start + 1 + (index + 1) % corners.length)
      }
      continue
    }
    if (degree.get(node.id) === 3) {
      const segments = 12
      for (let index = 0; index < segments; index += 1) {
        const angle = index * Math.PI * 2 / segments
        add(node.x + Math.cos(angle) * (half + 0.35),
          node.z + Math.sin(angle) * (half + 0.35))
      }
      for (let index = 0; index < segments; index += 1) {
        indices.push(start, start + 1 + index,
          start + 1 + (index + 1) % segments)
      }
      continue
    }
    add(node.x - half, node.z - half)
    add(node.x + half, node.z - half)
    add(node.x + half, node.z + half)
    add(node.x - half, node.z + half)
    indices.push(start, start + 1, start + 2,
      start, start + 2, start + 3,
      start, start + 3, start + 4,
      start, start + 4, start + 1)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function TerrainRoads({ city, terrain }: { city: CityModel; terrain: DevTerrainV1 }) {
  const paving = surfaceTextures().paving
  const asphalt = surfaceTextures().asphalt
  const geometry = useMemo(() => {
    const widths = new Map(city.roads.edges.map((edge) => [edge.id, edge.width]))
    const kinds = new Map(city.roads.edges.map((edge) => [edge.id, edge.kind]))
    const plan = planCurvedJunctions(city, terrain)
    const road: RibbonInput[] = []
    const sidewalk: RibbonInput[] = []
    const curb: RibbonInput[] = []
    const sidewalkQuads: SurfaceQuad[] = []
    const curbQuads: SurfaceQuad[] = []
    const sections = new Map<string, Readonly<{
      sidewalk: readonly [SurfaceVertex, SurfaceVertex]
      curb: readonly [SurfaceVertex, SurfaceVertex]
    }>>()
    const marks: RibbonInput[] = []
    const underdecks: RibbonInput[] = []
    const piers: BoxInstance[] = []
    for (const profile of terrain.roadProfiles) {
      const width = widths.get(profile.edgeId)
      if (!width) continue
      const deckSpan = profile.bridgeSpan ?? profile.culvertSpan
      road.push({ path: profile.path, width, sideOffset: 0, lift: 0.02,
        terrain, deckSpan })
      const section = (path: readonly WorldPointMm[], side: number,
        atStart: boolean, inner: number, outer: number,
        lift: number): readonly [SurfaceVertex, SurfaceVertex] => {
        const index = atStart ? 0 : path.length - 1
        const point = path[index]
        const [dx, dz] = tangent(path, index)
        const vertex = (distance: number): SurfaceVertex => {
          const x = point.x / 1000 - dz * side * (width / 2 + distance)
          const z = point.z / 1000 + dx * side * (width / 2 + distance)
          return { x, y: heightAtMm(terrain, Math.round(x * 1000),
            Math.round(z * 1000)) / 1000 + 0.07 + lift, z }
        }
        return [vertex(inner), vertex(outer)]
      }
      for (const side of [-1, 1]) {
        const startTrim = plan.trimsMm.get(junctionTrimKey(profile.edgeId, true, side)) ?? 0
        const endTrim = plan.trimsMm.get(junctionTrimKey(profile.edgeId, false, side)) ?? 0
        const path = deckSpan ? profile.path : trimRoadPath(profile.path, startTrim, endTrim)
        sidewalk.push({ path, width: 1.45,
          sideOffset: side * (width / 2 + 0.95), lift: 0.19, terrain, deckSpan })
        curb.push({ path, width: 0.19,
          sideOffset: side * (width / 2 + 0.1), lift: 0.12, terrain, deckSpan })
        for (const [atStart, trim] of [[true, startTrim], [false, endTrim]] as const) {
          if (!trim) continue
          sections.set(junctionTrimKey(profile.edgeId, atStart, side), {
            sidewalk: section(path, side, atStart, 0.225, 1.675, 0.19),
            curb: section(path, side, atStart, 0.005, 0.195, 0.12),
          })
        }
      }
      if (kinds.get(profile.edgeId) === 'avenue') {
        const startClear = Math.max(...[-1, 1].map((side) =>
          plan.trimsMm.get(junctionTrimKey(profile.edgeId, true, side)) ?? 0))
        const endClear = Math.max(...[-1, 1].map((side) =>
          plan.trimsMm.get(junctionTrimKey(profile.edgeId, false, side)) ?? 0))
        const distances = [0]
        for (let index = 1; index < profile.path.length; index += 1) {
          distances.push(distances[index - 1] + Math.hypot(
            profile.path[index].x - profile.path[index - 1].x,
            profile.path[index].z - profile.path[index - 1].z))
        }
        const total = distances.at(-1) ?? 0
        for (let index = 0; index + 2 < profile.path.length; index += 5) {
          if (startClear && distances[index] < startClear + 4_000 ||
            endClear && total - distances[index + 2] < endClear + 4_000) continue
          marks.push({ path: profile.path.slice(index, index + 3), width: 0.13,
            sideOffset: 0, lift: 0.044, terrain })
        }
      }
      if (profile.bridge && profile.bridgeSpan) {
        const { startIndex, endIndex } = profile.bridgeSpan
        underdecks.push({ path: profile.path.slice(startIndex, endIndex + 1),
          width: width + 3.3, sideOffset: 0, lift: -0.48 })
        const point = profile.path[Math.floor((startIndex + endIndex) / 2)]
        if (point) {
          const ground = heightAtMm(terrain, point.x, point.z)
          const gap = (point.y - ground) / 1000
          if (gap > 1.7) piers.push({ position: [point.x / 1000,
            (point.y + ground) / 2000 - 0.18, point.z / 1000],
          scale: [0.85, gap - 0.35, 0.85], color: '#56636b' })
        }
      }
      if (profile.culvertSpan) {
        const { startIndex, endIndex } = profile.culvertSpan
        underdecks.push({ path: profile.path.slice(startIndex, endIndex + 1),
          width: width + 3.3, sideOffset: 0, lift: -0.72 })
        for (const index of [Math.floor(startIndex + (endIndex - startIndex) * 0.23),
          Math.ceil(startIndex + (endIndex - startIndex) * 0.77)]) {
          const point = profile.path[index]
          if (!point) continue
          const ground = heightAtMm(terrain, point.x, point.z)
          const gap = (point.y - ground) / 1000
          if (gap < 1.2) continue
          const [dx, dz] = tangent(profile.path, index)
          for (const side of [-1, 1]) piers.push({
            position: [point.x / 1000 - dz * side * (width / 2 - 0.15),
              (point.y + ground) / 2000 - 0.18,
              point.z / 1000 + dx * side * (width / 2 - 0.15)],
            scale: [0.8, gap - 0.3, 0.8], color: '#596a70',
          })
        }
      }
    }
    for (const corners of plan.cornersByNode.values()) for (const corner of corners) {
      const first = sections.get(junctionTrimKey(corner.first.edge.id,
        corner.first.atStart, corner.first.atStart ? 1 : -1))
      const second = sections.get(junctionTrimKey(corner.second.edge.id,
        corner.second.atStart, corner.second.atStart ? -1 : 1))
      if (!first || !second) throw new Error('Curved junction is missing a sidewalk end')
      sidewalkQuads.push([first.sidewalk[0], first.sidewalk[1],
        second.sidewalk[1], second.sidewalk[0]])
      curbQuads.push([first.curb[0], first.curb[1],
        second.curb[1], second.curb[0]])
    }
    const profileById = new Map(terrain.roadProfiles.map((profile) => [profile.edgeId, profile]))
    const nodeWidths = new Map<string, number>()
    for (const edge of city.roads.edges) {
      const profile = profileById.get(edge.id)
      if (!profile) continue
      nodeWidths.set(edge.from, Math.max(nodeWidths.get(edge.from) ?? 0, edge.width))
      nodeWidths.set(edge.to, Math.max(nodeWidths.get(edge.to) ?? 0, edge.width))
    }
    return { road: ribbon(road), sidewalk: ribbon(sidewalk, sidewalkQuads),
      curb: ribbon(curb, curbQuads),
      underdecks: ribbon(underdecks),
      marks: ribbon(marks), bridgeWalls: spanSidePanels(terrain.roadProfiles, widths, 'bridge'),
      culvertWalls: spanSidePanels(terrain.roadProfiles, widths, 'culvert'),
      piers, junctions: junctionPatches(city, terrain, nodeWidths, plan) }
  }, [city, terrain])
  useEffect(() => () => {
    geometry.road.dispose()
    geometry.sidewalk.dispose()
    geometry.curb.dispose()
    geometry.underdecks.dispose()
    geometry.marks.dispose()
    geometry.bridgeWalls.dispose()
    geometry.culvertWalls.dispose()
    geometry.junctions.dispose()
  }, [geometry])
  return <>
    <mesh geometry={geometry.road} receiveShadow>
      <meshStandardMaterial color="#344859" roughness={0.98}
        map={asphalt.color} normalMap={asphalt.normal} roughnessMap={asphalt.roughness}
        side={2} />
    </mesh>
    <mesh geometry={geometry.junctions} receiveShadow>
      <meshStandardMaterial color="#344859" roughness={0.97}
        map={asphalt.color} normalMap={asphalt.normal} roughnessMap={asphalt.roughness}
        side={2} />
    </mesh>
    <mesh geometry={geometry.sidewalk} receiveShadow>
      <meshStandardMaterial color="#687885" roughness={0.94}
        map={paving.color} normalMap={paving.normal} roughnessMap={paving.roughness}
        side={2} />
    </mesh>
    <mesh geometry={geometry.curb} receiveShadow>
      <meshStandardMaterial color="#8a9798" roughness={0.84} side={2} />
    </mesh>
    <mesh geometry={geometry.marks}>
      <meshStandardMaterial color="#aeb8af" roughness={0.9} side={2} />
    </mesh>
    <mesh geometry={geometry.bridgeWalls} castShadow receiveShadow>
      <meshStandardMaterial color="#74858a" roughness={0.7} metalness={0.14} side={2} />
    </mesh>
    <mesh geometry={geometry.underdecks} castShadow receiveShadow>
      <meshStandardMaterial color="#4e626d" roughness={0.88} side={2} />
    </mesh>
    <mesh geometry={geometry.culvertWalls} castShadow receiveShadow>
      <meshStandardMaterial color="#64747a" roughness={0.89} metalness={0.04} side={2} />
    </mesh>
    <InstancedBoxes items={geometry.piers} castShadow receiveShadow roughness={0.82} />
  </>
}
