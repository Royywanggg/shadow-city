import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { DataTexture, EquirectangularReflectionMapping, LinearFilter,
  RGBAFormat, SRGBColorSpace } from 'three'

function createNightEnvironment(): DataTexture {
  const width = 256
  const height = 128
  const pixels = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const latitude = y / (height - 1)
    const horizon = Math.exp(-(((latitude - 0.52) / 0.19) ** 2))
    for (let x = 0; x < width; x += 1) {
      const longitude = x / width
      const warm = horizon * (
        Math.exp(-(((longitude - 0.19) / 0.09) ** 2)) +
        Math.exp(-(((longitude - 0.76) / 0.11) ** 2)) * 0.75)
      const index = (y * width + x) * 4
      pixels[index] = Math.round(23 + horizon * 36 + warm * 53)
      pixels[index + 1] = Math.round(36 + horizon * 42 + warm * 34)
      pixels[index + 2] = Math.round(54 + horizon * 49 + warm * 16)
      pixels[index + 3] = 255
    }
  }
  const texture = new DataTexture(pixels, width, height, RGBAFormat)
  texture.mapping = EquirectangularReflectionMapping
  texture.colorSpace = SRGBColorSpace
  texture.magFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

const nightEnvironment = createNightEnvironment()

export function NightEnvironment() {
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => {
    const previousEnvironment = scene.environment
    const previousIntensity = scene.environmentIntensity
    scene.environment = nightEnvironment
    scene.environmentIntensity = 0.42
    invalidate()
    return () => {
      scene.environment = previousEnvironment
      scene.environmentIntensity = previousIntensity
      invalidate()
    }
  }, [invalidate, scene])
  return null
}
