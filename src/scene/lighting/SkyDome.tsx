import { useEffect, useMemo } from 'react'
import { BackSide, Color, ShaderMaterial } from 'three'
import type { LightingState } from './timeOfDay'

const vertexShader = `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const fragmentShader = `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  varying vec3 vDirection;
  void main() {
    float altitude = smoothstep(-0.18, 0.68, vDirection.y);
    vec3 color = mix(uHorizon, uTop, altitude);
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function SkyDome({ lighting }: { lighting: LightingState }) {
  const material = useMemo(() => new ShaderMaterial({ vertexShader, fragmentShader,
    side: BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { uTop: { value: new Color() }, uHorizon: { value: new Color() } } }), [])
  useEffect(() => {
    material.uniforms.uTop.value.set(lighting.skyColor)
    material.uniforms.uHorizon.value.set(lighting.horizonColor)
  }, [lighting, material])
  useEffect(() => () => material.dispose(), [material])
  return <mesh material={material} renderOrder={-1000} frustumCulled={false}>
    <sphereGeometry args={[900, 24, 12]} />
  </mesh>
}
