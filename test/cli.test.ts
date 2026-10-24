import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const run = promisify(execFile);

it("writes a printable STL for Pedro Kantor on a 32 mm base", async () => {
  const out = join(mkdtempSync(join(tmpdir(), "nameplate-")), "kantor.stl");

  const { stdout } = await run("npx", ["tsx", "src/cli.ts", "Pedro Kantor", "--base", "32", "-o", out]);

  expect(stdout).toMatch(/\d+(\.\d+)?°/);
  const stl = readFileSync(out);
  const triangles = stl.readUInt32LE(80);
  expect(triangles).toBeGreaterThan(100);
  expect(stl.length).toBe(84 + 50 * triangles);

  let maxRadius = 0, minZ = Infinity, maxZ = -Infinity;
  for (let t = 0; t < triangles; t++) {
    for (let v = 0; v < 3; v++) {
      const at = 84 + t * 50 + 12 + v * 12;
      const [x, y, z] = [stl.readFloatLE(at), stl.readFloatLE(at + 4), stl.readFloatLE(at + 8)];
      maxRadius = Math.max(maxRadius, Math.hypot(x, y));
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  // 32 mm preset: 16 mm bottom radius, 4 mm tall; the plate stands at most 1.2 mm proud of the rim.
  expect(maxRadius).toBeGreaterThan(15);
  expect(maxRadius).toBeLessThan(17.2);
  expect(minZ).toBeGreaterThanOrEqual(0);
  expect(maxZ).toBeLessThanOrEqual(4.5);
}, 30_000);

it("exits non-zero with the reason when the nameplate can't be made", async () => {
  const failing = run("npx", ["tsx", "src/cli.ts", "Pedro Kantor", "--base", "32", "--strip-height", "9"]);

  await expect(failing).rejects.toMatchObject({ code: 1, stderr: expect.stringMatching(/slope/) });
}, 30_000);
