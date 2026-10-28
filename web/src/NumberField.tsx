import { useState } from "react";

interface Props {
  id: string;
  label: string;
  value: number | undefined;
  /** Shown as the placeholder when the field is empty, which means "use this", and beside it otherwise. */
  fallback: number;
  onChange: (value: number | undefined) => void;
}

/** A millimetre field; empty means the fallback applies. Keeps the typed text so "1." isn't rewritten mid-edit. */
export function NumberField({ id, label, value, fallback, onChange }: Props) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  return (
    <>
      <div className="field-label">
        <label id={`${id}-label`} htmlFor={id}>
          {label} (mm)
        </label>
        {text !== "" && (
          <button
            type="button"
            className="use-default"
            aria-describedby={`${id}-label`}
            onClick={() => {
              setText("");
              onChange(undefined);
            }}
          >
            use default {fallback}
          </button>
        )}
      </div>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step={0.1}
        value={text}
        placeholder={String(fallback)}
        onChange={(event) => {
          setText(event.target.value);
          const parsed = event.target.value.trim() === "" ? undefined : Number(event.target.value);
          onChange(parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined);
        }}
      />
    </>
  );
}
