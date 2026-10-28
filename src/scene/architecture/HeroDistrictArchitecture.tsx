import { useMemo } from 'react'
import type { Building, BuildingMass } from '../../city/model'
import { InstancedBoxes, type BoxInstance } from '../InstancedBoxes'
import { architecturalTextures } from './ArchitecturalTextures'
import { RoofVents } from './RoofVents'

interface ArchitecturalDetails {
  masonry: BoxInstance[]
  paleStone: BoxInstance[]
  shadowStone: BoxInstance[]
  bronze: BoxInstance[]
  roof: BoxInstance[]
  roofMetal: BoxInstance[]
  darkGlass: BoxInstance[]
  warmGlass: BoxInstance[]
  cyanGlass: BoxInstance[]
}

type Point = [number, number, number]

function box(position: Point, scale: Point, color?: string): BoxInstance {
  return { position, scale, color }
}

function colorFor(building: Building): string {
  switch (building.kind) {
    case 'residential': return '#806d69'
    case 'apartment': return '#697a85'
    case 'commercial': return '#777d7d'
    case 'office': return '#657584'
    case 'tower': return '#647887'
    case 'industrial': return '#737472'
    case 'civic': return '#9aa4a2'
    case 'corner': return '#8a7670'
    case 'landmark': return '#7a8c96'
  }
}

function addFacade(building: Building, part: BuildingMass, details: ArchitecturalDetails): void {
  const x = building.x + part.offsetX
  const z = building.z + part.offsetZ
  const base = part.baseY
  const top = base + part.height
  const stone = building.kind === 'civic' || building.kind === 'commercial'
  const ribColor = colorFor(building)
  const bandColor = stone ? '#b6aaa0' : '#7e8c94'
  const bandTarget = stone ? details.paleStone : details.masonry
  const floorCount = Math.min(12, Math.max(2, Math.round(part.height / 3.35)))

  // Continuous thin bands give each floor a legible datum without replacing the massing.
  for (let floor = 1; floor < floorCount; floor += 1) {
    const y = base + part.height * floor / floorCount
    const projecting = floor === 1 || floor === floorCount - 1
    const depth = projecting ? 0.35 : 0.16
    const height = projecting ? 0.22 : 0.085
    for (const sign of [-1, 1]) {
      bandTarget.push(box([x, y, z + sign * (part.depth / 2 + depth / 2 - 0.025)],
        [part.width + 0.16, height, depth], bandColor))
      bandTarget.push(box([x + sign * (part.width / 2 + depth / 2 - 0.025), y, z],
        [depth, height, part.depth + 0.16], bandColor))
    }
  }

  const cornerHeight = Math.max(0.5, part.height - 0.15)
  const ribWidth = building.kind === 'civic' ? 0.43 : 0.25
  for (const sideX of [-1, 1]) {
    for (const sideZ of [-1, 1]) {
      details.masonry.push(box([x + sideX * (part.width / 2 - ribWidth / 2),
        base + cornerHeight / 2, z + sideZ * (part.depth / 2 - ribWidth / 2)],
      [ribWidth, cornerHeight, ribWidth], ribColor))
    }
  }

  const bays = building.kind === 'office' || building.kind === 'tower' ||
    building.kind === 'landmark' ? 4 : building.kind === 'industrial' ? 2 : 3
  for (let bay = 1; bay < bays; bay += 1) {
    const fx = x - part.width / 2 + part.width * bay / bays
    const fz = z - part.depth / 2 + part.depth * bay / bays
    const height = Math.max(1, part.height - 0.42)
    const width = stone ? 0.22 : 0.13
    for (const sign of [-1, 1]) {
      details.masonry.push(box([fx, base + part.height / 2, z + sign * (part.depth / 2 + 0.025)],
        [width, height, 0.14], ribColor))
      details.masonry.push(box([x + sign * (part.width / 2 + 0.025), base + part.height / 2, fz],
        [0.14, height, width], ribColor))
    }
  }

  if (part.role === 'crown' || part.role === 'upper') {
    const crown = stone ? details.paleStone : details.roofMetal
    crown.push(box([x, top + 0.1, z], [part.width + 0.35, 0.2, part.depth + 0.35], bandColor))
  }
}

function matchingPart(building: Building, window: Building['windows'][number]): BuildingMass {
  return [...building.masses].sort((a, b) => {
    const faceOf = (part: BuildingMass) => window.face === 'x'
      ? part.offsetX + part.width / 2 : part.offsetZ + part.depth / 2
    const windowFace = window.face === 'x' ? window.offsetX : window.offsetZ
    return Math.abs(faceOf(a) - windowFace) - Math.abs(faceOf(b) - windowFace)
  })[0]
}

function addWindowSurrounds(building: Building, details: ArchitecturalDetails): void {
  const casing = building.kind === 'civic' ? details.paleStone : details.masonry
  const casingColor = building.kind === 'residential' || building.kind === 'corner'
    ? '#ae9485' : building.kind === 'civic' ? '#c8c6b8' : '#8798a0'
  const paneTarget = (light: number) => light === 1 ? details.warmGlass
    : light === 2 ? details.cyanGlass : details.darkGlass

  for (const window of building.windows) {
    const shopGround = (building.kind === 'commercial' || building.kind === 'corner' ||
      building.kind === 'tower') && window.y < 5.3
    const bayIndex = Math.round((window.face === 'x' ? window.offsetZ : window.offsetX) * 0.45)
    const storeyIndex = Math.round(window.y / 3.35)
    const emphasizeFrame = !shopGround && (building.kind !== 'commercial' ||
      (bayIndex + storeyIndex + building.roofDetail) % 3 === 0)
    const part = matchingPart(building, window)
    const partX = building.x + part.offsetX
    const partZ = building.z + part.offsetZ
    const px = building.x + window.offsetX
    const pz = building.z + window.offsetZ
    const h = window.height
    const w = window.width
    const sillY = window.y - h / 2 - 0.1
    const headY = window.y + h / 2 + 0.13
    const jambHeight = h + 0.24
    const frameSize = 0.12

    if (window.face === 'x') {
      // Three layers create a shadowed reveal around the existing lit pane.
      const outerX = px + 0.16
      if (emphasizeFrame) {
        for (const sign of [-1, 1]) {
          casing.push(box([outerX, window.y, pz + sign * (w / 2 + 0.09)],
            [0.23, jambHeight, frameSize], casingColor))
        }
        casing.push(box([outerX, headY, pz], [0.28, 0.16, w + 0.38], casingColor))
        details.paleStone.push(box([outerX + 0.04, sillY, pz], [0.3, 0.13, w + 0.43], '#a5aaa6'))
      }

      const backX = 2 * partX - px - 0.09
      details.shadowStone.push(box([backX + 0.1, window.y, pz],
        [0.08, h + 0.27, w + 0.27], '#253540'))
      paneTarget(shopGround ? 0 : window.light).push(box([backX - 0.015, window.y, pz],
        [0.05, h, w], window.light === 0 || shopGround ? '#293d4b' : undefined))
      if (emphasizeFrame) {
        for (const sign of [-1, 1]) {
          casing.push(box([backX - 0.08, window.y, pz + sign * (w / 2 + 0.09)],
            [0.2, jambHeight, frameSize], casingColor))
        }
        casing.push(box([backX - 0.08, headY, pz], [0.24, 0.16, w + 0.38], casingColor))
      }
    } else {
      const outerZ = pz + 0.16
      if (emphasizeFrame) {
        for (const sign of [-1, 1]) {
          casing.push(box([px + sign * (w / 2 + 0.09), window.y, outerZ],
            [frameSize, jambHeight, 0.23], casingColor))
        }
        casing.push(box([px, headY, outerZ], [w + 0.38, 0.16, 0.28], casingColor))
        details.paleStone.push(box([px, sillY, outerZ + 0.04], [w + 0.43, 0.13, 0.3], '#a5aaa6'))
      }

      const backZ = 2 * partZ - pz - 0.09
      details.shadowStone.push(box([px, window.y, backZ + 0.1],
        [w + 0.27, h + 0.27, 0.08], '#253540'))
      paneTarget(shopGround ? 0 : window.light).push(box([px, window.y, backZ - 0.015],
        [w, h, 0.05], window.light === 0 || shopGround ? '#293d4b' : undefined))
      if (emphasizeFrame) {
        for (const sign of [-1, 1]) {
          casing.push(box([px + sign * (w / 2 + 0.09), window.y, backZ - 0.08],
            [frameSize, jambHeight, 0.2], casingColor))
        }
        casing.push(box([px, headY, backZ - 0.08], [w + 0.38, 0.16, 0.24], casingColor))
      }
    }
  }
}

function addGroundFloor(building: Building, details: ArchitecturalDetails): void {
  const front = building.masses[0]
  const x = building.x + front.offsetX
  const z = building.z + front.offsetZ + front.depth / 2
  const entryX = building.entrance.x
  const entryZ = building.entrance.z - 0.36
  const isShop = building.kind === 'commercial' || building.kind === 'corner' ||
    building.kind === 'tower'
  const portalWidth = building.kind === 'civic' ? Math.min(4.6, front.width * 0.18)
    : isShop ? 2.7 : 2.15
  const portalHeight = building.kind === 'civic' ? 3.9 : isShop ? 3.4 : 2.8
  const portalY = 0.95 + portalHeight / 2
  const portalZ = entryZ + 0.22

  details.shadowStone.push(box([entryX, portalY, portalZ],
    [portalWidth - 0.25, portalHeight - 0.12, 0.12], '#172531'))
  for (const sign of [-1, 1]) {
    details.paleStone.push(box([entryX + sign * portalWidth / 2, portalY, portalZ + 0.17],
      [0.25, portalHeight + 0.18, 0.45], '#a0a9a4'))
  }
  details.paleStone.push(box([entryX, 0.95 + portalHeight + 0.14, portalZ + 0.17],
    [portalWidth + 0.42, 0.29, 0.49], '#b4b7ae'))
  details.bronze.push(box([entryX, 0.95 + portalHeight * 0.55, portalZ + 0.26],
    [0.065, portalHeight * 0.79, 0.06], '#bca883'))
  details.warmGlass.push(box([entryX, 1.22, portalZ + 0.27],
    [Math.min(1.12, portalWidth * 0.4), 0.18, 0.07], '#d1a578'))

  if (isShop) {
    const bayCount = Math.max(2, Math.min(5, Math.floor(front.width / 3.2)))
    for (let index = 0; index < bayCount; index += 1) {
      const bayX = x - front.width * 0.39 + (index + 0.5) * front.width * 0.78 / bayCount
      const paneWidth = Math.max(0.65, front.width * 0.68 / bayCount)
      if (Math.abs(bayX - entryX) < (portalWidth + paneWidth) / 2 + 0.1) continue
      details.bronze.push(box([bayX, 2.85, z + 0.19], [0.11, 3.15, 0.16], '#b7a17f'))
      const lit = (index + building.roofDetail) % 3 === 1
      const target = lit ? details.warmGlass : details.darkGlass
      target.push(box([bayX, 2.76, z + 0.23],
        [paneWidth, 2.55, 0.07], lit ? '#746352' : '#35515c'))
      if (lit) details.warmGlass.push(box([bayX, 4.02, z + 0.27],
        [paneWidth * 0.86, 0.11, 0.055], '#8d7356'))
    }
  } else if (building.kind === 'civic') {
    for (const fraction of [-0.39, -0.25, 0.25, 0.39]) {
      details.paleStone.push(box([x + front.width * fraction, 4.28, z + 0.22],
        [0.55, 6.5, 0.55], '#c3c4b8'))
    }
    details.roof.push(box([x, 7.75, z + 0.24],
      [front.width * 0.86, 0.28, 0.74], '#697985'))
  }
}

function addRoof(building: Building, details: ArchitecturalDetails): void {
  const top = building.masses.at(-1)!
  const x = building.x + top.offsetX
  const z = building.z + top.offsetZ
  const y = top.baseY + top.height + 0.28
  const capped = building.kind === 'landmark' || building.kind === 'tower'
  const roofColor = capped ? '#415463' : building.kind === 'residential' ? '#48505b' : '#53616a'

  details.roof.push(box([x, y, z],
    [top.width * 0.88, 0.12, top.depth * 0.88], roofColor))
  if (building.kind === 'civic') {
    details.paleStone.push(box([x, y + 0.25, z],
      [top.width * 0.95, 0.26, top.depth * 0.95], '#b4b9b1'))
  } else {
    const count = Math.max(2, Math.min(4, Math.round(top.width / 5)))
    for (let i = 0; i < count; i += 1) {
      const rx = x - top.width * 0.32 + i * top.width * 0.64 / Math.max(1, count - 1)
      details.roofMetal.push(box([rx, y + 0.5, z - top.depth * 0.19],
        [Math.min(1.2, top.width * 0.15), 0.6, 1.1], '#88949b'))
      details.shadowStone.push(box([rx, y + 0.82, z - top.depth * 0.19],
        [Math.min(1.36, top.width * 0.17), 0.09, 1.25], '#263847'))
    }
  }

  if (capped) {
    const roofWidth = Math.min(4.5, top.width * 0.42)
    details.paleStone.push(box([x, y + 0.55, z],
      [roofWidth, 0.42, Math.min(4.5, top.depth * 0.42)], '#9daeb0'))
    details.roof.push(box([x, y + 0.83, z],
      [roofWidth + 0.32, 0.2, Math.min(4.8, top.depth * 0.46)], '#3c515d'))
  }
}

function addBuilding(building: Building, details: ArchitecturalDetails): void {
  for (const part of building.masses) addFacade(building, part, details)
  addWindowSurrounds(building, details)
  addGroundFloor(building, details)
  addRoof(building, details)
}

export function HeroDistrictArchitecture({ buildings }: { buildings: readonly Building[] }) {
  const maps = useMemo(() => architecturalTextures(), [])
  const details = useMemo(() => {
    const result: ArchitecturalDetails = {
      masonry: [], paleStone: [], shadowStone: [], bronze: [], roof: [], roofMetal: [],
      darkGlass: [], warmGlass: [], cyanGlass: [],
    }
    for (const building of buildings) addBuilding(building, result)
    return result
  }, [buildings])

  return <>
    <InstancedBoxes items={details.masonry} castShadow receiveShadow roughness={0.88} metalness={0}
      map={maps.stone.color} normalMap={maps.stone.normal} roughnessMap={maps.stone.roughness} />
    <InstancedBoxes items={details.paleStone} castShadow receiveShadow roughness={0.83} metalness={0}
      map={maps.concrete.color} normalMap={maps.concrete.normal} roughnessMap={maps.concrete.roughness} />
    <InstancedBoxes items={details.shadowStone} receiveShadow roughness={0.96} metalness={0} />
    <InstancedBoxes items={details.bronze} castShadow color="#b5a381" roughness={0.42} metalness={0.76} />
    <InstancedBoxes items={details.roof} castShadow receiveShadow roughness={0.83} metalness={0.06}
      map={maps.roof.color} normalMap={maps.roof.normal} roughnessMap={maps.roof.roughness} />
    <InstancedBoxes items={details.roofMetal} castShadow roughness={0.56} metalness={0.7} />
    <InstancedBoxes items={details.darkGlass} color="#294655" roughness={0.27} metalness={0.1} />
    <InstancedBoxes items={details.warmGlass} color="#e2b58b" dayColor="#425d6c" emissive="#b86a3e"
      emissiveIntensity={0.76} roughness={0.36} />
    <InstancedBoxes items={details.cyanGlass} color="#95bec4" dayColor="#426678" emissive="#55a4a7"
      emissiveIntensity={0.48} roughness={0.35} />
    <RoofVents buildings={buildings} />
  </>
}
