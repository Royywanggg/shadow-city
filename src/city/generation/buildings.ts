import type { Building, BuildingKind, BuildingMass, BuildingWindow, DistrictKind, Parcel } from '../model'
import { between } from './random'

function chooseKind(random: () => number, district: DistrictKind, column: number, row: number): BuildingKind {
  if (district === 'civic') return 'civic'
  if (column === 2 && row === 1) return 'landmark'
  if (column === 4 && row === 2) return 'tower'
  if ((column === 2 && row === 4) || (column === 4 && row === 3)) return 'corner'
  if (column === 1 && row === 2) return 'office'

  const choice = random()
  if (district === 'works') return choice < 0.62 ? 'industrial' : 'commercial'
  if (column + row >= 8) return choice < 0.45 ? 'residential' : choice < 0.7 ? 'commercial' : 'apartment'
  if (district === 'residential') return choice < 0.65 ? 'residential' : choice < 0.9 ? 'apartment' : 'commercial'
  if (Math.abs(column - 3) + Math.abs(row - 3) <= 2) {
    return choice < 0.43 ? 'commercial' : choice < 0.78 ? 'apartment' : 'office'
  }
  return choice < 0.33 ? 'apartment' : choice < 0.64 ? 'office' : choice < 0.83 ? 'commercial' : 'residential'
}

function targetHeight(random: () => number, kind: BuildingKind, column: number, row: number): number {
  const foreground = column + row >= 8
  switch (kind) {
    case 'residential': return between(random, 7.5, 12)
    case 'apartment': return between(random, 14, foreground ? 19 : 26)
    case 'commercial': return between(random, 9, foreground ? 13 : 16)
    case 'office': return between(random, foreground ? 18 : 22, foreground ? 26 : 38)
    case 'tower': return between(random, 55, 62)
    case 'landmark': return between(random, 64, 70)
    case 'corner': return between(random, 18, 25)
    case 'industrial': return between(random, 6.5, 10)
    case 'civic': return 16
  }
}

function mass(
  role: BuildingMass['role'],
  footprintWidth: number,
  footprintDepth: number,
  start: number,
  height: number,
  widthFactor: number,
  depthFactor: number,
  xFactor = 0,
  zFactor = 0,
): BuildingMass {
  return {
    role,
    offsetX: footprintWidth * xFactor,
    offsetZ: footprintDepth * zFactor,
    baseY: 0.95 + start,
    width: footprintWidth * widthFactor,
    depth: footprintDepth * depthFactor,
    height,
  }
}

function createMassing(kind: BuildingKind, width: number, depth: number, height: number, variant: number): BuildingMass[] {
  switch (kind) {
    case 'residential':
      return [mass('body', width, depth, 0, height, 0.93, 0.84)]
    case 'apartment':
      if (variant >= 2) return [
        mass('base', width, depth, 0, 3.5, 0.94, 0.9),
        mass('wing', width, depth, 3.5, height - 3.5, 0.39, 0.78, -0.26, 0.04),
        mass('body', width, depth, 3.5, height - 3.5, 0.39, 0.78, 0.26, 0.04),
      ]
      return [
        mass('base', width, depth, 0, height * 0.72, 0.94, 0.9),
        mass('upper', width, depth, height * 0.72, height * 0.28, 0.7, 0.7, -0.06, -0.05),
      ]
    case 'commercial':
      if (variant === 2) return [
        mass('base', width, depth, 0, 4.5, 0.97, 0.95),
        mass('upper', width, depth, 4.5, height - 4.5, 0.7, 0.82, 0.09, -0.04),
      ]
      return [
        mass('base', width, depth, 0, 4.5, 0.97, 0.95),
        mass('upper', width, depth, 4.5, height - 4.5, 0.79, 0.78, -0.04, -0.06),
      ]
    case 'office':
      return [
        mass('base', width, depth, 0, height * 0.2, 0.97, 0.95),
        mass('body', width, depth, height * 0.2, height * 0.55, 0.82, 0.78, 0.03, -0.02),
        mass('upper', width, depth, height * 0.75, height * 0.25, 0.64, 0.62, 0.07, -0.05),
      ]
    case 'tower':
      return [
        mass('base', width, depth, 0, height * 0.19, 0.98, 0.96),
        mass('body', width, depth, height * 0.19, height * 0.66, 0.62, 0.61, -0.04, 0.03),
        mass('crown', width, depth, height * 0.85, height * 0.15, 0.47, 0.48, -0.04, 0.03),
      ]
    case 'industrial':
      return [mass('body', width, depth, 0, height, 0.96, 0.91)]
    case 'civic':
      return [
        mass('base', width, depth, 0, height, 0.95, 0.81, 0, -0.07),
        mass('crown', width, depth, height, 4.2, 0.19, 0.42, 0, -0.07),
      ]
    case 'corner':
      return [
        mass('wing', width, depth, 0, height * 0.76, 0.94, 0.46, 0, 0.25),
        mass('body', width, depth, 0, height, 0.43, 0.88, 0.27, 0.02),
        mass('crown', width, depth, height, 2.2, 0.31, 0.31, 0.27, 0.25),
      ]
    case 'landmark':
      return [
        mass('base', width, depth, 0, height * 0.18, 0.96, 0.96),
        mass('body', width, depth, height * 0.18, height * 0.54, 0.72, 0.7, -0.07, 0.01),
        mass('upper', width, depth, height * 0.72, height * 0.21, 0.5, 0.52, 0.05, -0.04),
        mass('crown', width, depth, height * 0.93, height * 0.07, 0.34, 0.36, 0.05, -0.04),
      ]
  }
}

function createWindows(random: () => number, kind: BuildingKind, masses: BuildingMass[]): BuildingWindow[] {
  const windows: BuildingWindow[] = []
  const officeLike = kind === 'office' || kind === 'tower' || kind === 'landmark'
  for (const component of masses) {
    if (component.role === 'crown') continue
    const floorUnit = kind === 'industrial' || kind === 'civic' ? 4.4 : 3.35
    const floors = Math.max(1, Math.round(component.height / floorUnit))
    const floorHeight = component.height / floors
    for (const face of ['x', 'z'] as const) {
      const span = face === 'x' ? component.depth : component.width
      const targetBayWidth = kind === 'residential' ? 3.2 : officeLike ? 2.2 : kind === 'civic' ? 4.5 : 2.8
      const bays = Math.max(2, Math.min(10, Math.round(span / targetBayWidth)))
      let clusterStart = Math.floor(random() * bays)
      let activeFloor = random() < (officeLike ? 0.48 : 0.35)
      const lightColor: 1 | 2 = officeLike && random() < 0.72 ? 2 : 1
      for (let floor = 0; floor < floors; floor += 1) {
        if (random() < 0.18) activeFloor = !activeFloor
        if (random() < 0.18) clusterStart = Math.floor(random() * bays)
        const storefront = (kind === 'commercial' || kind === 'corner') && component.role === 'base' && floor === 0
        const windowHeight = storefront ? Math.min(3.15, floorHeight * 0.75)
          : kind === 'civic' ? Math.min(2.55, floorHeight * 0.65)
            : kind === 'industrial' ? Math.min(1.1, floorHeight * 0.3)
              : Math.min(1.5, floorHeight * (officeLike ? 0.54 : 0.46))
        const windowWidth = Math.min(storefront ? 2.5 : officeLike ? 1.55 : 1.35, (span / bays) * (storefront ? 0.73 : 0.53))
        for (let bay = 0; bay < bays; bay += 1) {
          const clusterDistance = Math.min(Math.abs(bay - clusterStart), bays - Math.abs(bay - clusterStart))
          const litChance = storefront
            ? clusterDistance <= Math.max(1, Math.floor(bays / 3)) ? 0.91 : 0.12
            : activeFloor && clusterDistance <= 1 ? 0.88 : 0.018
          const light: 0 | 1 | 2 = random() < litChance ? storefront ? 1 : lightColor : 0
          const offset = -span / 2 + ((bay + 0.5) * span) / bays
          windows.push({
            offsetX: component.offsetX + (face === 'x' ? component.width / 2 + 0.042 : offset),
            offsetZ: component.offsetZ + (face === 'z' ? component.depth / 2 + 0.042 : offset),
            y: component.baseY + (floor + 0.55) * floorHeight,
            width: windowWidth,
            height: windowHeight,
            face,
            light,
          })
        }
      }
    }
  }
  return windows
}

export function createBuilding(
  parcel: Parcel,
  district: DistrictKind,
  column: number,
  row: number,
  random: () => number,
): Building {
  const kind = chooseKind(random, district, column, row)
  const insetX = between(random, 0.72, 1.5)
  const insetZ = between(random, 0.72, 1.5)
  const width = parcel.width - insetX * 2
  const depth = parcel.depth - insetZ * 2
  const height = targetHeight(random, kind, column, row)
  const roofDetail = Math.floor(random() * 4)
  const masses = createMassing(kind, width, depth, height, roofDetail)
  return {
    id: `building-${parcel.id}`,
    parcelId: parcel.id,
    kind,
    x: parcel.x + between(random, -0.14, 0.14),
    z: parcel.z + between(random, -0.14, 0.14),
    width,
    depth,
    height,
    floors: Math.max(2, Math.round(height / 3.4)),
    facadeTone: Math.floor(random() * 5),
    roofTone: Math.floor(random() * 4),
    accentTone: Math.floor(random() * 3),
    masses,
    windows: createWindows(random, kind, masses),
    roofDetail,
  }
}
