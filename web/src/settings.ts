import type { BaseProfile, NameplateRequest, NameplateSizes, PresetId } from "../../src/nameplate";
import { BASE_PRESETS, checkDimensions } from "../../src/nameplate";

/** Everything the form controls, except the font bytes themselves. */
export interface Settings {
  name: string;
  preset: PresetId;
  /** Measured dimensions that override the preset. */
  measured: Partial<BaseProfile>;
  /** Sizes that differ from the defaults. */
  sizes: Partial<NameplateSizes>;
}

export const DEFAULT_SETTINGS: Settings = {
  name: "Pedro Kantor",
  preset: "32",
  measured: {},
  sizes: {},
};

// Query keys mirror the CLI's flags.
export const PROFILE_KEYS: Record<string, keyof BaseProfile> = {
  "bottom-diameter": "bottomDiameter",
  "top-diameter": "topDiameter",
  height: "height",
};
export const SIZE_KEYS: Record<string, keyof NameplateSizes> = {
  "strip-height": "stripHeight",
  "cap-height": "capHeight",
  backing: "backing",
  relief: "relief",
  "end-padding": "endPadding",
};

/**
 * Reads settings from a query string; anything missing, unparseable or that the core would refuse as a size or
 * base profile falls back to its default. Numbers are taken in key order, so of two that clash the later one goes.
 */
export function settingsFromQuery(search: string): Settings {
  const query = new URLSearchParams(search);
  const number = (key: string) => {
    const raw = query.get(key);
    const value = raw === null || raw.trim() === "" ? NaN : Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  const base = query.get("base");
  const settings: Settings = {
    name: query.get("name") ?? DEFAULT_SETTINGS.name,
    preset: base !== null && base in BASE_PRESETS ? (base as PresetId) : DEFAULT_SETTINGS.preset,
    measured: {},
    sizes: {},
  };
  const sensible = ({ preset, measured, sizes }: Settings) => !checkDimensions({ preset, ...measured }, sizes);
  for (const [key, field] of Object.entries(PROFILE_KEYS)) {
    const value = number(key);
    const measured = { ...settings.measured, [field]: value };
    if (value !== undefined && sensible({ ...settings, measured })) settings.measured = measured;
  }
  for (const [key, field] of Object.entries(SIZE_KEYS)) {
    const value = number(key);
    const sizes = { ...settings.sizes, [field]: value };
    if (value !== undefined && sensible({ ...settings, sizes })) settings.sizes = sizes;
  }
  return settings;
}

/** Whether a link was made with the user's own font, which it can't carry. */
export const madeWithCustomFont = (search: string) => new URLSearchParams(search).get("font") === "custom";

export function settingsToQuery(settings: Settings, customFont: boolean): string {
  const query = new URLSearchParams({ name: settings.name, base: settings.preset });
  for (const [key, field] of Object.entries(PROFILE_KEYS)) {
    const value = settings.measured[field];
    if (value !== undefined) query.set(key, String(value));
  }
  for (const [key, field] of Object.entries(SIZE_KEYS)) {
    const value = settings.sizes[field];
    if (value !== undefined) query.set(key, String(value));
  }
  if (customFont) query.set("font", "custom");
  return `?${query}`;
}

export function settingsToRequest(settings: Settings, font: ArrayBuffer): NameplateRequest {
  return { name: settings.name, base: { preset: settings.preset, ...settings.measured }, sizes: settings.sizes, font };
}
