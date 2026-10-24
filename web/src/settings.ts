import type { BaseProfile, NameplateRequest, NameplateSizes, PresetId } from "../../src/nameplate";
import { BASE_PRESETS } from "../../src/nameplate";

/** Everything the form controls, except the font bytes themselves. */
export interface Settings {
  name: string;
  preset: PresetId;
  /** Measured dimensions that override the preset. */
  measured: Partial<BaseProfile>;
  /** Sizes that differ from the defaults. */
  sizes: Partial<NameplateSizes>;
  /** Whether the user chose their own font, which a link can't carry. */
  customFont: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  name: "Pedro Kantor",
  preset: "32",
  measured: {},
  sizes: {},
  customFont: false,
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

/** Reads settings from a query string; anything missing or unparseable falls back to its default. */
export function settingsFromQuery(search: string): Settings {
  const query = new URLSearchParams(search);
  const number = (key: string) => {
    const raw = query.get(key);
    const value = raw === null || raw.trim() === "" ? NaN : Number(raw);
    return Number.isFinite(value) ? value : undefined;
  };
  const pick = <K extends string>(keys: Record<string, K>) => {
    const out: Partial<Record<K, number>> = {};
    for (const [key, field] of Object.entries(keys)) {
      const value = number(key);
      if (value !== undefined) out[field] = value;
    }
    return out;
  };
  const base = query.get("base");
  return {
    name: query.get("name") ?? DEFAULT_SETTINGS.name,
    preset: base !== null && base in BASE_PRESETS ? (base as PresetId) : DEFAULT_SETTINGS.preset,
    measured: pick(PROFILE_KEYS),
    sizes: pick(SIZE_KEYS),
    customFont: query.get("font") === "custom",
  };
}

export function settingsToQuery(settings: Settings): string {
  const query = new URLSearchParams({ name: settings.name, base: settings.preset });
  for (const [key, field] of Object.entries(PROFILE_KEYS)) {
    const value = settings.measured[field];
    if (value !== undefined) query.set(key, String(value));
  }
  for (const [key, field] of Object.entries(SIZE_KEYS)) {
    const value = settings.sizes[field];
    if (value !== undefined) query.set(key, String(value));
  }
  if (settings.customFont) query.set("font", "custom");
  return `?${query}`;
}

export function settingsToRequest(settings: Settings, font: ArrayBuffer): NameplateRequest {
  return { name: settings.name, base: { preset: settings.preset, ...settings.measured }, sizes: settings.sizes, font };
}
