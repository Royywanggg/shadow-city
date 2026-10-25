import type { CityModel } from '../city/model'
import { InstancedBoxes, type BoxInstance } from './InstancedBoxes'

export function Plaza({ city }: { city: CityModel }) {
  const { x, z, width, depth } = city.plaza
  const treePositions: [number, number][] = [
    [-0.38, -0.36], [-0.18, -0.36], [0.18, -0.36], [0.38, -0.36],
    [-0.38, 0.36], [-0.18, 0.36], [0.18, 0.36], [0.38, 0.36],
  ]
  const lampPositions: [number, number][] = [
    [-0.39, -0.13], [-0.39, 0.13], [0.39, -0.13], [0.39, 0.13],
  ]
  const planting: BoxInstance[] = [
    { position: [x - width * 0.31, 0.3, z], scale: [width * 0.11, 0.22, depth * 0.45], color: '#263d3d' },
    { position: [x + width * 0.31, 0.3, z], scale: [width * 0.11, 0.22, depth * 0.45], color: '#263d3d' },
  ]
  const pavingLines: BoxInstance[] = [
    { position: [x, 0.28, z], scale: [width * 0.75, 0.02, 0.13] },
    { position: [x, 0.28, z], scale: [0.13, 0.02, depth * 0.77] },
    { position: [x, 0.28, z - depth * 0.24], scale: [width * 0.68, 0.02, 0.09] },
    { position: [x, 0.28, z + depth * 0.24], scale: [width * 0.68, 0.02, 0.09] },
  ]

  return (
    <group>
      {city.blocks.filter((block) => block.isPark).map((block) => (
        <group key={block.id}>
          <mesh position={[block.x, 0.28, block.z]} receiveShadow>
            <boxGeometry args={[block.width * 0.92, 0.08, block.depth * 0.92]} />
            <meshStandardMaterial color="#36524d" roughness={1} />
          </mesh>
          <mesh position={[block.x, 0.335, block.z]} receiveShadow>
            <boxGeometry args={[block.width * 0.17, 0.035, block.depth * 0.91]} />
            <meshStandardMaterial color="#8b9691" roughness={0.96} />
          </mesh>
          {[-1, 1].map((side) => (
            <group key={side} position={[block.x + side * block.width * 0.29, 0.37, block.z]}>
              <mesh position={[0, 0.7, 0]} castShadow>
                <cylinderGeometry args={[0.11, 0.16, 1.4, 6]} />
                <meshStandardMaterial color="#3d4842" roughness={1} />
              </mesh>
              <mesh position={[0, 2.05, 0]} castShadow>
                <dodecahedronGeometry args={[1.55, 0]} />
                <meshStandardMaterial color="#335752" roughness={0.96} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
      <mesh position={[x, 0.255, z]} receiveShadow>
        <boxGeometry args={[width * 0.88, 0.04, depth * 0.88]} />
        <meshStandardMaterial color="#516272" roughness={0.92} />
      </mesh>
      <InstancedBoxes items={planting} receiveShadow roughness={0.96} />
      <InstancedBoxes items={pavingLines} color="#9baaa7" roughness={0.9} />
      <mesh position={[x, 0.41, z]} castShadow receiveShadow>
        <cylinderGeometry args={[4.2, 4.45, 0.3, 12]} />
        <meshStandardMaterial color="#87959c" metalness={0.25} roughness={0.75} />
      </mesh>
      <mesh position={[x, 0.71, z]} castShadow receiveShadow>
        <cylinderGeometry args={[2.4, 2.65, 0.32, 12]} />
        <meshStandardMaterial color="#253c49" metalness={0.45} roughness={0.48} />
      </mesh>
      <mesh position={[x, 2.35, z]} castShadow>
        <cylinderGeometry args={[0.45, 0.72, 3.1, 8]} />
        <meshStandardMaterial color="#a8b9ba" metalness={0.38} roughness={0.55} />
      </mesh>
      <mesh position={[x, 4.03, z]}>
        <sphereGeometry args={[0.52, 12, 8]} />
        <meshStandardMaterial color="#add7ca" emissive="#78bcba" emissiveIntensity={1.3} />
      </mesh>
      {treePositions.map(([xRatio, zRatio], index) => {
        const treeX = x + xRatio * width
        const treeZ = z + zRatio * depth
        const height = 3.2 + (index % 3) * 0.4
        return (
          <group key={index} position={[treeX, 0.35, treeZ]}>
            <mesh position={[0, 0.8, 0]} castShadow>
              <cylinderGeometry args={[0.1, 0.17, 1.6, 6]} />
              <meshStandardMaterial color="#364443" roughness={1} />
            </mesh>
            <mesh position={[0, 1.7 + height * 0.18, 0]} castShadow>
              <dodecahedronGeometry args={[height * 0.42, 0]} />
              <meshStandardMaterial color={index % 2 ? '#284b4a' : '#355454'} roughness={0.96} />
            </mesh>
          </group>
        )
      })}
      {lampPositions.map(([xRatio, zRatio], index) => (
        <group key={`lamp-${index}`} position={[x + xRatio * width, 0.4, z + zRatio * depth]}>
          <mesh position={[0, 2.05, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.13, 4.1, 8]} />
            <meshStandardMaterial color="#586c76" metalness={0.52} roughness={0.48} />
          </mesh>
          <mesh position={[0, 4.14, 0]}>
            <sphereGeometry args={[0.24, 10, 8]} />
            <meshStandardMaterial color="#ffd9a0" emissive="#e6a461" emissiveIntensity={2.7} />
          </mesh>
          <pointLight position={[0, 4.1, 0]} color="#efb578" intensity={20} distance={20} decay={2} />
        </group>
      ))}
      <pointLight position={[x, 8, z]} color="#f0ba77" intensity={28} distance={36} decay={2} />
    </group>
  )
}
