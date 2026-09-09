import { useEffect, useRef, useId, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  onBack,
  wide = false,
  stepKey,
  variant = "default",
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  onBack?: () => void;
  wide?: boolean;
  stepKey?: string | number;
  variant?: "default" | "flow";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const subtitleId = useId();
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
  }, [title, stepKey]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={subtitle ? subtitleId : undefined}
      className={`modal ${wide ? "wide" : ""} modal-${variant}`}
      onCancel={(event) => {
        event.preventDefault();
        (onBack || onClose)();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-inner">
        <header className="modal-head">
          <button
            className="circle-button"
            aria-label="返回"
            onClick={onBack || onClose}
          >
            <ArrowLeft size={20} />
          </button>
          <h2 id={titleId}>{title}</h2>
          {onBack ? (
            <button
              className="circle-button subtle"
              aria-label="关闭"
              onClick={onClose}
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
          {children}
        </div>
      </div>
    </dialog>
  );
}
