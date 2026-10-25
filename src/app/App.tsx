import { Canvas } from '@react-three/fiber'
import { useMemo, useState } from 'react'
import { generateCity, HERO_SEED } from '../city/generation/generateCity'
import { CityScene } from '../scene/CityScene'
import './styles.css'

export function App() {
  const seed = new URLSearchParams(window.location.search).get('seed') || HERO_SEED
  const city = useMemo(() => generateCity(seed), [seed])
  const [resetToken, setResetToken] = useState(0)

  return (
    <main className="experience" aria-label="Shadow City interactive city">
      <Canvas
        orthographic
        camera={{ position: [188, 168, 188], near: 0.1, far: 1000, zoom: 1 }}
        dpr={[1, 1.7]}
        shadows
        frameloop="demand"
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        fallback={<div className="canvas-fallback">This city needs a browser with WebGL support.</div>}
      >
        <CityScene city={city} resetToken={resetToken} />
      </Canvas>
      <div className="scene-vignette" aria-hidden="true" />
      <header className="masthead">
        <span className="eyebrow">A LIVING CITY, IN THE MAKING</span>
        <h1>SHADOW <span>CITY</span></h1>
        <p>A procedural urban miniature after dark.</p>
      </header>
      <button className="reset-view" type="button" onClick={() => setResetToken((value) => value + 1)}>
        RESET VIEW <span aria-hidden="true">↗</span>
      </button>
      <div className="scene-meta" aria-label={`City seed ${seed}`}>
        <span className="meta-rule" />
        <span>FIELD STUDY 001</span>
        <span className="meta-divider">/</span>
        <span>SEED {seed.toUpperCase()}</span>
      </div>
      <p className="interaction-hint">DRAG TO PAN <span>·</span> SCROLL TO ZOOM</p>
    </main>
  )
}
