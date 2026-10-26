import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useCallback, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { CanvasTexture, Color, DoubleSide, DynamicDrawUsage, Object3D, Sphere, Vector3, type InstancedMesh, type Mesh } from 'three'
import type { PedestrianNetwork } from '../city/model'
import type { AgentSelectionController } from '../app/agentSelection'
import type { PlaybackController } from '../playback/PlaybackController'
import type { SimulationSession } from '../simulation/session'
import { getCitizenSimulationState, type SimulationStateV2 } from '../simulation/types'
import { createPedestrianLookup, interpolateAgentPose, type AgentRenderPose } from './agentInterpolation'
import { SelectedRoute } from './SelectedRoute'

declare global {
  interface Window {
    __shadowCityAgentDiagnostics?: {
      visibleCount: number
      candidates: { id: string; x: number; y: number }[]
      renderedFrames: number
    }
  }
}

interface RenderPair {
  previous: SimulationStateV2 | null
  current: SimulationStateV2 | null
}

const TRAVELLING_COLOR = new Color('#b7dcd4')
const RETURNING_COLOR = new Color('#e1c9a8')
const VISITING_COLOR = new Color('#b8c5c1')
const HIDDEN_SCALE = 0.00001

function createFootlightTexture(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')!
  const glow = context.createRadialGradient(32, 32, 2, 32, 32, 32)
  glow.addColorStop(0, 'rgba(255,255,255,0.7)')
  glow.addColorStop(0.45, 'rgba(255,255,255,0.25)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = glow
  context.fillRect(0, 0, 64, 64)
  return new CanvasTexture(canvas)
}

export function AgentLayer({
  session,
  playback,
  selection,
  graph,
}: {
  session: SimulationSession
  playback: PlaybackController
  selection: AgentSelectionController
  graph: PedestrianNetwork
}) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const playbackSnapshot = useSyncExternalStore(playback.subscribe, playback.getSnapshot, playback.getSnapshot)
  const selectedId = useSyncExternalStore(selection.subscribe, selection.getSnapshot, selection.getSnapshot)
  const state = getCitizenSimulationState(snapshot.state)
  const selected = state?.citizens.find((citizen) => citizen.id === selectedId) ?? null
  const lookup = useMemo(() => createPedestrianLookup(graph), [graph])
  const pickRadius = useMemo(() => Math.max(20, ...graph.nodes.map((node) => Math.hypot(node.x, node.z))) + 8, [graph])
  const { camera, gl, invalidate } = useThree()
  const bodyRef = useRef<InstancedMesh>(null)
  const headRef = useRef<InstancedMesh>(null)
  const footlightRef = useRef<InstancedMesh>(null)
  const ringRef = useRef<Mesh>(null)
  const pairRef = useRef<RenderPair>({ previous: null, current: null })
  const object = useMemo(() => new Object3D(), [])
  const footlightTexture = useMemo(createFootlightTexture, [])
  const screenPoint = useMemo(() => new Vector3(), [])
  const pointerDown = useRef<{ x: number; y: number } | null>(null)
  const renderedFrames = useRef(0)
  const lastDebugTick = useRef(-1)
  const lastRenderedTick = useRef<number | null>(null)
  const lastPlaybackStatus = useRef(playbackSnapshot.status)

  const draw = useCallback((alpha: number, updateDebug = false) => {
    const body = bodyRef.current
    const head = headRef.current
    const footlight = footlightRef.current
    const { previous, current } = pairRef.current
    if (!body || !head || !footlight || !current) return false
    let visibleCount = 0
    let movingCount = 0
    const poses: AgentRenderPose[] = []
    const stationaryRepresentatives = new Map<string, string>()
    for (const citizen of current.citizens) {
      if (citizen.activity !== 'atDestination') continue
      const anchorId = citizen.currentAnchorId ?? citizen.destinationAnchorId ?? citizen.id
      if (!stationaryRepresentatives.has(anchorId)) {
        stationaryRepresentatives.set(anchorId, citizen.id)
      }
    }
    if (selected?.activity === 'atDestination') {
      stationaryRepresentatives.set(selected.currentAnchorId ?? selected.destinationAnchorId ?? selected.id, selected.id)
    }
    for (const [index, citizen] of current.citizens.entries()) {
      const prior = previous?.citizens[index]?.id === citizen.id ? previous.citizens[index] : null
      const pose = interpolateAgentPose(prior, citizen, lookup, alpha)
      const settling = alpha < 1 && (prior?.activity === 'travelling' || prior?.activity === 'returningHome')
      const visible = pose.visible && (citizen.activity !== 'atDestination' || settling ||
        stationaryRepresentatives.get(citizen.currentAnchorId ?? citizen.destinationAnchorId ?? citizen.id) === citizen.id)
      poses.push({ ...pose, visible })
      if (visible) visibleCount += 1
      if (citizen.activity === 'travelling' || citizen.activity === 'returningHome' ||
          (alpha < 1 && (prior?.activity === 'travelling' || prior?.activity === 'returningHome'))) {
        movingCount += 1
      }
      const scale = visible ? 1 : HIDDEN_SCALE
      object.position.set(pose.x, pose.y + 0.77, pose.z)
      object.rotation.set(0, pose.yaw, 0)
      object.scale.setScalar(scale)
      object.updateMatrix()
      body.setMatrixAt(index, object.matrix)
      body.setColorAt(index, citizen.activity === 'returningHome'
        ? RETURNING_COLOR : citizen.activity === 'atDestination' ? VISITING_COLOR : TRAVELLING_COLOR)

      object.position.set(pose.x, pose.y + 1.61, pose.z)
      object.rotation.set(0, 0, 0)
      object.scale.setScalar(scale)
      object.updateMatrix()
      head.setMatrixAt(index, object.matrix)

      object.position.set(pose.x, pose.y + 0.035, pose.z)
      object.rotation.set(-Math.PI / 2, 0, 0)
      object.scale.setScalar(visible && citizen.activity !== 'atDestination' ? 1 : HIDDEN_SCALE)
      object.updateMatrix()
      footlight.setMatrixAt(index, object.matrix)
      footlight.setColorAt(index, citizen.activity === 'returningHome' ? RETURNING_COLOR : TRAVELLING_COLOR)
    }
    body.instanceMatrix.needsUpdate = true
    head.instanceMatrix.needsUpdate = true
    footlight.instanceMatrix.needsUpdate = true
    if (body.instanceColor) body.instanceColor.needsUpdate = true
    if (footlight.instanceColor) footlight.instanceColor.needsUpdate = true
    const ring = ringRef.current
    if (ring) {
      const selectedIndex = current.citizens.findIndex((citizen) => citizen.id === selectedId)
      const selectedPose = poses[selectedIndex]
      ring.visible = Boolean(selectedPose?.visible)
      if (selectedPose) ring.position.set(selectedPose.x, selectedPose.y + 0.08, selectedPose.z)
    }

    if (import.meta.env.DEV && updateDebug) {
      const bounds = gl.domElement.getBoundingClientRect()
      const candidates: { id: string; x: number; y: number }[] = []
      for (const [index, pose] of poses.entries()) {
        if (!pose.visible) continue
        screenPoint.set(pose.x, pose.y + 1.05, pose.z).project(camera)
        const x = bounds.left + (screenPoint.x + 1) * bounds.width / 2
        const y = bounds.top + (1 - screenPoint.y) * bounds.height / 2
        if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
          candidates.push({ id: current.citizens[index].id, x, y })
        }
      }
      candidates.sort((a, b) => b.y - a.y)
      window.__shadowCityAgentDiagnostics = { visibleCount, candidates, renderedFrames: renderedFrames.current }
      lastDebugTick.current = current.tick
    }
    return movingCount > 0
  }, [camera, gl, lookup, object, screenPoint, selected, selectedId])

  useLayoutEffect(() => {
    const current = state
    const previousState = session.getPreviousLiveState()
    const previousCitizen = previousState ? getCitizenSimulationState(previousState) : null
    const previous = previousCitizen && current &&
      playbackSnapshot.status === 'playing' && lastPlaybackStatus.current === 'playing' &&
      lastRenderedTick.current !== null && current.tick === lastRenderedTick.current + 1 &&
      !snapshot.isInspecting &&
      previousCitizen.tick === current.tick - 1 ? previousCitizen : null
    pairRef.current = { previous, current }
    draw(previous ? playback.getInterpolationAlpha() : 1, true)
    lastRenderedTick.current = current?.tick ?? null
    lastPlaybackStatus.current = playbackSnapshot.status
    invalidate()
  }, [draw, invalidate, playback, playbackSnapshot.status, session, snapshot.isInspecting, state])

  useLayoutEffect(() => {
    const body = bodyRef.current
    const head = headRef.current
    const footlight = footlightRef.current
    body?.instanceMatrix.setUsage(DynamicDrawUsage)
    head?.instanceMatrix.setUsage(DynamicDrawUsage)
    footlight?.instanceMatrix.setUsage(DynamicDrawUsage)
    // InstancedMesh raycasting rejects everything outside its cached sphere.
    // Citizens move, so keep a stable bound around the full pedestrian network.
    if (body) body.boundingSphere = new Sphere(new Vector3(), pickRadius)
    if (head) head.boundingSphere = new Sphere(new Vector3(), pickRadius)
  }, [pickRadius, state?.citizens.length])

  useLayoutEffect(() => () => footlightTexture.dispose(), [footlightTexture])

  useFrame(() => {
    renderedFrames.current += 1
    const active = playback.getSnapshot().status === 'playing' &&
      !session.getSnapshot().isInspecting
    const moving = draw(active ? playback.getInterpolationAlpha() : 1,
      import.meta.env.DEV && (!active || lastDebugTick.current !== pairRef.current.current?.tick || renderedFrames.current % 10 === 0))
    if (active && moving) invalidate()
  })

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    pointerDown.current = { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY }
  }
  const onClick = (event: ThreeEvent<MouseEvent>) => {
    const start = pointerDown.current
    pointerDown.current = null
    if (event.instanceId === undefined || !start || !state) return
    const dx = event.nativeEvent.clientX - start.x
    const dy = event.nativeEvent.clientY - start.y
    if (dx * dx + dy * dy > 36) return
    const citizen = state.citizens[event.instanceId]
    if (!citizen || citizen.activity === 'atHome' || citizen.activity === 'planningTrip') return
    event.stopPropagation()
    selection.select(citizen.id)
  }

  const count = state?.citizens.length ?? 0
  if (count === 0) return null
  return (
    <group>
      <instancedMesh ref={bodyRef} args={[undefined, undefined, count]} frustumCulled={false}
        onPointerDown={onPointerDown} onClick={onClick}>
        <capsuleGeometry args={[0.35, 0.82, 3, 6]} />
        <meshStandardMaterial color="#ffffff" emissive="#91bcb4" emissiveIntensity={0.6} roughness={0.83} />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[undefined, undefined, count]} frustumCulled={false}
        onPointerDown={onPointerDown} onClick={onClick}>
        <sphereGeometry args={[0.29, 6, 5]} />
        <meshStandardMaterial color="#ecdeca" emissive="#d0b999" emissiveIntensity={0.42} roughness={0.83} />
      </instancedMesh>
      <instancedMesh ref={footlightRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <circleGeometry args={[0.9, 12]} />
        <meshBasicMaterial color="#ffffff" map={footlightTexture} transparent opacity={0.8}
          depthWrite={false} side={DoubleSide} toneMapped={false} />
      </instancedMesh>
      <SelectedRoute agent={selected} graph={graph} />
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.67, 0.85, 20]} />
        <meshBasicMaterial color="#c3ddd4" transparent opacity={0.8} depthWrite={false} />
      </mesh>
    </group>
  )
}
