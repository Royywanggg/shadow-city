import { Canvas } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { CameraControls } from './CameraControls'
import { AgentInspector } from './AgentInspector'
import { SimulationControls } from './SimulationControls'
import { createAgentSelectionController } from './agentSelection'
import { createCameraController } from '../camera/cameraController'
import { generateCity, HERO_SEED } from '../city/generation/generateCity'
import { PlaybackController } from '../playback/PlaybackController'
import { CityScene } from '../scene/CityScene'
import { AgentLayer } from '../scene/AgentLayer'
import { SimulationSession } from '../simulation/session'
import { DEFAULT_SIMULATION_CONFIG } from '../simulation/types'
import './styles.css'

declare global {
  interface Window {
    __shadowCityV03?: {
      advanceToTick(targetTick: number): number[]
      getSnapshot(): ReturnType<SimulationSession['getSnapshot']>
      getEvents(): ReturnType<SimulationSession['getEventHistory']>
    }
  }
}

export function App() {
  const parameters = new URLSearchParams(window.location.search)
  const seed = parameters.get('seed') || HERO_SEED
  const populationParameter = parameters.get('population')
  const requestedPopulation = populationParameter === null ? DEFAULT_SIMULATION_CONFIG.populationSize : Number(populationParameter)
  const populationSize = populationParameter !== '' && Number.isSafeInteger(requestedPopulation) &&
    requestedPopulation >= 0 && requestedPopulation <= 200 ? requestedPopulation : DEFAULT_SIMULATION_CONFIG.populationSize
  const city = useMemo(() => generateCity(seed), [seed])
  const cameraController = useMemo(createCameraController, [])
  const agentSelection = useMemo(createAgentSelectionController, [])
  const simulationConfig = useMemo(() => ({ ...DEFAULT_SIMULATION_CONFIG, populationSize }), [populationSize])
  const simulationSession = useMemo(() => new SimulationSession(city, simulationConfig), [city, simulationConfig])
  const playbackController = useMemo(() => new PlaybackController(simulationSession), [simulationSession])

  useEffect(() => playbackController.connect(), [playbackController])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const fixture = {
      advanceToTick(targetTick: number) {
        const currentTick = simulationSession.getSnapshot().liveTick
        if (!Number.isSafeInteger(targetTick) || targetTick < currentTick || targetTick > 1_000) {
          throw new Error('Development fixture target must be a future tick at most 1000')
        }
        const durations: number[] = []
        while (simulationSession.getSnapshot().liveTick < targetTick) {
          const startedAt = performance.now()
          simulationSession.advanceOneTick()
          durations.push(performance.now() - startedAt)
        }
        return durations
      },
      getSnapshot: () => simulationSession.getSnapshot(),
      getEvents: () => simulationSession.getEventHistory(),
    }
    window.__shadowCityV03 = fixture
    return () => {
      if (window.__shadowCityV03 === fixture) delete window.__shadowCityV03
    }
  }, [simulationSession])

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
        <AgentLayer
          session={simulationSession}
          playback={playbackController}
          selection={agentSelection}
          graph={city.pedestrian}
        />
      </Canvas>
      <div className="scene-vignette" aria-hidden="true" />
      <header className="masthead">
        <span className="eyebrow">A LIVING CITY, IN THE MAKING</span>
        <h1>SHADOW <span>CITY</span></h1>
        <p>A procedural urban miniature after dark.</p>
      </header>
      <CameraControls controller={cameraController} />
      <SimulationControls controller={playbackController} populationSize={populationSize} />
      <AgentInspector session={simulationSession} selection={agentSelection} graph={city.pedestrian} />
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
