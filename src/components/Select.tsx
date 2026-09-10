import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption<V extends string> = {
  value: V;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
};

type Props<V extends string> = {
  value: V | "";
  options: SelectOption<V>[];
  onChange: (value: V) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  className?: string;
};

type Box = { left: number; width: number; top?: number; bottom?: number; maxHeight: number };
const GAP = 6;
const EDGE = 12;

/**
 * A select built from a button and a listbox so it looks the same on every
 * platform and never shows the native popup. The list is rendered into the
 * enclosing dialog (or the body) so scroll containers and footers cannot
 * clip it, and it opens upward when there is more room above. Keyboard:
 * arrows move, Enter or Space picks, Escape closes; the trigger keeps focus.
 */
export function Select<V extends string>({
  value,
  options,
  onChange,
  placeholder,
  disabled = false,
  id,
  "aria-label": ariaLabel,
  className = "",
}: Props<V>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [box, setBox] = useState<Box | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value);

  const enabledIndex = (from: number, step: 1 | -1) => {
    for (let i = from; i >= 0 && i < options.length; i += step) {
      if (!options[i].disabled) return i;
    }
    return -1;
  };
  const show = () => {
    if (disabled) return;
    const current = options.findIndex((option) => option.value === value && !option.disabled);
    setActive(current >= 0 ? current : enabledIndex(0, 1));
    setHost(root.current?.closest("dialog") ?? document.body);
    setBox(null);
    setOpen(true);
  };
  const hide = () => {
    setOpen(false);
    setBox(null);
  };
  const pick = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    hide();
  };

  // Place the list relative to its host; re-run on scroll and resize while open.
  useLayoutEffect(() => {
    if (!open || !host) return;
    const place = () => {
      const trigger = root.current?.getBoundingClientRect();
      const menu = list.current;
      if (!trigger || !menu) return;
      const frame = host === document.body
        ? { top: 0, bottom: window.innerHeight, left: 0 }
        : host.getBoundingClientRect();
      const offsetY = host === document.body ? window.scrollY : 0;
      const offsetX = host === document.body ? window.scrollX : 0;
      const height = menu.scrollHeight + 2;
      const below = frame.bottom - trigger.bottom - EDGE;
      const above = trigger.top - frame.top - EDGE;
      const upward = below < height + GAP && above > below;
      setBox({
        left: trigger.left - frame.left + offsetX,
        width: trigger.width,
        maxHeight: Math.max(120, Math.min(264, (upward ? above : below) - GAP)),
        ...(upward
          ? { bottom: frame.bottom - trigger.top + GAP - offsetY }
          : { top: trigger.bottom - frame.top + GAP + offsetY }),
      });
    };
    place();
    window.addEventListener("scroll", place, { capture: true, passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, { capture: true });
      window.removeEventListener("resize", place);
    };
  }, [open, host]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !list.current?.contains(target)) hide();
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!open || active < 0) return;
    list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        show();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((index) => {
          const next = enabledIndex(index + 1, 1);
          return next >= 0 ? next : index;
        });
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((index) => {
          const next = enabledIndex(index - 1, -1);
          return next >= 0 ? next : index;
        });
        break;
      case "Home":
        event.preventDefault();
        setActive(enabledIndex(0, 1));
        break;
      case "End":
        event.preventDefault();
        setActive(enabledIndex(options.length - 1, -1));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        pick(active);
        break;
      case "Escape":
        event.preventDefault();
        hide();
        break;
      case "Tab":
        hide();
        break;
    }
  };

  const style: CSSProperties = box
    ? { left: box.left, width: box.width, top: box.top, bottom: box.bottom, maxHeight: box.maxHeight }
    : { visibility: "hidden", left: 0, top: 0, width: root.current?.offsetWidth };

  const menu = open && host && (
    <ul
      className="select-list"
      role="listbox"
      id={listId}
      ref={list}
      data-placement={box?.bottom !== undefined ? "top" : "bottom"}
      style={style}
      onMouseDown={(event) => event.preventDefault()}
    >
      {options.map((option, index) => (
        <li
          key={option.value}
          id={`${listId}-${index}`}
          role="option"
          aria-selected={option.value === value}
          aria-disabled={option.disabled || undefined}
          data-active={index === active}
          onPointerMove={() => {
            if (!option.disabled && index !== active) setActive(index);
          }}
          onClick={() => pick(index)}
        >
          <span>
            {option.label}
            {option.description && <small>{option.description}</small>}
          </span>
          {option.value === value && <Check size={15} aria-hidden="true" />}
        </li>
      ))}
    </ul>
  );

  return (
    <div className={`select ${className}`} ref={root}>
      <button
        type="button"
        id={id}
        className={`select-trigger ${selected ? "" : "placeholder"}`}
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? hide() : show())}
        onKeyDown={onKeyDown}
      >
        <span>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {menu && host && createPortal(menu, host)}
    </div>
  );
}
