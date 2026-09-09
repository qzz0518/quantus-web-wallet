import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Info, X } from "lucide-react";
import { MOTION_EASE, motionAllowed, trackMotion } from "../lib/motion";

export type Notice = { message: string; success: boolean };

export function Toast({
  notice,
  onDismiss,
}: {
  notice: Notice | null;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(notice);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (notice) {
      setVisible(notice);
      return;
    }
    const element = ref.current;
    if (!element || !motionAllowed()) {
      setVisible(null);
      return;
    }
    let active = true;
    const animation = trackMotion(
      element.animate(
        [
          { opacity: 1, translate: "0 0" },
          { opacity: 0, translate: "0 8px" },
        ],
        { duration: 150, easing: MOTION_EASE, fill: "forwards" },
      ),
    );
    const finish = () => {
      if (active) setVisible(null);
    };
    const timer = setTimeout(finish, 180);
    void animation.finished.catch(() => {}).then(finish);
    return () => {
      active = false;
      clearTimeout(timer);
      animation.cancel();
    };
  }, [notice]);
  useLayoutEffect(() => {
    // translate (not transform) preserves the toast's horizontal centering.
    const element = ref.current;
    if (!visible || !element || !motionAllowed()) return;
    const animation = trackMotion(
      element.animate(
        [
          { opacity: 0, translate: "0 10px" },
          { opacity: 1, translate: "0 0" },
        ],
        { duration: 220, easing: MOTION_EASE },
      ),
    );
    return () => animation.cancel();
  }, [visible]);
  if (!visible) return null;
  return (
    <div className="toast" role="status" ref={ref}>
      {visible.success ? <Check size={16} /> : <Info size={16} />}
      {visible.message}
      <button aria-label="关闭提示" onClick={onDismiss}>
        <X size={14} />
      </button>
    </div>
  );
}
