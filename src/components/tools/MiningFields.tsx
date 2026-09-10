import { useId, type ReactNode, type RefObject } from "react";
import type { HashrateUnit } from "../../lib/mining/inputs";

/**
 * Form and layout primitives shared by the mining calculator's panels: a
 * pill switch, a numeric field with an optional in-field suffix, a
 * collapsible section for detail that is not needed on first read, and a
 * label/value pair for the result grids.
 */

export function Segmented<V extends string>({
  value,
  options,
  onChange,
  label,
  className = "",
}: {
  value: V;
  options: { value: V; label: ReactNode }[];
  onChange: (value: V) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={`segmented ${className}`} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
        >
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  suffix,
  hint,
  placeholder,
  disabled,
  id,
  inputRef,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  suffix?: ReactNode;
  hint?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  const hintId = `${inputId}-hint`;
  // The suffix may hold its own control (a unit switch), so it sits outside
  // the label: the input's accessible name stays the label text alone.
  return (
    <div className="field mining-field">
      <label htmlFor={inputId}>{label}</label>
      <span className="mining-input">
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix && <span className="mining-input-suffix">{suffix}</span>}
      </span>
      {hint && <small id={hintId}>{hint}</small>}
    </div>
  );
}

export const UNIT_OPTIONS: { value: HashrateUnit; label: string }[] = [
  { value: "MH", label: "MH/s" },
  { value: "GH", label: "GH/s" },
];

/**
 * A section the reader opens only when they want it. Everything inside stays
 * in the document, so find-in-page and the server snapshot still see it.
 */
export function Fold({ title, meta, children }: { title: ReactNode; meta?: ReactNode; children: ReactNode }) {
  return (
    <details className="flow-details mining-fold">
      <summary>
        <span className="mining-fold-title">{title}</span>
        {meta && <span className="mining-fold-meta">{meta}</span>}
      </summary>
      <div className="mining-fold-body">{children}</div>
    </details>
  );
}

export function Stat({
  label,
  value,
  hint,
  highlight,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? "highlight" : undefined}>
      <dt>{label}</dt>
      <dd>
        {value}
        {hint && <small>{hint}</small>}
      </dd>
    </div>
  );
}

/** Accent for a figure that is good above zero and bad below it. */
export function signClass(value: number | null | undefined): string | undefined {
  if (value === null || value === undefined || !Number.isFinite(value)) return undefined;
  return value >= 0 ? "positive" : "negative";
}
