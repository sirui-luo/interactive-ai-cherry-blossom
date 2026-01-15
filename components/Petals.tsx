import React, { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { TreeMode } from "../types";

type Props = {
    mode: TreeMode;
    count?: number;
    radius?: number;
    height?: number;
    surfacePush?: number;
    color?: string;
    emissive?: string;
  
    layer?: "top" | "main" | "skirt";

  };

// Create custom cherry blossom geometry (5-petal flower with improved shape)
function createCherryBlossomGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const petalCount = 5;
  const segments = 12; // More segments for smoother petals

  // Center point (small center)
  const centerIndex = vertices.length / 3;
  vertices.push(0, 0, 0);
  normals.push(0, 0, 1);
  uvs.push(0.5, 0.5);

  // Create each petal with more realistic cherry blossom shape
  for (let p = 0; p < petalCount; p++) {
    const angle = (p / petalCount) * Math.PI * 2;
    const petalStartIndex = vertices.length / 3;

    // Petal vertices - cherry blossoms have rounded, heart-like petals
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      
      // Petal shape: rounded at tip, narrow at base, slight indent at tip (heart-like)
      const length = t * 1.1; // Petal length
      
      // Width curve: narrow at base, widest in middle, slightly narrower at tip
      let width;
      if (t < 0.3) {
        // Base: narrow
        width = Math.pow(t / 0.3, 0.5) * 0.15;
      } else if (t < 0.7) {
        // Middle: widest
        width = 0.15 + (t - 0.3) / 0.4 * 0.25;
      } else {
        // Tip: slightly rounded
        width = 0.4 - Math.pow((t - 0.7) / 0.3, 1.5) * 0.15;
      }
      
      // Tip indent for heart-like shape
      const tipIndent = t > 0.7 ? Math.pow((t - 0.7) / 0.3, 2) * 0.08 : 0;
      
      // Position along petal direction
      const x = Math.cos(angle) * (length - tipIndent);
      const y = Math.sin(angle) * (length - tipIndent);
      const z = 0;
      
      // Perpendicular direction for width
      const perpAngle = angle + Math.PI / 2;
      const xOffset = Math.cos(perpAngle) * width;
      const yOffset = Math.sin(perpAngle) * width;
      
      // Slight 3D curve for natural look
      const curve = Math.sin(t * Math.PI) * 0.08;

      vertices.push(x + xOffset, y + yOffset, z + curve);
      normals.push(
        Math.cos(perpAngle) * 0.3,
        Math.sin(perpAngle) * 0.3,
        0.95
      );
      uvs.push(
        0.5 + (x / 1.5) * 0.48,
        0.5 + (y / 1.5) * 0.48
      );
    }

    // Create triangles for this petal (fan from center)
    for (let i = 0; i < segments; i++) {
      // Triangle 1: center, current point, next point
      indices.push(
        centerIndex,
        petalStartIndex + i,
        petalStartIndex + i + 1
      );
    }
  }

  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();

  return geometry;
}

export default function Petals({
mode,
count = 900,
radius = 2.6,
height = 3.3,
surfacePush = 0.4,
color = "#f6b7c9",
emissive = "#ffd6e6",
layer = "main",
}: Props) {

  const meshRef = useRef<THREE.InstancedMesh>(null!);
  
  // Cherry blossom color palette (various shades of pink/white)
  const colorPalette = useMemo(() => [
    new THREE.Color(0xfff0f5), // Lavender blush - very light pink
    new THREE.Color(0xffe4e6), // Misty rose - soft pink
    new THREE.Color(0xf6b7c9), // Light pink - default
    new THREE.Color(0xffb3d9), // Pink
    new THREE.Color(0xffc0cb), // Pink
    new THREE.Color(0xffd6e6), // Light pink - emissive
    new THREE.Color(0xffeef7), // Almost white
    new THREE.Color(0xffffff), // Pure white
  ], []);

  const petals = useMemo(() => {
    const arr: {
      base: THREE.Vector3;
      phase: number;
      drift: number;
      scale: number;
      scaleVariation: number;
      rot: THREE.Euler;
      colorIndex: number;
    }[] = [];
  
    const randn = () => {
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    };
  

    // Layer shaping knobs (tune these)
    const layerYOffset =
    layer === "top"  ? height * 0.32 :
    layer === "main" ? height * 0.12 :
    /* skirt */        height * 0.06;

    const layerSigmaY =
    layer === "top"  ? 0.85 :
    layer === "main" ? 0.65 :
    /* skirt */        0.45;

    const layerSigmaXY =
    layer === "top"  ? 0.95 :
    layer === "main" ? 1.00 :
    /* skirt */        0.85;

    // 1) branch anchors
    const branchAnchors: THREE.Vector3[] = [];
    const branchCount = 14;
  
    for (let b = 0; b < branchCount; b++) {
      const angle = (b / branchCount) * Math.PI * 2;
      const r01 = Math.pow(Math.random(), 1.6);
      const spread = radius * (0.15 + 0.95 * r01);
  
      const ax = Math.cos(angle) * spread;
      const az = Math.sin(angle) * spread;
      const ay = height * (0.48 + 0.32 * Math.random());
  
      branchAnchors.push(new THREE.Vector3(ax, ay, az));
    }
  
    // 2) puff centers
    const puffCenters: { c: THREE.Vector3; w: number; sigma: number }[] = [];
  
    for (const a of branchAnchors) {
      const puffsOnThisBranch = 3 + Math.floor(Math.random() * 4);
      for (let k = 0; k < puffsOnThisBranch; k++) {
        const jitter = new THREE.Vector3(
          (Math.random() - 0.5) * radius * 0.25,
          (Math.random() - 0.5) * height * 0.18,
          (Math.random() - 0.5) * radius * 0.25
        );
  
        const center = a.clone().add(jitter);
        center.y += layerYOffset;
  
        const sigma = radius * (0.18 + Math.random() * 0.18);
        const w = 0.6 + Math.random() * 1.2;
        puffCenters.push({ c: center, w, sigma });
      }
    }
  
    // 3) sample petals around puff centers
    for (let i = 0; i < count; i++) {
      // pick puff center weighted
      let totalW = 0;
      for (const p of puffCenters) totalW += p.w;
      let pick = Math.random() * totalW;
  
      let chosen = puffCenters[0];
      for (const p of puffCenters) {
        pick -= p.w;
        if (pick <= 0) { chosen = p; break; }
      }
  
      const sigmaXY = chosen.sigma * layerSigmaXY * (0.9 + Math.random() * 0.3);
      const sigmaY  = chosen.sigma * layerSigmaY  * (0.55 + Math.random() * 0.25);
      
  
      let x = chosen.c.x + randn() * sigmaXY;
      let y = chosen.c.y + randn() * sigmaY;
      let z = chosen.c.z + randn() * sigmaXY;
      
      // 🔝 TOP PUFF — adds height & roundness
      if (layer === "top") {
        // pull slightly inward so it crowns nicely
        const pull = 0.75 + Math.random() * 0.1;
        x *= pull;
        z *= pull;
    
        // lift upward
        y += height * (0.10 + Math.random() * 0.06);
    
        // reduce vertical noise so it feels like a dome
        y = THREE.MathUtils.lerp(y, chosen.c.y + height * 0.35, 0.4);
      }

  
      if (layer === "main") {
        const pull = 0.84; 
        x *= pull;
        z *= pull;
        y -= height * 0.06;   
      }

      // soft boundary clamp
      const rr = Math.sqrt(x*x + z*z);
      const maxR = radius * 1.05;
      if (rr > maxR) {
        const s = maxR / rr;
        x *= s; z *= s;
      }

      // skirt override
      if (layer === "skirt") {
        const rim = 0.78 + 0.22 * Math.random();
        const skirtR = radius * 1.3 * rim;
        const ang = Math.atan2(chosen.c.z, chosen.c.x);
  
        x = Math.cos(ang) * skirtR + (Math.random() - 0.5) * 0.25;
        z = Math.sin(ang) * skirtR + (Math.random() - 0.5) * 0.25;
  
        y = height * (0.42 + Math.random() * 0.18);
        y -= 0.6 + Math.random() * 0.5;
        y -= Math.abs(Math.sin(ang)) * 0.25;
      }
  
      arr.push({
        base: new THREE.Vector3(x, y, z),
        phase: Math.random() * Math.PI * 2,
        drift: 0.25 + Math.random() * 0.75,
        scale: 0.040 + Math.random() * 0.080, // Slightly larger blossoms
        scaleVariation: 0.85 + Math.random() * 0.3, // Pre-calculate scale variation
        rot: new THREE.Euler(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI
        ),
        colorIndex: Math.floor(Math.random() * colorPalette.length),
      });
    }
  
    return arr;
  }, [count, radius, height, layer, colorPalette]);

  // Create cherry blossom geometry with color attribute
  const blossomGeometry = useMemo(() => {
    const geo = createCherryBlossomGeometry();
    
    // Create color attribute for per-instance coloring
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const color = colorPalette[petals[i].colorIndex];
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geo.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(colors, 3));
    
    return geo;
  }, [count, petals, colorPalette]);
  
  // Reference for color attribute updates
  const colorAttributeRef = useRef<THREE.InstancedBufferAttribute | null>(null);

  // Create cherry blossom material with better properties and lighting
  const blossomMaterial = useMemo(() => {
    // Use a shader material for per-instance colors with proper lighting
    return new THREE.ShaderMaterial({
      vertexShader: `
        attribute vec3 instanceColor;
        varying vec3 vColor;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        
        void main() {
          vColor = instanceColor;
          vNormal = normalize(normalMatrix * normal);
          
          vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uEmissiveColor;
        uniform float uTime;
        uniform vec3 uLightPosition;
        uniform vec3 uLightColor;
        uniform vec3 uAmbientColor;
        
        varying vec3 vColor;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        
        void main() {
          vec3 base = vColor;
          
          // Calculate lighting
          vec3 lightDir = normalize(uLightPosition - vWorldPosition);
          float NdotL = max(dot(vNormal, lightDir), 0.0);
          
          // Combine ambient and directional lighting
          vec3 lit = base * (uAmbientColor + uLightColor * NdotL * 0.6);
          
          // Add emissive glow for magical cherry blossom effect
          vec3 final = lit + uEmissiveColor * 0.4;
          
          // Soft pulsing effect
          float pulse = 0.98 + sin(uTime * 0.5) * 0.02;
          final *= pulse;
          
          gl_FragColor = vec4(final, 0.93);
        }
      `,
      uniforms: {
        uEmissiveColor: { value: new THREE.Color(emissive) },
        uTime: { value: 0 },
        uLightPosition: { value: new THREE.Vector3(8, 18, 12) },
        uLightColor: { value: new THREE.Color(0xfff1f6) },
        uAmbientColor: { value: new THREE.Color(0xffffff).multiplyScalar(0.6) },
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
  }, [emissive]);
    
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const chaos = mode === TreeMode.CHAOS ? 1 : 0;
  
    // Update shader time uniform for pulsing effects
    if (blossomMaterial instanceof THREE.ShaderMaterial && blossomMaterial.uniforms) {
      blossomMaterial.uniforms.uTime.value = t;
    }

    for (let i = 0; i < petals.length; i++) {
      const p = petals[i];
  
      const swayX = Math.sin(t * p.drift + p.phase) * 0.05;
      const swayZ = Math.cos(t * p.drift + p.phase) * 0.05;
  
      // subtle gravity (small, always on)
      const gravity = -0.01 * p.drift;
  
      // CHAOS mode: extra scatter + falling
      const fall = chaos ? ((t * 0.15 + i * 0.002) % 1) * -2.0 : 0;
  
      dummy.position.set(
        p.base.x + swayX + chaos * (Math.sin(t + i) * 0.8),
        p.base.y + gravity + fall + chaos * (Math.cos(t + i * 0.5) * 0.3),
        p.base.z + swayZ + chaos * (Math.cos(t + i) * 0.8)
      );
  
      // Enhanced rotation with more natural movement
      dummy.rotation.set(
        p.rot.x + t * 0.15 + Math.sin(t * 0.5 + p.phase) * 0.1,
        p.rot.y + t * 0.2 + Math.cos(t * 0.4 + p.phase) * 0.1,
        p.rot.z + t * 0.12 + Math.sin(t * 0.6 + p.phase) * 0.1
      );
  
      // More varied scaling for natural look with flutter animation
      const flutter = 1.0 + Math.sin(t * 2.5 + p.phase) * 0.03;
      const baseScale = p.scale * 1.3 * p.scaleVariation * flutter;
      dummy.scale.set(
        baseScale, 
        baseScale, 
        p.scale * 0.2 // Very thin for petal look
      );
      
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      // Update color animation (subtle pulsing)
      if (colorAttributeRef.current) {
        const baseColor = colorPalette[p.colorIndex];
        const pulse = 0.96 + Math.sin(t * 0.8 + p.phase) * 0.04;
        const idx = i * 3;
        colorAttributeRef.current.array[idx] = baseColor.r * pulse;
        colorAttributeRef.current.array[idx + 1] = baseColor.g * pulse;
        colorAttributeRef.current.array[idx + 2] = baseColor.b * pulse;
      }
    }
  
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (colorAttributeRef.current) {
      colorAttributeRef.current.needsUpdate = true;
    }
  });

  // Set up color attribute reference
  useEffect(() => {
    if (meshRef.current && meshRef.current.geometry) {
      const attr = meshRef.current.geometry.getAttribute('instanceColor') as THREE.InstancedBufferAttribute;
      if (attr) {
        colorAttributeRef.current = attr;
      }
    }
  }, [blossomGeometry]);
      

  return (
    <instancedMesh ref={meshRef} args={[blossomGeometry, blossomMaterial, count]} />
  );
}
