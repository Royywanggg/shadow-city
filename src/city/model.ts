export type RoadKind = 'avenue' | 'street'
export type BuildingKind = 'terrace' | 'midrise' | 'tower' | 'industrial'
export type DistrictKind = 'civic' | 'core' | 'residential' | 'works'

export interface RoadNode {
  id: string
  x: number
  z: number
}

export interface RoadEdge {
  id: string
  from: string
  to: string
  width: number
  kind: RoadKind
}

export interface RoadNetwork {
  nodes: RoadNode[]
  edges: RoadEdge[]
}

export interface CityBlock {
  id: string
  column: number
  row: number
  x: number
  z: number
  width: number
  depth: number
  district: DistrictKind
  isPlaza: boolean
}

export interface Parcel {
  id: string
  blockId: string
  x: number
  z: number
  width: number
  depth: number
}

export interface Building {
  id: string
  parcelId: string
  kind: BuildingKind
  x: number
  z: number
  width: number
  depth: number
  height: number
  floors: number
  facadeTone: number
  roofTone: number
  accentTone: number
  baysX: number
  baysZ: number
  /** 0 = dark, 1 = warm, 2 = cool. Positive X face, then positive Z face. */
  windowPattern: number[]
  roofDetail: number
}

export interface Plaza {
  x: number
  z: number
  width: number
  depth: number
}

export interface CityModel {
  seed: string
  size: number
  roads: RoadNetwork
  blocks: CityBlock[]
  parcels: Parcel[]
  buildings: Building[]
  plaza: Plaza
}
