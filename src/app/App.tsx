import { Canvas } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { CameraControls } from './CameraControls'
import { SimulationControls } from './SimulationControls'
import { createCameraController } from '../camera/cameraController'
import { generateCity, HERO_SEED } from '../city/generation/generateCity'
import { PlaybackController } from '../playback/PlaybackController'
import { CityScene } from '../scene/CityScene'
import { SimulationSession } from '../simulation/session'
import './styles.css'

export function App() {
  const seed = new URLSearchParams(window.location.search).get('seed') || HERO_SEED
  const city = useMemo(() => generateCity(seed), [seed])
  const cameraController = useMemo(createCameraController, [])
  const simulationSession = useMemo(() => new SimulationSession(city), [city])
  const playbackController = useMemo(() => new PlaybackController(simulationSession), [simulationSession])

  useEffect(() => playbackController.connect(), [playbackController])

  return (
    <main className="experience" aria-label="Shadow City interactive city">
      <Canvas
        orthographic
        camera={{ position: [188, 168, 188], near: 0.1, far: 1000, zoom: 1 }}
        dpr={[1, 1.7]}
        shadows="percentage"
        frameloop="demand"
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        fallback={<div className="canvas-fallback">This city needs a browser with WebGL support.</div>}
      >
        <CityScene city={city} cameraController={cameraController} />
      </Canvas>
      <div className="scene-vignette" aria-hidden="true" />
      <header className="masthead">
        <span className="eyebrow">A LIVING CITY, IN THE MAKING</span>
        <h1>SHADOW <span>CITY</span></h1>
        <p>A procedural urban miniature after dark.</p>
      </header>
      <CameraControls controller={cameraController} />
      <SimulationControls controller={playbackController} />
      <div className="scene-meta" aria-label={`City seed ${seed}`}>
        <span className="meta-rule" />
        <span>FIELD STUDY 001</span>
        <span className="meta-divider">/</span>
        <span>SEED {seed.toUpperCase()}</span>
      </div>
      <p className="interaction-hint">DRAG TO PAN <span>·</span> RIGHT DRAG TO ROTATE <span>·</span> SCROLL TO ZOOM</p>
    </main>
  )
}
