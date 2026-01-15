import React, { useMemo } from "react";
import * as THREE from "three";

export function Trunk() {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#2b1b16",
        roughness: 0.9,
        metalness: 0.0,
      }),
    []
  );

  return (
    <group position={[0, -5, 0]}>
      {/* trunk */}
      <mesh material={mat} position={[0, 2.0, 0]} castShadow>
        <cylinderGeometry args={[0.45, 0.65, 4.2, 18]} />
      </mesh>

      {/* main branches */}
      <mesh material={mat} position={[0.9, 3.6, 0.2]} rotation={[0, 0, -0.6]} castShadow>
        <cylinderGeometry args={[0.12, 0.22, 2.4, 12]} />
      </mesh>

      <mesh material={mat} position={[-0.9, 3.5, -0.1]} rotation={[0, 0, 0.6]} castShadow>
        <cylinderGeometry args={[0.12, 0.22, 2.3, 12]} />
      </mesh>

      <mesh material={mat} position={[0.2, 3.9, -0.9]} rotation={[0.6, 0.0, 0.2]} castShadow>
        <cylinderGeometry args={[0.10, 0.18, 2.0, 12]} />
      </mesh>
    </group>
  );
}
