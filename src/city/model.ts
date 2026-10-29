export type RoadKind = 'avenue' | 'street'
export type BuildingKind =
  | 'residential'
  | 'apartment'
  | 'commercial'
  | 'office'
  | 'tower'
  | 'industrial'
  | 'civic'
  | 'corner'
  | 'landmark'
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
  isPark: boolean
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
  masses: BuildingMass[]
  windows: BuildingWindow[]
  roofDetail: number
  entrance: BuildingEntrance
}

export interface BuildingEntrance {
  /** World-space doorstep, just outside the ground-floor frontage. */
  x: number
  z: number
  face: 'south'
}

export interface BuildingMass {
  role: 'base' | 'body' | 'upper' | 'crown' | 'wing'
  offsetX: number
  offsetZ: number
  baseY: number
  width: number
  depth: number
  height: number
}

export interface BuildingWindow {
  offsetX: number
  offsetZ: number
  y: number
  width: number
  height: number
  face: 'x' | 'z'
  light: 0 | 1 | 2
}

export interface Plaza {
  x: number
  z: number
  width: number
  depth: number
}

export interface StreetFeature {
  id: string
  kind: 'lamp' | 'tree' | 'bench' | 'planter' | 'busStop'
  x: number
  z: number
  rotationY: number
  scale: number
  surfaceY?: number
}

export interface PedestrianNode {
  id: string
  x: number
  z: number
  surfaceY: number
  kind: 'sidewalk' | 'entrance' | 'publicSpace' | 'crossing'
}

export interface PedestrianEdge {
  id: string
  from: string
  to: string
  length: number
  costMm: number
  kind: 'sidewalk' | 'access' | 'crossing' | 'publicSpace'
  sourceRoadEdgeId?: string
}

export interface PedestrianAnchor {
  id: string
  nodeId: string
  kind: 'building' | 'plaza' | 'park' | 'publicEntrance' | 'street'
  buildingId?: string
  blockId?: string
}

export interface PedestrianNetwork {
  nodes: PedestrianNode[]
  edges: PedestrianEdge[]
  anchors: PedestrianAnchor[]
}

export interface CityModel {
  seed: string
  size: number
  roads: RoadNetwork
  blocks: CityBlock[]
  parcels: Parcel[]
  buildings: Building[]
  plaza: Plaza
  streetFeatures: StreetFeature[]
  pedestrian: PedestrianNetwork
}
