import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
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

/**
 * A select built from a button and a listbox so it looks the same on every
 * platform and never shows the native popup. Keyboard: arrows move, Enter or
 * Space picks, Escape closes; the trigger keeps focus throughout.
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
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
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
    setOpen(true);
  };
  const pick = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
  };

  useLayoutEffect(() => {
    if (!open || !root.current || !list.current) return;
    const anchor = root.current.getBoundingClientRect();
    const height = list.current.offsetHeight;
    const below = window.innerHeight - anchor.bottom;
    setPlacement(below < height + 12 && anchor.top > height + 12 ? "top" : "bottom");
    list.current.scrollIntoView({ block: "nearest" });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
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
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

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
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
      >
        <span>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {open && (
        <ul
          className="select-list"
          role="listbox"
          id={listId}
          ref={list}
          data-placement={placement}
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
      )}
    </div>
  );
}
