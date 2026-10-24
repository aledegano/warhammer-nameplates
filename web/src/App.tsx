import { useEffect, useMemo, useState } from "react";
import cinzelUrl from "../../fonts/cinzel/Cinzel.ttf?url";
import { BASE_PRESETS, DEFAULT_SIZES, type BaseProfile, type NameplateSizes, type PresetId } from "../../src/nameplate";
import { stlFileName } from "../../src/stl";
import { NumberField } from "./NumberField";
import { Preview } from "./Preview";
import { settingsFromQuery, settingsToQuery, settingsToRequest, type Settings } from "./settings";
import { useNameplate } from "./useNameplate";

const MEASURED_FIELDS: [keyof BaseProfile, string][] = [
  ["bottomDiameter", "Bottom diameter"],
  ["topDiameter", "Top diameter"],
  ["height", "Height"],
];
const SIZE_FIELDS: [keyof NameplateSizes, string][] = [
  ["stripHeight", "Strip height"],
  ["capHeight", "Cap height"],
  ["backing", "Backing"],
  ["relief", "Relief"],
  ["endPadding", "End padding"],
];

/** Sets or, for undefined, removes one key. */
const withValue = <K extends string>(values: Partial<Record<K, number>>, key: K, value: number | undefined) => {
  const { [key]: _, ...rest } = values;
  return (value === undefined ? rest : { ...rest, [key]: value }) as Partial<Record<K, number>>;
};

const loadCinzel = () => fetch(cinzelUrl).then((response) => response.arrayBuffer());

export function App() {
  const [settings, setSettings] = useState<Settings>(() => settingsFromQuery(window.location.search));
  const [cinzel, setCinzel] = useState<ArrayBuffer>();
  // The user's own font, by file name; it never leaves the browser.
  const [uploaded, setUploaded] = useState<{ name: string; bytes: ArrayBuffer }>();

  useEffect(() => {
    loadCinzel().then(setCinzel);
  }, []);

  useEffect(() => {
    window.history.replaceState(null, "", settingsToQuery(settings));
  }, [settings]);

  const font = uploaded?.bytes ?? cinzel;
  const request = useMemo(() => (font ? settingsToRequest(settings, font) : undefined), [settings, font]);
  const { plate, refusal } = useNameplate(request);
  const base = { ...BASE_PRESETS[settings.preset], ...settings.measured };
  const update = (change: (current: Settings) => Partial<Settings>) =>
    setSettings((current) => ({ ...current, ...change(current) }));

  const chooseFont = async (file: File | undefined) => {
    if (!file) return;
    setUploaded({ name: file.name, bytes: await file.arrayBuffer() });
    update(() => ({ customFont: true }));
  };
  const resetFont = () => {
    setUploaded(undefined);
    update(() => ({ customFont: false }));
  };

  const download = () => {
    if (!plate) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([plate.stl as BlobPart], { type: "model/stl" }));
    link.download = stlFileName(settings.name);
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <main className="app">
      <form className="settings" onSubmit={(event) => event.preventDefault()}>
        <h1>Warhammer Nameplates</h1>
        <p className="intro">A nameplate for the rim of a round base, ready to print.</p>

        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" value={settings.name} onChange={(event) => update(() => ({ name: event.target.value }))} />
        </div>
        <div className="field">
          <label htmlFor="base">Base</label>
          <select
            id="base"
            value={settings.preset}
            onChange={(event) => update(() => ({ preset: event.target.value as PresetId }))}
          >
            {Object.entries(BASE_PRESETS).map(([id, p]) => (
              <option key={id} value={id}>
                {id} mm ({p.bottomDiameter} / {p.topDiameter} / {p.height})
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend>Measured base</legend>
          <p className="hint">Presets are approximate. Measure your base with calipers for a tight fit.</p>
          {MEASURED_FIELDS.map(([field, label]) => (
            <NumberField
              key={field}
              id={field}
              label={label}
              value={settings.measured[field]}
              fallback={BASE_PRESETS[settings.preset][field]}
              onChange={(value) => update((current) => ({ measured: withValue(current.measured, field, value) }))}
            />
          ))}
        </fieldset>

        <fieldset>
          <legend>Plate</legend>
          <p className="hint">Heights are measured along the rim's slope. Empty fields use the default shown.</p>
          {SIZE_FIELDS.map(([field, label]) => (
            <NumberField
              key={field}
              id={field}
              label={label}
              value={settings.sizes[field]}
              fallback={DEFAULT_SIZES[field]}
              onChange={(value) => update((current) => ({ sizes: withValue(current.sizes, field, value) }))}
            />
          ))}
        </fieldset>

        <fieldset>
          <legend>Font</legend>
          <p className="hint">{uploaded ? `Using ${uploaded.name}. It stays in your browser.` : "Using Cinzel."}</p>
          {settings.customFont && !uploaded && (
            <p className="note" role="note">
              This link was made with a custom font, which links can't include, so it's shown in Cinzel.
            </p>
          )}
          <div className="field">
            <label htmlFor="font">Your own font (TTF/OTF)</label>
            <input
              id="font"
              type="file"
              accept=".ttf,.otf,font/ttf,font/otf"
              onChange={(event) => chooseFont(event.target.files?.[0])}
            />
          </div>
          {uploaded && (
            <button type="button" className="secondary" onClick={resetFont}>
              Use Cinzel
            </button>
          )}
        </fieldset>

        <button type="button" onClick={download} disabled={!plate || !!refusal}>
          Download STL
        </button>
      </form>

      <section className="preview" aria-label="Preview">
        <Preview mesh={refusal ? undefined : plate?.mesh} base={base} />
        {refusal ? (
          <p role="alert" className="refusal">
            {refusal.error.message}
          </p>
        ) : (
          <output role="status" className="report">
            {plate && `${plate.report.length.toFixed(1)} mm long, ${plate.report.arcDegrees.toFixed(1)}° of rim`}
          </output>
        )}
      </section>
    </main>
  );
}
