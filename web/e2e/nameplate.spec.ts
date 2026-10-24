import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("opens Pedro Kantor's nameplate from a link", async ({ page }) => {
  await page.goto("?name=Pedro+Kantor&base=32");

  await expect(page.getByLabel("Name")).toHaveValue("Pedro Kantor");
  await expect(page.getByLabel("Base", { exact: true })).toHaveValue("32");
  // The CLI reports 26.7 mm and 99.6° for the same plate.
  await expect(page.getByRole("status")).toContainText("99.6°");
  await expect(page.getByRole("status")).toContainText("26.7 mm");
});

test("keeps the link in step with the settings", async ({ page }) => {
  await page.goto("?name=Pedro+Kantor&base=32");
  await expect(page.getByRole("status")).toContainText("99.6°");

  await page.getByLabel("Cap height").fill("1.6");

  await expect(page).toHaveURL(/cap-height=1\.6/);
  // Smaller capitals make a shorter plate.
  await expect(page.getByRole("status")).not.toContainText("99.6°");
  const arc = Number((await page.getByRole("status").textContent())?.match(/([\d.]+)°/)?.[1]);
  expect(arc).toBeLessThan(99.6);
});

test("downloads the plate as a printable STL", async ({ page }) => {
  await page.goto("?name=Pedro+Kantor&base=32");
  await expect(page.getByRole("status")).toContainText("99.6°");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download STL" }).click(),
  ]);

  expect(download.suggestedFilename()).toBe("pedro-kantor.stl");
  const stl = readFileSync(await download.path());
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
  // Same bounds as the CLI smoke test: 32 mm preset, plate at most 1.2 mm proud of the rim.
  expect(maxRadius).toBeGreaterThan(15);
  expect(maxRadius).toBeLessThan(17.2);
  expect(minZ).toBeGreaterThanOrEqual(0);
  expect(maxZ).toBeLessThanOrEqual(4.5);
});

test("explains why a name is refused and blocks the download", async ({ page }) => {
  await page.goto("?name=Pedro+Kantor&base=32");
  await expect(page.getByRole("status")).toContainText("99.6°");

  await page.getByLabel("Name").fill("Pedro Kantor, Chapter Master of the Crimson Fists");

  await expect(page.getByRole("alert")).toContainText("180°");
  await expect(page.getByRole("alert")).toContainText(/cap height of [\d.]+ mm/);
  await expect(page.getByRole("button", { name: "Download STL" })).toBeDisabled();
});

test("only downloads a plate built from the current settings", async ({ page }) => {
  await page.goto("?name=Pedro+Kantor&base=32");
  await expect(page.getByRole("status")).toContainText("99.6°");
  const downloadButton = page.getByRole("button", { name: "Download STL" });

  await page.getByLabel("Name").fill("Kantor");

  // Until the new plate is built, the shown plate is still Pedro Kantor's.
  await expect(downloadButton).toBeDisabled();
  await expect(page.getByRole("status")).not.toContainText("99.6°");
  await expect(downloadButton).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent("download"), downloadButton.click()]);
  expect(download.suggestedFilename()).toBe("kantor.stl");
});

test("only keeps font=custom in the link while an uploaded font is in use", async ({ page }) => {
  await page.goto("?name=Pedro+Kantor&base=32&font=custom");

  // The opened link was made with a custom font, but the plate shown is in Cinzel.
  await expect(page.getByRole("note")).toContainText("custom font");
  await expect(page).not.toHaveURL(/font=custom/);

  await page.getByLabel("Your own font (TTF/OTF)").setInputFiles("fonts/cinzel/Cinzel.ttf");
  await expect(page).toHaveURL(/font=custom/);
  await expect(page.getByRole("note")).toBeHidden();

  await page.getByRole("button", { name: "Use Cinzel" }).click();
  await expect(page).not.toHaveURL(/font=custom/);
  await expect(page.getByRole("note")).toBeHidden();
});
