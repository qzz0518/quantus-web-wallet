import { useLayoutEffect, useRef, useId, useState, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import { dismissModal, reveal } from "../lib/motion";
import { useT } from "../lib/i18n";

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  onBack,
  wide = false,
  stepKey,
  variant = "default",
  busy = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  onBack?: () => void;
  wide?: boolean;
  stepKey?: string | number;
  variant?: "default" | "flow";
  busy?: boolean;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  // Children mount after the dialog is open so a field's autoFocus can win;
  // otherwise focus rests on the inert container instead of the first button.
  const [ready, setReady] = useState(() => typeof document === "undefined");
  const titleId = useId();
  const subtitleId = useId();
  const previousStep = useRef(`${title}:${stepKey}`);
  useLayoutEffect(() => {
    const el = ref.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    el?.showModal();
    el?.querySelector<HTMLElement>(".modal-inner")?.focus({ preventScroll: true });
    setReady(true);
    return () => {
      el?.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  useLayoutEffect(() => {
    const element = ref.current;
    const key = `${title}:${stepKey}`;
    const body = element?.querySelector(".flow-body");
    element?.scrollTo({ top: 0 });
    body?.scrollTo({ top: 0 });
    if (previousStep.current === key) return;
    previousStep.current = key;
    const direction = element?.dataset.stepDirection === "back" ? -1 : 1;
    if (element) delete element.dataset.stepDirection;
    const animation = reveal(body || null, direction * 16, 0, 240);
    const footer = reveal(
      element?.querySelector(".flow-footer") || null,
      0,
      5,
      180,
    );
    return () => {
      animation?.cancel();
      footer?.cancel();
    };
  }, [title, stepKey]);
  const unavailable = () => busy || !!ref.current?.dataset.exiting;
  const close = () => {
    if (!unavailable()) dismissModal(onClose);
  };
  const back = () => {
    if (unavailable()) return;
    if (ref.current) ref.current.dataset.stepDirection = "back";
    if (!onBack || onBack === onClose) dismissModal(onClose);
    else onBack();
  };
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={subtitle ? subtitleId : undefined}
      aria-busy={busy}
      className={`modal ${wide ? "wide" : ""} modal-${variant}`}
      onCancel={(event) => {
        event.preventDefault();
        back();
      }}
      onClickCapture={(event) => {
        if (ref.current?.dataset.exiting) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onSubmitCapture={(event) => {
        if (ref.current?.dataset.exiting) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="modal-inner" tabIndex={-1}>
        <header className="modal-head">
          <button
            className="circle-button"
            aria-label={t("返回")}
            disabled={busy}
            onClick={back}
          >
            <ArrowLeft size={20} />
          </button>
          <h2 id={titleId}>{title}</h2>
          {onBack ? (
            <button
              className="circle-button subtle"
              aria-label={t("关闭")}
              disabled={busy}
              onClick={close}
            >
              <X size={19} />
            </button>
          ) : (
            <span className="modal-head-spacer" />
          )}
        </header>
        <div className="modal-content">
          {subtitle && (
            <p className="modal-subtitle" id={subtitleId}>
              {subtitle}
            </p>
          )}
          {ready && children}
        </div>
      </div>
    </dialog>
  );
}
