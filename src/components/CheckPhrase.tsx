import { useEffect, useState } from "react";
import {
  CHECK_PHRASE_WORDS,
  cachedCheckPhrase,
  checkPhrase,
  formatCheckPhrase,
} from "../lib/checkphrase";
import { useT } from "../lib/i18n";

const SLOTS = Array.from({ length: CHECK_PHRASE_WORDS }, (_, index) => index);

/**
 * The five words that belong to an address. Reading them back to whoever owns
 * the address catches a swapped or lookalike address, which comparing long
 * strings of characters does not. Deriving them costs 40,000 PBKDF2 rounds, so
 * a phrase already computed on this page appears at once and the rest arrive
 * into a placeholder of the same size.
 */
export function CheckPhrase({
  address,
  hint,
  className = "",
}: {
  address: string;
  hint?: string;
  className?: string;
}) {
  const t = useT();
  const [words, setWords] = useState<string[] | null>(
    () => cachedCheckPhrase(address) ?? null,
  );
  useEffect(() => {
    const cached = cachedCheckPhrase(address);
    setWords(cached ?? null);
    if (cached) return;
    let active = true;
    checkPhrase(address)
      .then((result) => {
        if (active) setWords(result);
      })
      .catch(() => {
        // Advisory only: an environment without Web Crypto keeps the
        // placeholder rather than claiming a phrase it could not derive.
      });
    return () => {
      active = false;
    };
  }, [address]);
  return (
    <div className={`check-phrase ${className}`.trimEnd()}>
      <p className="check-phrase-label">{t("校验短语")}</p>
      <p
        className="check-phrase-words"
        aria-busy={!words}
        aria-label={words ? formatCheckPhrase(words) : t("正在生成校验短语…")}
      >
        {SLOTS.map((slot) => (
          <span key={slot} className={words ? "" : "pending"}>
            {words ? formatCheckPhrase([words[slot]]) : ""}
          </span>
        ))}
      </p>
      <p className="check-phrase-hint">
        {hint ?? t("对方读出的五个词一致，地址就没抄错")}
      </p>
    </div>
  );
}
