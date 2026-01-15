import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface StarFieldProps {
  count?: number;
}

export const StarField: React.FC<StarFieldProps> = ({ count = 3000 }) => {
  const meshRef = useRef<THREE.Points>(null);

  const { positions, sizes, twinkles } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const twinkles = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Distribute stars in a large sphere (background layer)
      const radius = 40 + Math.random() * 60; // 40-100 units away
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);

      // Size variation (smaller stars in distance)
      sizes[i] = Math.random() * 2 + 0.5;
      twinkles[i] = Math.random();
    }

    return { positions, sizes, twinkles };
  }, [count]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
  }), []);

  useFrame((state) => {
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.ShaderMaterial;
      material.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={count}
          array={sizes}
          itemSize={1}
        />
        <bufferAttribute
          attach="attributes-twinkle"
          count={count}
          array={twinkles}
          itemSize={1}
        />
      </bufferGeometry>
      {/* @ts-ignore */}
      <shaderMaterial
        vertexShader={`
          attribute float size;
          attribute float twinkle;
          uniform float uTime;
          varying float vTwinkle;
          
          void main() {
            vTwinkle = twinkle;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `}
        fragmentShader={`
          uniform float uTime;
          varying float vTwinkle;
          
          void main() {
            // Soft circular star
            float r = distance(gl_PointCoord, vec2(0.5));
            if (r > 0.5) discard;
            
            // Twinkling effect
            float twinkle = 0.8 + sin(uTime * 2.0 + vTwinkle * 10.0) * 0.2;
            
            // Soft glow
            float glow = 1.0 - (r * 2.0);
            glow = pow(glow, 2.0);
            
            // Color - blend between white and soft pink/lavender
            vec3 starColor = mix(
              vec3(1.0, 1.0, 1.0),
              vec3(1.0, 0.85, 0.95),
              vTwinkle * 0.4
            );
            
            gl_FragColor = vec4(starColor * twinkle, glow * 0.6);
          }
        `}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};
