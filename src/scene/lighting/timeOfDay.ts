export interface LightingState {
  readonly worldSeconds: number
  readonly phase: string
  readonly sunDirection: readonly [number, number, number]
  readonly sunIntensity: number
  readonly sunColor: string
  readonly moonIntensity: number
  readonly ambientIntensity: number
  readonly ambientColor: string
  readonly hemisphereIntensity: number
  readonly skyColor: string
  readonly horizonColor: string
  readonly fogColor: string
  readonly fogDensity: number
  readonly environmentIntensity: number
  readonly nightBlend: number
  readonly windowEmission: number
  readonly streetlightIntensity: number
  readonly exposure: number
}

type Keyframe = Readonly<{
  hour: number; phase: string; sky: string; horizon: string; fog: string;
  sun: number; sunColor: string; moon: number; ambient: number;
  ambientColor: string; hemisphere: number; night: number; windows: number;
  street: number; environment: number; exposure: number; fogDensity: number
}>

// The first and last entries share all visual values, including the midnight direction.
const KEYFRAMES: readonly Keyframe[] = [
  { hour: 0, phase: 'Late night', sky: '#02060b', horizon: '#050b14', fog: '#08111f',
    sun: 0, sunColor: '#fff4e5', moon: 2.65, ambient: .72, ambientColor: '#91a9c1',
    hemisphere: 1.02, night: 1, windows: .72, street: 1, environment: .42,
    exposure: 1.2, fogDensity: .00235 },
  { hour: 4, phase: 'Pre-dawn', sky: '#081424', horizon: '#1d263b', fog: '#111b2b',
    sun: 0, sunColor: '#e9ad83', moon: 2.15, ambient: .78, ambientColor: '#94acc0',
    hemisphere: 1.04, night: .9, windows: .66, street: 1, environment: .42,
    exposure: 1.2, fogDensity: .0018 },
  { hour: 6, phase: 'Sunrise', sky: '#243b57', horizon: '#664c56', fog: '#31465b',
    sun: .55, sunColor: '#f3ad79', moon: .58, ambient: 1.02, ambientColor: '#a4b7c6',
    hemisphere: 1.18, night: .44, windows: .38, street: .47, environment: .55,
    exposure: 1.12, fogDensity: .0012 },
  { hour: 7, phase: 'Sunrise', sky: '#345f83', horizon: '#7a6a69', fog: '#566d81',
    sun: 2.1, sunColor: '#f7d4ad', moon: .12, ambient: 1.12, ambientColor: '#b7c5ce',
    hemisphere: 1.3, night: .12, windows: .1, street: .1, environment: .56,
    exposure: 1.06, fogDensity: .00075 },
  { hour: 9, phase: 'Morning', sky: '#24527f', horizon: '#658ba7', fog: '#6e91a6',
    sun: 2.65, sunColor: '#fff0db', moon: 0, ambient: .88, ambientColor: '#b9c7d0',
    hemisphere: 1.05, night: 0, windows: .035, street: 0, environment: .58,
    exposure: 1.03, fogDensity: .00065 },
  { hour: 12, phase: 'Noon', sky: '#255682', horizon: '#668faa', fog: '#7195ad',
    sun: 2.85, sunColor: '#fff4e5', moon: 0, ambient: .9, ambientColor: '#b9c7d0',
    hemisphere: 1.08, night: 0, windows: .025, street: 0, environment: .6,
    exposure: 1.02, fogDensity: .0006 },
  { hour: 16, phase: 'Afternoon', sky: '#3a5f82', horizon: '#766e70', fog: '#647286',
    sun: 2.4, sunColor: '#f9d0a4', moon: 0, ambient: .85, ambientColor: '#b4c1ce',
    hemisphere: 1.02, night: .02, windows: .08, street: 0, environment: .57,
    exposure: 1.05, fogDensity: .0007 },
  { hour: 18.5, phase: 'Sunset', sky: '#243d61', horizon: '#714e50', fog: '#394b64',
    sun: 1.05, sunColor: '#f3a16e', moon: .28, ambient: 1.08, ambientColor: '#9aafc3',
    hemisphere: 1.22, night: .47, windows: .55, street: .5, environment: .53,
    exposure: 1.11, fogDensity: .001 },
  { hour: 20, phase: 'Blue hour', sky: '#0a182b', horizon: '#19283d', fog: '#111e30',
    sun: 0, sunColor: '#eaa27a', moon: 1.7, ambient: .78, ambientColor: '#93acc4',
    hemisphere: 1.04, night: .88, windows: .94, street: .94, environment: .44,
    exposure: 1.17, fogDensity: .0018 },
  { hour: 21, phase: 'Night', sky: '#02060b', horizon: '#050b14', fog: '#08111f',
    sun: 0, sunColor: '#fff4e5', moon: 2.65, ambient: .72, ambientColor: '#91a9c1',
    hemisphere: 1.02, night: 1, windows: 1, street: 1, environment: .42,
    exposure: 1.2, fogDensity: .00235 },
  { hour: 23, phase: 'Night', sky: '#02060b', horizon: '#050b14', fog: '#08111f',
    sun: 0, sunColor: '#fff4e5', moon: 2.65, ambient: .72, ambientColor: '#91a9c1',
    hemisphere: 1.02, night: 1, windows: 1, street: 1, environment: .42,
    exposure: 1.2, fogDensity: .00235 },
  { hour: 24, phase: 'Late night', sky: '#02060b', horizon: '#050b14', fog: '#08111f',
    sun: 0, sunColor: '#fff4e5', moon: 2.65, ambient: .72, ambientColor: '#91a9c1',
    hemisphere: 1.02, night: 1, windows: .72, street: 1, environment: .42,
    exposure: 1.2, fogDensity: .00235 },
]

function smoothstep(value: number): number { return value * value * (3 - 2 * value) }
function mix(a: number, b: number, amount: number): number { return a + (b - a) * amount }
function colorMix(a: string, b: string, amount: number): string {
  const channels = [1, 3, 5].map((offset) => Math.round(mix(
    Number.parseInt(a.slice(offset, offset + 2), 16),
    Number.parseInt(b.slice(offset, offset + 2), 16), amount)))
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

/** Pure, cyclic lighting calculation. No render-frame history or camera state is read. */
export function getLightingState(worldSeconds: number): LightingState {
  if (!Number.isFinite(worldSeconds)) throw new Error('Invalid lighting time')
  const secondOfDay = ((worldSeconds % 86_400) + 86_400) % 86_400
  const hour = secondOfDay / 3_600
  const rightIndex = KEYFRAMES.findIndex((key) => key.hour > hour)
  const right = KEYFRAMES[rightIndex]
  const left = KEYFRAMES[rightIndex - 1]
  const amount = smoothstep((hour - left.hour) / (right.hour - left.hour))
  const value = (name: keyof Pick<Keyframe, 'sun' | 'moon' | 'ambient' | 'hemisphere' |
    'night' | 'windows' | 'street' | 'environment' | 'exposure' | 'fogDensity'>) =>
    mix(left[name], right[name], amount)
  const color = (name: keyof Pick<Keyframe, 'sky' | 'horizon' | 'fog' |
    'sunColor' | 'ambientColor'>) => colorMix(left[name], right[name], amount)
  const altitude = .82 * (Math.cos((hour - 12) * Math.PI / 12) + .26) / 1.26
  const azimuth = (hour - 12) * Math.PI / 12
  const horizontal = Math.sqrt(1 - altitude * altitude)
  const direction: readonly [number, number, number] = [
    horizontal * Math.cos(azimuth), altitude, horizontal * Math.sin(azimuth)]
  return { worldSeconds, phase: left.phase, sunDirection: direction,
    sunIntensity: value('sun') * smoothstep(Math.min(1, Math.max(0, altitude / .12))),
    sunColor: color('sunColor'),
    moonIntensity: value('moon'), ambientIntensity: value('ambient'),
    ambientColor: color('ambientColor'), hemisphereIntensity: value('hemisphere'),
    skyColor: color('sky'), horizonColor: color('horizon'), fogColor: color('fog'),
    fogDensity: value('fogDensity'), environmentIntensity: value('environment'),
    nightBlend: value('night'), windowEmission: value('windows'),
    streetlightIntensity: value('street'), exposure: value('exposure') }
}

export function formatWorldTime(worldSeconds: number): string {
  const minute = Math.floor((((worldSeconds % 86_400) + 86_400) % 86_400) / 60)
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}
