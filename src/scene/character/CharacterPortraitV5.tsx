import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import type { CitizenAppearance } from '../../simulation/population'
import { CharacterManager, loadCharacterAssets } from './CharacterManager'

function Portrait({ manager, appearance, activity, movementMode, logicalTime }:
  { manager: CharacterManager; appearance: CitizenAppearance; activity: string;
    movementMode: 'walk' | 'jog'; logicalTime: number }) {
  const { invalidate } = useThree()
  useEffect(() => { invalidate() }, [appearance, activity, movementMode, logicalTime, invalidate])
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

export function CharacterPortraitV5({ appearance, activity, movementMode, logicalTime }:
  { appearance: CitizenAppearance; activity: string; movementMode: 'walk' | 'jog';
    logicalTime: number }) {
  const [manager, setManager] = useState<CharacterManager | null>(null)
  useEffect(() => {
    let cancelled = false
    let active: CharacterManager | null = null
    loadCharacterAssets().then((assets) => {
      if (cancelled) return
      active = new CharacterManager(assets)
      setManager(active)
    }).catch(() => {})
    return () => { cancelled = true; active?.dispose() }
  }, [])
  return <div className="v06-portrait" aria-label="Selected resident 3D portrait">
    {manager && <Canvas camera={{ position: [2.2, 1.6, 3.5], fov: 38 }}
      dpr={[1, 1.5]} frameloop="demand">
      <Portrait manager={manager} appearance={appearance} activity={activity}
        movementMode={movementMode} logicalTime={logicalTime} />
    </Canvas>}
  </div>
}
