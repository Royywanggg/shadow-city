import { useMemo } from 'react'
import { InstancedBoxes, type BoxInstance } from '../InstancedBoxes'
import type { LookDevArea } from './selectLookDevArea'

export function LookDevLighting({ area }: { area: LookDevArea }) {
  const fixtures = useMemo(() => {
    const civicFront = area.civic.z + area.civic.masses[0].offsetZ +
      area.civic.masses[0].depth / 2
    const shopFront = area.commercial.z + area.commercial.masses[0].offsetZ +
      area.commercial.masses[0].depth / 2
    const sources: BoxInstance[] = [
      ...[-8, 8].map((offset) => ({ position: [area.civic.x + offset, 4.25, civicFront + 1.45] as
        [number, number, number], scale: [0.85, 0.12, 0.34] as [number, number, number] })),
      ...[-10.5, 10.5].map((offset) => ({ position: [area.commercial.x + offset, 3.95,
        shopFront + 1.05] as [number, number, number],
      scale: [1.05, 0.12, 0.28] as [number, number, number] })),
    ]
    return { sources, civicFront, shopFront }
  }, [area])

  return <>
    <InstancedBoxes items={fixtures.sources} color="#e7ba8d" emissive="#f2b572"
      emissiveIntensity={1.5} roughness={0.38} metalness={0.2} />
    {[-8, 8].map((offset) => <pointLight key={`civic-${offset}`}
      position={[area.civic.x + offset, 3.95, fixtures.civicFront + 1.58]}
      color="#ffd09a" intensity={82} distance={18} decay={2} />)}
    {[-10.5, 10.5].map((offset) => <pointLight key={`shop-${offset}`}
      position={[area.commercial.x + offset, 3.7, fixtures.shopFront + 1.05]}
      color="#ffc285" intensity={108} distance={18} decay={2} />)}
  </>
}
