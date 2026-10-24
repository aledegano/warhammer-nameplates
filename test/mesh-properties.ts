import { readFileSync } from "node:fs";
import type { NameplateMesh } from "../src/nameplate.js";

export const cinzel = (): ArrayBuffer => {
  const bytes = readFileSync(new URL("../fonts/cinzel/Cinzel.ttf", import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

export const vertices = (mesh: NameplateMesh): [number, number, number][] => {
  const out: [number, number, number][] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    out.push([mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!]);
  }
  return out;
};

/** Angular extent around the base axis, in degrees, for a plate centred on +x. */
export const angularExtent = (mesh: NameplateMesh): number => {
  const angles = vertices(mesh).map(([x, y]) => Math.atan2(y, x));
  return ((Math.max(...angles) - Math.min(...angles)) * 180) / Math.PI;
};

/**
 * Each vertex in rim coordinates for a base with the given dimensions:
 * `out` is the signed distance outward from the rim's cone, `up` the distance up the slope from the bottom edge.
 */
export const rimCoordinates = (
  mesh: NameplateMesh,
  base: { bottomDiameter: number; topDiameter: number; height: number },
) => {
  const bottomRadius = base.bottomDiameter / 2;
  const inset = (base.bottomDiameter - base.topDiameter) / 2;
  const slant = Math.hypot(inset, base.height);
  return vertices(mesh).map(([x, y, z]) => {
    const r = Math.hypot(x, y);
    return {
      out: ((r - bottomRadius) * base.height + z * inset) / slant,
      up: ((bottomRadius - r) * inset + z * base.height) / slant,
    };
  });
};

// Every directed edge must appear exactly once, and its reverse exactly once.
export const isWatertight = (mesh: NameplateMesh): boolean => {
  const directed = new Map<string, number>();
  const t = mesh.triangles;
  for (let i = 0; i < t.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const key = `${t[i + k]}>${t[i + ((k + 1) % 3)]}`;
      directed.set(key, (directed.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of directed) {
    const [a, b] = key.split(">");
    if (count !== 1 || directed.get(`${b}>${a}`) !== 1) return false;
  }
  return directed.size > 0;
};

export const componentCount = (mesh: NameplateMesh): number => {
  const parent = Array.from({ length: mesh.positions.length / 3 }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const t = mesh.triangles;
  for (let i = 0; i < t.length; i += 3) {
    parent[find(t[i]!)] = find(t[i + 1]!);
    parent[find(t[i + 1]!)] = find(t[i + 2]!);
  }
  const used = new Set<number>();
  for (const v of t) used.add(find(v));
  return used.size;
};
