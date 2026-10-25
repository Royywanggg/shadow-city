import { useMemo } from 'react'
import type { Building, CityModel } from '../city/model'
import { InstancedBoxes, type BoxInstance } from './InstancedBoxes'
import { RoofPrisms } from './RoofPrisms'

const facadeColors = ['#4a6075', '#536c80', '#5e7387', '#44596e', '#6a7889']
const roofColors = ['#2b3e51', '#32485c', '#3c5063', '#46596a']
const trimColors = ['#7a91a0', '#8b9da9', '#6f8a9d']

interface BuildingGeometry {
  bodies: BoxInstance[]
  plinths: BoxInstance[]
  cornices: BoxInstance[]
  roofs: BoxInstance[]
  roofPrisms: BoxInstance[]
  rooftop: BoxInstance[]
  facadeDetails: BoxInstance[]
  parapets: BoxInstance[]
  roofPanels: BoxInstance[]
  entries: BoxInstance[]
  civicColumns: BoxInstance[]
  darkWindows: BoxInstance[]
  warmWindows: BoxInstance[]
  coolWindows: BoxInstance[]
  accents: BoxInstance[]
  signs: BoxInstance[]
}

function addBuilding(building: Building, geometry: BuildingGeometry) {
  const { x, z, width, depth, height } = building
  const facadeColor = facadeColors[building.facadeTone]
  const roofColor = roofColors[building.roofTone]
  const trimColor = trimColors[building.accentTone]
  const isTower = building.kind === 'tower'
  const isIndustrial = building.kind === 'industrial'
  const isCivic = building.kind === 'civic'

  geometry.plinths.push({
    position: [x, 0.48, z],
    scale: [width + 0.45, 0.92, depth + 0.45],
    color: '#273b4d',
  })
  geometry.bodies.push({
    position: [x, 0.95 + height / 2, z],
    scale: [width, height, depth],
    color: isCivic ? '#657988' : facadeColor,
  })

  const bandHeight = isIndustrial ? 0.3 : 0.42
  geometry.cornices.push({
    position: [x, 1.26, z],
    scale: [width + 0.4, bandHeight, depth + 0.4],
    color: trimColor,
  })
  geometry.cornices.push({
    position: [x, 0.95 + height - 0.24, z],
    scale: [width + 0.5, 0.36, depth + 0.5],
    color: trimColor,
  })
  if (height > 17 && !isIndustrial) {
    geometry.cornices.push({
      position: [x, 0.95 + height * 0.62, z],
      scale: [width + 0.18, 0.18, depth + 0.18],
      color: trimColor,
    })
  }

  if (building.kind === 'midrise' || isTower) {
    const ribColor = trimColors[(building.accentTone + 1) % trimColors.length]
    for (const side of [-1, 1]) {
      geometry.facadeDetails.push({
        position: [x + side * (width / 2 - 0.42), 0.95 + height / 2, z + depth / 2 + 0.08],
        scale: [0.26, height * 0.95, 0.22],
        color: ribColor,
      })
      geometry.facadeDetails.push({
        position: [x + width / 2 + 0.08, 0.95 + height / 2, z + side * (depth / 2 - 0.42)],
        scale: [0.22, height * 0.95, 0.26],
        color: ribColor,
      })
    }
    for (let floor = 3; floor < building.floors; floor += 3) {
      const bandY = 0.95 + (floor * height) / building.floors
      geometry.facadeDetails.push({
        position: [x, bandY, z + depth / 2 + 0.055],
        scale: [width + 0.12, 0.11, 0.14],
        color: ribColor,
      })
      geometry.facadeDetails.push({
        position: [x + width / 2 + 0.055, bandY, z],
        scale: [0.14, 0.11, depth + 0.12],
        color: ribColor,
      })
    }
  }

  geometry.entries.push({
    position: [x, 2.0, z + depth / 2 + 0.09],
    scale: [Math.min(width * (isIndustrial ? 0.46 : 0.25), 3.8), 2.25, 0.09],
    color: isIndustrial ? '#243d4e' : '#182c3c',
  })

  if (isCivic) {
    const columns = Math.max(5, Math.floor(width / 4.4))
    for (let index = 0; index < columns; index += 1) {
      geometry.civicColumns.push({
        position: [x - width * 0.43 + (index * width * 0.86) / (columns - 1), 3.9, z + depth / 2 + 0.65],
        scale: [0.64, 5.5, 0.64],
        color: '#b0b7b1',
      })
    }
    geometry.cornices.push({
      position: [x, 6.7, z + depth / 2 + 0.78],
      scale: [width * 0.93, 0.52, 1.65],
      color: '#aeb9b6',
    })
    geometry.roofs.push({
      position: [x, height + 2.2, z],
      scale: [width * 0.2, 2.5, depth * 0.5],
      color: '#617b88',
    })
    geometry.roofPrisms.push({
      position: [x, height + 3.5, z],
      scale: [width * 0.2, 1.7, depth * 0.5],
      color: '#85979c',
    })
  }
  geometry.entries.push({
    position: [x, 3.15, z + depth / 2 + 0.45],
    scale: [Math.min(width * (isIndustrial ? 0.54 : 0.31), 4.3), 0.16, 0.9],
    color: trimColor,
  })

  geometry.roofs.push({
    position: [x, 1.08 + height, z],
    scale: [width + 0.56, 0.33, depth + 0.56],
    color: roofColor,
  })
  if (!isIndustrial && building.kind !== 'terrace') {
    const parapetY = height + 1.52
    for (const sign of [-1, 1]) {
      geometry.parapets.push({
        position: [x, parapetY, z + sign * (depth / 2 + 0.15)],
        scale: [width + 0.55, 0.56, 0.24],
        color: trimColor,
      })
      geometry.parapets.push({
        position: [x + sign * (width / 2 + 0.15), parapetY, z],
        scale: [0.24, 0.56, depth + 0.55],
        color: trimColor,
      })
    }
    geometry.roofPanels.push({
      position: [x - width * 0.18, height + 1.3, z + depth * 0.16],
      scale: [Math.max(1.5, width * 0.24), 0.04, Math.max(1.2, depth * 0.22)],
      color: '#537583',
    })
  }
  if (isTower) {
    geometry.roofs.push({
      position: [x, 1.8 + height, z],
      scale: [width * 0.76, 1.25, depth * 0.78],
      color: facadeColor,
    })
    geometry.cornices.push({
      position: [x, 2.57 + height, z],
      scale: [width * 0.83, 0.34, depth * 0.85],
      color: trimColor,
    })
  } else if (building.kind === 'midrise') {
    geometry.roofs.push({
      position: [x - width * 0.08, 1.65 + height, z - depth * 0.06],
      scale: [width * 0.64, 0.94, depth * 0.58],
      color: roofColor,
    })
  } else if (building.kind === 'terrace' || isIndustrial) {
    geometry.roofPrisms.push({
      position: [x, 1.25 + height, z],
      scale: [width * 0.94, isIndustrial ? 1.4 : 2.2, depth * 0.92],
      color: roofColor,
    })
  }

  const detailX = x + width * (building.roofDetail % 2 === 0 ? 0.19 : -0.16)
  const detailZ = z + depth * (building.roofDetail > 1 ? 0.16 : -0.19)
  geometry.rooftop.push({
    position: [detailX, height + 1.7 + (isTower ? 1.4 : 0), detailZ],
    scale: [Math.min(width * 0.29, 3.3), 1.15, Math.min(depth * 0.3, 3.5)],
    color: '#758692',
  })
  if (height > 18) {
    geometry.rooftop.push({
      position: [x - width * 0.25, height + 1.55, z + depth * 0.23],
      scale: [1.1, 0.85, 1.35],
      color: '#8a98a0',
    })
  }
  if (isTower) {
    geometry.rooftop.push({
      position: [x + width * 0.12, height + 4.15, z - depth * 0.11],
      scale: [0.16, 3.1, 0.16],
      color: '#92a6ab',
    })
  }

  const floorHeight = height / building.floors
  for (let floor = 0; floor < building.floors; floor += 1) {
    const y = 0.95 + (floor + 0.53) * floorHeight
    const windowHeight = Math.min(1.48, floorHeight * 0.47)
    for (let bay = 0; bay < building.baysZ; bay += 1) {
      const lit = building.windowPattern[floor * (building.baysZ + building.baysX) + bay]
      const target = lit === 1 ? geometry.warmWindows : lit === 2 ? geometry.coolWindows : geometry.darkWindows
      target.push({
        position: [x + width / 2 + 0.034, y, z - depth / 2 + ((bay + 0.5) * depth) / building.baysZ],
        scale: [0.055, windowHeight, Math.min(1.15, depth / building.baysZ * 0.48)],
      })
    }
    for (let bay = 0; bay < building.baysX; bay += 1) {
      const lit = building.windowPattern[floor * (building.baysZ + building.baysX) + building.baysZ + bay]
      const target = lit === 1 ? geometry.warmWindows : lit === 2 ? geometry.coolWindows : geometry.darkWindows
      target.push({
        position: [x - width / 2 + ((bay + 0.5) * width) / building.baysX, y, z + depth / 2 + 0.034],
        scale: [Math.min(1.15, width / building.baysX * 0.48), windowHeight, 0.055],
      })
    }
  }

  if (isTower || (building.kind === 'midrise' && building.accentTone === 1)) {
    geometry.accents.push({
      position: [x + width / 2 + 0.09, height * 0.84, z],
      scale: [0.1, isTower ? 0.32 : 0.14, depth * 0.58],
      color: isTower ? '#6cc3ba' : '#ad8b68',
    })
  }
  if (building.accentTone === 2 && height > 15) {
    geometry.signs.push({
      position: [x, 4.15, z + depth / 2 + 0.12],
      scale: [Math.min(width * 0.48, 4.2), 0.28, 0.12],
    })
  }
}

export function Buildings({ city }: { city: CityModel }) {
  const geometry = useMemo(() => {
    const result: BuildingGeometry = {
      bodies: [],
      plinths: [],
      cornices: [],
      roofs: [],
      roofPrisms: [],
      rooftop: [],
      facadeDetails: [],
      parapets: [],
      roofPanels: [],
      entries: [],
      civicColumns: [],
      darkWindows: [],
      warmWindows: [],
      coolWindows: [],
      accents: [],
      signs: [],
    }
    city.buildings.forEach((building) => addBuilding(building, result))
    return result
  }, [city])

  return (
    <>
      <InstancedBoxes items={geometry.plinths} castShadow receiveShadow roughness={0.91} />
      <InstancedBoxes items={geometry.bodies} castShadow receiveShadow roughness={0.79} metalness={0.12} />
      <InstancedBoxes items={geometry.cornices} castShadow roughness={0.7} metalness={0.2} />
      <InstancedBoxes items={geometry.facadeDetails} castShadow roughness={0.68} metalness={0.16} />
      <InstancedBoxes items={geometry.entries} roughness={0.59} metalness={0.2} />
      <InstancedBoxes items={geometry.civicColumns} castShadow roughness={0.7} metalness={0.08} />
      <InstancedBoxes items={geometry.roofs} castShadow roughness={0.85} />
      <InstancedBoxes items={geometry.parapets} castShadow roughness={0.77} />
      <InstancedBoxes items={geometry.roofPanels} roughness={0.35} metalness={0.42} />
      <RoofPrisms items={geometry.roofPrisms} />
      <InstancedBoxes items={geometry.rooftop} castShadow roughness={0.68} metalness={0.35} />
      <InstancedBoxes items={geometry.darkWindows} color="#22364a" roughness={0.45} metalness={0.35} />
      <InstancedBoxes items={geometry.warmWindows} color="#f4b878" emissive="#ef9b4a" emissiveIntensity={1.8} roughness={0.35} />
      <InstancedBoxes items={geometry.coolWindows} color="#8acbd0" emissive="#54bfc4" emissiveIntensity={1.4} roughness={0.35} />
      <InstancedBoxes items={geometry.accents} emissive="#42c9be" emissiveIntensity={1.25} roughness={0.4} />
      <InstancedBoxes items={geometry.signs} color="#d6a06c" emissive="#e18a4c" emissiveIntensity={1.4} roughness={0.4} />
    </>
  )
}
