import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { CanvasTexture, Color, DoubleSide, MeshBasicMaterial, Object3D, PlaneGeometry,
  Sphere, SRGBColorSpace, TextureLoader, Vector3, type InstancedMesh } from 'three'
import type { SimulationSessionV5 } from '../simulation/sessionV5'
import { createCitizenIdentity } from '../simulation/population'
import type { SimulationStateV5 } from '../simulation/v5Types'
import { CharacterManager, getCharacterAssetLoadDurationMs, getResolvedCharacterAssetMode,
  loadCharacterAssets, type CharacterRenderItem } from './character/CharacterManager'
import { CHARACTER_ASSETS } from './character/catalog'
import { sampleAnimationTime } from './character/animationClock'
import { selectCharacterReviewIds } from './character/reviewSelection'
import { interpolateHeading } from './character/heading'

interface MotionPair { prior: SimulationStateV5 | null; current: SimulationStateV5; changedAt: number }

export function WorldAgentLayerV5({ session, selectedId, onSelect, playing, ticksPerSecond,
  level }: { session: SimulationSessionV5; selectedId: string | null;
  onSelect: (id: string) => void; playing: boolean; ticksPerSecond: number;
  level: 'all' | 'L0' | 'L1' }) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const { camera, size, gl, invalidate } = useThree()
  const identities = useMemo(() => new Map(session.getProfiles().map((profile) =>
    [profile.id, createCitizenIdentity(profile.id)])), [session])
  const profiles = useMemo(() => new Map(session.getProfiles().map((profile) =>
    [profile.id, profile])), [session])
  const reviewIds = useMemo(() => selectCharacterReviewIds(identities), [identities])
  const surfaces = useMemo(() => new Map(session.getWorld().surfaces.map((surface) =>
    [surface.id, surface])), [session])
  const managerRef = useRef<CharacterManager | null>(null)
  const [manager, setManager] = useState<CharacterManager | null>(null)
  const [materials, setMaterials] = useState<ReadonlyMap<string, MeshBasicMaterial>>(new Map())
  const meshRefs = useRef(new Map<string, InstancedMesh>())
  const object = useMemo(() => new Object3D(), [])
  const color = useMemo(() => new Color(), [])
  const tintColor = useMemo(() => new Color(), [])
  const vector = useMemo(() => new Vector3(), [])
  const spriteGeometry = useMemo(() => new PlaneGeometry(0.9, 1.78), [])
  const glowGeometry = useMemo(() => new PlaneGeometry(1.65, 1.65), [])
  const glowTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64; canvas.height = 64
    const context = canvas.getContext('2d')!
    const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 32)
    gradient.addColorStop(0, 'rgba(255,255,255,.65)')
    gradient.addColorStop(.32, 'rgba(255,255,255,.32)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 64, 64)
    return new CanvasTexture(canvas)
  }, [])
  const glowMaterial = useMemo(() => new MeshBasicMaterial({ map: glowTexture,
    color: '#8bd2d2', transparent: true, depthWrite: false, side: DoubleSide,
    toneMapped: false }), [glowTexture])
  const glowRef = useRef<InstancedMesh>(null)
  const fallbackMaterial = useMemo(() => new MeshBasicMaterial({ color: '#b9d4d0',
    side: DoubleSide }), [])
  const motion = useRef<MotionPair>({ prior: null, current: snapshot.state, changedAt: performance.now() })
  const previousTick = useRef(snapshot.tick)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const lastDebug = useRef(0)
  useLayoutEffect(() => {
    for (const mesh of meshRefs.current.values()) mesh.boundingSphere =
      new Sphere(new Vector3(), 260)
  }, [materials, snapshot.state.citizens.length])

  useEffect(() => {
    let cancelled = false
    setManager(null)
    loadCharacterAssets().then((assets) => {
      if (cancelled) return
      const next = new CharacterManager(assets)
      managerRef.current = next
      setManager(next)
      invalidate()
    }).catch(() => { /* Far impostors remain visible if a rig fails to load. */ })
    return () => { cancelled = true; managerRef.current?.dispose(); managerRef.current = null }
  }, [invalidate])

  useEffect(() => {
    let cancelled = false
    const loader = new TextureLoader()
    Promise.all(CHARACTER_ASSETS.map(async (asset) => {
      const texture = await loader.loadAsync(`/characters/quaternius-v01/impostors/${asset.presetId}.png`)
      texture.colorSpace = SRGBColorSpace
      return [asset.presetId, new MeshBasicMaterial({ map: texture, transparent: true,
        alphaTest: 0.08, side: DoubleSide, depthWrite: true, toneMapped: false })] as const
    })).then((loaded) => {
      if (cancelled) { loaded.forEach(([, material]) => { material.map?.dispose(); material.dispose() }); return }
      setMaterials(new Map(loaded)); invalidate()
    }).catch(() => { /* The simple marker remains as a fallback. */ })
    return () => { cancelled = true }
  }, [invalidate])
  useEffect(() => () => {
    for (const material of materials.values()) { material.map?.dispose(); material.dispose() }
  }, [materials])
  useEffect(() => () => { spriteGeometry.dispose(); fallbackMaterial.dispose()
    glowGeometry.dispose(); glowMaterial.dispose(); glowTexture.dispose() },
    [spriteGeometry, fallbackMaterial, glowGeometry, glowMaterial, glowTexture])

  useEffect(() => {
    const previous = motion.current.current
    const continuous = playing && !snapshot.isInspecting && snapshot.tick === previousTick.current + 1
    motion.current = { prior: continuous ? previous : null, current: snapshot.state,
      changedAt: performance.now() }
    previousTick.current = snapshot.tick
    invalidate()
  }, [invalidate, playing, snapshot])

  useFrame(() => {
    const { prior, current, changedAt } = motion.current
    const alpha = prior && playing ? Math.min(1, (performance.now() - changedAt) * ticksPerSecond / 1000) : 1
    const previousById = new Map(prior?.citizens.map((citizen) => [citizen.id, citizen]) ?? [])
    const items: CharacterRenderItem[] = []
    const screenCandidates: { id: string; x: number; y: number }[] = []
    const canvasBounds = gl.domElement.getBoundingClientRect()
    for (const citizen of current.citizens) {
      const previous = previousById.get(citizen.id)
      const visible = citizen.activity !== 'atHome' || citizen.id === selectedId
      if (!visible) continue
      const surface = surfaces.get(citizen.surfaceId)
      if (level !== 'all' && surface?.levelId !== level && surface?.levelId !== 'L0-L1' &&
        citizen.id !== selectedId) continue
      const appearance = identities.get(citizen.id)!.appearance
      const x = (previous ? previous.position.x + (citizen.position.x - previous.position.x) * alpha : citizen.position.x) / 1000
      const y = (previous ? previous.position.y + (citizen.position.y - previous.position.y) * alpha : citizen.position.y) / 1000
      const z = (previous ? previous.position.z + (citizen.position.z - previous.position.z) * alpha : citizen.position.z) / 1000
      const bottom = vector.set(x, y, z).project(camera).y
      const top = vector.set(x, y + 1.8, z).project(camera).y
      const pixelHeight = Math.abs(top - bottom) * size.height / 2
      items.push({ id: citizen.id, appearance, activity: citizen.activity,
        movementMode: citizen.movementMode, previousActivity: previous?.activity,
        previousMovementMode: previous?.movementMode, transitionProgress: alpha,
        animationRate: profiles.get(citizen.id)!.travellerCosts.speedMmPerSecond / 1300,
        pose: { x, y, z, yaw: previous ? interpolateHeading(previous.headingRadians,
          citizen.headingRadians, alpha) : citizen.headingRadians, visible: true }, pixelHeight })
      const screen = vector.set(x, y + 0.9, z).project(camera)
      screenCandidates.push({ id: citizen.id, x: canvasBounds.left + (screen.x + 1) * size.width / 2,
        y: canvasBounds.top + (1 - screen.y) * size.height / 2 })
    }
    const animationStart = performance.now()
    const result = manager?.update(items, selectedId,
      sampleAnimationTime(prior?.tick ?? null, current.tick, alpha, 4))
    const animationUpdateMs = performance.now() - animationStart
    const countByPreset = new Map<string, number>()
    let glowCount = 0
    for (const item of items) {
      const glow = glowRef.current
      if (glow) {
        object.position.set(item.pose.x, item.pose.y + 0.045, item.pose.z)
        object.rotation.set(-Math.PI / 2, 0, 0)
        object.scale.setScalar(1)
        object.updateMatrix()
        glow.setMatrixAt(glowCount, object.matrix)
        glowCount += 1
      }
      if (result && result.tiers.get(item.id) !== 'far') continue
      const preset = item.appearance.presetId
      const mesh = meshRefs.current.get(preset)
      if (!mesh) continue
      const slot = countByPreset.get(preset) ?? 0
      object.position.set(item.pose.x, item.pose.y + 0.9, item.pose.z)
      object.quaternion.copy(camera.quaternion)
      object.scale.setScalar(1)
      object.updateMatrix()
      mesh.setMatrixAt(slot, object.matrix)
      color.set('#ffffff')
      if (item.appearance.primaryClothingColor) color.lerp(
        tintColor.set(item.appearance.primaryClothingColor), 0.24)
      mesh.setColorAt(slot, color)
      const ids = mesh.userData.agentIds as string[]
      ids[slot] = item.id
      countByPreset.set(preset, slot + 1)
    }
    if (glowRef.current) {
      glowRef.current.count = glowCount
      glowRef.current.instanceMatrix.needsUpdate = true
    }
    for (const asset of CHARACTER_ASSETS) {
      const mesh = meshRefs.current.get(asset.presetId)
      if (!mesh) continue
      mesh.count = countByPreset.get(asset.presetId) ?? 0
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    if (import.meta.env.DEV && performance.now() - lastDebug.current > 250) {
      window.__shadowCityV06Agents = { tick: current.tick, visibleCount: items.length,
        candidates: screenCandidates, farCount: result?.diagnostics.farCount ?? items.length,
        mediumCount: result?.diagnostics.mediumCount ?? 0,
        closeCount: result?.diagnostics.closeCount ?? 0,
        activeInstances: result?.diagnostics.activeInstances ?? 0,
        reviewAgentIds: [...reviewIds],
        animationUpdateMs,
        characterAssetMode: getResolvedCharacterAssetMode(),
        characterAssetLoadMs: getCharacterAssetLoadDurationMs(),
        assetPresetCount: result?.diagnostics.assetPresetCount ?? 0,
        textures: gl.info.memory.textures }
      lastDebug.current = performance.now()
    }
  })

  const selected = snapshot.state.citizens.find((item) => item.id === selectedId)
  const pointerDown = (event: { clientX: number; clientY: number }) => {
    pointerStart.current = { x: event.clientX, y: event.clientY }
  }
  const pick = (event: { clientX: number; clientY: number; stopPropagation(): void }, id: string | undefined) => {
    if (!id || !pointerStart.current ||
      Math.hypot(event.clientX - pointerStart.current.x, event.clientY - pointerStart.current.y) > 6) return
    event.stopPropagation(); onSelect(id)
  }
  return <>
    <instancedMesh ref={glowRef} args={[glowGeometry, glowMaterial,
      snapshot.state.citizens.length]} raycast={() => null} />
    {CHARACTER_ASSETS.map((asset) => <instancedMesh key={asset.presetId}
      ref={(mesh) => { if (mesh) { meshRefs.current.set(asset.presetId, mesh); mesh.userData.agentIds ??= [] }
        else meshRefs.current.delete(asset.presetId) }}
      args={[spriteGeometry, materials.get(asset.presetId) ?? fallbackMaterial,
        snapshot.state.citizens.length]}
      onPointerDown={pointerDown}
      onClick={(event) => pick(event, (event.object.userData.agentIds as string[])?.[event.instanceId ?? -1])} />)}
    {manager && <primitive object={manager.group} onPointerDown={pointerDown}
      onClick={(event: { object: Object3D; clientX: number; clientY: number; stopPropagation(): void }) =>
        pick(event, event.object.userData.agentId as string | undefined)} />}
    {selected && <mesh position={[selected.position.x / 1000, selected.position.y / 1000 + 0.05,
      selected.position.z / 1000]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.95, 1.14, 24]} />
      <meshBasicMaterial color="#f2d08a" side={DoubleSide} />
    </mesh>}
  </>
}

declare global {
  interface Window {
    __shadowCityV06Agents?: { tick: number; visibleCount: number;
      candidates: { id: string; x: number; y: number }[];
      farCount: number; mediumCount: number; closeCount: number;
      activeInstances: number;
      reviewAgentIds: string[]; animationUpdateMs: number;
      characterAssetMode: 'upgraded' | 'legacy' | null;
      characterAssetLoadMs: number | null; assetPresetCount: number; textures: number }
  }
}
