#!/usr/bin/env -S npx tsx
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  BASE_PRESETS,
  DEFAULT_SIZES,
  generateNameplate,
  type NameplateRequest,
  type NameplateSizes,
  type PresetId,
} from "./nameplate.js";
import { toStl } from "./stl.js";

const DEFAULT_FONT = new URL("../fonts/cinzel/Cinzel.ttf", import.meta.url);

const presetList = Object.entries(BASE_PRESETS)
  .map(([id, p]) => `${id} (${p.bottomDiameter}/${p.topDiameter}/${p.height})`)
  .join(", ");

const HELP = `Usage: nameplate <name> [options]

Writes an STL nameplate that sits on the rim of a round base. All sizes in mm.

Base:
  --base <preset>            Preset base: ${presetList} as bottom/top/height.
                             Presets are approximate; measure your base for a tight fit.
  --bottom-diameter <mm>     Measured bottom diameter (overrides the preset)
  --top-diameter <mm>        Measured top diameter (overrides the preset)
  --height <mm>              Measured base height (overrides the preset)

Plate:
  --strip-height <mm>        Strip height along the rim's slope (default ${DEFAULT_SIZES.stripHeight})
  --cap-height <mm>          Capital letter height along the slope (default ${DEFAULT_SIZES.capHeight})
  --backing <mm>             Strip thickness behind the letters (default ${DEFAULT_SIZES.backing})
  --relief <mm>              How far letters stand out from the strip (default ${DEFAULT_SIZES.relief})
  --end-padding <mm>         Space between the text and each end (default ${DEFAULT_SIZES.endPadding})
  --font <file>              TTF/OTF font (default: bundled Cinzel)

Output:
  -o, --output <file>        STL path (default: <name>.stl)
  -h, --help                 Show this help
`;

const sizeFlags: Record<string, keyof NameplateSizes> = {
  "strip-height": "stripHeight",
  "cap-height": "capHeight",
  backing: "backing",
  relief: "relief",
  "end-padding": "endPadding",
};
const profileFlags = { "bottom-diameter": "bottomDiameter", "top-diameter": "topDiameter", height: "height" } as const;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    base: { type: "string" },
    font: { type: "string" },
    output: { type: "string", short: "o" },
    help: { type: "boolean", short: "h" },
    ...Object.fromEntries([...Object.keys(sizeFlags), ...Object.keys(profileFlags)].map((f) => [f, { type: "string" }])),
  },
});

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const millimetres = (flag: string): number | undefined => {
  const raw = (values as Record<string, unknown>)[flag];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fail(`--${flag} must be a number, got "${raw}".`);
};

if (values.help) {
  console.log(HELP);
  process.exit(0);
}
const name = positionals.join(" ").trim();
if (!name) fail(`Give the model's name.\n\n${HELP}`);
if (values.base !== undefined && !(values.base in BASE_PRESETS)) {
  fail(`Unknown base preset "${values.base}". Choose one of: ${Object.keys(BASE_PRESETS).join(", ")}.`);
}

const base: NameplateRequest["base"] = { preset: values.base as PresetId | undefined };
for (const [flag, key] of Object.entries(profileFlags)) {
  const value = millimetres(flag);
  if (value !== undefined) base[key] = value;
}
const sizes: Partial<NameplateSizes> = {};
for (const [flag, key] of Object.entries(sizeFlags)) {
  const value = millimetres(flag);
  if (value !== undefined) sizes[key] = value;
}

const fontPath = typeof values.font === "string" ? values.font : DEFAULT_FONT;
let font: Buffer;
try {
  font = readFileSync(fontPath);
} catch {
  fail(`Couldn't read font file ${fontPath}.`);
}
const result = await generateNameplate({
  name,
  base,
  sizes,
  font: font!.buffer.slice(font!.byteOffset, font!.byteOffset + font!.byteLength) as ArrayBuffer,
});
if (!result.ok) fail(result.error.message);
else {
  const output = typeof values.output === "string" ? values.output : `${name.toLowerCase().replace(/\W+/g, "-")}.stl`;
  writeFileSync(output, toStl(result.mesh));
  const { arcDegrees, length, stripHeight, capHeight, backing, relief } = result.report;
  console.log(
    `Wrote ${output}: ${length.toFixed(1)} mm long (${arcDegrees.toFixed(1)}° of rim), ${stripHeight} mm strip, ` +
      `${capHeight} mm capitals, ${backing} mm backing + ${relief} mm relief.`,
  );
}
