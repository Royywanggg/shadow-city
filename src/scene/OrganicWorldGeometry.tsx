import { Html, Line } from '@react-three/drei'
import { useEffect, useMemo, useState } from 'react'
import { BufferGeometry, CatmullRomCurve3, DoubleSide, Float32BufferAttribute,
  TubeGeometry, Vector3 } from 'three'
import type { TerrainFieldV1, WorldModelV2, WorldPointMm } from '../world/model'
import { getTerrainGradient, getTerrainHeight } from '../world/terrain/terrainV1'
import { createWalkwayDeckGeometry } from './WalkwayStructures'
import { OrganicRoadGeometry } from './OrganicRoadGeometry'
import { InstancedBoxes, type BoxInstance } from './InstancedBoxes'
import { useLightingState } from './lighting/LightingContext'

export type OrganicDebugMode = 'none' | 'height' | 'slope' | 'centerlines' |
  'nodes' | 'junctions' | 'surfaces' | 'footprints' | 'foundations' |
  'entrances' | 'bridges'

function terrainGeometry(terrain: TerrainFieldV1, world: WorldModelV2,
  mode: OrganicDebugMode): BufferGeometry {
  const vertices: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  for (let row = 0; row < terrain.rows; row += 1) {
    for (let column = 0; column < terrain.columns; column += 1) {
      const x = terrain.originX + column * terrain.stepMm
      const z = terrain.originZ + row * terrain.stepMm
      const h = terrain.heightsMm[row * terrain.columns + column] / 1000
      vertices.push(x / 1000, h, z / 1000)
      const green = world.regions?.filter((region) => region.kind === 'park').reduce(
        (sum, region) => sum + region.strength * Math.exp(-0.5 *
          (Math.hypot(x - region.center.x, z - region.center.z) / region.radiusMm) ** 2), 0) ?? 0
      const gradient = getTerrainGradient(terrain, x, z)
      const slope = Math.hypot(gradient.x, gradient.z)
      const variation = 0.025 * Math.sin(x / 17_000) * Math.cos(z / 23_000)
      const rock = Math.max(0, Math.min(1, (slope - 0.055) * 8))
      if (mode === 'height') {
        const t = Math.max(0, Math.min(1, (h + 4) / 17))
        colors.push(0.1 + t * 0.78, 0.35 + t * 0.45, 0.75 - t * 0.62)
      } else if (mode === 'slope') {
        const t = Math.max(0, Math.min(1, slope / 0.12))
        colors.push(0.1 + t * 0.85, 0.82 - t * 0.58, 0.18)
      } else colors.push(0.24 + variation + rock * 0.12 - green * 0.025,
        0.31 + variation + green * 0.07 - rock * 0.03,
        0.27 + variation * 0.4 - green * 0.015 + rock * 0.065)
      if (row > 0 && column > 0) {
        const a = (row - 1) * terrain.columns + column - 1
        const b = a + 1
        const c = a + terrain.columns
        const d = c + 1
        indices.push(a, c, b, b, c, d)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function Ribbon({ path, width, color, onClick }: { path: readonly WorldPointMm[];
  width: number; color: string; onClick?: () => void }) {
  const geometry = useMemo(() => createWalkwayDeckGeometry(path, width), [path, width])
  return <mesh geometry={geometry} receiveShadow onClick={onClick && ((event) => {
    event.stopPropagation(); onClick()
  })}>
    <meshStandardMaterial color={color} roughness={0.92} side={DoubleSide} />
  </mesh>
}

/** Roads and bridge decks use the same centerlines and elevations as the navigation world. */
export function OrganicWorldGeometry({ world, onPickSurface, debugRegions = false,
  debugMode = 'none' }: {
  world: WorldModelV2; onPickSurface: (surfaceId: string | null) => void;
  debugRegions?: boolean; debugMode?: OrganicDebugMode }) {
  const [probe, setProbe] = useState<Readonly<{ roadId: string; hierarchy: string;
    point: WorldPointMm; terrainY: number; navId: string }> | null>(null)
  const ground = useMemo(() => world.terrain ?
    terrainGeometry(world.terrain, world, debugMode) : null, [world, debugMode])
  useEffect(() => () => ground?.dispose(), [ground])
  const bridgeEdges = useMemo(() => world.navEdges.filter((edge) =>
    edge.id.startsWith('organic:skybridge:') && edge.id.endsWith(':deck')), [world.navEdges])
  const stairEdges = useMemo(() => world.navEdges.filter((edge) =>
    edge.id.startsWith('organic:tower-') && edge.kind === 'stair'), [world.navEdges])
  const lighting = useLightingState()
  const laneMarks = useMemo<BoxInstance[]>(() => world.roadEdges.flatMap((road) => {
    if (road.hierarchy !== 'arterial' || !road.path) return []
    return road.path.flatMap((point, index, path) => {
      if (index < 4 || index > path.length - 5 || index % 4 !== 0) return []
      const a = path[index - 1]; const b = path[index + 1]
      return [{ position: [point.x / 1000, point.y / 1000 + 0.045,
        point.z / 1000] as [number, number, number],
        scale: [0.11, 0.018, 2.2] as [number, number, number],
        rotationY: Math.atan2(b.x - a.x, b.z - a.z) }]
    })
  }), [world.roadEdges])
  const viaduct = useMemo(() => world.roadEdges.find((road) =>
    road.structure === 'viaduct'), [world.roadEdges])
  const supportBoxes = useMemo<BoxInstance[]>(() => {
    if (!world.terrain || !viaduct?.path) return []
    return viaduct.path.flatMap((point, index) => {
      const ground = getTerrainHeight(world.terrain!, point.x, point.z) / 1000
      const clearance = point.y / 1000 - ground
      if (clearance < 2.25 || index % 4 !== 0) return []
      return [-1, 1].map((side) => ({
        position: [point.x / 1000 + side * 2.4,
          ground + (clearance - 0.25) / 2, point.z / 1000] as [number, number, number],
        scale: [0.5, clearance - 0.25, 0.5] as [number, number, number],
      }))
    })
  }, [viaduct, world.terrain])
  const guardrails = useMemo(() => {
    if (!viaduct?.path) return []
    return [-1, 1].map((side) => {
      const points = viaduct.path!.map((point, index, path) => {
        const a = path[Math.max(0, index - 1)]
        const b = path[Math.min(path.length - 1, index + 1)]
        const dx = b.x - a.x; const dz = b.z - a.z
        const length = Math.hypot(dx, dz) || 1
        return new Vector3(point.x / 1000 - side * dz / length * 5.0,
          point.y / 1000 + 1.0, point.z / 1000 + side * dx / length * 5.0)
      })
      return new TubeGeometry(new CatmullRomCurve3(points),
        Math.max(24, points.length * 2), 0.055, 5)
    })
  }, [viaduct])
  useEffect(() => () => guardrails.forEach((geometry) => geometry.dispose()), [guardrails])
  const park = useMemo(() => {
    if (!world.terrain) return null
    const vertices: number[] = []
    const indices: number[] = []
    for (let row = 0; row <= 10; row += 1) for (let column = 0; column <= 12; column += 1) {
      const x = -70 + column * 2.5
      const z = 57.5 + row * 2.5
      vertices.push(x, getTerrainHeight(world.terrain, x * 1000, z * 1000) / 1000 + 0.14, z)
      if (row > 0 && column > 0) {
        const a = (row - 1) * 13 + column - 1
        indices.push(a, a + 13, a + 1, a + 1, a + 13, a + 14)
      }
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
    geometry.setIndex(indices); geometry.computeVertexNormals()
    return geometry
  }, [world.terrain])
  if (!ground) return null
  return <group>
    <mesh geometry={ground} receiveShadow onClick={(event) => {
      event.stopPropagation(); onPickSurface('organic:ground')
    }}>
      <meshStandardMaterial vertexColors color={lighting && lighting.nightBlend > 0.5 ?
        '#65786d' : '#ced7c2'} roughness={0.98} side={DoubleSide} />
    </mesh>
    {park && <mesh geometry={park} receiveShadow onClick={(event) => {
      event.stopPropagation(); onPickSurface('organic:hill-park:surface')
    }}><meshStandardMaterial color="#48735e" roughness={1} side={DoubleSide} /></mesh>}
    <OrganicRoadGeometry world={world} onPick={(surfaceId, x, z) => {
      onPickSurface(surfaceId)
      if (!import.meta.env.DEV) return
      const nearest = world.roadEdges.flatMap((road) => (road.path ?? []).map((point) => ({
        road, point, distance: Math.hypot(point.x / 1000 - x, point.z / 1000 - z),
      }))).sort((a, b) => a.distance - b.distance)[0]
      if (nearest) setProbe({ roadId: nearest.road.id,
        hierarchy: nearest.road.hierarchy ?? 'local', point: nearest.point,
        terrainY: getTerrainHeight(world.terrain!, nearest.point.x, nearest.point.z),
        navId: `walk:${nearest.road.id}` })
    }} />
    <InstancedBoxes items={laneMarks} color="#b7b6a7" roughness={0.9} />
    <InstancedBoxes items={supportBoxes} color="#617783" roughness={0.87}
      castShadow receiveShadow />
    {guardrails.map((geometry, index) => <mesh key={index} geometry={geometry} castShadow>
      <meshStandardMaterial color="#a1b3b5" roughness={0.5} metalness={0.35} />
    </mesh>)}
    {import.meta.env.DEV && probe && <Html position={[probe.point.x / 1000,
      probe.point.y / 1000 + 1.5, probe.point.z / 1000]} center>
      <div style={{ background: '#091d2ce8', color: '#d3e9e7', padding: '8px 10px',
        border: '1px solid #6c9eae', fontSize: 11, width: 190, pointerEvents: 'none' }}>
        <strong>{probe.roadId}</strong><br />{probe.hierarchy}<br />
        XYZ {probe.point.x / 1000}, {probe.point.y / 1000}, {probe.point.z / 1000}<br />
        Terrain {probe.terrainY / 1000} m · Nav {probe.navId}
      </div>
    </Html>}
    {debugMode === 'centerlines' && world.roadEdges.map((road) => road.path &&
      <Line key={road.id} points={road.path.map((point) => [point.x / 1000,
        point.y / 1000 + 0.16, point.z / 1000])} color="#ffcb73" lineWidth={2} />)}
    {(debugMode === 'nodes' || debugMode === 'junctions') && world.roadNodes
      .filter((node) => debugMode === 'nodes' || world.roadEdges.filter((road) =>
        road.from === node.id || road.to === node.id).length >= 3)
      .map((node) => <mesh key={node.id} position={[node.position.x / 1000,
        getTerrainHeight(world.terrain!, node.position.x, node.position.z) / 1000 + 0.35,
        node.position.z / 1000]}><sphereGeometry args={[0.65, 8, 6]} />
        <meshBasicMaterial color="#f7a86d" /></mesh>)}
    {debugMode === 'surfaces' && world.surfaces.map((surface) =>
      <Line key={surface.id} points={[...surface.polygonXZ, surface.polygonXZ[0]].map(
        (point) => [point.x / 1000, surface.elevationMm / 1000 + 0.5,
          point.z / 1000])} color={surface.levelId === 'L1' ? '#f3b173' : '#65d6c6'}
        lineWidth={1.5} />)}
    {(debugMode === 'footprints' || debugMode === 'foundations') &&
      world.buildingPlacements?.map((placement) => {
        const asset = world.baseCity?.buildings.find((item) => item.id === placement.buildingId)
        if (!asset) return null
        const x = placement.x / 1000; const z = placement.z / 1000
        const w = asset.width / 2; const d = asset.depth / 2
        const y = (debugMode === 'foundations' ? placement.foundationBottomMm :
          placement.elevationMm) / 1000 + 0.5
        return <Line key={placement.buildingId} points={[[x - w, y, z - d],
          [x + w, y, z - d], [x + w, y, z + d], [x - w, y, z + d],
          [x - w, y, z - d]]} color="#f3bf74" lineWidth={1.5} />
      })}
    {debugMode === 'entrances' && world.navNodes.filter((node) =>
      node.id.endsWith(':entry')).map((node) => <mesh key={node.id}
      position={[node.position.x / 1000, node.position.y / 1000 + 0.5,
        node.position.z / 1000]}><sphereGeometry args={[0.5, 8, 6]} />
        <meshBasicMaterial color="#80edc4" /></mesh>)}
    {debugMode === 'bridges' && world.navEdges.filter((edge) =>
      edge.id.startsWith('walk:organic:road:04:')).map((edge) => <Line key={edge.id}
      points={edge.path.map((point) => [point.x / 1000, point.y / 1000 + 0.3,
        point.z / 1000])} color="#f2ab70" lineWidth={3} />)}
    {bridgeEdges.map((edge) => <group key={edge.id}>
      <Ribbon path={edge.path} width={2.8} color="#4a8298"
        onClick={() => onPickSurface(edge.surfaceId)} />
      {[-1, 1].map((side) => <group key={side}>
        {edge.path.map((point, index) => <mesh key={index}
          position={[point.x / 1000, point.y / 1000 + 0.62,
            point.z / 1000 + side * 1.32]} castShadow>
          <boxGeometry args={[0.09, 1.25, 0.09]} />
          <meshStandardMaterial color="#91b5be" roughness={0.46} metalness={0.34} />
        </mesh>)}
        <mesh position={[(edge.path[0].x + edge.path.at(-1)!.x) / 2000,
          edge.path[0].y / 1000 + 1.25, edge.path[0].z / 1000 + side * 1.32]}>
          <boxGeometry args={[(edge.path.at(-1)!.x - edge.path[0].x) / 1000,
            0.1, 0.1]} />
          <meshStandardMaterial color="#91b5be" roughness={0.46} metalness={0.34} />
        </mesh>
      </group>)}
    </group>)}
    {stairEdges.map((edge) => <Ribbon key={edge.id} path={edge.path}
      width={1.15} color="#657f8e"
      onClick={() => onPickSurface(`connector:${edge.connectorId}`)} />)}
    {debugRegions && world.regions?.map((region) => <mesh key={region.id}
      position={[region.center.x / 1000, 0.7, region.center.z / 1000]}
      rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[region.radiusMm / 1000, 48]} />
      <meshBasicMaterial color={region.kind === 'commercial' ? '#da9e70' :
        region.kind === 'park' ? '#78c5a3' : region.kind === 'mixedUse' ? '#b49aca' : '#85a9d4'}
        transparent opacity={0.08} depthWrite={false} />
    </mesh>)}
  </group>
}
