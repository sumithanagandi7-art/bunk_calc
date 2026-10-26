import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const orbData = [
  { pos: [-3, 1, -2],  color: '#6C63FF', emissive: '#6C63FF', scale: 1.2 },
  { pos: [3, -1, -3],  color: '#00D2FF', emissive: '#00D2FF', scale: 0.9 },
  { pos: [0, 2, -4],   color: '#9C63FF', emissive: '#6C63FF', scale: 0.7 },
  { pos: [-2, -2, -2], color: '#00D2FF', emissive: '#00D2FF', scale: 0.6 },
  { pos: [2, 2, -1],   color: '#6C63FF', emissive: '#6C63FF', scale: 0.5 },
  { pos: [-1, 0, -5],  color: '#FF6CB4', emissive: '#FF6CB4', scale: 0.8 },
];

const Orb = ({ position, color, emissive, scale, index }) => {
  const ref = useRef();
  const speed = useMemo(() => 0.3 + index * 0.15, [index]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = position[1] + Math.sin(t * speed + index) * 0.6;
    ref.current.position.x = position[0] + Math.cos(t * speed * 0.7 + index) * 0.3;
    ref.current.rotation.x = t * 0.2;
    ref.current.rotation.z = t * 0.15;
  });

  return (
    <mesh ref={ref} position={position} scale={scale}>
      <sphereGeometry args={[0.8, 32, 32]} />
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={0.4}
        transparent
        opacity={0.25}
        roughness={0.1}
        metalness={0.2}
        wireframe={false}
      />
    </mesh>
  );
};

const Scene = () => (
  <>
    <ambientLight intensity={0.5} />
    <pointLight position={[5, 5, 5]} intensity={1} color="#6C63FF" />
    <pointLight position={[-5, -5, 5]} intensity={0.8} color="#00D2FF" />
    {orbData.map((orb, i) => (
      <Orb key={i} index={i} position={orb.pos} color={orb.color} emissive={orb.emissive} scale={orb.scale} />
    ))}
  </>
);

const FloatingOrbs = () => (
  <Canvas
    style={{ position: 'absolute', inset: 0, zIndex: 0 }}
    camera={{ position: [0, 0, 6], fov: 60 }}
    gl={{ antialias: true, alpha: true }}
  >
    <Scene />
  </Canvas>
);

export default FloatingOrbs;
