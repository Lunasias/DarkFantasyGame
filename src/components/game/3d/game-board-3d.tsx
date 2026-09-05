"use client";

import { Canvas } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import type { GameSnapshot } from "@/server/game/actions";

type Vec3 = [number, number, number];

/** Visual-only node layout (not authoritative; not persisted). */
const NODES: Record<string, [number, number]> = {
  A: [-3, -2],
  B: [0, 0],
  C: [3, 2],
  E: [2, -1],
  D: [5, 3],
};
const EDGES: readonly [string, string][] = [
  ["A", "B"],
  ["B", "C"],
  ["B", "E"],
  ["C", "D"],
];

function node3d(id: string): Vec3 {
  const p = NODES[id] ?? [0, 0];
  return [p[0], 0, p[1]];
}

export function GameBoard3D({ snapshot }: { snapshot: GameSnapshot }) {
  return (
    <Canvas camera={{ position: [8, 11, 13], fov: 50 }}>
      <color attach="background" args={["#0b0a10"]} />
      <fog attach="fog" args={["#0b0a10", 20, 46]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 12, 4]} intensity={1.1} />
      <pointLight position={[0, 6, 0]} intensity={0.5} color="#8a6bff" />

      {Object.entries(NODES).map(([id]) => (
        <Node key={id} id={id} position={node3d(id)} />
      ))}
      {EDGES.map(([a, b]) => (
        <Line key={`${a}-${b}`} points={[node3d(a), node3d(b)]} color="#3f3f46" lineWidth={2} />
      ))}

      {snapshot.positions.map((pos, i) => {
        const char = snapshot.characters.find((c) => c.characterId === pos.characterId);
        const name = (char?.userId ?? pos.characterId).slice(0, 5);
        const active = snapshot.activePlayer === char?.userId;
        return (
          <PlayerPiece
            key={pos.characterId}
            position={node3d(pos.nodeId)}
            name={name}
            color={i % 2 === 0 ? "#22c55e" : "#eab308"}
            active={active}
          />
        );
      })}
    </Canvas>
  );
}

function Node({ id, position }: { id: string; position: Vec3 }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[1.2, 0.6, 1.2]} />
        <meshStandardMaterial color="#1f2937" metalness={0.3} roughness={0.7} />
      </mesh>
      <Html position={[0, 1, 0]} center distanceFactor={14}>
        <span className="pointer-events-none rounded bg-zinc-900/80 px-1.5 py-0.5 text-xs font-semibold tracking-widest text-zinc-200">
          {id}
        </span>
      </Html>
    </group>
  );
}

function PlayerPiece({
  position,
  name,
  color,
  active,
}: {
  position: Vec3;
  name: string;
  color: string;
  active: boolean;
}) {
  return (
    <group position={position}>
      <mesh position={[0, 1.2, 0]}>
        <sphereGeometry args={[0.45, 18, 18]} />
        <meshStandardMaterial color={color} emissive={active ? "#eab308" : "#000000"} emissiveIntensity={active ? 0.7 : 0} />
      </mesh>
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.6, 10]} />
        <meshStandardMaterial color="#71717a" />
      </mesh>
      <Html position={[0, 2, 0]} center distanceFactor={14}>
        <span className="pointer-events-none whitespace-nowrap rounded bg-zinc-900/80 px-1.5 py-0.5 text-xs text-zinc-100">
          {name}
          {active ? " ●" : ""}
        </span>
      </Html>
    </group>
  );
}
