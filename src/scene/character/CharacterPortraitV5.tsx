import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import type { CitizenAppearance } from '../../simulation/population'
import { CharacterManager, loadCharacterAssets, loadProofCharacterAssets,
  type CharacterPreviewClip } from './CharacterManager'

function Portrait({ manager, appearance, activity, movementMode, logicalTime, preview }:
  { manager: CharacterManager; appearance: CitizenAppearance; activity: string;
    movementMode: 'walk' | 'jog'; logicalTime: number; preview: CharacterPreviewClip | null }) {
  const { camera, invalidate } = useThree()
  useEffect(() => {
    camera.position.set(2.2, 1.8, 4.3)
    camera.lookAt(0, 0.9, 0)
    invalidate()
  }, [camera, invalidate])
  useEffect(() => { invalidate() }, [appearance, activity, movementMode, logicalTime, invalidate])
  useEffect(() => { manager.setPreviewClip(preview); invalidate() }, [manager, preview, invalidate])
  useFrame(() => {
    manager.update([{ id: 'portrait', appearance, activity, movementMode,
      pose: { x: 0, y: 0, z: 0, yaw: 0, visible: true }, pixelHeight: 150 }],
    'portrait', logicalTime)
  })
  return <>
    <ambientLight intensity={1.3} color="#8eafc3" />
    <directionalLight intensity={2} position={[3, 5, 4]} color="#e0e9e3" />
    <primitive object={manager.group} />
  </>
}

export function CharacterPortraitV5({ proof, appearance, activity, movementMode, logicalTime }:
  { proof: boolean; appearance: CitizenAppearance; activity: string; movementMode: 'walk' | 'jog';
    logicalTime: number }) {
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
    {manager && <Canvas camera={{ position: [2.2, 1.6, 3.5], fov: 38 }}
      dpr={[1, 1.5]} frameloop="demand">
      <Portrait manager={manager} appearance={appearance} activity={activity}
        movementMode={movementMode} logicalTime={previewTime ?? logicalTime} preview={preview} />
    </Canvas>}
  </div>
}

declare global {
  interface Window {
    __shadowCityV5CharacterPreview?: {
      setClip(clip: CharacterPreviewClip | null): void
      setTime(time: number | null): void
    }
  }
}
