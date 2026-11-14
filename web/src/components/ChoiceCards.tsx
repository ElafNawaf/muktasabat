"use client";

/** Big tappable options for a small either/or choice (replaces a 2–3 option select). */
export function ChoiceCards<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string; icon: string }[];
  label: string;
}) {
  return (
    <div className="choice" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className="choice__opt"
          onClick={() => onChange(o.value)}
        >
          <span className="ms" aria-hidden="true">{o.icon}</span>
          <span>
            <strong>{o.label}</strong>
            {o.hint && <small>{o.hint}</small>}
          </span>
        </button>
      ))}
    </div>
  );
}
