import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CitizenAppearance } from '../../simulation/population'
import { CharacterManager, loadCharacterAssets, type CharacterPreviewClip } from './CharacterManager'
import { sampleAnimationTime } from './animationClock'

interface PortraitPlayback {
  readonly agentId: string
  readonly tick: number
  readonly priorTick: number | null
  readonly priorActivity?: string
  readonly priorMovementMode?: 'walk' | 'jog'
}

function Portrait({ manager, agentId, appearance, activity, movementMode, tick, playing,
  getPlaybackAlpha, animationRate, preview, previewTime, lifeStatus,
  functionalStatus, onsetTick }:
  { manager: CharacterManager; agentId: string; appearance: CitizenAppearance;
    activity: string; movementMode: 'walk' | 'jog'; tick: number; playing: boolean;
    getPlaybackAlpha: () => number; animationRate: number;
    lifeStatus?: 'alive' | 'deceased';
    functionalStatus?: 'unimpaired' | 'impaired' | 'incapacitated' | null;
    onsetTick?: number;
    preview: CharacterPreviewClip | null; previewTime: number | null }) {
  const { camera, invalidate } = useThree()
  const playback = useRef<PortraitPlayback>({ agentId, tick, priorTick: null })
  const previousActivity = useRef(activity)
  const previousMovementMode = useRef(movementMode)
  const frameCount = useRef(0)
  useEffect(() => () => { if (import.meta.env.DEV) delete window.__shadowCityV5Portrait }, [])
  useEffect(() => {
    camera.position.set(1.45, 1.55, 3.05)
    camera.lookAt(0, lifeStatus === 'deceased' || functionalStatus === 'incapacitated' ? 0.45 : 0.9, 0)
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, invalidate, lifeStatus, functionalStatus])
  useLayoutEffect(() => {
    const prior = playback.current
    const continuous = playing && prior.agentId === agentId && tick === prior.tick + 1
    playback.current = { agentId, tick, priorTick: continuous ? prior.tick : null,
      priorActivity: continuous ? previousActivity.current : undefined,
      priorMovementMode: continuous ? previousMovementMode.current : undefined }
    previousActivity.current = activity
    previousMovementMode.current = movementMode
    invalidate()
  }, [agentId, tick, activity, movementMode, playing, invalidate])
  useEffect(() => { invalidate() }, [appearance, animationRate, previewTime, invalidate])
  useEffect(() => { manager.setPreviewClip(preview); invalidate() }, [manager, preview, invalidate])
  useFrame(() => {
    const motion = playback.current
    const alpha = playing && motion.priorTick !== null ? getPlaybackAlpha() : 1
    const time = previewTime ?? sampleAnimationTime(motion.priorTick, motion.tick, alpha, 4)
    if (import.meta.env.DEV) window.__shadowCityV5Portrait = {
      tick: motion.tick, time, alpha, frameCount: ++frameCount.current, activity,
    }
    manager.update([{ id: 'portrait', appearance, activity, movementMode,
      lifeStatus, functionalStatus,
      collapseProgress: onsetTick === undefined ? 0 : Math.max(0, Math.min(1,
        tick - onsetTick + alpha)),
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

export function CharacterPortraitV5({ agentId, appearance, activity, movementMode, tick,
  playing, getPlaybackAlpha, animationRate, lifeStatus, functionalStatus, onsetTick }:
  { agentId: string; appearance: CitizenAppearance; activity: string;
    movementMode: 'walk' | 'jog'; tick: number; playing: boolean;
    getPlaybackAlpha: () => number; animationRate: number;
    lifeStatus?: 'alive' | 'deceased';
    functionalStatus?: 'unimpaired' | 'impaired' | 'incapacitated' | null;
    onsetTick?: number }) {
  const [manager, setManager] = useState<CharacterManager | null>(null)
  const [preview, setPreview] = useState<CharacterPreviewClip | null>(null)
  const [previewTime, setPreviewTime] = useState<number | null>(null)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const controls = { setClip: setPreview, setTime: setPreviewTime }
    window.__shadowCityV5CharacterPreview = controls
    return () => { if (window.__shadowCityV5CharacterPreview === controls)
      delete window.__shadowCityV5CharacterPreview }
  }, [])
  useEffect(() => {
    let cancelled = false
    let active: CharacterManager | null = null
    setManager(null)
    loadCharacterAssets().then((assets) => {
      if (cancelled) return
      active = new CharacterManager(assets)
      setManager(active)
    }).catch(() => {})
    return () => { cancelled = true; active?.dispose() }
  }, [])
  return <div className="v06-portrait" aria-label="Selected resident 3D portrait">
    {manager && <Canvas camera={{ position: [1.45, 1.55, 3.05], fov: 38 }}
      dpr={[1, 1.5]} frameloop={playing ? 'always' : 'demand'}>
      <Portrait manager={manager} agentId={agentId} appearance={appearance} activity={activity}
        movementMode={movementMode} tick={tick} playing={playing}
        getPlaybackAlpha={getPlaybackAlpha} animationRate={animationRate}
        lifeStatus={lifeStatus} functionalStatus={functionalStatus} onsetTick={onsetTick}
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
