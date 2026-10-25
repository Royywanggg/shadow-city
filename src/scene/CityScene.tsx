import { Bloom, EffectComposer } from '@react-three/postprocessing'
import type { CityModel } from '../city/model'
import { Buildings } from './Buildings'
import { CameraRig } from './CameraRig'
import { InstancedBoxes } from './InstancedBoxes'
import { Plaza } from './Plaza'
import { Roads } from './Roads'

export function CityScene({ city }: { city: CityModel }) {
  const half = city.size / 2
  return (
    <>
      <color attach="background" args={['#08111f']} />
      <fogExp2 attach="fog" args={['#08111f', 0.0022]} />
      <ambientLight color="#adc5d7" intensity={1.08} />
      <hemisphereLight args={['#b8d0dd', '#1d2b3b', 1.45]} />
      <directionalLight
        position={[-85, 145, 65]}
        color="#c9d9e9"
        intensity={2.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-145}
        shadow-camera-right={145}
        shadow-camera-top={145}
        shadow-camera-bottom={-145}
        shadow-camera-near={0.1}
        shadow-camera-far={380}
        shadow-bias={-0.0005}
      />

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
      <Buildings city={city} />
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.28} luminanceThreshold={1.15} luminanceSmoothing={0.2} mipmapBlur />
      </EffectComposer>
      <CameraRig />
    </>
  )
}
