import { useMemo } from 'react'
import type { Building, BuildingMass, BuildingWindow } from '../../city/model'
import { InstancedBoxes, type BoxInstance } from '../InstancedBoxes'
import { architecturalTextures } from '../architecture/ArchitecturalTextures'
import type { LookDevArea } from './selectLookDevArea'

type Point = [number, number, number]
type Face = 'x' | 'z'

interface Opening {
  readonly lateral: number
  readonly width: number
  readonly bottom: number
  readonly top: number
  readonly light: 0 | 1 | 2
  readonly entrance: boolean
}

interface Parts {
  stone: BoxInstance[]
  brick: BoxInstance[]
  concrete: BoxInstance[]
  darkReveal: BoxInstance[]
  paleTrim: BoxInstance[]
  metal: BoxInstance[]
  roof: BoxInstance[]
  darkGlass: BoxInstance[]
  warmGlass: BoxInstance[]
  coolGlass: BoxInstance[]
}

function box(position: Point, scale: Point, color?: string): BoxInstance {
  return { position, scale, color }
}

function outerFace(building: Building, mass: BuildingMass, face: Face,
  direction: 1 | -1 = 1): number {
  return face === 'z' ? building.z + mass.offsetZ + direction * mass.depth / 2
    : building.x + mass.offsetX + direction * mass.width / 2
}

function openingsOn(building: Building, mass: BuildingMass, face: Face,
  direction: 1 | -1): Opening[] {
  const sourceFacePosition = outerFace(building, mass, face)
  const lateralCenter = face === 'z' ? building.x + mass.offsetX : building.z + mass.offsetZ
  const half = face === 'z' ? mass.width / 2 : mass.depth / 2
  const windows = building.windows.filter((window: BuildingWindow) => {
    const position = face === 'z' ? building.z + window.offsetZ : building.x + window.offsetX
    const lateral = face === 'z' ? building.x + window.offsetX : building.z + window.offsetZ
    return window.face === face && Math.abs(position - sourceFacePosition) < 0.34 &&
      lateral > lateralCenter - half + 0.15 && lateral < lateralCenter + half - 0.15 &&
      window.y - window.height / 2 >= mass.baseY - 0.02 &&
      window.y + window.height / 2 <= mass.baseY + mass.height + 0.02
  }).map((window) => ({ lateral: face === 'z' ? building.x + window.offsetX
    : building.z + window.offsetZ, width: window.width,
  bottom: window.y - window.height / 2, top: window.y + window.height / 2,
  light: window.light, entrance: false }))

  if (face === 'z' && direction === 1 && mass.role === 'base') {
    const width = building.kind === 'civic' ? 3.45 : 2.35
    const entry: Opening = { lateral: building.entrance.x, width,
      bottom: mass.baseY, top: Math.min(mass.baseY + mass.height - 0.35,
        mass.baseY + (building.kind === 'civic' ? 3.6 : 3.35)),
      light: 0, entrance: true }
    return [...windows.filter((window) => window.bottom >= entry.top ||
      Math.abs(window.lateral - entry.lateral) > (window.width + width) / 2 + 0.18), entry]
  }
  return windows
}

function addReveal(parts: Parts, opening: Opening, face: Face, facePosition: number,
  direction: 1 | -1, civic: boolean): void {
  const depth = 0.46
  const center = facePosition - direction * depth / 2
  const middle = (opening.bottom + opening.top) / 2
  const height = opening.top - opening.bottom
  const halfWidth = opening.width / 2
  const trim = civic ? parts.paleTrim : parts.metal
  const finish = civic ? '#bfc0b5' : '#8c837a'
  const side = (lateral: number, y: number, width: number, h: number,
    forward: number, thickness: number, target: BoxInstance[], color?: string) => {
    const position: Point = face === 'z' ? [lateral, y, forward] : [forward, y, lateral]
    const scale: Point = face === 'z' ? [width, h, thickness] : [thickness, h, width]
    target.push(box(position, scale, color))
  }
  // The wall has an actual opening. These four pieces form its physical return surfaces.
  for (const sign of [-1, 1]) {
    side(opening.lateral + sign * (halfWidth - 0.04), middle, 0.12, height,
      center, depth, parts.darkReveal, '#374550')
    side(opening.lateral + sign * (halfWidth + 0.06), middle, 0.13, height + 0.2,
      facePosition + direction * 0.055, 0.13, trim, finish)
  }
  for (const [y, thickness] of [[opening.bottom + 0.05, 0.1], [opening.top - 0.05, 0.1]]) {
    side(opening.lateral, y, opening.width, thickness, center, depth,
      parts.darkReveal, '#34414a')
  }
  side(opening.lateral, opening.bottom - 0.1, opening.width + 0.26, 0.18,
    facePosition + direction * 0.13, 0.32, trim, finish)
  side(opening.lateral, opening.top + 0.11, opening.width + 0.27, 0.2,
    facePosition + direction * 0.1, 0.28, trim, finish)
  const pane = opening.entrance ? parts.darkGlass : opening.light === 1
    ? parts.warmGlass : opening.light === 2 ? parts.coolGlass : parts.darkGlass
  side(opening.lateral, middle, opening.width - 0.18, height - 0.18,
    facePosition - direction * 0.31, 0.07, pane,
    opening.entrance ? '#253641' : undefined)
  if (opening.entrance) {
    side(opening.lateral, middle, 0.06, height - 0.24,
      facePosition - direction * 0.24, 0.13, parts.metal, '#aa9880')
    side(opening.lateral + opening.width * 0.3, opening.bottom + 1.3, 0.27, 0.07,
      facePosition - direction * 0.19, 0.09, parts.metal, '#b7a789')
  }
}

function addCutWall(building: Building, mass: BuildingMass, face: Face,
  direction: 1 | -1, parts: Parts, wall: BoxInstance[]): void {
  const lateralCenter = face === 'z' ? building.x + mass.offsetX : building.z + mass.offsetZ
  const span = face === 'z' ? mass.width : mass.depth
  const facePosition = outerFace(building, mass, face, direction)
  const openings = openingsOn(building, mass, face, direction)
  const lateralMin = lateralCenter - span / 2
  const lateralMax = lateralCenter + span / 2
  const bottom = mass.baseY
  const top = bottom + mass.height
  const cuts = (values: number[]) => [...new Set(values.map((value) =>
    Math.round(value * 10000) / 10000))].sort((a, b) => a - b)
  const xs = cuts([lateralMin, lateralMax, ...openings.flatMap((opening) => [
    Math.max(lateralMin, opening.lateral - opening.width / 2),
    Math.min(lateralMax, opening.lateral + opening.width / 2)])])
  const ys = cuts([bottom, top, ...openings.flatMap((opening) => [
    Math.max(bottom, opening.bottom), Math.min(top, opening.top)])])
  for (let x = 0; x < xs.length - 1; x += 1) for (let y = 0; y < ys.length - 1; y += 1) {
    const width = xs[x + 1] - xs[x]
    const height = ys[y + 1] - ys[y]
    if (width < 0.015 || height < 0.015) continue
    const lateral = (xs[x] + xs[x + 1]) / 2
    const vertical = (ys[y] + ys[y + 1]) / 2
    if (openings.some((opening) => lateral > opening.lateral - opening.width / 2 + 0.001 &&
      lateral < opening.lateral + opening.width / 2 - 0.001 &&
      vertical > opening.bottom + 0.001 && vertical < opening.top - 0.001)) continue
    wall.push(box(face === 'z' ? [lateral, vertical, facePosition - direction * 0.21]
      : [facePosition - direction * 0.21, vertical, lateral],
    face === 'z' ? [width, height, 0.42] : [0.42, height, width]))
  }
  openings.forEach((opening) => addReveal(parts, opening, face, facePosition, direction,
    building.kind === 'civic'))
}

function addMass(building: Building, mass: BuildingMass, parts: Parts): void {
  const x = building.x + mass.offsetX
  const z = building.z + mass.offsetZ
  const wall = building.kind === 'civic' ? parts.stone
    : mass.role === 'base' ? parts.concrete : parts.brick
  for (const face of ['z', 'x'] as const) for (const direction of [1, -1] as const) {
    addCutWall(building, mass, face, direction, parts, wall)
  }

  const top = mass.baseY + mass.height
  parts.roof.push(box([x, top - 0.09, z], [mass.width, 0.18, mass.depth],
    building.kind === 'civic' ? '#657077' : '#4d555c'))
  for (const sign of [-1, 1]) {
    parts.paleTrim.push(box([x, top + 0.32, z + sign * mass.depth / 2],
      [mass.width + 0.32, 0.64, 0.28], building.kind === 'civic' ? '#c0bdb1' : '#988b83'))
    parts.paleTrim.push(box([x + sign * mass.width / 2, top + 0.32, z],
      [0.28, 0.64, mass.depth + 0.32], building.kind === 'civic' ? '#c0bdb1' : '#988b83'))
  }
  if (mass.role === 'base') {
    parts.darkReveal.push(box([x, 0.57, z], [mass.width - 0.18, 0.74,
      mass.depth - 0.18], '#34414a'))
  }
}

function addCivicStructure(building: Building, parts: Parts): void {
  const mass = building.masses[0]
  const front = outerFace(building, mass, 'z')
  const x = building.x + mass.offsetX
  const width = mass.width
  const depth = 1.55
  for (const fraction of [-0.42, -0.3, -0.18, 0.18, 0.3, 0.42]) {
    parts.stone.push(box([x + width * fraction, 3.85, front + depth * 0.82],
      [0.72, 5.8, 0.8]))
    parts.paleTrim.push(box([x + width * fraction, 6.85, front + depth * 0.82],
      [1.02, 0.22, 1.04], '#c2beb1'))
  }
  parts.stone.push(box([x, 6.94, front + depth * 0.78],
    [width * 0.94, 0.72, depth + 0.65]))
  parts.paleTrim.push(box([x, 7.4, front + depth * 0.78],
    [width * 0.97, 0.22, depth + 0.75], '#c8c4b7'))
  parts.darkReveal.push(box([x, 0.18, front + 0.83],
    [width * 0.94, 0.15, 1.6], '#53616a'))
  for (const offset of [-6.5, 6.5]) {
    parts.metal.push(box([x + offset, 17.58, zOf(mass, building) - 1.6],
      [2.1, 1.05, 2.3], '#85939b'))
    parts.darkReveal.push(box([x + offset, 18.15, zOf(mass, building) - 1.6],
      [2.3, 0.11, 2.5], '#35424d'))
  }
}

function zOf(mass: BuildingMass, building: Building): number {
  return building.z + mass.offsetZ
}

function addCommercialStructure(building: Building, parts: Parts): void {
  const mass = building.masses[0]
  const x = building.x + mass.offsetX
  const front = outerFace(building, mass, 'z')
  const width = mass.width
  parts.metal.push(box([x, 5.19, front + 0.47],
    [width * 0.91, 0.24, 1.15], '#908d85'))
  parts.darkReveal.push(box([x, 4.92, front + 0.4],
    [width * 0.88, 0.1, 1.02], '#394851'))
  for (const sign of [-1, 1]) {
    parts.brick.push(box([x + sign * width * 0.43, 3.2, front + 0.16],
      [0.42, 4.5, 0.68], '#a88473'))
  }
  for (const upper of building.masses.slice(1)) {
    const px = building.x + upper.offsetX
    const pz = building.z + upper.offsetZ
    const top = upper.baseY + upper.height
    parts.metal.push(box([px - upper.width * 0.18, top + 0.5, pz - upper.depth * 0.17],
      [Math.min(2, upper.width * 0.23), 0.95, 1.5], '#798990'))
    parts.darkReveal.push(box([px - upper.width * 0.18, top + 1.02,
      pz - upper.depth * 0.17], [Math.min(2.2, upper.width * 0.25), 0.1, 1.7], '#35434d'))
  }
}

function makeParts(area: LookDevArea): Parts {
  const parts: Parts = { stone: [], brick: [], concrete: [], darkReveal: [], paleTrim: [],
    metal: [], roof: [], darkGlass: [], warmGlass: [], coolGlass: [] }
  for (const building of [area.civic, area.commercial]) {
    building.masses.forEach((mass) => addMass(building, mass, parts))
  }
  addCivicStructure(area.civic, parts)
  addCommercialStructure(area.commercial, parts)
  return parts
}

/** Two rendered facades replace their old meshes without changing CityModel or navigation. */
export function LookDevArchitecture({ area }: { area: LookDevArea }) {
  const parts = useMemo(() => makeParts(area), [area])
  const maps = useMemo(() => architecturalTextures(), [])
  return <>
    <InstancedBoxes items={parts.stone} castShadow receiveShadow color="#aca99f"
      roughness={0.85} map={maps.stone.color} normalMap={maps.stone.normal}
      roughnessMap={maps.stone.roughness} textureWorldScale={5} />
    <InstancedBoxes items={parts.brick} castShadow receiveShadow color="#a27d6e"
      roughness={0.9} map={maps.brick.color} normalMap={maps.brick.normal}
      roughnessMap={maps.brick.roughness} textureWorldScale={2.8} />
    <InstancedBoxes items={parts.concrete} castShadow receiveShadow color="#8f9895"
      roughness={0.82} map={maps.concrete.color} normalMap={maps.concrete.normal}
      roughnessMap={maps.concrete.roughness} textureWorldScale={4.5} />
    <InstancedBoxes items={parts.darkReveal} castShadow receiveShadow roughness={0.91} />
    <InstancedBoxes items={parts.paleTrim} castShadow receiveShadow roughness={0.73}
      metalness={0.04} />
    <InstancedBoxes items={parts.metal} castShadow receiveShadow roughness={0.48}
      metalness={0.48} />
    <InstancedBoxes items={parts.roof} castShadow receiveShadow roughness={0.8}
      map={maps.roof.color} normalMap={maps.roof.normal}
      roughnessMap={maps.roof.roughness} textureWorldScale={5} />
    <InstancedBoxes items={parts.darkGlass} color="#354d59" roughness={0.22}
      metalness={0.14} />
    <InstancedBoxes items={parts.warmGlass} color="#dbb18a" emissive="#a86b45"
      emissiveIntensity={0.8} roughness={0.28} metalness={0.08} />
    <InstancedBoxes items={parts.coolGlass} color="#84b4bc" emissive="#508d98"
      emissiveIntensity={0.45} roughness={0.27} metalness={0.08} />
  </>
}
