import React, { useRef, useEffect } from 'react';
import { Environment, OrbitControls, ContactShadows } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { BlendFunction } from 'postprocessing';
import { useFrame } from '@react-three/fiber';
import { Foliage } from './Foliage';
import { Polaroids } from './Polaroids';
import Petals from './Petals';
import { StarField } from './StarField';
import { TreeMode } from '../types';
import { Trunk } from "./Trunk";


interface ExperienceProps {
  mode: TreeMode;
  handPosition: { x: number; y: number; detected: boolean };
  uploadedPhotos: string[];
  twoHandsDetected: boolean;
  onClosestPhotoChange?: (photoUrl: string | null) => void;
}

export const Experience: React.FC<ExperienceProps> = ({ mode, handPosition, uploadedPhotos, twoHandsDetected, onClosestPhotoChange }) => {
  const controlsRef = useRef<any>(null);
  const { scene } = useThree();

  const blossomRadius = 5.4;
  const blossomHeight = 6.4;

  // Add atmospheric fog for depth and harmony
  React.useEffect(() => {
    scene.fog = new THREE.FogExp2('#0a0a1a', 0.025);
    return () => {
      scene.fog = null;
    };
  }, [scene]);

  // Update camera rotation based on hand position
  useFrame((_, delta) => {
    if (controlsRef.current && handPosition.detected) {
      const controls = controlsRef.current;
      
      // Map hand position to spherical coordinates
      // x: 0 (left) to 1 (right) -> azimuthal angle (horizontal rotation)
      // y: 0 (top) to 1 (bottom) -> polar angle (vertical tilt)
      
      // Target azimuthal angle: increased range for larger rotation
      const targetAzimuth = (handPosition.x - 0.5) * Math.PI * 3; // Increased from 2 to 3
      
      // Adjust Y mapping so natural hand position gives best view
      // Offset Y so hand at 0.4-0.5 range gives centered view
      const adjustedY = (handPosition.y - 0.2) * 2.0; // Increased sensitivity from 1.5 to 2.0
      const clampedY = Math.max(0, Math.min(1, adjustedY)); // Clamp to 0-1
      
      // Target polar angle: PI/4 to PI/1.8 (constrained vertical angle)
      const minPolar = Math.PI / 4;
      const maxPolar = Math.PI / 1.8;
      const targetPolar = minPolar + clampedY * (maxPolar - minPolar);
      
      // Get current angles
      const currentAzimuth = controls.getAzimuthalAngle();
      const currentPolar = controls.getPolarAngle();
      
      // Calculate angle differences (handle wrapping for azimuth)
      let azimuthDiff = targetAzimuth - currentAzimuth;
      if (azimuthDiff > Math.PI) azimuthDiff -= Math.PI * 2;
      if (azimuthDiff < -Math.PI) azimuthDiff += Math.PI * 2;
      
      // Smoothly interpolate angles
      const lerpSpeed = 8; // Increased from 5 to 8 for faster response
      const newAzimuth = currentAzimuth + azimuthDiff * delta * lerpSpeed;
      const newPolar = currentPolar + (targetPolar - currentPolar) * delta * lerpSpeed;
      
      // Calculate new camera position in spherical coordinates
      const radius = controls.getDistance();
      const targetY = 4; // Tree center height
      
      const x = radius * Math.sin(newPolar) * Math.sin(newAzimuth);
      const y = targetY + radius * Math.cos(newPolar);
      const z = radius * Math.sin(newPolar) * Math.cos(newAzimuth);
      
      // Update camera position and target
      controls.object.position.set(x, y, z);
      controls.target.set(0, targetY, 0);
      controls.update();
    }
  });
  return (
    <>
      <OrbitControls 
        ref={controlsRef}
        enablePan={false} 
        minPolarAngle={Math.PI / 4} 
        maxPolarAngle={Math.PI / 1.8}
        minDistance={10}
        maxDistance={30}
        enableDamping
        dampingFactor={0.05}
        enabled={true}
      />

      {/* Enhanced Lighting Setup for Cherry Blossoms */}
      <Environment preset="sunset" background={false} blur={0.8} />

      {/* Distant star field background layer */}
      <StarField count={2500} />
      
      <ambientLight intensity={0.6} color="#ffffff" />

      {/* Main spotlight - warmer and more intense */}
      <spotLight
        position={[8, 18, 12]}
        angle={0.4}
        penumbra={1.2}
        intensity={1.4}
        color="#fff1f6"   // warm pink-white
        castShadow
      />

      {/* Secondary point lights for depth and glow */}
      <pointLight position={[-10, 6, -8]} intensity={0.45} color="#ffd6e6" />
      <pointLight position={[10, 8, -6]} intensity={0.3} color="#ffeef7" />
      <pointLight position={[0, 12, -10]} intensity={0.35} color="#ffffff" />

      {/* Rim light for magical glow */}
      <pointLight position={[-5, 4, 10]} intensity={0.25} color="#fff0f5" />


      <group position={[0, -3.2, 0]}>
      <group position={[0, 1.7, 0]}>
        <Trunk />
      </group>

      <group scale={[1.3, 0.78, 1.3]} position={[0, 0.7, 0]}>
        <Foliage mode={mode} count={9000} />

        {/* Top airy crown */}
        <Petals
          mode={mode}
          layer="top"
          count={900}
          radius={blossomRadius * 0.7}
          height={blossomHeight}
        />

        {/* Main body */}
        <Petals
          mode={mode}
          layer="main"
          count={2200}
          radius={blossomRadius}
          height={blossomHeight}
        />

        {/* Hanging edges */}
        <Petals
          mode={mode}
          layer="skirt"
          count={1100}
          radius={blossomRadius}
          height={blossomHeight}
        />
      </group>

      <Polaroids
        mode={mode}
        uploadedPhotos={uploadedPhotos}
        twoHandsDetected={twoHandsDetected}
        onClosestPhotoChange={onClosestPhotoChange}
      />

    </group>


        <ContactShadows opacity={0.7} scale={30} blur={2} far={4.5} color="#000000" />


      <EffectComposer enableNormalPass={false}>
        <Bloom 
          luminanceThreshold={0.75} 
          mipmapBlur 
          intensity={1.0} 
          radius={0.7}
          levels={8}
        />
        <Vignette eskil={false} offset={0.15} darkness={0.5} />
        <Noise opacity={0.01} blendFunction={BlendFunction.OVERLAY} />
      </EffectComposer>
    </>
  );
};
