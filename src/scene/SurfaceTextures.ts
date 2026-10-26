import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping,
  RGBAFormat, SRGBColorSpace, type Texture } from 'three'

interface SurfaceMaps {
  readonly color: Texture
  readonly normal: Texture
  readonly roughness: Texture
}

function hash(x: number, y: number, salt: number): number {
  let value = Math.imul(x + salt * 71, 374761393) + Math.imul(y - salt * 31, 668265263)
  value = Math.imul(value ^ (value >>> 13), 1274126177)
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295
}

function smoothNoise(x: number, y: number, cellSize: number, salt: number): number {
  const px = x / cellSize
  const py = y / cellSize
  const ix = Math.floor(px)
  const iy = Math.floor(py)
  const tx = (px - ix) ** 2 * (3 - 2 * (px - ix))
  const ty = (py - iy) ** 2 * (3 - 2 * (py - iy))
  const period = 128 / cellSize
  const sample = (dx: number, dy: number) => hash((ix + dx) % period, (iy + dy) % period, salt)
  const lower = sample(0, 0) * (1 - tx) + sample(1, 0) * tx
  const upper = sample(0, 1) * (1 - tx) + sample(1, 1) * tx
  return lower * (1 - ty) + upper * ty
}

function makeTexture(data: Uint8Array, color: boolean): Texture {
  const texture = new DataTexture(data, 128, 128, RGBAFormat)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = 4
  if (color) texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function surfaceValue(x: number, y: number, paving: boolean): number {
  const grain = smoothNoise(x, y, 8, paving ? 11 : 7) * 0.62 +
    smoothNoise(x, y, 32, paving ? 15 : 3) * 0.38
  const fleck = hash(x, y, paving ? 19 : 23) - 0.5
  const joint = paving && (x % 16 < 2 || y % 16 < 2) ? -0.095 : 0
  return Math.max(0, Math.min(1, 0.83 + (grain - 0.5) * 0.11 + fleck * 0.055 + joint))
}

function buildSurfaceMaps(paving: boolean): SurfaceMaps {
  const color = new Uint8Array(128 * 128 * 4)
  const normal = new Uint8Array(128 * 128 * 4)
  const roughness = new Uint8Array(128 * 128 * 4)
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const value = surfaceValue(x, y, paving)
      const horizontal = surfaceValue((x + 1) & 127, y, paving) -
        surfaceValue((x + 127) & 127, y, paving)
      const vertical = surfaceValue(x, (y + 1) & 127, paving) -
        surfaceValue(x, (y + 127) & 127, paving)
      const index = (y * 128 + x) * 4
      const shade = Math.round(value * 255)
      color[index] = color[index + 1] = color[index + 2] = shade
      color[index + 3] = 255
      normal[index] = Math.round(128 - horizontal * 140)
      normal[index + 1] = Math.round(128 - vertical * 140)
      normal[index + 2] = 251
      normal[index + 3] = 255
      const finish = Math.round(Math.max(178, Math.min(246,
        (paving ? 211 : 225) + (value - 0.83) * 130)))
      roughness[index] = roughness[index + 1] = roughness[index + 2] = finish
      roughness[index + 3] = 255
    }
  }
  return {
    color: makeTexture(color, true),
    normal: makeTexture(normal, false),
    roughness: makeTexture(roughness, false),
  }
}

let cached: { asphalt: SurfaceMaps; paving: SurfaceMaps } | null = null

export function surfaceTextures() {
  if (!cached) cached = { asphalt: buildSurfaceMaps(false), paving: buildSurfaceMaps(true) }
  return cached
}
