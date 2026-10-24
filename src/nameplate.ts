import Module, { type CrossSection, type ManifoldToplevel, type SimplePolygon } from "manifold-3d";
import { parse, type Font, type PathCommand } from "opentype.js/dist/opentype.mjs";

export type PresetId = "25" | "32" | "40";

/** Shape of a base: diameters of the bottom and top faces and the height between them, in mm. */
export interface BaseProfile {
  bottomDiameter: number;
  topDiameter: number;
  height: number;
}

// Approximate figures pieced together from hobbyist sources; replace with caliper measurements.
export const BASE_PRESETS: Record<PresetId, BaseProfile> = {
  "25": { bottomDiameter: 25, topDiameter: 23, height: 4 },
  "32": { bottomDiameter: 32, topDiameter: 29.5, height: 4 },
  "40": { bottomDiameter: 40, topDiameter: 37, height: 4 },
};

export interface NameplateSizes {
  /** Height of the strip, measured along the rim's slope. */
  stripHeight: number;
  /** Height of the capital letters, measured along the rim's slope. */
  capHeight: number;
  /** Thickness of the strip the letters stand on. */
  backing: number;
  /** How far the letters stand out from the backing. */
  relief: number;
  /** Clear space between the text and each end of the strip, along the rim. */
  endPadding: number;
}

export const DEFAULT_SIZES: NameplateSizes = {
  stripHeight: 3.2,
  capHeight: 2.0,
  backing: 0.8,
  relief: 0.4,
  endPadding: 2.0,
};

export interface NameplateRequest {
  name: string;
  /** A preset, a full profile, or a preset with some dimensions overridden. */
  base: { preset?: PresetId } & Partial<BaseProfile>;
  /** TTF/OTF font file contents. */
  font: ArrayBuffer;
  sizes?: Partial<NameplateSizes>;
}

/** Triangle mesh in mm: base axis is +z, base bottom face at z = 0, plate centred on +x. */
export interface NameplateMesh {
  positions: Float32Array;
  triangles: Uint32Array;
}

export interface NameplateError {
  kind:
    | "arc-too-large"
    | "invalid-base-profile"
    | "invalid-sizes"
    | "strip-taller-than-rim"
    | "font-unreadable"
    | "missing-glyph";
  message: string;
}

export const MAX_ARC_DEGREES = 180;

export interface NameplateReport {
  /** How far around the rim the plate reaches, in degrees. */
  arcDegrees: number;
  /** Plate length along the strip's centreline, in mm. */
  length: number;
}

export type NameplateResult =
  | { ok: true; mesh: NameplateMesh; report: NameplateReport }
  | { ok: false; error: NameplateError };

// Mesh edge length used before bending, so flat faces follow the rim's curve closely.
const BEND_EDGE_LENGTH = 0.4;
// Letters are sunk slightly into the backing so the union has no coplanar faces.
const RELIEF_OVERLAP = 0.05;
const CURVE_SEGMENTS = 8;

let manifold: Promise<ManifoldToplevel> | undefined;
const loadManifold = (): Promise<ManifoldToplevel> =>
  (manifold ??= Module().then((wasm) => {
    wasm.setup();
    return wasm;
  }));

export async function generateNameplate(request: NameplateRequest): Promise<NameplateResult> {
  const wasm = await loadManifold();
  const sizes = { ...DEFAULT_SIZES, ...request.sizes };
  const profile = resolveProfile(request.base);
  if (typeof profile === "string") return failure("invalid-base-profile", `Invalid base profile: ${profile}.`);
  const sizeProblem = checkSizes(sizes);
  if (sizeProblem) return failure("invalid-sizes", `Invalid sizes: ${sizeProblem}.`);
  const rim = rimGeometry(profile);
  if (sizes.stripHeight > rim.slant) {
    return failure(
      "strip-taller-than-rim",
      `A ${sizes.stripHeight} mm strip doesn't fit on a rim whose slope is ${rim.slant.toFixed(2)} mm.`,
    );
  }
  const font = readFont(request.font);
  if (!font) return failure("font-unreadable", "The font file couldn't be read as a TTF or OTF font.");
  const text = request.name.toUpperCase();
  const missing = [...new Set(text)].filter((c) => c.trim() && font.charToGlyphIndex(c) === 0);
  if (missing.length) {
    return failure("missing-glyph", `The font has no glyph for: ${missing.join(" ")}`);
  }

  const layout = layoutText(font, text, sizes.capHeight);
  const length = layout.width + 2 * sizes.endPadding;
  const centreRadius = rim.radiusAt(rim.slant / 2);
  const arcDegrees = ((length / centreRadius) * 180) / Math.PI;
  if (arcDegrees > MAX_ARC_DEGREES) {
    return failure(
      "arc-too-large",
      `"${request.name}" needs ${Math.round(arcDegrees)}° of rim but a nameplate may reach at most ` +
        `${MAX_ARC_DEGREES}°. Try a cap height of ${fittingCapHeight(sizes, layout.width, centreRadius).toFixed(2)} mm or less.`,
    );
  }

  const flat = flatPlate(wasm, layout.contours, length, sizes);
  const bent = flat.refineToLength(BEND_EDGE_LENGTH).warp((vert) => {
    const [u, v, w] = vert;
    const s = rim.slant / 2 + v;
    const radius = rim.radiusAt(s) + w * rim.sin;
    const z = s * rim.sin + w * rim.cos;
    const theta = u / centreRadius;
    vert[0] = radius * Math.cos(theta);
    vert[1] = radius * Math.sin(theta);
    vert[2] = z;
  });

  const mesh = bent.getMesh();
  const positions = new Float32Array(mesh.numVert * 3);
  for (let i = 0; i < mesh.numVert; i++) {
    positions.set(mesh.vertProperties.subarray(i * mesh.numProp, i * mesh.numProp + 3), i * 3);
  }
  return {
    ok: true,
    mesh: { positions, triangles: new Uint32Array(mesh.triVerts) },
    report: { arcDegrees, length },
  };
}

const failure = (kind: NameplateError["kind"], message: string): NameplateResult => ({
  ok: false,
  error: { kind, message },
});

/** The preset's profile with any measured dimensions applied, or why it isn't a usable base. */
function resolveProfile({ preset, ...overrides }: NameplateRequest["base"]): BaseProfile | string {
  const { bottomDiameter, topDiameter, height } = { ...(preset ? BASE_PRESETS[preset] : {}), ...overrides };
  if (bottomDiameter === undefined || topDiameter === undefined || height === undefined) {
    return "give a preset, or all of bottom diameter, top diameter and height";
  }
  if (!(bottomDiameter > 0 && topDiameter > 0 && height > 0)) return "dimensions must be positive";
  if (topDiameter >= bottomDiameter) return "the top diameter must be smaller than the bottom diameter";
  return { bottomDiameter, topDiameter, height };
}

function checkSizes(sizes: NameplateSizes): string | undefined {
  const { stripHeight, capHeight, backing, relief, endPadding } = sizes;
  if (!(stripHeight > 0 && capHeight > 0 && backing > 0 && relief > 0)) {
    return "strip height, cap height, backing and relief must be positive";
  }
  if (!(endPadding >= 0)) return "end padding can't be negative";
  if (capHeight > stripHeight) return "the cap height must not exceed the strip height";
  return undefined;
}

/** Largest cap height whose text, scaled down proportionally, keeps the plate within the arc limit. */
function fittingCapHeight(sizes: NameplateSizes, textWidth: number, centreRadius: number): number {
  const maxLength = (MAX_ARC_DEGREES * Math.PI * centreRadius) / 180;
  return (sizes.capHeight * (maxLength - 2 * sizes.endPadding)) / textWidth;
}

function readFont(bytes: ArrayBuffer): Font | undefined {
  try {
    return parse(bytes);
  } catch {
    return undefined;
  }
}

/**
 * The rim as a cone frustum, parametrised by s, the distance up the slope from the bottom edge.
 * sin and cos are of the slope angle measured from the horizontal.
 */
function rimGeometry(profile: BaseProfile) {
  const inset = (profile.bottomDiameter - profile.topDiameter) / 2;
  const slant = Math.hypot(inset, profile.height);
  const sin = profile.height / slant;
  const cos = inset / slant;
  return { slant, sin, cos, radiusAt: (s: number) => profile.bottomDiameter / 2 - s * cos };
}

/**
 * Glyph outlines in plate coordinates: u along the rim (text centred on u = 0, reading towards +u),
 * v up the slope (cap height centred on v = 0).
 */
function layoutText(font: Font, text: string, capHeight: number) {
  const capUnits = font.tables.os2?.sCapHeight || font.charToGlyph("H").getBoundingBox().y2;
  const fontSize = (capHeight * font.unitsPerEm) / capUnits;
  const width = font.getAdvanceWidth(text, fontSize);
  const toPlate = (x: number, y: number): [number, number] => [x - width / 2, -y - capHeight / 2];
  return { width, contours: flattenPath(font.getPath(text, 0, 0, fontSize).commands, toPlate) };
}

function flattenPath(
  commands: PathCommand[],
  toPlate: (x: number, y: number) => [number, number],
): SimplePolygon[] {
  const contours: SimplePolygon[] = [];
  let contour: [number, number][] = [];
  let x = 0;
  let y = 0;
  const close = () => {
    const first = contour[0];
    const last = contour[contour.length - 1];
    if (first && last && first[0] === last[0] && first[1] === last[1]) contour.pop();
    if (contour.length >= 3) contours.push(contour.map(([px, py]) => toPlate(px, py)));
    contour = [];
  };
  for (const c of commands) {
    if (c.type === "M") {
      close();
      contour.push([(x = c.x), (y = c.y)]);
    } else if (c.type === "L") {
      contour.push([(x = c.x), (y = c.y)]);
    } else if (c.type === "Q") {
      for (let i = 1; i <= CURVE_SEGMENTS; i++) {
        const t = i / CURVE_SEGMENTS;
        const a = (1 - t) ** 2, b = 2 * (1 - t) * t, d = t ** 2;
        contour.push([a * x + b * c.x1 + d * c.x, a * y + b * c.y1 + d * c.y]);
      }
      x = c.x;
      y = c.y;
    } else if (c.type === "C") {
      for (let i = 1; i <= CURVE_SEGMENTS; i++) {
        const t = i / CURVE_SEGMENTS;
        const a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, e = 3 * (1 - t) * t ** 2, d = t ** 3;
        contour.push([
          a * x + b * c.x1 + e * c.x2 + d * c.x,
          a * y + b * c.y1 + e * c.y2 + d * c.y,
        ]);
      }
      x = c.x;
      y = c.y;
    } else if (c.type === "Z") {
      close();
    }
  }
  close();
  return contours;
}

/** The unbent plate: u along the rim, v up the slope, w outward from the rim (back face at w = 0). */
function flatPlate(wasm: ManifoldToplevel, glyphs: SimplePolygon[], length: number, sizes: NameplateSizes) {
  const { CrossSection } = wasm;
  const radius = sizes.stripHeight / 2;
  const endCentre = length / 2 - radius;
  const outline: CrossSection = CrossSection.hull([
    CrossSection.circle(radius).translate([-endCentre, 0]),
    CrossSection.circle(radius).translate([endCentre, 0]),
  ]);
  const backing = outline.extrude(sizes.backing);
  const letters = new CrossSection(glyphs, "NonZero")
    .extrude(sizes.relief + RELIEF_OVERLAP)
    .translate([0, 0, sizes.backing - RELIEF_OVERLAP]);
  return backing.add(letters);
}
