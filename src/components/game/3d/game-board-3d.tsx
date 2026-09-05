"use client";

import { useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import { Vector3, type Group } from "three";
import type { GameSnapshot } from "@/server/game/actions";
import {
  allTowns,
  allDungeons,
  allWorldEvents,
  encounterForNode,
} from "@/game/content";

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

function nodeVec(id: string): Vec3 {
  const p = NODES[id] ?? [0, 0];
  return [p[0], 0, p[1]];
}

type NodeKind = "town" | "dungeon" | "encounter" | "event" | "plain";

/** Visual-only node classification (data-driven from the content registry). */
function nodeKind(id: string): NodeKind {
  if (allTowns().some((t) => t.nodeId === id)) return "town";
  if (allDungeons().some((d) => d.entryNodeId === id)) return "dungeon";
  if (encounterForNode(id)) return "encounter";
  if (allWorldEvents().some((e) => e.nodeId === id)) return "event";
  return "plain";
}

const KIND_COLOR: Record<NodeKind, string> = {
  town: "#22c55e",
  dungeon: "#a855f7",
  encounter: "#ef4444",
  event: "#f59e0b",
  plain: "#1f2937",
};

const KIND_TAG: Record<NodeKind, string> = {
  town: "T",
  dungeon: "D",
  encounter: "E",
  event: "⚑",
  plain: "",
};

export function GameBoard3D({
  snapshot,
  selectedNode,
  attackingId,
}: {
  snapshot: GameSnapshot;
  selectedNode: string | null;
  attackingId: string | null;
}) {
  const activeCharId = snapshot.activePlayer
    ? snapshot.characters.find((c) => c.userId === snapshot.activePlayer)?.characterId
    : undefined;
  const focusNodeId = activeCharId
    ? (snapshot.positions.find((p) => p.characterId === activeCharId)?.nodeId ?? null)
    : null;
  const focus = focusNodeId ? nodeVec(focusNodeId) : null;

  return (
    <Canvas camera={{ position: [8, 11, 14], fov: 50 }}>
      <color attach="background" args={["#0b0a10"]} />
      <fog attach="fog" args={["#0b0a10", 20, 46]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[6, 12, 4]} intensity={1.1} />
      <pointLight position={[0, 6, 0]} intensity={0.5} color="#8a6bff" />

      {Object.entries(NODES).map(([id]) => (
        <Node
          key={id}
          id={id}
          position={nodeVec(id)}
          active={focusNodeId === id}
          selected={selectedNode === id}
          kind={nodeKind(id)}
        />
      ))}
      {EDGES.map(([a, b]) => (
        <Line key={`${a}-${b}`} points={[nodeVec(a), nodeVec(b)]} color="#3f3f46" lineWidth={2} />
      ))}

      {snapshot.positions.map((pos, i) => {
        const char = snapshot.characters.find((c) => c.characterId === pos.characterId);
        const name = (char?.userId ?? pos.characterId).slice(0, 5);
        const active = snapshot.activePlayer === char?.userId;
        return (
          <PlayerPiece
            key={pos.characterId}
            target={nodeVec(pos.nodeId)}
            name={name}
            color={i % 2 === 0 ? "#22c55e" : "#eab308"}
            active={active}
            attacking={attackingId === pos.characterId}
          />
        );
      })}

      {focus && <FocusCamera target={focus} />}
    </Canvas>
  );
}

/** Gently eases the camera toward a focus point (client-only; no state). */
function FocusCamera({ target }: { target: Vec3 }) {
  const camera = useThree((s) => s.camera);
  const desired = new Vector3(target[0] + 6, 10, target[2] + 12);
  useFrame((_, delta) => {
    camera.position.lerp(desired, 1 - Math.exp(-delta * 1.5));
    camera.lookAt(target[0], 0, target[2]);
  });
  return null;
}

function Node({
  id,
  position,
  active,
  selected,
  kind,
}: {
  id: string;
  position: Vec3;
  active: boolean;
  selected: boolean;
  kind: NodeKind;
}) {
  const base = kind === "plain" ? "#1f2937" : KIND_COLOR[kind];
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[1.2, 0.6, 1.2]} />
        <meshStandardMaterial
          color={active ? "#a16207" : base}
          emissive={active ? "#eab308" : selected ? "#3b82f6" : kind === "plain" ? "#000000" : base}
          emissiveIntensity={active ? 0.4 : selected ? 0.35 : kind === "plain" ? 0 : 0.25}
          metalness={0.3}
          roughness={0.7}
        />
      </mesh>
      <Html position={[0, 1, 0]} center distanceFactor={14}>
        <span className="pointer-events-none rounded bg-zinc-900/80 px-1.5 py-0.5 text-xs font-semibold tracking-widest text-zinc-200">
          {id}
          {kind !== "plain" && <span style={{ color: KIND_COLOR[kind] }}> · {KIND_TAG[kind]}</span>}
        </span>
      </Html>
    </group>
  );
}

function PlayerPiece({
  target,
  name,
  color,
  active,
  attacking,
}: {
  target: Vec3;
  name: string;
  color: string;
  active: boolean;
  attacking: boolean;
}) {
  const ref = useRef<Group>(null);
  const cur = useRef<Vector3 | null>(null);

  useFrame((_, delta) => {
    if (!cur.current) cur.current = new Vector3(target[0], 0, target[2]);
    const t = 1 - Math.exp(-delta * 8);
    // Lerp toward the CURRENT authoritative target; always reconciles to server.
    cur.current.x += (target[0] - cur.current.x) * t;
    cur.current.z += (target[2] - cur.current.z) * t;
    const bounce = attacking
      ? Math.abs(Math.sin(performance.now() * 0.02)) * 0.6
      : active
        ? Math.abs(Math.sin(performance.now() * 0.002)) * 0.15
        : 0;
    ref.current?.position.set(cur.current.x, bounce, cur.current.z);
  });

  return (
    <group ref={ref}>
      <mesh position={[0, 1.2, 0]}>
        <sphereGeometry args={[0.45, 16, 16]} />
        <meshStandardMaterial color={color} emissive={active ? "#eab308" : "#000000"} emissiveIntensity={active ? 0.8 : 0} />
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
