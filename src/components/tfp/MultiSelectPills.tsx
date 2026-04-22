import { Pill } from "./Badge";

/**
 * Multi-select pill group: first tap selects, subsequent taps toggle.
 * The first selected value is treated as the primary by callers.
 */
export function MultiSelectPills<T extends string>({
  options,
  selected,
  onChange,
  primaryLabel = "Primary",
}: {
  options: readonly T[];
  selected: T[];
  onChange: (next: T[]) => void;
  primaryLabel?: string;
}) {
  function toggle(o: T) {
    if (selected.includes(o)) {
      onChange(selected.filter((x) => x !== o));
    } else {
      onChange([...selected, o]);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const idx = selected.indexOf(o);
        const isPrimary = idx === 0;
        const isActive = idx >= 0;
        return (
          <div key={o} className="relative">
            <Pill active={isActive} onClick={() => toggle(o)}>
              {o}
            </Pill>
            {isPrimary && selected.length > 1 && (
              <span className="pointer-events-none absolute -top-1.5 -right-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary-foreground">
                {primaryLabel}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
