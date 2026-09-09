import { useEffect, useState } from "react";
import { ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import {
  applyTheme,
  normalizeThemePreference,
  readThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "../lib/theme";

export function ThemePicker() {
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

  const Icon = preference === "light" ? Sun : preference === "dark" ? Moon : Monitor;
  return (
    <label className="theme-picker" title="外观：白天、黑夜或跟随系统">
      <Icon size={15} aria-hidden="true" />
      <select
        aria-label="外观模式"
        value={preference}
        onChange={(event) => {
          const next = normalizeThemePreference(event.target.value);
          setPreference(next);
          // Storage restrictions should never prevent changing the current theme.
          try {
            localStorage.setItem(THEME_STORAGE_KEY, next);
          } catch {
            // Keep the preference for this page session when storage is unavailable.
          }
        }}
      >
        <option value="system">跟随系统</option>
        <option value="light">白天</option>
        <option value="dark">黑夜</option>
      </select>
      <ChevronDown size={11} className="theme-chevron" aria-hidden="true" />
    </label>
  );
}
