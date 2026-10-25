import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, ExtrudeGeometry, Object3D, Shape, type InstancedMesh } from 'three'
import type { BoxInstance } from './InstancedBoxes'

export function RoofPrisms({ items }: { items: BoxInstance[] }) {
  const meshRef = useRef<InstancedMesh>(null)
  const geometry = useMemo(() => {
    const outline = new Shape()
    outline.moveTo(-0.5, 0)
    outline.lineTo(0.5, 0)
    outline.lineTo(0, 1)
    outline.closePath()
    const prism = new ExtrudeGeometry(outline, { depth: 1, bevelEnabled: false })
    prism.translate(0, 0, -0.5)
    return prism
  }, [])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const object = new Object3D()
    const color = new Color()
    items.forEach((item, index) => {
      object.position.set(...item.position)
      object.scale.set(...item.scale)
      object.rotation.set(0, item.rotationY ?? 0, 0)
      object.updateMatrix()
      mesh.setMatrixAt(index, object.matrix)
      mesh.setColorAt(index, color.set(item.color ?? '#374b5e'))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [items])

  if (items.length === 0) return null
  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, items.length]} castShadow receiveShadow>
      <meshStandardMaterial color="#ffffff" roughness={0.76} metalness={0.16} flatShading />
    </instancedMesh>
  )
}
