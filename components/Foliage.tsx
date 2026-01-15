import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TreeMode } from '../types';

interface FoliageProps {
  mode: TreeMode;
  count: number;
}

const vertexShader = `
  uniform float uTime;
  uniform float uProgress;
  
  attribute vec3 aChaosPos;
  attribute vec3 aTargetPos;
  attribute float aRandom;
  
  varying vec3 vColor;
  varying float vAlpha;
  varying float vR;      // normalized radius (0 center → 1 edge)
  varying float vArm;    // spiral-arm mask

  // Cubic Ease In Out
  float cubicInOut(float t) {
    return t < 0.5
      ? 4.0 * t * t * t
      : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
  }

  void main() {
    // Add some individual variation to the progress so they don't all move at once
    float localProgress = clamp(uProgress * 1.2 - aRandom * 0.2, 0.0, 1.0);
    float easedProgress = cubicInOut(localProgress);

    // Interpolate position
    vec3 newPos = mix(aChaosPos, aTargetPos, easedProgress);
    
    // --- Galaxy coordinates based on current position ---
    // Estimate radius in XZ plane and normalize.
    // NOTE: divisor is a tune knob; increase if your dome is huge.
    float r = length(newPos.xz);
    vR = clamp(r / 9.0, 0.0, 1.0);

    // Spiral-arm signal (more visible mid-radius)
    float ang = atan(newPos.z, newPos.x);
    float arms = 3.0; // 2-5 looks good

    // Strongest spiral visibility around mid radius, softer at core & rim
    float midMask = smoothstep(0.12, 0.35, vR) * (1.0 - smoothstep(0.70, 1.0, vR));

    float armWave = sin(ang * arms + vR * 8.0 - uTime * 0.25);

    // Convert to 0..1 mask and bias it
    vArm = smoothstep(0.20, 0.85, armWave * 0.5 + 0.5);
    vArm *= midMask;

    // Add a slight "breathing" wind effect when formed
    // (Use uProgress if you don't have easedProgress)
    if (uProgress > 0.9) {
      newPos.x += sin(uTime * 2.0 + newPos.y) * 0.05;
      newPos.z += cos(uTime * 1.5 + newPos.y) * 0.05;
    }

    vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);

    // ------------------------------------
    // Size attenuation (base)
    // ------------------------------------
    float baseSize = (5.0 * aRandom + 2.8) * (22.0 / -mvPosition.z);

    // ------------------------------------
    // Core emphasis (ONLY when formed)
    // ------------------------------------
    float coreBoost = (1.0 - smoothstep(0.0, 0.3, vR)) * easedProgress;
    baseSize *= (1.0 + coreBoost * 0.6);

    // ------------------------------------
    // Spiral arms emphasis (ONLY when formed)
    // ------------------------------------
    baseSize *= (1.0 + vArm * 0.25 * easedProgress);

    // ------------------------------------
    // Chaos damping (this is key)
    // ------------------------------------
    float chaosSizeScale = mix(0.35, 1.0, easedProgress);
    baseSize *= chaosSizeScale;

    // ------------------------------------
    // Final clamp (prevents big floaters)
    // ------------------------------------
    baseSize = clamp(baseSize, 1.2, 12.0);

    gl_PointSize = baseSize;
    gl_Position = projectionMatrix * mvPosition;

    // =========================
    // Enhanced Galaxy palette with better harmony
    // =========================

    // Core → mid → rim (harmonized with cherry blossom colors)
    vec3 core = vec3(1.00, 0.88, 0.96);   // warm pink-white core (brighter, warmer)
    vec3 mid  = vec3(0.78, 0.65, 1.00);   // lavender (brighter to match blossoms)
    vec3 rim  = vec3(0.15, 0.22, 0.45);   // deep blue-purple (warmer blue)

    // Radial gradient with smoother transitions
    vec3 baseGalaxy = mix(core, mid, smoothstep(0.08, 0.50, vR));
    baseGalaxy = mix(baseGalaxy, rim, smoothstep(0.50, 0.95, vR));

    // Enhanced spiral arm tint (more visible, pinker to match blossoms)
    baseGalaxy += vArm * vec3(0.45, 0.25, 0.60);

    // Rim glow (warmer, more visible)
    float rimGlow = smoothstep(0.60, 1.00, vR);
    baseGalaxy += rimGlow * vec3(0.10, 0.15, 0.30) * (0.8 + 0.2 * aRandom);

    // Core glow (brighter center)
    float coreGlow = 1.0 - smoothstep(0.0, 0.25, vR);
    baseGalaxy += coreGlow * vec3(0.25, 0.20, 0.30);

    // Shell boost (outer "halo" / dome visibility) - enhanced
    float shell = smoothstep(0.50, 0.90, vR);
    baseGalaxy = mix(baseGalaxy, baseGalaxy * 1.45, shell);

    // Subtle time-based pulsing for living galaxy feel
    float pulse = 0.98 + sin(uTime * 0.3) * 0.02;
    baseGalaxy *= pulse;

    // Add depth-based brightness (closer = brighter, far = dimmer)
    float depthFade = smoothstep(10.0, 15.0, newPos.y);
    baseGalaxy *= (1.0 - depthFade * 0.2);

    // Final assign
    vColor = baseGalaxy;
    
    // Alpha varies with depth and position for atmospheric effect
    // Reduce opacity when spread out (chaos mode) to avoid blocking tree
    float formedAlpha = 0.75 + 0.25 * (1.0 - vR * 0.3) + coreGlow * 0.15;
    float chaosAlpha = 0.35 + 0.25 * aRandom; // Lower opacity when spread out
    vAlpha = mix(chaosAlpha, formedAlpha, easedProgress);
    vAlpha = clamp(vAlpha, 0.3, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // Enhanced circular particle with glow halo
    vec2 center = vec2(0.5);
    float r = distance(gl_PointCoord, center);
    
    if (r > 0.5) discard;

    // Soft edge with enhanced glow
    float glow = 1.0 - (r * 2.0);
    glow = pow(glow, 0.75);  // Softer, fuller glow
    
    // Outer glow halo for magical effect
    float halo = 1.0 - smoothstep(0.3, 0.5, r);
    halo = pow(halo, 3.0) * 0.4;
    
    // Combine base glow with halo
    float finalGlow = glow + halo;
    
    // Enhanced color with slight saturation boost
    vec3 finalColor = vColor * (1.0 + finalGlow * 0.15);
    
    gl_FragColor = vec4(finalColor, vAlpha * finalGlow);

  }
`;

export const Foliage: React.FC<FoliageProps> = ({ mode, count }) => {
  const meshRef = useRef<THREE.Points>(null);
  
  // Target progress reference for smooth JS-side dampening logic for the uniform
  const progressRef = useRef(0);

  const { chaosPositions, targetPositions, randoms } = useMemo(() => {
    const chaos = new Float32Array(count * 3);
    const target = new Float32Array(count * 3);
    const rnd = new Float32Array(count);

    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const height = 12;
    const maxRadius = 5;

    for (let i = 0; i < count; i++) {
      // 1. Chaos Positions: Wider spread sphere (increased distance between particles)
      // Use a wider distribution with larger radius for more spacing
      // Use uniform distribution (no bias toward center) so particles spread evenly
      const r = 55 * Math.random(); // Increased from 18, uniform distribution for wider spread
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(2 * Math.random() - 1);
      
      // Wider vertical spread to push particles away from tree area
      const verticalBias = (Math.random() - 0.5) * 20; // Increased vertical spread for more distance
      
      // Push particles further out horizontally for better spacing
      chaos[i * 3] = r * Math.sin(phi) * Math.cos(theta) * 1.8; // Slight horizontal expansion
      chaos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) + 8 + verticalBias; // Higher and more spread
      chaos[i * 3 + 2] = r * Math.cos(phi) * 1.3; // Slight depth expansion

      // 2. Target Positions: Spiral Cone (Fibonacci Lattice on Cone)
      // Normalized height 0 to 1


      // 2. Target Positions: Sakura Canopy (squashed spherical shell)
      // We want a fluffy crown (not a cone), lifted upward.
      const u = (i + 0.5) / count;

      // radius distribution: more points near center (galaxy core)
      const r01 = Math.pow(u, 0.45);          // <1 = denser core
      const diskR = maxRadius * 3 * r01;    // spread wide
      const bulge = (1 - r01) * (1 - r01); // biggest at center

      
      // fibonacci angle for even distribution
      const thetaG = 2 * Math.PI * goldenRatio * i;

      // spiral twist: arms wrap outward
      const arms = 3;                          // 2–5
      const twist = diskR * 0.45;              // how much spiral winds
      const thetaSpiral = thetaG + arms * twist;

      // Enhanced vertical distribution - more dome-like canopy
      const baseY = height * 0.95 + 1.0; // Slightly lower, more spread out
      const thicknessCenter = 2.0;   // Thicker center for more volume
      const thicknessEdge   = 0.4;  // Thicker edge for better transition
      const edgeDrop = -0.35 * (r01 * r01); // More edge drop for dome shape

      const localThickness = thicknessEdge + (thicknessCenter - thicknessEdge) * bulge;
      // Add more vertical variation for natural canopy feel
      const verticalVariation = (Math.random() - 0.5) * localThickness * 1.2;
      const y = baseY + edgeDrop + verticalVariation;   

      // slight clumpy noise so it doesn't look like a perfect ring
      const jitter = (Math.random() - 0.5) * 0.20;
      const rr = diskR * (1 + jitter);

      target[i * 3]     = Math.cos(thetaSpiral) * rr;
      target[i * 3 + 1] = y;
      target[i * 3 + 2] = Math.sin(thetaSpiral) * rr;



      // 3. Randoms
      rnd[i] = Math.random();
    }

    return {
      chaosPositions: chaos,
      targetPositions: target,
      randoms: rnd
    };
  }, [count]);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uProgress: { value: 0 },
  }), []);

  useFrame((state, delta) => {
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.ShaderMaterial;
      // Update time for both vertex and fragment shaders
      material.uniforms.uTime.value = state.clock.elapsedTime;
      
      // Smoothly interpolate the progress uniform
      const target = mode === TreeMode.FORMED ? 1 : 0;
      // Using a simple lerp for the uniform value
      progressRef.current = THREE.MathUtils.lerp(progressRef.current, target, delta * 1.5);
      material.uniforms.uProgress.value = progressRef.current;
    }
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position" // Required by three.js, though we override in shader
          count={count}
          array={chaosPositions} // Initial state
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aChaosPos"
          count={count}
          array={chaosPositions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aTargetPos"
          count={count}
          array={targetPositions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aRandom"
          count={count}
          array={randoms}
          itemSize={1}
        />
      </bufferGeometry>
      {/* @ts-ignore */}
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        opacity={0.7}
      />
    </points>
  );
};