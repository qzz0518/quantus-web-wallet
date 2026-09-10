import { useEffect, useId, useRef, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useT } from "../lib/i18n";
import {
  applyTheme,
  normalizeThemePreference,
  readThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "../lib/theme";

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "跟随系统", Icon: Monitor },
  { value: "light", label: "白天", Icon: Sun },
  { value: "dark", label: "黑夜", Icon: Moon },
];

function useThemePreference() {
  const [preference, setPreference] = useState<ThemePreference>(readThemePreference);
  useEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyTheme(preference, system.matches);
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        setPreference(readThemePreference());
      }
    };
    update();
    system.addEventListener("change", update);
    window.addEventListener("storage", onStorage);
    return () => {
      system.removeEventListener("change", update);
      window.removeEventListener("storage", onStorage);
    };
  }, [preference]);
  const choose = (value: unknown) => {
    const next = normalizeThemePreference(value);
    setPreference(next);
    // Storage restrictions should never prevent changing the current theme.
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Keep the preference for this page session when storage is unavailable.
    }
  };
  return [preference, choose] as const;
}

/**
 * `segmented` is the settings control; `menu` is the compact header button
 * that opens a small list. Both use real buttons so a tap never leaves a
 * focus ring behind and the list looks the same on every platform.
 */
export function ThemePicker({ variant = "segmented" }: { variant?: "segmented" | "menu" }) {
  const t = useT();
  const [preference, choose] = useThemePreference();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const current = OPTIONS.find((option) => option.value === preference) ?? OPTIONS[0];

  if (variant === "menu") {
    return (
      <div className="theme-menu" ref={root}>
        <button
          type="button"
          className="circle-button"
          aria-label={t("外观模式")}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((value) => !value)}
        >
          <current.Icon size={18} aria-hidden="true" />
        </button>
        {open && (
          <div className="theme-menu-list" role="menu" id={menuId}>
            {OPTIONS.map(({ value, label, Icon }) => (
              <button
                type="button"
                key={value}
                role="menuitemradio"
                aria-checked={preference === value}
                onClick={() => {
                  choose(value);
                  setOpen(false);
                }}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{t(label)}</span>
                {preference === value && <Check size={15} aria-hidden="true" />}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="segmented" role="radiogroup" aria-label={t("外观模式")} ref={root}>
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          type="button"
          key={value}
          role="radio"
          aria-checked={preference === value}
          onClick={() => choose(value)}
        >
          <Icon size={15} aria-hidden="true" />
          <span>{t(label)}</span>
        </button>
      ))}
    </div>
  );
}
