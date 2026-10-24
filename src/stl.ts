import type { NameplateMesh } from "./nameplate.js";

/** Binary STL, units in mm. Facet normals are computed from each triangle's winding. */
export function toStl(mesh: NameplateMesh): Uint8Array {
  const count = mesh.triangles.length / 3;
  const bytes = new Uint8Array(84 + 50 * count);
  const view = new DataView(bytes.buffer);
  view.setUint32(80, count, true);
  const p = mesh.positions;
  for (let t = 0; t < count; t++) {
    const [a, b, c] = [0, 1, 2].map((k) => mesh.triangles[t * 3 + k]! * 3) as [number, number, number];
    const u = [p[b]! - p[a]!, p[b + 1]! - p[a + 1]!, p[b + 2]! - p[a + 2]!];
    const v = [p[c]! - p[a]!, p[c + 1]! - p[a + 1]!, p[c + 2]! - p[a + 2]!];
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const length = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
    const offset = 84 + t * 50;
    n.forEach((value, i) => view.setFloat32(offset + i * 4, value / length, true));
    [a, b, c].forEach((vertex, i) => {
      for (let axis = 0; axis < 3; axis++) {
        view.setFloat32(offset + 12 + i * 12 + axis * 4, p[vertex + axis]!, true);
      }
    });
  }
  return bytes;
}
