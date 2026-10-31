import { describe, expect, it } from "vitest";
import { DEFAULT_SIZES, generateNameplate } from "../src/nameplate.js";
import { angularExtent, backFaceDistances, cinzel, componentCount, isWatertight, rimCoordinates } from "./mesh-properties.js";

const kantor = { name: "Pedro Kantor", base: { preset: "32" as const }, font: cinzel() };

describe("generateNameplate", () => {
  it("produces a single watertight solid for Pedro Kantor on a 32 mm base", async () => {
    const result = await generateNameplate(kantor);

    if (!result.ok) throw new Error(result.error.message);
    expect(isWatertight(result.mesh)).toBe(true);
    expect(componentCount(result.mesh)).toBe(1);
  });

  it("reports an arc angle that matches the plate's extent around the rim", async () => {
    const result = await generateNameplate(kantor);

    if (!result.ok) throw new Error(result.error.message);
    expect(result.report).toMatchObject({ stripHeight: 3.2, capHeight: 2.0, backing: 0.8, relief: 0.4 });
    // "PEDRO KANTOR" at 2 mm caps is roughly 25 mm of plate on a ~96 mm rim.
    expect(result.report.arcDegrees).toBeGreaterThan(70);
    expect(result.report.arcDegrees).toBeLessThan(120);
    expect(angularExtent(result.mesh)).toBeCloseTo(result.report.arcDegrees, 1);
  });

  it("reports the true extent of a plate whose name is shorter than its rounded ends", async () => {
    const result = await generateNameplate({ ...kantor, name: "I", sizes: { endPadding: 0 } });

    if (!result.ok) throw new Error(result.error.message);
    expect(result.report.length).toBeGreaterThanOrEqual(DEFAULT_SIZES.stripHeight);
    expect(angularExtent(result.mesh)).toBeCloseTo(result.report.arcDegrees, 1);
  });

  it("marks the raised letters' faces apart from the strip's, split at the backing's front face", async () => {
    const result = await generateNameplate(kantor);

    if (!result.ok) throw new Error(result.error.message);
    const { triangles, letters } = result.mesh;
    expect(letters.length).toBe(triangles.length / 3);
    const out = rimCoordinates(result.mesh, { bottomDiameter: 32, topDiameter: 29.5, height: 4 }).map((p) => p.out);
    const letterOut: number[] = [];
    const stripOut: number[] = [];
    letters.forEach((isLetter, t) => {
      for (let k = 0; k < 3; k++) (isLetter ? letterOut : stripOut).push(out[triangles[t * 3 + k]!]!);
    });
    expect(letterOut.length).toBeGreaterThan(0);
    expect(Math.min(...letterOut)).toBeGreaterThan(DEFAULT_SIZES.backing - 1e-3);
    expect(Math.max(...letterOut)).toBeCloseTo(DEFAULT_SIZES.backing + DEFAULT_SIZES.relief, 3);
    expect(Math.max(...stripOut)).toBeLessThan(DEFAULT_SIZES.backing + 1e-3);
  });

  it("lengthens the arc by the extra end padding over the strip's centreline radius", async () => {
    const short = await generateNameplate({ ...kantor, sizes: { endPadding: 2 } });
    const long = await generateNameplate({ ...kantor, sizes: { endPadding: 3 } });

    if (!short.ok || !long.ok) throw new Error("expected both plates to generate");
    // 32 mm preset: centreline radius (16 + 14.75) / 2 = 15.375 mm; 2 mm extra → 7.453°.
    expect(long.report.arcDegrees - short.report.arcDegrees).toBeCloseTo(7.453, 2);
  });

  describe.each([
    { label: "25 mm preset", base: { preset: "25" as const }, dims: { bottomDiameter: 25, topDiameter: 23, height: 4 } },
    { label: "32 mm preset", base: { preset: "32" as const }, dims: { bottomDiameter: 32, topDiameter: 29.5, height: 4 } },
    { label: "40 mm preset", base: { preset: "40" as const }, dims: { bottomDiameter: 40, topDiameter: 37, height: 4 } },
    {
      label: "measured profile",
      base: { bottomDiameter: 50, topDiameter: 46, height: 5 },
      dims: { bottomDiameter: 50, topDiameter: 46, height: 5 },
    },
    {
      label: "preset with a measured top diameter",
      base: { preset: "32" as const, topDiameter: 30.2 },
      dims: { bottomDiameter: 32, topDiameter: 30.2, height: 4 },
    },
  ])("on a $label", ({ base, dims }) => {
    it("sits flush on the rim without cutting into the base", async () => {
      const result = await generateNameplate({ ...kantor, base });

      if (!result.ok) throw new Error(result.error.message);
      const rim = rimCoordinates(result.mesh, dims);
      expect(Math.min(...rim.map((p) => p.out))).toBeGreaterThan(-1e-3);
      const back = backFaceDistances(result.mesh, dims);
      expect(back.length).toBeGreaterThan(100);
      expect(Math.max(...back.map(Math.abs))).toBeLessThan(1e-3);
    });

    it("is centred on the rim's slope", async () => {
      const result = await generateNameplate({ ...kantor, base });

      if (!result.ok) throw new Error(result.error.message);
      const up = rimCoordinates(result.mesh, dims).map((p) => p.up);
      const slant = Math.hypot((dims.bottomDiameter - dims.topDiameter) / 2, dims.height);
      expect((Math.min(...up) + Math.max(...up)) / 2).toBeCloseTo(slant / 2, 3);
    });
  });

  it("produces identical output for identical requests", async () => {
    const first = await generateNameplate(kantor);
    const second = await generateNameplate(kantor);

    if (!first.ok || !second.ok) throw new Error("expected both plates to generate");
    expect(second.mesh.positions).toEqual(first.mesh.positions);
    expect(second.mesh.triangles).toEqual(first.mesh.triangles);
  });

  describe("refuses", () => {
    it("a name that would reach more than 180° around the rim", async () => {
      const result = await generateNameplate({ ...kantor, name: "Pedro Kantor, Chapter Master of the Crimson Fists" });

      if (result.ok) throw new Error("expected an error");
      expect(result.error.kind).toBe("arc-too-large");
      expect(result.error.message).toMatch(/\d+° .*180°/);
      expect(result.error.message).toMatch(/cap height/i);
    });

    it("a plate whose end padding alone exceeds 180°, suggesting less padding", async () => {
      // 32 mm preset: 180° of the centreline is π × 15.375 ≈ 48.3 mm, less than 2 × 25 mm of padding.
      const result = await generateNameplate({ ...kantor, sizes: { endPadding: 25 } });

      if (result.ok) throw new Error("expected an error");
      expect(result.error.kind).toBe("arc-too-large");
      expect(result.error.message).toMatch(/end padding/i);
      expect(result.error.message).not.toMatch(/-\d/);
    });

    it.each([
      { problem: "a top wider than the bottom", base: { bottomDiameter: 30, topDiameter: 32, height: 4 } },
      { problem: "a vertical rim", base: { bottomDiameter: 32, topDiameter: 32, height: 4 } },
      { problem: "a zero height", base: { bottomDiameter: 32, topDiameter: 29.5, height: 0 } },
      { problem: "a negative diameter", base: { bottomDiameter: 32, topDiameter: -1, height: 4 } },
      { problem: "a missing dimension and no preset", base: { bottomDiameter: 32, height: 4 } },
    ])("a base profile with $problem", async ({ base }) => {
      const result = await generateNameplate({ ...kantor, base });

      if (result.ok) throw new Error("expected an error");
      expect(result.error.kind).toBe("invalid-base-profile");
    });

    it("a strip taller than the rim's slope", async () => {
      // 32 mm preset: slope is hypot(1.25, 4) ≈ 4.19 mm.
      const result = await generateNameplate({ ...kantor, sizes: { stripHeight: 4.5 } });

      if (result.ok) throw new Error("expected an error");
      expect(result.error.kind).toBe("strip-taller-than-rim");
      expect(result.error.message).toMatch(/4\.19/);
    });

    it.each([
      { problem: "capitals taller than the strip", sizes: { capHeight: 3.5 } },
      { problem: "no backing", sizes: { backing: 0 } },
      { problem: "negative relief", sizes: { relief: -0.4 } },
      { problem: "negative end padding", sizes: { endPadding: -1 } },
    ])("sizes with $problem", async ({ sizes }) => {
      const result = await generateNameplate({ ...kantor, sizes });

      if (result.ok) throw new Error("expected an error");
      expect(result.error.kind).toBe("invalid-sizes");
    });

    it("a font file it can't read", async () => {
      const result = await generateNameplate({ ...kantor, font: new TextEncoder().encode("not a font").buffer });

      if (result.ok) throw new Error("expected an error");
      expect(result.error.kind).toBe("font-unreadable");
    });

    it("a name with characters the font has no glyph for", async () => {
      const result = await generateNameplate({ ...kantor, name: "Pedro 漢 Kantor" });

      if (result.ok) throw new Error("expected an error");
      expect(result.error.kind).toBe("missing-glyph");
      expect(result.error.message).toContain("漢");
    });
  });

  it("has the requested strip height, backing and relief", async () => {
    const result = await generateNameplate({
      ...kantor,
      sizes: { stripHeight: 3.6, capHeight: 2.2, backing: 1.0, relief: 0.3 },
    });

    if (!result.ok) throw new Error(result.error.message);
    const rim = rimCoordinates(result.mesh, { bottomDiameter: 32, topDiameter: 29.5, height: 4 });
    const up = rim.map((p) => p.up);
    expect(Math.max(...up) - Math.min(...up)).toBeCloseTo(3.6, 3);
    expect(Math.max(...rim.map((p) => p.out))).toBeCloseTo(1.3, 3);
    // The backing's outer face is the most common outward distance after the back face.
    expect(rim.filter((p) => Math.abs(p.out - 1.0) < 1e-3).length).toBeGreaterThan(100);
  });
});
