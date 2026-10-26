import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { BufferAttribute, BufferGeometry, Material, Scene, Texture } from 'three'

function resourceEstimates(scene: Scene) {
  const geometries = new Set<BufferGeometry>()
  const textures = new Set<Texture>()
  let instanceBufferBytes = 0
  scene.traverse((object) => {
    if (!('geometry' in object && 'material' in object)) return
    const rendered = object as typeof object & {
      geometry?: BufferGeometry
      material?: Material | Material[]
      instanceMatrix?: BufferAttribute
      instanceColor?: BufferAttribute | null
    }
    if (rendered.geometry?.isBufferGeometry) geometries.add(rendered.geometry)
    instanceBufferBytes += rendered.instanceMatrix?.array.byteLength ?? 0
    instanceBufferBytes += rendered.instanceColor?.array.byteLength ?? 0
    for (const material of Array.isArray(rendered.material) ? rendered.material :
      rendered.material ? [rendered.material] : []) {
      for (const value of Object.values(material)) {
        if (value && typeof value === 'object' && 'isTexture' in value && value.isTexture) {
          textures.add(value as Texture)
        }
      }
    }
  })
  const buffers = new Set<ArrayBufferLike>()
  for (const geometry of geometries) {
    for (const attribute of Object.values(geometry.attributes)) {
      buffers.add(('data' in attribute ? attribute.data.array : attribute.array).buffer)
    }
    if (geometry.index) buffers.add(geometry.index.array.buffer)
  }
  let textureSourceBytesEstimated = 0
  for (const texture of textures) {
    const image = texture.image as { data?: ArrayBufferView; width?: number;
      height?: number } | undefined
    if (image?.data) textureSourceBytesEstimated += image.data.byteLength
    else if (image?.width && image.height) {
      textureSourceBytesEstimated += Math.ceil(image.width * image.height * 4 * 4 / 3)
    }
  }
  return { geometryBufferBytes: [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0),
    instanceBufferBytes, textureSourceBytesEstimated }
}

declare global {
  interface Window {
    __shadowCityDiagnostics?: {
      drawCalls: number
      triangles: number
      geometries: number
      textures: number
      geometryBufferBytes: number
      instanceBufferBytes: number
      textureSourceBytesEstimated: number
      medianActiveFrameMs: number | null
      p50ActiveFrameMs: number | null
      p95ActiveFrameMs: number | null
      sampledFrames: number
      renderedFrames: number
    }
  }
}

export function RenderDiagnostics() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const activeIntervals = useRef<number[]>([])
  const renderedFrames = useRef(0)
  const resources = useRef({ geometryBufferBytes: 0, instanceBufferBytes: 0,
    textureSourceBytesEstimated: 0 })

  useEffect(() => {
    const previous = gl.info.autoReset
    gl.info.autoReset = false
    return () => { gl.info.autoReset = previous }
  }, [gl])

  useFrame((_, delta) => {
    renderedFrames.current += 1
    if (renderedFrames.current % 120 === 1) resources.current = resourceEstimates(scene)
    gl.info.reset()
    const interval = delta * 1000
    if (interval > 0 && interval < 100) {
      activeIntervals.current.push(interval)
      if (activeIntervals.current.length > 120) activeIntervals.current.shift()
    }
    const sorted = [...activeIntervals.current].sort((a, b) => a - b)
    const percentile = (fraction: number) => sorted.length
      ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
      : null
    queueMicrotask(() => {
      window.__shadowCityDiagnostics = {
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        ...resources.current,
        medianActiveFrameMs: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
        p50ActiveFrameMs: percentile(0.5),
        p95ActiveFrameMs: percentile(0.95),
        sampledFrames: sorted.length,
        renderedFrames: renderedFrames.current,
      }
    })
  }, -100)
  return null
}
