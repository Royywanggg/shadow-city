import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedBufferAttribute, Object3D, type InstancedMesh, type Texture,
  type WebGLProgramParametersWithUniforms } from 'three'

export interface BoxInstance {
  position: [number, number, number]
  scale: [number, number, number]
  color?: string
  rotationY?: number
}

export function applyInstanceTextureScale(shader: WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader.replace('#include <common>',
    '#include <common>\nattribute vec3 instanceUvScale;')
  shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>',
    `#include <uv_vertex>
     vec2 faceUvScale = abs(normal.x) > 0.5 ? instanceUvScale.zy :
       (abs(normal.y) > 0.5 ? instanceUvScale.xz : instanceUvScale.xy);
     #ifdef USE_MAP
       vMapUv *= faceUvScale;
     #endif
     #ifdef USE_NORMALMAP
       vNormalMapUv *= faceUvScale;
     #endif
     #ifdef USE_ROUGHNESSMAP
       vRoughnessMapUv *= faceUvScale;
     #endif`)
}

interface InstancedBoxesProps {
  items: BoxInstance[]
  color?: string
  emissive?: string
  emissiveIntensity?: number
  metalness?: number
  roughness?: number
  map?: Texture
  normalMap?: Texture
  roughnessMap?: Texture
  /** Repeat surface maps in world metres on the horizontal faces of each box. */
  textureWorldScale?: number
  castShadow?: boolean
  receiveShadow?: boolean
}

export function InstancedBoxes({
  items,
  color = '#ffffff',
  emissive = '#000000',
  emissiveIntensity = 0,
  metalness = 0.1,
  roughness = 0.82,
  map,
  normalMap,
  roughnessMap,
  textureWorldScale,
  castShadow = false,
  receiveShadow = false,
}: InstancedBoxesProps) {
  const meshRef = useRef<InstancedMesh>(null)
  const applyWorldTextureScale = useMemo(() => textureWorldScale ?
    applyInstanceTextureScale : undefined, [textureWorldScale])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const object = new Object3D()
    const instanceColor = new Color()
    items.forEach((item, index) => {
      object.position.set(...item.position)
      object.rotation.set(0, item.rotationY ?? 0, 0)
      object.scale.set(...item.scale)
      object.updateMatrix()
      mesh.setMatrixAt(index, object.matrix)
      instanceColor.set(item.color ?? '#ffffff')
      mesh.setColorAt(index, instanceColor)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    if (textureWorldScale) {
      const scales = new Float32Array(items.length * 3)
      items.forEach((item, index) => {
        scales[index * 3] = item.scale[0] / textureWorldScale
        scales[index * 3 + 1] = item.scale[1] / textureWorldScale
        scales[index * 3 + 2] = item.scale[2] / textureWorldScale
      })
      mesh.geometry.setAttribute('instanceUvScale', new InstancedBufferAttribute(scales, 3))
    }
    mesh.computeBoundingSphere()
  }, [items, textureWorldScale])

  if (items.length === 0) return null
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, items.length]} castShadow={castShadow} receiveShadow={receiveShadow}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        metalness={metalness}
        roughness={roughness}
        map={map}
        normalMap={normalMap}
        roughnessMap={roughnessMap}
        onBeforeCompile={applyWorldTextureScale}
      />
    </instancedMesh>
  )
}
