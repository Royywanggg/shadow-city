import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping,
  RGBAFormat, SRGBColorSpace, type Texture } from 'three'

export interface ArchitecturalMaps {
  readonly color: Texture
  readonly normal: Texture
  readonly roughness: Texture
}

type SurfaceKind = 'brick' | 'stone' | 'concrete' | 'roof'

function hash(x: number, y: number, salt: number): number {
  const mixed = Math.imul(x + salt * 17, 1597334677) ^ Math.imul(y + salt * 29, 3812015801)
  return ((Math.imul(mixed ^ (mixed >>> 15), 2246822519) ^ (mixed >>> 13)) >>> 0) / 4294967295
}

function pixel(x: number, y: number, kind: SurfaceKind): number {
  const grain = (hash(x, y, 3) - 0.5) * 0.11
  const low = (hash(Math.floor(x / 8), Math.floor(y / 8), 11) - 0.5) * 0.065
  const brickCourse = Math.floor(y / 4)
  const brickOffset = brickCourse % 2 ? 8 : 0
  const brickJoint = kind === 'brick' && (y % 4 === 0 || (x + brickOffset) % 16 === 0)
  const stoneJoint = kind === 'stone' && (y % 24 === 0 || (x + (Math.floor(y / 24) % 2) * 32) % 64 === 0)
  const concreteSeam = kind === 'concrete' && x % 64 === 0
  const roofSeam = kind === 'roof' && y % 16 === 0
  const joint = brickJoint ? -0.15 : stoneJoint ? -0.095 : concreteSeam ? -0.055 : roofSeam ? -0.085 : 0
  return Math.max(0.62, Math.min(1, 0.9 + grain + low + joint))
}

function texture(data: Uint8Array, color: boolean): Texture {
  const result = new DataTexture(data, 128, 128, RGBAFormat)
  result.wrapS = result.wrapT = RepeatWrapping
  result.magFilter = LinearFilter
  result.minFilter = LinearMipmapLinearFilter
  result.generateMipmaps = true
  result.anisotropy = 4
  if (color) result.colorSpace = SRGBColorSpace
  result.needsUpdate = true
  return result
}

function createMaps(kind: SurfaceKind): ArchitecturalMaps {
  const color = new Uint8Array(128 * 128 * 4)
  const normal = new Uint8Array(128 * 128 * 4)
  const roughness = new Uint8Array(128 * 128 * 4)
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const value = pixel(x, y, kind)
      const dx = pixel((x + 1) & 127, y, kind) - pixel((x + 127) & 127, y, kind)
      const dy = pixel(x, (y + 1) & 127, kind) - pixel(x, (y + 127) & 127, kind)
      const index = (y * 128 + x) * 4
      const shade = Math.round(value * 255)
      color[index] = color[index + 1] = color[index + 2] = shade
      color[index + 3] = 255
      normal[index] = Math.round(128 - dx * 104)
      normal[index + 1] = Math.round(128 - dy * 104)
      normal[index + 2] = 251
      normal[index + 3] = 255
      const finish = kind === 'roof' ? 205 : kind === 'brick' ? 233 : 224
      roughness[index] = roughness[index + 1] = roughness[index + 2] = Math.max(180,
        Math.min(250, Math.round(finish + (value - 0.9) * 95)))
      roughness[index + 3] = 255
    }
  }
  return {
    color: texture(color, true),
    normal: texture(normal, false),
    roughness: texture(roughness, false),
  }
}

let cache: Record<SurfaceKind, ArchitecturalMaps> | null = null

export function architecturalTextures(): Record<SurfaceKind, ArchitecturalMaps> {
  if (!cache) cache = {
    brick: createMaps('brick'),
    stone: createMaps('stone'),
    concrete: createMaps('concrete'),
    roof: createMaps('roof'),
  }
  return cache
}
