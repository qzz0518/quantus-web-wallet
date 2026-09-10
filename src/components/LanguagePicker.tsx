import { Languages } from "lucide-react";
import { LANGUAGES, setLanguage, useLanguage, useT } from "../lib/i18n";

/**
 * `segmented` sits in settings; `compact` is the header toggle shown before
 * a vault is unlocked, so a new visitor can switch language right away.
 */
export function LanguagePicker({ variant = "segmented" }: { variant?: "segmented" | "compact" }) {
  const t = useT();
  const language = useLanguage();
  if (variant === "compact") {
    const next = language === "zh" ? "en" : "zh";
    return (
      <button
        type="button"
        className="circle-button language-toggle"
        aria-label={t("切换语言")}
        title={LANGUAGES.find((item) => item.value === next)?.label}
        onClick={() => setLanguage(next)}
      >
        <Languages size={18} aria-hidden="true" />
      </button>
    );
  }
  return (
    <div className="segmented" role="radiogroup" aria-label={t("语言")}>
      {LANGUAGES.map(({ value, label }) => (
        <button
          type="button"
          key={value}
          role="radio"
          aria-checked={language === value}
          lang={value === "zh" ? "zh-CN" : "en"}
          onClick={() => setLanguage(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
