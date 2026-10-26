import { useMemo } from 'react'
import type { Building, BuildingKind, CityModel } from '../city/model'
import { InstancedBoxes, type BoxInstance } from './InstancedBoxes'
import { RoofPrisms } from './RoofPrisms'
import { HeroDistrictArchitecture } from './architecture/HeroDistrictArchitecture'
import { ArchitecturalAssetDetails } from './architecture/ArchitecturalAssetDetails'
import { architecturalTextures } from './architecture/ArchitecturalTextures'
import { selectHeroBuildings } from './architecture/heroDistrict'

const facades: Record<BuildingKind, string[]> = {
  residential: ['#5e6974', '#667078', '#6e6d70'],
  apartment: ['#566c7d', '#607487', '#53667a'],
  commercial: ['#405a69', '#4c6572', '#556c74'],
  office: ['#4b6679', '#536e80', '#5b7281'],
  tower: ['#455f72', '#4f687a', '#587283'],
  industrial: ['#59636b', '#666568', '#586a70'],
  civic: ['#7a858a', '#879092', '#75828a'],
  corner: ['#5c6772', '#68727c', '#596e7b'],
  landmark: ['#526b7b', '#5d7584', '#657b89'],
}
const roofs = ['#293c4d', '#344959', '#3d5160', '#465866']
const trim = ['#607889', '#718897', '#586f80']

interface BuildingGeometry {
  shells: BoxInstance[]
  heroBrickShells: BoxInstance[]
  heroStoneShells: BoxInstance[]
  heroConcreteShells: BoxInstance[]
  ledges: BoxInstance[]
  parapets: BoxInstance[]
  roofPrisms: BoxInstance[]
  roofEquipment: BoxInstance[]
  facadeRibs: BoxInstance[]
  balconySlabs: BoxInstance[]
  balconyRails: BoxInstance[]
  entries: BoxInstance[]
  windowFrames: BoxInstance[]
  darkWindows: BoxInstance[]
  warmWindows: BoxInstance[]
  coolWindows: BoxInstance[]
  storefronts: BoxInstance[]
  warmSigns: BoxInstance[]
  coolAccents: BoxInstance[]
}

function box(position: [number, number, number], scale: [number, number, number], color?: string): BoxInstance {
  return { position, scale, color }
}

function addMassing(building: Building, geometry: BuildingGeometry, hero: boolean) {
  const wallColor = facades[building.kind][building.facadeTone % 3]
  const roofColor = building.kind === 'residential' ? '#4c5964' : roofs[building.roofTone]
  const trimColor = trim[building.accentTone]
  const pitched = building.kind === 'residential' || building.kind === 'industrial'

  building.masses.forEach((part, index) => {
    const px = building.x + part.offsetX
    const pz = building.z + part.offsetZ
    const top = part.baseY + part.height
    const color = part.role === 'base' ? '#354a5a' : part.role === 'crown' ? '#6c8290' : wallColor
    const shells = !hero ? geometry.shells
      : building.kind === 'residential' || building.kind === 'corner' || building.kind === 'commercial'
        ? geometry.heroBrickShells
        : building.kind === 'civic' || building.kind === 'industrial'
          ? geometry.heroConcreteShells : geometry.heroStoneShells
    shells.push(box([px, part.baseY + part.height / 2, pz], [part.width, part.height, part.depth],
      building.kind === 'civic' && index === 0 ? '#77858b' : color))

    const cap = pitched ? 0.18 : 0.24
    geometry.ledges.push(box([px, top + cap / 2, pz], [part.width + 0.55, cap, part.depth + 0.55], roofColor))
    const needsParapet = index === building.masses.length - 1
      || (part.role === 'base' && (building.kind === 'office' || building.kind === 'tower' || building.kind === 'landmark'))
    if (!pitched && part.role !== 'crown' && needsParapet) {
      for (const sign of [-1, 1]) {
        geometry.parapets.push(box([px, top + 0.44, pz + sign * part.depth / 2], [part.width + 0.55, 0.53, 0.22], trimColor))
        geometry.parapets.push(box([px + sign * part.width / 2, top + 0.44, pz], [0.22, 0.53, part.depth + 0.55], trimColor))
      }
    }
  })

  const topPart = building.masses[building.masses.length - 1]
  const roofX = building.x + topPart.offsetX
  const roofZ = building.z + topPart.offsetZ
  const roofY = topPart.baseY + topPart.height
  if (pitched) {
    if (building.kind === 'industrial') {
      for (const lane of [-1, 0, 1]) {
        geometry.roofPrisms.push(box([
          roofX + lane * topPart.width * 0.31, roofY + 0.2, roofZ,
        ], [topPart.width * 0.3, 2.25, topPart.depth * 0.92], roofColor))
      }
    } else {
      for (const part of building.masses) {
        geometry.roofPrisms.push(box([
          building.x + part.offsetX, part.baseY + part.height + 0.2, building.z + part.offsetZ,
        ], [part.width * 0.95, part.role === 'wing' ? 1.8 : 2.7, part.depth * 0.92], roofColor))
      }
    }
  }
  if (building.kind === 'civic') {
    geometry.roofPrisms.push(box([roofX, roofY + 0.18, roofZ], [topPart.width * 0.98, 1.8, topPart.depth * 0.95], '#889ca2'))
  }
  if (building.kind === 'apartment' && building.roofDetail === 1) {
    geometry.roofPrisms.push(box([roofX, roofY + 0.21, roofZ],
      [topPart.width * 0.91, 3.1, topPart.depth * 0.89], '#4d606b'))
  }
  if (building.kind === 'commercial' && building.roofDetail % 2 === 1) {
    geometry.roofEquipment.push(box([roofX, roofY + 1.35, roofZ - topPart.depth * 0.1],
      [topPart.width * 0.38, 2.5, topPart.depth * 0.55], '#657b85'))
  }
  if (building.kind !== 'residential') {
    const equipmentBase = building.kind === 'civic' ? building.masses[0] : topPart
    const ey = equipmentBase.baseY + equipmentBase.height + 0.75
    if (building.roofDetail !== 0) {
      const side = building.roofDetail % 2 === 0 ? 1 : -1
      geometry.roofEquipment.push(box([
        building.x + equipmentBase.offsetX + side * equipmentBase.width * 0.18,
        ey,
        building.z + equipmentBase.offsetZ - equipmentBase.depth * 0.13,
      ], [Math.min(3.2, equipmentBase.width * 0.27), 1.2, Math.min(3.4, equipmentBase.depth * 0.31)], '#7c8c93'))
      if (building.roofDetail === 3) {
        geometry.roofEquipment.push(box([
          building.x + equipmentBase.offsetX - equipmentBase.width * 0.18,
          ey - 0.2,
          building.z + equipmentBase.offsetZ + equipmentBase.depth * 0.15,
        ], [1.1, 0.8, 1.35], '#98a4a6'))
      }
    }
  }
  if (building.kind === 'tower' || building.kind === 'landmark') {
    geometry.roofEquipment.push(box([roofX, roofY + 2.2, roofZ], [0.15, 3.8, 0.15], '#a4b7bb'))
    geometry.coolAccents.push(box([roofX, roofY + 4.16, roofZ], [0.42, 0.24, 0.42]))
    if (building.kind === 'landmark') {
      const edgeY = roofY - topPart.height * 0.28
      for (const side of [-1, 1]) {
        geometry.coolAccents.push(box([roofX, edgeY, roofZ + side * topPart.depth * 0.5], [topPart.width, 0.18, 0.13]))
        geometry.coolAccents.push(box([roofX + side * topPart.width * 0.5, edgeY, roofZ], [0.13, 0.18, topPart.depth]))
        geometry.roofEquipment.push(box([roofX + side * topPart.width * 0.62, roofY + 2.7, roofZ],
          [0.34, 5.4, 0.72], '#8aabb0'))
      }
    }
  }
}

function addWindows(building: Building, geometry: BuildingGeometry, hero: boolean) {
  for (const window of building.windows) {
    const px = building.x + window.offsetX
    const pz = building.z + window.offsetZ
    const paneScale: [number, number, number] = window.face === 'x'
      ? [0.055, window.height, window.width]
      : [window.width, window.height, 0.055]
    const frameScale: [number, number, number] = window.face === 'x'
      ? [0.085, window.height + 0.16, window.width + 0.15]
      : [window.width + 0.15, window.height + 0.16, 0.085]
    geometry.windowFrames.push(box([px, window.y, pz], frameScale,
      building.kind === 'civic' ? '#9ba9aa' : '#536e7e'))
    const panePosition: [number, number, number] = window.face === 'x'
      ? [px + 0.025, window.y, pz]
      : [px, window.y, pz + 0.025]
    const shopGround = hero && (building.kind === 'commercial' || building.kind === 'corner'
      || building.kind === 'tower') && window.y < 5.3
    const target = shopGround ? geometry.darkWindows
      : window.light === 1 ? geometry.warmWindows
        : window.light === 2 ? geometry.coolWindows : geometry.darkWindows
    target.push(box(panePosition, paneScale))
  }
}

function addStreetFront(building: Building, geometry: BuildingGeometry) {
  const front = building.masses[0]
  const fx = building.x + front.offsetX
  const fz = building.z + front.offsetZ + front.depth / 2
  const doorwayX = building.entrance.x
  const doorwayZ = building.entrance.z - 0.36
  const right = building.x + front.offsetX + front.width / 2
  const shop = building.kind === 'commercial' || building.kind === 'corner' || building.kind === 'tower'
  if (shop) {
    geometry.storefronts.push(box([fx, 3.0, fz + 0.11], [front.width * 0.78, 3.25, 0.12], '#274c5a'))
    geometry.storefronts.push(box([right + 0.11, 3.0, building.z + front.offsetZ], [0.12, 3.25, front.depth * 0.7], '#274c5a'))
    geometry.ledges.push(box([fx, 4.75, fz + 0.52], [front.width * 0.89, 0.29, 1.05], '#879aa2'))
    geometry.warmSigns.push(box([fx, 4.29, fz + 0.2], [Math.min(4.8, front.width * 0.44), 0.24, 0.12]))
    geometry.entries.push(box([doorwayX, 1.85, doorwayZ + 0.2], [1.5, 2.45, 0.15], '#1d3743'))
  } else if (building.kind === 'industrial') {
    geometry.entries.push(box([doorwayX, 2.95, doorwayZ + 0.1], [Math.min(5, front.width * 0.52), 3.6, 0.11], '#2b4856'))
    geometry.ledges.push(box([fx, 5.0, fz + 0.28], [Math.min(5.5, front.width * 0.57), 0.3, 0.55], '#8b9699'))
  } else if (building.kind === 'civic') {
    const count = Math.max(5, Math.min(11, Math.round(front.width / 4.2)))
    for (let index = 0; index < count; index += 1) {
      const x = fx - front.width * 0.43 + (index * front.width * 0.86) / (count - 1)
      geometry.facadeRibs.push(box([x, 4.0, fz + 0.9], [0.65, 6.0, 0.65], '#bcc7c4'))
    }
    geometry.ledges.push(box([fx, 7.12, fz + 0.95], [front.width * 0.94, 0.58, 1.9], '#acb9b8'))
    geometry.entries.push(box([doorwayX, 2.65, doorwayZ + 0.35], [Math.min(4.6, front.width * 0.17), 3.3, 0.2], '#1e3542'))
  } else {
    geometry.entries.push(box([doorwayX, 1.9, doorwayZ + 0.09], [1.65, 2.15, 0.12], '#243b4a'))
    geometry.ledges.push(box([doorwayX, 3.15, doorwayZ + 0.42], [2.1, 0.18, 0.86], '#8b9ca5'))
  }
}

function addFacadeFeatures(building: Building, geometry: BuildingGeometry) {
  const kind = building.kind
  const main = building.masses.find((part) => part.role === 'body') ?? building.masses[0]
  const px = building.x + main.offsetX
  const pz = building.z + main.offsetZ
  const front = pz + main.depth / 2
  const side = px + main.width / 2
  const contrast = trim[building.accentTone]

  if (kind === 'office' || kind === 'tower' || kind === 'landmark') {
    for (const fraction of [-0.33, 0, 0.33]) {
      geometry.facadeRibs.push(box([px + main.width * fraction, main.baseY + main.height / 2, front + 0.22],
        [0.3, main.height * 0.96, 0.42], contrast))
      geometry.facadeRibs.push(box([side + 0.22, main.baseY + main.height / 2, pz + main.depth * fraction],
        [0.42, main.height * 0.96, 0.3], contrast))
    }
  }
  if (kind === 'apartment') {
    const floors = Math.max(3, Math.round(main.height / 3.3))
    for (let floor = 1; floor < floors; floor += 2) {
      const y = main.baseY + (floor * main.height) / floors
      geometry.balconySlabs.push(box([px, y, front + 0.48], [main.width * 0.82, 0.16, 1.0], '#8398a4'))
      geometry.balconyRails.push(box([px, y + 0.62, front + 0.94], [main.width * 0.82, 0.72, 0.06], '#718a96'))
    }
  }
  if (kind === 'residential') {
    const roofY = main.baseY + main.height
    for (const sign of [-1, 1]) {
      geometry.roofEquipment.push(box([px + sign * main.width * 0.22, roofY + 1.0, front - 0.72], [1.25, 1.0, 1.1], '#7a8c95'))
    }
  }
  if (kind === 'landmark') {
    geometry.coolAccents.push(box([side + 0.16, main.baseY + main.height * 0.72, pz], [0.12, main.height * 0.38, 0.32]))
  } else if (kind === 'tower') {
    geometry.coolAccents.push(box([side + 0.13, main.baseY + main.height * 0.8, pz], [0.12, 0.28, main.depth * 0.58]))
  }
}

function addBuilding(building: Building, geometry: BuildingGeometry, hero: boolean) {
  addMassing(building, geometry, hero)
  addWindows(building, geometry, hero)
  if (!hero) addStreetFront(building, geometry)
  addFacadeFeatures(building, geometry)
}

export function Buildings({ city }: { city: CityModel }) {
  const heroBuildings = useMemo(() => selectHeroBuildings(city), [city])
  const maps = useMemo(() => architecturalTextures(), [])
  const geometry = useMemo(() => {
    const result: BuildingGeometry = {
      shells: [], heroBrickShells: [], heroStoneShells: [], heroConcreteShells: [],
      ledges: [], parapets: [], roofPrisms: [], roofEquipment: [], facadeRibs: [],
      balconySlabs: [], balconyRails: [], entries: [], windowFrames: [], darkWindows: [],
      warmWindows: [], coolWindows: [], storefronts: [], warmSigns: [], coolAccents: [],
    }
    const heroIds = new Set(heroBuildings.map((building) => building.id))
    city.buildings.forEach((building) => addBuilding(building, result, heroIds.has(building.id)))
    return result
  }, [city, heroBuildings])

  return (
    <>
      <InstancedBoxes items={geometry.shells} castShadow receiveShadow roughness={0.87}
        metalness={0.04} map={maps.concrete.color} normalMap={maps.concrete.normal}
        roughnessMap={maps.concrete.roughness} textureWorldScale={6} />
      <InstancedBoxes items={geometry.heroBrickShells} castShadow receiveShadow roughness={0.92}
        metalness={0} map={maps.brick.color} normalMap={maps.brick.normal}
        roughnessMap={maps.brick.roughness} textureWorldScale={3} />
      <InstancedBoxes items={geometry.heroStoneShells} castShadow receiveShadow roughness={0.9}
        metalness={0} map={maps.stone.color} normalMap={maps.stone.normal}
        roughnessMap={maps.stone.roughness} textureWorldScale={8} />
      <InstancedBoxes items={geometry.heroConcreteShells} castShadow receiveShadow roughness={0.9}
        metalness={0} map={maps.concrete.color} normalMap={maps.concrete.normal}
        roughnessMap={maps.concrete.roughness} textureWorldScale={6} />
      <InstancedBoxes items={geometry.ledges} castShadow roughness={0.74} metalness={0.21} />
      <InstancedBoxes items={geometry.parapets} castShadow roughness={0.8} />
      <RoofPrisms items={geometry.roofPrisms} />
      <InstancedBoxes items={geometry.roofEquipment} castShadow roughness={0.62} metalness={0.32} />
      <InstancedBoxes items={geometry.facadeRibs} castShadow roughness={0.73} metalness={0.15} />
      <InstancedBoxes items={geometry.balconySlabs} castShadow roughness={0.72} />
      <InstancedBoxes items={geometry.balconyRails} roughness={0.52} metalness={0.35} />
      <InstancedBoxes items={geometry.entries} roughness={0.58} metalness={0.23} />
      <InstancedBoxes items={geometry.windowFrames} roughness={0.56} metalness={0.25} />
      <InstancedBoxes items={geometry.darkWindows} color="#182c3d" roughness={0.4} metalness={0.37} />
      <InstancedBoxes items={geometry.warmWindows} color="#ebb881" emissive="#d99051" emissiveIntensity={1.25} roughness={0.36} />
      <InstancedBoxes items={geometry.coolWindows} color="#9cbcc2" emissive="#65aeb8" emissiveIntensity={0.95} roughness={0.36} />
      <InstancedBoxes items={geometry.storefronts} roughness={0.32} metalness={0.45} />
      <InstancedBoxes items={geometry.warmSigns} color="#e6ab73" emissive="#dd8e4f" emissiveIntensity={1.45} />
      <InstancedBoxes items={geometry.coolAccents} color="#9ed8d3" emissive="#4bb3ad" emissiveIntensity={1.15} />
      <HeroDistrictArchitecture buildings={heroBuildings} />
      <ArchitecturalAssetDetails buildings={heroBuildings} />
    </>
  )
}
