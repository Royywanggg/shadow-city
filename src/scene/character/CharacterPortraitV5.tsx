import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import type { CitizenAppearance } from '../../simulation/population'
import { CharacterManager, loadCharacterAssets, loadProofCharacterAssets,
  type CharacterPreviewClip } from './CharacterManager'
import { sampleAnimationTime } from './animationClock'

interface PortraitPlayback {
  readonly agentId: string
  readonly tick: number
  readonly priorTick: number | null
  readonly priorActivity?: string
  readonly priorMovementMode?: 'walk' | 'jog'
  readonly changedAt: number
}

function Portrait({ manager, agentId, appearance, activity, movementMode, tick, playing,
  ticksPerSecond, animationRate, preview, previewTime }:
  { manager: CharacterManager; agentId: string; appearance: CitizenAppearance;
    activity: string; movementMode: 'walk' | 'jog'; tick: number; playing: boolean;
    ticksPerSecond: number; animationRate: number;
    preview: CharacterPreviewClip | null; previewTime: number | null }) {
  const { camera, invalidate } = useThree()
  const playback = useRef<PortraitPlayback>({ agentId, tick, priorTick: null, changedAt: performance.now() })
  const previousActivity = useRef(activity)
  const previousMovementMode = useRef(movementMode)
  const frameCount = useRef(0)
  useEffect(() => () => { if (import.meta.env.DEV) delete window.__shadowCityV5Portrait }, [])
  useEffect(() => {
    camera.position.set(1.45, 1.55, 3.05)
    camera.lookAt(0, 0.9, 0)
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, invalidate])
  useEffect(() => {
    const prior = playback.current
    const continuous = playing && prior.agentId === agentId && tick === prior.tick + 1
    playback.current = { agentId, tick, priorTick: continuous ? prior.tick : null,
      priorActivity: continuous ? previousActivity.current : undefined,
      priorMovementMode: continuous ? previousMovementMode.current : undefined,
      changedAt: performance.now() }
    previousActivity.current = activity
    previousMovementMode.current = movementMode
    invalidate()
  }, [agentId, tick, activity, movementMode, playing, invalidate])
  useEffect(() => { invalidate() }, [appearance, animationRate, ticksPerSecond, previewTime, invalidate])
  useEffect(() => { manager.setPreviewClip(preview); invalidate() }, [manager, preview, invalidate])
  useFrame(() => {
    const motion = playback.current
    const alpha = playing && motion.priorTick !== null ? Math.min(1,
      (performance.now() - motion.changedAt) * ticksPerSecond / 1000) : 1
    const time = previewTime ?? sampleAnimationTime(motion.priorTick, motion.tick, alpha, 4)
    if (import.meta.env.DEV) window.__shadowCityV5Portrait = {
      tick: motion.tick, time, alpha, frameCount: ++frameCount.current, activity,
    }
    manager.update([{ id: 'portrait', appearance, activity, movementMode,
      previousActivity: motion.priorActivity, previousMovementMode: motion.priorMovementMode,
      transitionProgress: alpha, animationRate,
      pose: { x: 0, y: 0, z: 0, yaw: 0, visible: true }, pixelHeight: 150 }],
    'portrait', time)
  })
  return <>
    <ambientLight intensity={1.3} color="#8eafc3" />
    <directionalLight intensity={2} position={[3, 5, 4]} color="#e0e9e3" />
    <primitive object={manager.group} />
  </>
}

export function CharacterPortraitV5({ proof, agentId, appearance, activity, movementMode, tick,
  playing, ticksPerSecond, animationRate }:
  { proof: boolean; agentId: string; appearance: CitizenAppearance; activity: string;
    movementMode: 'walk' | 'jog'; tick: number; playing: boolean;
    ticksPerSecond: number; animationRate: number }) {
  const [manager, setManager] = useState<CharacterManager | null>(null)
  const [preview, setPreview] = useState<CharacterPreviewClip | null>(null)
  const [previewTime, setPreviewTime] = useState<number | null>(null)
  useEffect(() => {
    if (!import.meta.env.DEV || !proof) return
    const controls = { setClip: setPreview, setTime: setPreviewTime }
    window.__shadowCityV5CharacterPreview = controls
    return () => { if (window.__shadowCityV5CharacterPreview === controls)
      delete window.__shadowCityV5CharacterPreview }
  }, [proof])
  useEffect(() => {
    let cancelled = false
    let active: CharacterManager | null = null
    setManager(null)
    Promise.all([loadCharacterAssets(), proof ? loadProofCharacterAssets().catch(() => null) :
      Promise.resolve(null)])
      .then(([assets, proofAssets]) => {
        if (cancelled) return
        active = new CharacterManager(assets, proofAssets ? {
          assets: proofAssets, agentIds: new Set(['portrait']),
        } : null)
        setManager(active)
      }).catch(() => {})
    return () => { cancelled = true; active?.dispose() }
  }, [proof])
  return <div className="v06-portrait" aria-label="Selected resident 3D portrait">
    {manager && <Canvas camera={{ position: [1.45, 1.55, 3.05], fov: 38 }}
      dpr={[1, 1.5]} frameloop={playing ? 'always' : 'demand'}>
      <Portrait manager={manager} agentId={agentId} appearance={appearance} activity={activity}
        movementMode={movementMode} tick={tick} playing={playing}
        ticksPerSecond={ticksPerSecond} animationRate={animationRate}
        preview={preview} previewTime={previewTime} />
    </Canvas>}
  </div>
}

declare global {
  interface Window {
    __shadowCityV5CharacterPreview?: {
      setClip(clip: CharacterPreviewClip | null): void
      setTime(time: number | null): void
    }
    __shadowCityV5Portrait?: { tick: number; time: number; alpha: number;
      frameCount: number; activity: string }
  }
}
