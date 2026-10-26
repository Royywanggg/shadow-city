import { Line } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedBufferAttribute, Object3D, type InstancedMesh } from 'three'
import type { WorldBox, WorldModelV2, WorldPointMm } from '../world/model'
import { metres } from '../world/model'
import { createNavigationIndexV2, orientedEdgePath } from '../world/navigation/routeV2'
import type { CitizenStateV5, SimulationStateV5 } from '../simulation/v5Types'
import { reportIdForOffence } from '../simulation/offending/opportunityV5'
import { CityStaticScene, type LightingDiagnostic, type RenderingQuality } from './CityScene'
import { RenderDiagnostics } from './RenderDiagnostics'
import { WalkwayStructures } from './WalkwayStructures'
import { GalleriaCanopy } from './GalleriaCanopy'
import { GalleriaArchitecturalSkin } from './GalleriaArchitecturalSkin'
import { surfaceTextures } from './SurfaceTextures'
import { applyInstanceTextureScale } from './InstancedBoxes'

function roadBoxes(world: WorldModelV2): WorldBox[] {
  const nodes = new Map(world.roadNodes.map((node) => [node.id, node]))
  return world.roadEdges.flatMap((edge) => {
    const a = nodes.get(edge.from)!.position
    const b = nodes.get(edge.to)!.position
    const cx = (a.x + b.x) / 2
    const cz = (a.z + b.z) / 2
    const alongX = a.z === b.z
    const boxes: WorldBox[] = [{ id: `visible:${edge.id}`, kind: 'road',
      center: { x: cx, y: 18, z: cz },
      size: { x: alongX ? Math.abs(a.x - b.x) : edge.widthMm,
        y: 42, z: alongX ? edge.widthMm : Math.abs(a.z - b.z) },
      color: edge.widthMm > 8_000 ? '#2b3c4a' : '#314450' }]
    const side = edge.widthMm / 2 + 650
    for (const sign of [-1, 1]) boxes.push({ id: `curb:${edge.id}:${sign}`, kind: 'path',
      center: { x: cx + (alongX ? 0 : sign * side), y: 95,
        z: cz + (alongX ? sign * side : 0) },
      size: { x: alongX ? Math.abs(a.x - b.x) : 550, y: 180,
        z: alongX ? 550 : Math.abs(a.z - b.z) }, color: '#58717d' })
    if (edge.widthMm > 8_000) {
      const length = Math.abs(alongX ? b.x - a.x : b.z - a.z)
      for (let offset = 5_000; offset < length - 4_000; offset += 9_000) {
        boxes.push({ id: `mark:${edge.id}:${offset}`, kind: 'path',
          center: { x: alongX ? Math.min(a.x, b.x) + offset : cx,
            y: 53, z: alongX ? cz : Math.min(a.z, b.z) + offset },
          size: { x: alongX ? 3_000 : 130, y: 24, z: alongX ? 130 : 3_000 },
          color: '#96a8a5' })
      }
    }
    return boxes
  })
}

function InstancedWorldBoxes({ boxes, onPick, quality }: { boxes: readonly WorldBox[];
  onPick: (box: WorldBox) => void; quality: RenderingQuality }) {
  const ref = useRef<InstancedMesh>(null)
  const helper = useMemo(() => new Object3D(), [])
  const color = useMemo(() => new Color(), [])
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    boxes.forEach((box, index) => {
      helper.position.set(...metres(box.center))
      helper.rotation.set(box.rotationX ?? 0, box.rotationY ?? 0, box.rotationZ ?? 0)
      helper.scale.set(box.size.x / 1000, box.size.y / 1000, box.size.z / 1000)
      helper.updateMatrix()
      mesh.setMatrixAt(index, helper.matrix)
      mesh.setColorAt(index, color.set(box.color))
    })
    if (quality === 'high' && (boxes[0]?.kind === 'road' || boxes[0]?.kind === 'path' ||
      boxes[0]?.kind === 'floor')) {
      const tileMm = boxes[0].kind === 'road' ? 5_000 : 8_000
      mesh.geometry.setAttribute('instanceUvScale', new InstancedBufferAttribute(
        new Float32Array(boxes.flatMap((box) => [box.size.x / tileMm, box.size.y / tileMm,
          box.size.z / tileMm])), 3))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [boxes, color, helper, quality])
  if (boxes.length === 0) return null
  const kind = boxes[0].kind
  const surfaces = quality === 'high' ? surfaceTextures() : null
  return <instancedMesh ref={ref} args={[undefined, undefined, boxes.length]}
    castShadow={kind === 'building' || kind === 'roof'} receiveShadow
    onClick={(event) => {
      if (event.instanceId === undefined) return
      event.stopPropagation()
      onPick(boxes[event.instanceId])
    }}>
    <boxGeometry args={[1, 1, 1]} />
    {kind === 'accent' || kind === 'darkWindow'
      ? <meshBasicMaterial color="#ffffff" />
      : kind === 'glass'
        ? <meshStandardMaterial color="#ffffff" roughness={0.24} metalness={0.08}
          envMapIntensity={1.15} transparent opacity={0.72} depthWrite={false} />
      : kind === 'road' || kind === 'path' || kind === 'floor'
        ? <meshStandardMaterial color="#ffffff"
          onBeforeCompile={applyInstanceTextureScale}
          map={kind === 'road' ? surfaces?.asphalt.color : surfaces?.paving.color}
          normalMap={kind === 'road' ? surfaces?.asphalt.normal : surfaces?.paving.normal}
          roughnessMap={kind === 'road' ? surfaces?.asphalt.roughness : surfaces?.paving.roughness}
          roughness={kind === 'road' ? 0.96 : 0.88} metalness={0} />
      : kind === 'rail' || kind === 'step' || kind === 'trim'
        ? <meshStandardMaterial color="#ffffff" roughness={kind === 'rail' ? 0.39 : 0.58}
          metalness={kind === 'rail' ? 0.63 : 0.3} envMapIntensity={0.8} />
      : kind === 'roof'
        ? <meshStandardMaterial color="#ffffff" roughness={0.73} metalness={0.07} />
      : kind === 'building'
        ? <meshStandardMaterial color="#ffffff" roughness={0.84} metalness={0.02} />
      : <meshStandardMaterial color="#ffffff" roughness={0.79} metalness={0.08} />}
  </instancedMesh>
}

export function WorldSceneV2({ world, level, cutaway, debugNavigation, onPickSurface,
  quality = 'high', postprocessing = true, lighting = 'night', castShadows = true,
  ambientOcclusion = false }: {
  world: WorldModelV2
  level: 'all' | 'L0' | 'L1'
  cutaway: boolean
  debugNavigation: boolean
  onPickSurface: (surfaceId: string | null) => void
  quality?: RenderingQuality
  postprocessing?: boolean
  lighting?: LightingDiagnostic
  castShadows?: boolean
  ambientOcclusion?: boolean
}) {
  const groups = useMemo(() => {
    const candidates = [...(world.baseCity ? [] : roadBoxes(world)), ...world.boxes].filter((box) => {
      if (cutaway && (box.roofFor === 'central-galleria' ||
        box.id.startsWith('galleria-west-glass') ||
        box.id === 'galleria-notch-glass')) return false
      if (level === 'L0' && box.levelId === 'L1' &&
        (box.placeId === 'central-galleria' || box.roofFor === 'central-galleria' ||
          box.placeId?.startsWith('overpass-') || world.overpasses?.some((bridge) =>
            box.placeId === (bridge.id === 'bridge' ? 'skybridge-walkway' :
              `${bridge.id}:skybridge-walkway`)))) return false
      return true
    })
    const map = new Map<WorldBox['kind'], WorldBox[]>()
    for (const box of candidates) {
      const current = map.get(box.kind) ?? []
      current.push(box)
      map.set(box.kind, current)
    }
    return [...map.entries()]
  }, [cutaway, level, world])
  const debugEdges = useMemo(() => {
    const overpassEdges = new Set(world.overpasses?.flatMap((bridge) => bridge.deckEdgeIds) ?? [])
    return world.navEdges.filter((edge) => edge.kind !== 'walk' || overpassEdges.has(edge.id))
  }, [world])
  const { gl } = useThree()
  if (import.meta.env.DEV) {
    window.__shadowCityV06Rendering = { drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures }
  }
  const pick = (box: WorldBox) => {
    const place = world.places.find((item) => item.id === box.placeId)
    const surfaceId = box.surfaceId ?? (box.placeId === 'central-galleria'
      ? box.levelId === 'L1' ? 'galleria-l1' : 'galleria-l0'
      : place?.surfaceIds.find((id) => !box.levelId ||
        world.surfaces.find((surface) => surface.id === id)?.levelId === box.levelId) ??
        (box.id.startsWith('bridge-') ? 'skybridge' : box.kind === 'floor' ? 'ground' : null))
    onPickSurface(surfaceId)
  }
  return <>
    {world.baseCity ? <>
      <CityStaticScene city={world.baseCity} quality={quality} postprocessing={postprocessing}
        lighting={lighting} castShadows={castShadows} ambientOcclusion={ambientOcclusion} />
      {import.meta.env.DEV && <RenderDiagnostics />}
    </> : <>
    <color attach="background" args={['#101c2a']} />
    <fog attach="fog" args={['#101c2a', 240, 650]} />
    <ambientLight intensity={1.05} color="#9db5cc" />
    <directionalLight position={[-80, 155, 45]} intensity={2.7} color="#c7d9ea"
      castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048}
      shadow-camera-left={-185} shadow-camera-right={185}
      shadow-camera-top={185} shadow-camera-bottom={-185} shadow-bias={-0.00015} />
    <hemisphereLight args={['#adc5d8', '#23394a', 1.15]} />
    <mesh position={[0, -0.45, 0]} receiveShadow>
      <boxGeometry args={[328, 0.9, 328]} />
      <meshStandardMaterial color="#1a2a36" roughness={0.93} />
    </mesh>
    <mesh position={[0, -0.9, 0]}>
      <boxGeometry args={[332, 0.22, 332]} />
      <meshStandardMaterial color="#5a8d9c" emissive="#153d52" emissiveIntensity={0.7} />
    </mesh>
    </>}
    {groups.map(([kind, boxes]) => <InstancedWorldBoxes key={kind} boxes={boxes} onPick={pick}
      quality={quality} />)}
    <WalkwayStructures world={world} onPickSurface={onPickSurface} />
    <GalleriaArchitecturalSkin world={world} showRoof={!cutaway && level !== 'L0'} />
    <GalleriaCanopy world={world} visible={!cutaway && level !== 'L0'} />
    {debugNavigation && debugEdges.map((edge) => <Line key={edge.id}
      points={edge.path.map((point) => metres(point))} color={edge.kind === 'portal' ? '#e0ab75' :
        edge.kind === 'stair' ? '#ffca72' : edge.kind === 'ramp' ? '#7bd6b8' : '#80bbd3'}
      lineWidth={2} />)}
  </>
}

export function WorldSelectedRoute({ world, citizen }: { world: WorldModelV2; citizen: CitizenStateV5 | null }) {
  const index = useMemo(() => createNavigationIndexV2(world), [world])
  const points = useMemo(() => {
    if (!citizen || citizen.routeIndex >= citizen.route.length) return []
    const result: WorldPointMm[] = [citizen.position]
    for (const step of citizen.route.slice(citizen.routeIndex)) {
      result.push(...orientedEdgePath(index, step).slice(1))
    }
    return result.map((point) => [point.x / 1000, point.y / 1000 + 0.11,
      point.z / 1000] as [number, number, number])
  }, [citizen, index])
  return points.length > 1 ? <Line points={points} color="#e8ca83" lineWidth={3} /> : null
}

export function WorldOffenceLayer({ state, mode, observationSeed }: { state: SimulationStateV5;
  mode: 'truth' | 'observed' | 'compare'; observationSeed: string }) {
  if (mode === 'observed') return <>{state.reports.map((report) => <mesh key={report.id}
    position={[report.reportedPosition.x / 1000, report.reportedPosition.y / 1000 + 0.28,
      report.reportedPosition.z / 1000]}>
    <sphereGeometry args={[0.38, 8, 8]} />
    <meshBasicMaterial color="#e0c183" />
  </mesh>)}</>
  const observed = new Set(state.reports.map((report) => report.id))
  return <>{state.offences.map((offence) => <mesh key={offence.id}
    position={[offence.position.x / 1000, offence.position.y / 1000 + 0.26,
      offence.position.z / 1000]}>
    <sphereGeometry args={[0.32, 8, 8]} />
    <meshBasicMaterial color={mode === 'compare' &&
      observed.has(reportIdForOffence(offence, observationSeed)) ? '#f7ce85' : '#eb8393'} />
  </mesh>)}</>
}

declare global {
  interface Window {
    __shadowCityV06Rendering?: { drawCalls: number; triangles: number; geometries: number; textures: number }
  }
}
