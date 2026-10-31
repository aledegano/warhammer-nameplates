// Regenerates the README images of Pedro Kantor's nameplate: `npm run render`.
// A small orthographic z-buffer renderer, so the images need no 3D software to reproduce.
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { BASE_PRESETS, generateNameplate, type BaseProfile, type NameplateMesh } from "../src/nameplate.js";

type Vec3 = [number, number, number];
type Triangle = { vertices: [Vec3, Vec3, Vec3]; colour: Vec3 };

// Painted look: stone-grey strip, gold raised letters.
const PLATE_COLOUR: Vec3 = [130, 139, 143];
const LETTER_COLOUR: Vec3 = [222, 205, 170];
const BASE_COLOUR: Vec3 = [70, 74, 80];
const LIGHT: Vec3 = [0.35, 0.55, 0.76];
const SUPERSAMPLING = 3;
const BASE_SEGMENTS = 160;

const font = readFileSync(new URL("../fonts/cinzel/Cinzel.ttf", import.meta.url));
const profile = BASE_PRESETS["32"];
const result = await generateNameplate({
  name: "Pedro Kantor",
  base: { preset: "32" },
  font: font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength) as ArrayBuffer,
});
if (!result.ok) throw new Error(result.error.message);

const plate = meshTriangles(result.mesh);
const images = new URL("../docs/images/", import.meta.url);
writeFileSync(
  new URL("pedro-kantor-on-base.png", images),
  render([...plate, ...baseTriangles(profile)], { yaw: 0, pitch: 28, width: 1000, height: 560 }),
);
writeFileSync(new URL("pedro-kantor-front.png", images), render(plate, { yaw: 0, pitch: 0, width: 1000, height: 170 }));
console.log("Wrote docs/images/pedro-kantor-on-base.png and docs/images/pedro-kantor-front.png");

function meshTriangles(mesh: NameplateMesh): Triangle[] {
  const vertex = (i: number): Vec3 => [mesh.positions[i * 3]!, mesh.positions[i * 3 + 1]!, mesh.positions[i * 3 + 2]!];
  const triangles: Triangle[] = [];
  for (let t = 0; t < mesh.triangles.length; t += 3) {
    const [a, b, c] = [mesh.triangles[t]!, mesh.triangles[t + 1]!, mesh.triangles[t + 2]!];
    const colour = mesh.letters[t / 3] ? LETTER_COLOUR : PLATE_COLOUR;
    triangles.push({ vertices: [vertex(a), vertex(b), vertex(c)], colour });
  }
  return triangles;
}

/** A stand-in base: the rim's cone frustum and its top face. */
function baseTriangles({ bottomDiameter, topDiameter, height }: BaseProfile): Triangle[] {
  const ring = (diameter: number, z: number, angle: number): Vec3 => [
    (diameter / 2) * Math.cos(angle),
    (diameter / 2) * Math.sin(angle),
    z,
  ];
  const triangles: Triangle[] = [];
  for (let i = 0; i < BASE_SEGMENTS; i++) {
    const [a, b] = [i, i + 1].map((k) => (k / BASE_SEGMENTS) * 2 * Math.PI) as [number, number];
    const [b0, b1] = [ring(bottomDiameter, 0, a), ring(bottomDiameter, 0, b)];
    const [t0, t1] = [ring(topDiameter, height, a), ring(topDiameter, height, b)];
    triangles.push(
      { vertices: [b0, b1, t1], colour: BASE_COLOUR },
      { vertices: [b0, t1, t0], colour: BASE_COLOUR },
      { vertices: [[0, 0, height], t0, t1], colour: BASE_COLOUR },
    );
  }
  return triangles;
}

/** Renders to PNG bytes, looking at the base axis from +x (turned by yaw), tilted down by pitch degrees. */
function render(triangles: Triangle[], camera: { yaw: number; pitch: number; width: number; height: number }) {
  const yaw = (camera.yaw * Math.PI) / 180;
  const pitch = (camera.pitch * Math.PI) / 180;
  const [W, H] = [camera.width * SUPERSAMPLING, camera.height * SUPERSAMPLING];
  // View space: x right, y up, z towards the camera.
  const view = ([x, y, z]: Vec3): Vec3 => {
    const forward = x * Math.cos(yaw) + y * Math.sin(yaw);
    const right = -x * Math.sin(yaw) + y * Math.cos(yaw);
    return [right, z * Math.cos(pitch) - forward * Math.sin(pitch), forward * Math.cos(pitch) + z * Math.sin(pitch)];
  };
  const viewed = triangles.map((t) => ({ vertices: t.vertices.map(view) as Triangle["vertices"], colour: t.colour }));
  const all = viewed.flatMap((t) => t.vertices);
  const [minX, maxX] = [Math.min(...all.map((v) => v[0])), Math.max(...all.map((v) => v[0]))];
  const [minY, maxY] = [Math.min(...all.map((v) => v[1])), Math.max(...all.map((v) => v[1]))];
  const scale = 0.9 * Math.min(W / (maxX - minX), H / (maxY - minY));
  const toPixel = ([x, y, d]: Vec3): Vec3 => [
    W / 2 + (x - (minX + maxX) / 2) * scale,
    H / 2 - (y - (minY + maxY) / 2) * scale,
    d,
  ];

  const depth = new Float32Array(W * H).fill(-Infinity);
  const image = new Float32Array(W * H * 3).fill(1);
  for (const { vertices, colour } of viewed) {
    const [a, b, c] = vertices;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const length = Math.hypot(normal[0]!, normal[1]!, normal[2]!);
    if (length === 0 || normal[2]! <= 0) continue; // degenerate or facing away
    const diffuse = Math.max(0, (normal[0]! * LIGHT[0] + normal[1]! * LIGHT[1] + normal[2]! * LIGHT[2]) / length);
    const shade = 0.35 + 0.65 * diffuse;
    const p = vertices.map(toPixel);
    const [p0, p1, p2] = [p[0]!, p[1]!, p[2]!];
    const area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
    const x0 = Math.max(0, Math.floor(Math.min(p0[0], p1[0], p2[0])));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(p0[0], p1[0], p2[0])));
    const y0 = Math.max(0, Math.floor(Math.min(p0[1], p1[1], p2[1])));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(p0[1], p1[1], p2[1])));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const [px, py] = [x + 0.5, y + 0.5];
        const l0 = ((p1[0] - px) * (p2[1] - py) - (p2[0] - px) * (p1[1] - py)) / area;
        const l1 = ((p2[0] - px) * (p0[1] - py) - (p0[0] - px) * (p2[1] - py)) / area;
        const l2 = 1 - l0 - l1;
        if (l0 < 0 || l1 < 0 || l2 < 0) continue;
        const d = l0 * p0[2] + l1 * p1[2] + l2 * p2[2];
        if (d <= depth[y * W + x]!) continue;
        depth[y * W + x] = d;
        for (let k = 0; k < 3; k++) image[(y * W + x) * 3 + k] = (colour[k]! / 255) * shade;
      }
    }
  }
  return encodePng(downsample(image, camera.width, camera.height), camera.width, camera.height);
}

/** Averages each SUPERSAMPLING² block into one 8-bit RGB pixel. */
function downsample(image: Float32Array, width: number, height: number): Uint8Array {
  const W = width * SUPERSAMPLING;
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < 3; k++) {
        let sum = 0;
        for (let sy = 0; sy < SUPERSAMPLING; sy++) {
          for (let sx = 0; sx < SUPERSAMPLING; sx++) {
            sum += image[((y * SUPERSAMPLING + sy) * W + x * SUPERSAMPLING + sx) * 3 + k]!;
          }
        }
        rgb[(y * width + x) * 3 + k] = Math.round((sum / SUPERSAMPLING ** 2) * 255);
      }
    }
  }
  return rgb;
}

function encodePng(rgb: Uint8Array, width: number, height: number): Buffer {
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) rows.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(rows, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function crc32(bytes: Buffer): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}
