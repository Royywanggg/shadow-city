import { Bloom, EffectComposer, N8AO, ToneMapping } from '@react-three/postprocessing'
import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { MeshStandardMaterial } from 'three'
import type { CityModel } from '../city/model'
import type { CameraController } from '../camera/cameraController'
import { Buildings } from './Buildings'
import { CameraRig } from './CameraRig'
import { InstancedBoxes } from './InstancedBoxes'
import { NightEnvironment } from './NightEnvironment'
import { Plaza } from './Plaza'
import { RenderDiagnostics } from './RenderDiagnostics'
import { Roads } from './Roads'
import { StreetFurniture } from './StreetFurniture'
import { LookDevLighting } from './lookdev/LookDevLighting'
import { selectLookDevArea } from './lookdev/selectLookDevArea'
import type { LightingState } from './lighting/timeOfDay'
import { SkyDome } from './lighting/SkyDome'

export type RenderingQuality = 'low' | 'high'
export type LightingDiagnostic = 'night' | 'day'
export type LookDevMode = 'baseline' | 'clay' | 'lighting' | 'geometry' | 'final'
export type ShadowMode = 'none' | 'full' | 'optimized'

function DynamicExposure({ exposure }: { exposure: number }) {
  const { gl, invalidate } = useThree()
  useEffect(() => {
    const previous = gl.toneMappingExposure
    gl.toneMappingExposure = exposure
    invalidate()
    return () => { gl.toneMappingExposure = previous; invalidate() }
  }, [exposure, gl, invalidate])
  return null
}

function ClayOverride() {
  const { scene } = useThree()
  useEffect(() => {
    const previous = scene.overrideMaterial
    const material = new MeshStandardMaterial({ color: '#a7a9a5', roughness: 1,
      metalness: 0 })
    scene.overrideMaterial = material
    return () => { scene.overrideMaterial = previous; material.dispose() }
  }, [scene])
  return null
}

export function CityStaticScene({ city, quality = 'high', postprocessing = true,
  lighting = 'night', castShadows = true, ambientOcclusion = false, lookdev = 'final',
  bloomEnabled = false, timeLighting = null, shadowMode = 'optimized' }: {
  city: CityModel
  quality?: RenderingQuality
  postprocessing?: boolean
  lighting?: LightingDiagnostic
  castShadows?: boolean
  ambientOcclusion?: boolean
  lookdev?: LookDevMode
  bloomEnabled?: boolean
  timeLighting?: LightingState | null
  shadowMode?: ShadowMode
}) {
  const half = city.size / 2
  const shadowExtent = half + 10
  const clay = lookdev === 'clay'
  const day = !timeLighting && (lighting === 'day' || clay)
  const windowLights = timeLighting?.streetlightIntensity ?? (day ? 0 : 1)
  const useSunShadow = Boolean(timeLighting && castShadows && shadowMode !== 'none' &&
    timeLighting.sunIntensity > (shadowMode === 'optimized' ? 0.15 : 0.01))
  const useMoonShadow = castShadows && shadowMode !== 'none' && (!timeLighting ||
    timeLighting.moonIntensity > (shadowMode === 'optimized' ? 0.15 : 0.01))
  const lookdevArea = useMemo(() => selectLookDevArea(city), [city])
  const plazaLights = useMemo(() => [...city.buildings]
    .filter((building) => building.kind === 'civic' || building.kind === 'commercial' || building.kind === 'corner')
    .sort((a, b) => {
      const distance = (building: typeof a) =>
        Math.hypot(building.x - city.plaza.x, building.z - city.plaza.z)
      return distance(a) - distance(b)
    }).slice(0, 3), [city])
  return (
    <>
      <color attach="background" args={[timeLighting?.skyColor ?? (day ? '#8ea5b5' : '#08111f')]} />
      <fogExp2 attach="fog" args={[timeLighting?.fogColor ?? (day ? '#8ea5b5' : '#08111f'),
        timeLighting?.fogDensity ?? (day ? 0.0018 : 0.00235)]} />
      {timeLighting && <><SkyDome lighting={timeLighting} />
        <DynamicExposure exposure={timeLighting.exposure} /></>}
      {(!day || timeLighting) && <NightEnvironment intensity={timeLighting?.environmentIntensity} />}
      <ambientLight color={timeLighting?.ambientColor ?? (day ? '#b9c7d0' : '#91a9c1')}
        intensity={timeLighting?.ambientIntensity ?? (day ? 1.15 : 0.72)} />
      <hemisphereLight args={timeLighting ? [timeLighting.skyColor, '#172331',
        timeLighting.hemisphereIntensity] : day ? ['#d5e0e6', '#697b86', 1.35] :
        ['#a7bbce', '#172331', 1.02]} />
      {timeLighting ? <directionalLight
        position={timeLighting.sunDirection.map((component) => component * 220) as
          [number, number, number]}
        color={timeLighting.sunColor} intensity={timeLighting.sunIntensity}
        castShadow={useSunShadow}
        shadow-mapSize={quality === 'high' ? [2048, 2048] : [1024, 1024]}
        shadow-camera-left={-shadowExtent} shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent} shadow-camera-bottom={-shadowExtent}
        shadow-camera-near={0.1} shadow-camera-far={400}
        shadow-bias={-0.00035} shadow-normalBias={0.025} shadow-radius={2} /> :
        <directionalLight position={[65, 90, -80]} color={day ? '#cad5db' : '#819db3'}
          intensity={day ? 0.45 : 0.32} />}
      <directionalLight
        position={[-85, 145, 65]}
        color={timeLighting ? '#d6e4ee' : day ? '#fff4e5' : '#d6e4ee'}
        intensity={timeLighting?.moonIntensity ?? (day ? 3.1 : 2.65)}
        castShadow={useMoonShadow}
        shadow-mapSize={quality === 'high' ? [2048, 2048] : [1024, 1024]}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-camera-near={0.1}
        shadow-camera-far={380}
        shadow-bias={-0.00035}
        shadow-normalBias={0.025}
        shadow-radius={2}
      />
      {windowLights > 0.01 && plazaLights.map((building) => <pointLight key={`entry-light-${building.id}`}
        position={[building.entrance.x, 3.1, building.entrance.z + 0.6]}
        color="#eab37a" intensity={(quality === 'high' ? 17 : 11) * windowLights}
        distance={13} decay={2} />)}
      {windowLights > 0.01 && lookdevArea && lookdev !== 'baseline' &&
        <LookDevLighting area={lookdevArea} intensity={windowLights} />}

      <mesh position={[0, -3.25, 0]} receiveShadow>
        <boxGeometry args={[city.size + 22, 1, city.size + 22]} />
        <meshStandardMaterial color="#0b1725" roughness={1} />
      </mesh>
      <mesh position={[0, -1.58, 0]} castShadow receiveShadow>
        <boxGeometry args={[city.size, 3.2, city.size]} />
        <meshStandardMaterial color="#1a2939" roughness={0.88} metalness={0.14} />
      </mesh>
      <InstancedBoxes
        items={[
          { position: [0, -1.35, half + 0.03], scale: [city.size, 0.16, 0.12] },
          { position: [0, -1.35, -half - 0.03], scale: [city.size, 0.16, 0.12] },
          { position: [half + 0.03, -1.35, 0], scale: [0.12, 0.16, city.size] },
          { position: [-half - 0.03, -1.35, 0], scale: [0.12, 0.16, city.size] },
        ]}
        color="#6d9e9b"
        emissive="#3c9f9c"
        emissiveIntensity={0.28}
        roughness={0.5}
      />
      <Roads city={city} />
      <Plaza city={city} />
      <Buildings city={city} lookdev={lookdev} />
      <StreetFurniture city={city} enableLights={!clay} lightIntensity={windowLights} />
      {clay && <ClayOverride />}
      {postprocessing && lookdev !== 'geometry' && !clay &&
      <EffectComposer multisampling={quality === 'high' ? 4 : 0}>
        {quality === 'high' && ambientOcclusion && <N8AO halfRes quality="performance" aoRadius={0.85}
          intensity={0.5} distanceFalloff={0.75} color="#142331" />}
        {bloomEnabled && <Bloom intensity={quality === 'high' ? 0.17 : 0.1}
          luminanceThreshold={1.35} luminanceSmoothing={0.18} mipmapBlur />}
        <ToneMapping />
      </EffectComposer>}
    </>
  )
}

export function CityScene({ city, cameraController, quality = 'high', postprocessing = true,
  lighting = 'night', castShadows = true, ambientOcclusion = false }: {
  city: CityModel
  cameraController: CameraController
  quality?: RenderingQuality
  postprocessing?: boolean
  lighting?: LightingDiagnostic
  castShadows?: boolean
  ambientOcclusion?: boolean
}) {
  return <>
    <CityStaticScene city={city} quality={quality} postprocessing={postprocessing}
      lighting={lighting} castShadows={castShadows} ambientOcclusion={ambientOcclusion} />
    <CameraRig controller={cameraController} city={city} />
    {import.meta.env.DEV && <RenderDiagnostics />}
  </>
}
