import { t } from "./i18n";
import { STORAGE_KEY } from "./vault";

/** Recheck the destination after asynchronous creation or backup validation. */
export function persistNewVault(
  encrypted: string,
  beforeWrite: () => void = () => {},
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
) {
  if (storage.getItem(STORAGE_KEY) !== null)
    throw new Error(t("另一页面已保存钱包，请返回并解锁，避免覆盖"));
  beforeWrite();
  storage.setItem(STORAGE_KEY, encrypted);
}
