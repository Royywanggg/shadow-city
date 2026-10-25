import { useLayoutEffect, useRef } from 'react'
import { Color, Object3D, type InstancedMesh } from 'three'

export interface BoxInstance {
  position: [number, number, number]
  scale: [number, number, number]
  color?: string
  rotationY?: number
}

interface InstancedBoxesProps {
  items: BoxInstance[]
  color?: string
  emissive?: string
  emissiveIntensity?: number
  metalness?: number
  roughness?: number
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
  castShadow = false,
  receiveShadow = false,
}: InstancedBoxesProps) {
  const meshRef = useRef<InstancedMesh>(null)

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
    mesh.computeBoundingSphere()
  }, [items])

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
      />
    </instancedMesh>
  )
}
