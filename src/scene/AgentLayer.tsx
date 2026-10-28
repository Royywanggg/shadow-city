import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { CanvasTexture, Color, DoubleSide, DynamicDrawUsage, MeshBasicMaterial, Object3D, PlaneGeometry,
  Sphere, SRGBColorSpace, TextureLoader, Vector3, type InstancedMesh, type Mesh } from 'three'
import type { PedestrianNetwork } from '../city/model'
import type { AgentSelectionController } from '../app/agentSelection'
import type { PlaybackController } from '../playback/PlaybackController'
import type { SimulationSession } from '../simulation/session'
import { getCitizenSimulationState, type SimulationStateV2 } from '../simulation/types'
import { createPedestrianLookup, interpolateAgentPose, type AgentRenderPose } from './agentInterpolation'
import { SelectedRoute } from './SelectedRoute'
import { CharacterManager, loadCharacterAssets, type CharacterDiagnostics, type CharacterRenderItem } from './character/CharacterManager'
import { sampleAnimationTime } from './character/animationClock'
import { CHARACTER_ASSETS, CHARACTER_ASSET_BY_ID } from './character/catalog'

declare global {
  interface Window {
    __shadowCityAgentDiagnostics?: {
      visibleCount: number
      candidates: { id: string; x: number; y: number }[]
      renderedFrames: number
    }
    __shadowCityAnonymousPresence?: { visibleCount: number }
    __shadowCityPopulationSpatialDiagnostics?: {
      tick: number
      outdoorCount: number
      renderedCount: number
      occupiedCount: number
      uniqueOccupiedSlots: number
      sharedActivitySites: number
      invalidOccupiedPositions: number
      waitingCount: number
    }
    __shadowCityCharacterDiagnostics?: CharacterDiagnostics & {
      farSpriteCount?: number
      primitiveFallbackCount?: number
      selectedTier?: 'far' | 'medium' | 'close' | null
      selectedVisualTime?: number | null
      selectedPresetId?: string | null
      selectedPrimaryColor?: string | null
      assetError?: string
    }
    __shadowCityCharacterPreview?: {
      setClip(clip: 'Idle' | 'Walk' | 'Run' | null): void
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
  interactive = true,
}: {
  session: SimulationSession
  playback: PlaybackController
  selection: AgentSelectionController
  graph: PedestrianNetwork
  interactive?: boolean
}) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const playbackSnapshot = useSyncExternalStore(playback.subscribe, playback.getSnapshot, playback.getSnapshot)
  const selectionId = useSyncExternalStore(selection.subscribe, selection.getSnapshot, selection.getSnapshot)
  const selectedId = selectionId
  const state = getCitizenSimulationState(snapshot.state)
  const selected = state?.citizens.find((citizen) => citizen.id === selectedId) ?? null
  const populationPort = useMemo(() => session.createPopulationResearchPort(), [session])
  const appearanceById = useMemo(() => new Map(populationPort.getView().citizens.map((citizen) =>
    [citizen.id, citizen.identity.appearance])), [populationPort])
  const animationRateById = useMemo(() => new Map(populationPort.getView().citizens.map((citizen) =>
    [citizen.id, citizen.profile.speedUnitsPerLogicalSecond / 0.35])), [populationPort])
  const farTintById = useMemo(() => new Map(populationPort.getView().citizens.map((citizen) => {
    const appearance = citizen.identity.appearance
    const tint = new Color('#ffffff')
    if (appearance.primaryClothingColor) tint.lerp(new Color(appearance.primaryClothingColor), 0.3)
    if (appearance.secondaryClothingColor) tint.lerp(new Color(appearance.secondaryClothingColor), 0.1)
    return [citizen.id, tint] as const
  })), [populationPort])
  const lookup = useMemo(() => createPedestrianLookup(graph), [graph])
  const pickRadius = useMemo(() => Math.max(20, ...graph.nodes.map((node) => Math.hypot(node.x, node.z))) + 8, [graph])
  const { camera, gl, invalidate } = useThree()
  const bodyRef = useRef<InstancedMesh>(null)
  const headRef = useRef<InstancedMesh>(null)
  const footlightRef = useRef<InstancedMesh>(null)
  const farMeshesRef = useRef(new Map<string, InstancedMesh>())
  const ringRef = useRef<Mesh>(null)
  const locatorRef = useRef<Mesh>(null)
  const locatorTipRef = useRef<Mesh>(null)
  const pairRef = useRef<RenderPair>({ previous: null, current: null })
  const object = useMemo(() => new Object3D(), [])
  const clothingColor = useMemo(() => new Color(), [])
  const footlightTexture = useMemo(createFootlightTexture, [])
  const farPlane = useMemo(() => new PlaneGeometry(0.88, 1.76), [])
  const [farMaterials, setFarMaterials] = useState<readonly { presetId: string; material: MeshBasicMaterial }[]>([])
  const screenPoint = useMemo(() => new Vector3(), [])
  const screenTop = useMemo(() => new Vector3(), [])
  const managerRef = useRef<CharacterManager | null>(null)
  const [characterManager, setCharacterManager] = useState<CharacterManager | null>(null)
  const pointerDown = useRef<{ x: number; y: number } | null>(null)
  const renderedFrames = useRef(0)
  const lastDebugTick = useRef(-1)
  const lastRenderedTick = useRef<number | null>(null)
  const lastPlaybackStatus = useRef(playbackSnapshot.status)

  useEffect(() => () => {
    if (import.meta.env.DEV) {
      delete window.__shadowCityAgentDiagnostics
      delete window.__shadowCityAnonymousPresence
      delete window.__shadowCityCharacterDiagnostics
      delete window.__shadowCityPopulationSpatialDiagnostics
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const loader = new TextureLoader()
    Promise.all(CHARACTER_ASSETS.map(async ({ presetId }) => {
      const texture = await loader.loadAsync(`/characters/quaternius-v01/impostors/${presetId}.webp`)
      texture.colorSpace = SRGBColorSpace
      return { presetId, material: new MeshBasicMaterial({
        map: texture, color: '#b8c7ce', transparent: true, alphaTest: 0.08,
        depthWrite: true, side: DoubleSide, toneMapped: false,
      }) }
    })).then((loaded) => {
      if (cancelled) {
        for (const { material } of loaded) { material.map?.dispose(); material.dispose() }
      } else {
        setFarMaterials(loaded)
        invalidate()
      }
    }).catch(() => { /* The original distant markers remain available if a sprite cannot load. */ })
    return () => { cancelled = true }
  }, [invalidate])

  useEffect(() => () => {
    for (const { material } of farMaterials) { material.map?.dispose(); material.dispose() }
  }, [farMaterials])

  useEffect(() => {
    let cancelled = false
    loadCharacterAssets().then((assets) => {
      const manager = new CharacterManager(assets)
      if (cancelled) {
        manager.dispose()
        return
      }
      managerRef.current = manager
      setCharacterManager(manager)
      if (import.meta.env.DEV) window.__shadowCityCharacterPreview = {
        setClip: (clip) => {
          manager.setPreviewClip(clip)
          invalidate()
        },
      }
      invalidate()
    }).catch((error: unknown) => {
      if (cancelled) return
      if (import.meta.env.DEV) window.__shadowCityCharacterDiagnostics = {
        farCount: 0, mediumCount: 0, closeCount: 0, visibleCount: 0,
        assetPresetCount: 0, activeInstances: 0, pooledInstances: 0,
        assetError: error instanceof Error ? error.message : String(error),
      }
    })
    return () => {
      cancelled = true
      managerRef.current?.dispose()
      managerRef.current = null
      if (import.meta.env.DEV) delete window.__shadowCityCharacterPreview
    }
  }, [invalidate])

  const draw = useCallback((alpha: number, updateDebug = false) => {
    const body = bodyRef.current
    const head = headRef.current
    const footlight = footlightRef.current
    const { previous, current } = pairRef.current
    if (!body || !head || !footlight || !current) return false
    let visibleCount = 0
    let movingCount = 0
    const poses: AgentRenderPose[] = []
    const renderItems: CharacterRenderItem[] = []
    const bounds = gl.domElement.getBoundingClientRect()
    for (const [index, citizen] of current.citizens.entries()) {
      const prior = previous?.citizens[index]?.id === citizen.id ? previous.citizens[index] : null
      const pose = interpolateAgentPose(prior, citizen, lookup, alpha)
      poses.push(pose)
      if (pose.visible) visibleCount += 1
      if (citizen.activity === 'travelling' || citizen.activity === 'returningHome' ||
          (alpha < 1 && (prior?.activity === 'travelling' || prior?.activity === 'returningHome'))) {
        movingCount += 1
      }
      const appearance = appearanceById.get(citizen.id)
      if (pose.visible && appearance) {
        screenPoint.set(pose.x, pose.y, pose.z).project(camera)
        screenTop.set(pose.x, pose.y + 1.76, pose.z).project(camera)
        const onScreen = screenPoint.x >= -1.1 && screenPoint.x <= 1.1 &&
          screenPoint.y >= -1.1 && screenPoint.y <= 1.1 && screenPoint.z <= 1
        renderItems.push({
          id: citizen.id,
          appearance,
          activity: citizen.activity,
          movementMode: citizen.movementMode,
          previousActivity: prior?.activity,
          previousMovementMode: prior?.movementMode,
          transitionProgress: alpha,
          animationRate: animationRateById.get(citizen.id) ?? 1,
          pose,
          pixelHeight: onScreen ? Math.abs(screenTop.y - screenPoint.y) * bounds.height / 2 : 0,
        })
      }
    }
    const manager = managerRef.current
    const visualTime = sampleAnimationTime(previous?.tick ?? null, current.tick, alpha)
    const result = manager?.update(renderItems, selectedId, visualTime)
    const tiers = result?.tiers
    const farReady = farMaterials.length === CHARACTER_ASSETS.length
    body.count = farReady ? 0 : current.citizens.length
    head.count = farReady ? 0 : current.citizens.length
    if (farReady) {
      const counts = new Map<string, number>()
      for (const [index, citizen] of current.citizens.entries()) {
        const appearance = appearanceById.get(citizen.id)
        const pose = poses[index]
        if (!pose.visible || !appearance || (tiers?.get(citizen.id) ?? 'far') !== 'far') continue
        const mesh = farMeshesRef.current.get(appearance.presetId)
        if (!mesh) continue
        const slot = counts.get(appearance.presetId) ?? 0
        object.position.set(pose.x, pose.y + 0.88, pose.z)
        object.quaternion.copy(camera.quaternion)
        object.scale.setScalar(1)
        object.updateMatrix()
        mesh.setMatrixAt(slot, object.matrix)
        const tint = farTintById.get(citizen.id)
        if (tint) mesh.setColorAt(slot, tint)
        const agentIds = mesh.userData.agentIds as string[]
        agentIds[slot] = citizen.id
        counts.set(appearance.presetId, slot + 1)
      }
      for (const { presetId } of farMaterials) {
        const mesh = farMeshesRef.current.get(presetId)
        if (!mesh) continue
        mesh.count = counts.get(presetId) ?? 0
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      }
    }
    if (import.meta.env.DEV && updateDebug) {
      const diagnostics = result?.diagnostics ?? {
        farCount: visibleCount, mediumCount: 0, closeCount: 0, visibleCount, assetPresetCount: 0,
        activeInstances: 0, pooledInstances: 0,
      }
      window.__shadowCityCharacterDiagnostics = {
        ...diagnostics,
        farSpriteCount: farReady ? diagnostics.farCount : 0,
        primitiveFallbackCount: farReady ? 0 : diagnostics.farCount,
        selectedTier: selectedId ? tiers?.get(selectedId) ?? null : null,
        selectedVisualTime: selectedId ? visualTime : null,
        selectedPresetId: selectedId ? appearanceById.get(selectedId)?.presetId ?? null : null,
        selectedPrimaryColor: selectedId ? appearanceById.get(selectedId)?.primaryClothingColor ?? null : null,
      }
      const slots = new Map(session.environment?.activitySlots.map((slot) => [slot.id, slot]) ?? [])
      const occupied = current.citizens.filter((citizen) => citizen.activity === 'atDestination')
      const siteCounts = new Map<string, number>()
      let invalidOccupiedPositions = 0
      for (const citizen of occupied) {
        const slot = citizen.occupancySlotId ? slots.get(citizen.occupancySlotId) : null
        if (!slot || Math.hypot(citizen.position.x - slot.position.x,
          citizen.position.z - slot.position.z) > 1e-6) invalidOccupiedPositions += 1
        else siteCounts.set(slot.siteId, (siteCounts.get(slot.siteId) ?? 0) + 1)
      }
      window.__shadowCityPopulationSpatialDiagnostics = {
        tick: current.tick,
        outdoorCount: current.citizens.filter((citizen) =>
          citizen.activity === 'travelling' || citizen.activity === 'returningHome' ||
          citizen.activity === 'atDestination').length,
        renderedCount: visibleCount,
        occupiedCount: occupied.length,
        uniqueOccupiedSlots: new Set(occupied.map((citizen) => citizen.occupancySlotId)).size,
        sharedActivitySites: [...siteCounts.values()].filter((count) => count > 1).length,
        invalidOccupiedPositions,
        waitingCount: current.citizens.filter((citizen) => citizen.activity === 'waitingForSpace').length,
      }
    }
    for (const [index, citizen] of current.citizens.entries()) {
      const pose = poses[index]
      const appearance = appearanceById.get(citizen.id)
      if (!farReady) {
        const scale = pose.visible && tiers?.get(citizen.id) !== 'medium' && tiers?.get(citizen.id) !== 'close'
          ? 1 : HIDDEN_SCALE
        object.position.set(pose.x, pose.y + 0.77, pose.z)
        object.rotation.set(0, pose.yaw, 0)
        object.scale.setScalar(scale)
        object.updateMatrix()
        body.setMatrixAt(index, object.matrix)
        const visualColor = appearance?.primaryClothingColor ??
          (appearance ? CHARACTER_ASSET_BY_ID.get(appearance.presetId)?.farColor : null)
        body.setColorAt(index, visualColor
          ? clothingColor.set(visualColor)
          : citizen.activity === 'returningHome'
            ? RETURNING_COLOR : citizen.activity === 'atDestination' ? VISITING_COLOR : TRAVELLING_COLOR)

        object.position.set(pose.x, pose.y + 1.61, pose.z)
        object.rotation.set(0, 0, 0)
        object.scale.setScalar(scale)
        object.updateMatrix()
        head.setMatrixAt(index, object.matrix)
      }

      object.position.set(pose.x, pose.y + 0.035, pose.z)
      object.rotation.set(-Math.PI / 2, 0, 0)
      object.scale.setScalar(pose.visible && citizen.activity !== 'atDestination' ? 1 : HIDDEN_SCALE)
      object.updateMatrix()
      footlight.setMatrixAt(index, object.matrix)
      footlight.setColorAt(index, citizen.activity === 'returningHome' ? RETURNING_COLOR : TRAVELLING_COLOR)
    }
    if (!farReady) {
      body.instanceMatrix.needsUpdate = true
      head.instanceMatrix.needsUpdate = true
      if (body.instanceColor) body.instanceColor.needsUpdate = true
    }
    footlight.instanceMatrix.needsUpdate = true
    if (footlight.instanceColor) footlight.instanceColor.needsUpdate = true
    const ring = ringRef.current
    const locator = locatorRef.current
    const locatorTip = locatorTipRef.current
    if (ring) {
      const selectedIndex = current.citizens.findIndex((citizen) => citizen.id === selectedId)
      const selectedPose = poses[selectedIndex]
      ring.visible = Boolean(selectedPose?.visible)
      if (selectedPose) ring.position.set(selectedPose.x, selectedPose.y + 0.08, selectedPose.z)
      if (locator) {
        locator.visible = Boolean(selectedPose?.visible)
        if (selectedPose) locator.position.set(selectedPose.x, selectedPose.y + 1.18, selectedPose.z)
      }
      if (locatorTip) {
        locatorTip.visible = Boolean(selectedPose?.visible)
        if (selectedPose) locatorTip.position.set(selectedPose.x, selectedPose.y + 2.43, selectedPose.z)
      }
    }

    if (import.meta.env.DEV && updateDebug && !interactive) {
      window.__shadowCityAnonymousPresence = { visibleCount }
      delete window.__shadowCityAgentDiagnostics
    }
    if (import.meta.env.DEV && updateDebug && interactive) {
      delete window.__shadowCityAnonymousPresence
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
    return movingCount > 0 || (result?.diagnostics.closeCount ?? 0) > 0
  }, [animationRateById, appearanceById, camera, clothingColor, farMaterials, farTintById, gl, interactive, lookup, object, screenPoint, screenTop, selectedId, session])

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
    if (!start || !state) return
    const dx = event.nativeEvent.clientX - start.x
    const dy = event.nativeEvent.clientY - start.y
    if (dx * dx + dy * dy > 36) return
    const id = typeof event.object.userData.agentId === 'string'
      ? event.object.userData.agentId as string
      : event.instanceId === undefined ? null
        : (event.object.userData.agentIds as string[] | undefined)?.[event.instanceId] ?? state.citizens[event.instanceId]?.id
    const citizen = state.citizens.find((item) => item.id === id)
    if (!citizen || citizen.activity === 'atHome' || citizen.activity === 'planningTrip' ||
        citizen.activity === 'waitingForSpace') return
    event.stopPropagation()
    selection.select(citizen.id)
  }

  const count = state?.citizens.length ?? 0
  if (count === 0) return null
  return (
    <group>
      <instancedMesh ref={bodyRef} args={[undefined, undefined, count]} frustumCulled={false}
        onPointerDown={interactive ? onPointerDown : undefined} onClick={interactive ? onClick : undefined}>
        <capsuleGeometry args={[0.35, 0.82, 3, 6]} />
        <meshStandardMaterial color="#ffffff" emissive="#91bcb4" emissiveIntensity={0.6} roughness={0.83} />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[undefined, undefined, count]} frustumCulled={false}
        onPointerDown={interactive ? onPointerDown : undefined} onClick={interactive ? onClick : undefined}>
        <sphereGeometry args={[0.29, 6, 5]} />
        <meshStandardMaterial color="#ecdeca" emissive="#d0b999" emissiveIntensity={0.42} roughness={0.83} />
      </instancedMesh>
      {farMaterials.map(({ presetId, material }) => (
        <instancedMesh key={presetId} args={[farPlane, material, count]} frustumCulled={false}
          ref={(mesh) => {
            if (mesh) {
              farMeshesRef.current.set(presetId, mesh)
              mesh.count = 0
              mesh.userData.agentIds ??= []
              mesh.boundingSphere = new Sphere(new Vector3(), pickRadius)
            } else farMeshesRef.current.delete(presetId)
          }}
          onPointerDown={interactive ? onPointerDown : undefined}
          onClick={interactive ? onClick : undefined} />
      ))}
      <instancedMesh ref={footlightRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <circleGeometry args={[0.9, 12]} />
        <meshBasicMaterial color="#ffffff" map={footlightTexture} transparent opacity={0.8}
          depthWrite={false} side={DoubleSide} toneMapped={false} />
      </instancedMesh>
      {characterManager && <primitive object={characterManager.group}
        onPointerDown={interactive ? onPointerDown : undefined}
        onClick={interactive ? onClick : undefined} />}
      <SelectedRoute agent={selected} graph={graph} />
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.87, 1.1, 24]} />
        <meshBasicMaterial color="#bfe8df" transparent opacity={0.85} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={locatorRef} visible={false}>
        <cylinderGeometry args={[0.035, 0.035, 2.25, 5]} />
        <meshBasicMaterial color="#8fdad3" transparent opacity={0.52} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={locatorTipRef} visible={false} rotation={[0, Math.PI / 4, 0]}>
        <octahedronGeometry args={[0.22, 0]} />
        <meshBasicMaterial color="#d6fff3" depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
