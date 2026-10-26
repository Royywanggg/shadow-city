import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { PlaybackController } from '../../playback/PlaybackController'
import type { CitizenAppearance } from '../../simulation/population'
import type { SimulationSession } from '../../simulation/session'
import { getCitizenSimulationState } from '../../simulation/types'
import { CharacterManager, loadCharacterAssets } from './CharacterManager'

interface CharacterPortraitProps {
  readonly appearance: CitizenAppearance
  readonly activity: string
  readonly logicalTimeSeconds: number
  readonly agentId: string
  readonly playback: PlaybackController
  readonly session: SimulationSession
}

function PortraitScene({ manager, appearance, activity, logicalTimeSeconds, rotationY, agentId, playback, session }: CharacterPortraitProps & {
  readonly manager: CharacterManager
  readonly rotationY: number
}) {
  const { camera, invalidate } = useThree()
  const lastTick = useRef<number | null>(null)
  const lastPlaying = useRef(false)
  const interpolateTick = useRef(false)

  useEffect(() => {
    camera.position.set(2.1, 1.45, 3.6)
    camera.lookAt(0, 0.9, 0)
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, invalidate])

  useEffect(() => { invalidate() }, [activity, appearance, invalidate, logicalTimeSeconds, manager])
  useEffect(() => playback.subscribe(invalidate), [invalidate, playback])

  useEffect(() => {
    lastTick.current = null
    interpolateTick.current = false
  }, [agentId, session])

  useFrame(() => {
    const snapshot = session.getSnapshot()
    const current = getCitizenSimulationState(snapshot.state)
    if (!current) return
    const playing = playback.getSnapshot().status === 'playing' && !snapshot.isInspecting
    const previousState = session.getPreviousLiveState()
    const previous = previousState ? getCitizenSimulationState(previousState) : null
    if (lastTick.current !== current.tick) {
      interpolateTick.current = playing && lastPlaying.current && lastTick.current !== null &&
        current.tick === lastTick.current + 1 && previous?.tick === current.tick - 1
      lastTick.current = current.tick
    }
    const alpha = playing && interpolateTick.current ? playback.getInterpolationAlpha() : 1
    const priorActivity = previous?.citizens.find((citizen) => citizen.id === agentId)?.activity
    const selectedActivity = current.citizens.find((citizen) => citizen.id === agentId)?.activity ?? activity
    const time = playing && interpolateTick.current && previous
      ? previous.logicalTimeSeconds + (current.logicalTimeSeconds - previous.logicalTimeSeconds) * alpha
      : current.logicalTimeSeconds
    manager.update([{
      id: 'selected-portrait', appearance, activity: selectedActivity,
      previousActivity: playing && interpolateTick.current ? priorActivity : undefined,
      transitionProgress: alpha,
      pose: { x: 0, y: 0, z: 0, yaw: 0, visible: true }, pixelHeight: 160,
    }], 'selected-portrait', time)
    lastPlaying.current = playing
    if (playing) invalidate()
  })

  useEffect(() => { invalidate() }, [invalidate, rotationY])

  return (
    <>
      <ambientLight color="#839ead" intensity={1.3} />
      <directionalLight color="#d7e6e9" position={[3, 5, 5]} intensity={2.0} />
      <directionalLight color="#c99671" position={[-3, 2, -2]} intensity={0.65} />
      <group rotation={[0, rotationY, 0]}>
        <primitive object={manager.group} />
      </group>
    </>
  )
}

/** A selected-only turntable, independent of city occlusion and simulation movement. */
export function CharacterPortrait({ appearance, activity, logicalTimeSeconds, agentId, playback, session }: CharacterPortraitProps) {
  const [manager, setManager] = useState<CharacterManager | null>(null)
  const [error, setError] = useState(false)
  const [rotationY, setRotationY] = useState(0)
  const drag = useRef<{ x: number; rotationY: number } | null>(null)
  const managerRef = useRef<CharacterManager | null>(null)

  useEffect(() => {
    let cancelled = false
    loadCharacterAssets().then((assets) => {
      const next = new CharacterManager(assets)
      if (cancelled) next.dispose()
      else {
        managerRef.current = next
        setManager(next)
      }
    }).catch(() => { if (!cancelled) setError(true) })
    return () => {
      cancelled = true
      managerRef.current?.dispose()
      managerRef.current = null
    }
  }, [])

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: event.clientX, rotationY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    setRotationY(drag.current.rotationY + (event.clientX - drag.current.x) * 0.015)
  }
  const onPointerUp = () => { drag.current = null }

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 100, position: 'relative',
      overflow: 'hidden', cursor: manager ? 'grab' : 'default',
      background: 'radial-gradient(ellipse at 50% 55%, #243649 0%, #101d2d 58%, #0a1422 100%)' }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      {manager ? <Canvas orthographic camera={{ position: [2.1, 1.45, 3.6], zoom: 48, near: 0.1, far: 20 }}
        dpr={[1, 1.3]} frameloop="demand" gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
        style={{ width: '100%', height: '100%' }}>
        <PortraitScene manager={manager} appearance={appearance} activity={activity}
          logicalTimeSeconds={logicalTimeSeconds} rotationY={rotationY}
          agentId={agentId} playback={playback} session={session} />
      </Canvas> : <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
        color: '#8ca9ae', fontSize: 10, letterSpacing: 1.2 }}>
        {error ? '3D PREVIEW UNAVAILABLE' : 'LOADING CHARACTER…'}
      </span>}
    </div>
  )
}
