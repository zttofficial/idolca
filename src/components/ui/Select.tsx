"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type SelectOption<T extends string> = { value: T; label: string };

// 下拉選單（取代瀏覽器預設的 select）：樣式和全站一致，鍵盤可操作；選項多時（searchable）上方有搜尋框
export default function Select<T extends string>({
  value,
  onChange,
  options,
  className = "",
  ariaLabel,
  placeholder = "",
  required,
  searchable,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
  required?: boolean;
  searchable?: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase() === q) : options;
  }, [options, query]);
  const current = options.find((o) => o.value === value);

  // 點選單外面就關起來
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const show = () => {
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  // 打開後把目前選項捲進畫面
  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const pick = (o: SelectOption<T>) => {
    onChange(o.value);
    setOpen(false);
    button.current?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return show();
      setActive((i) => Math.max(0, Math.min(shown.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter" || (e.key === " " && !searchable)) {
      e.preventDefault();
      if (!open) return show();
      if (shown[active]) pick(shown[active]);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
    }
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
        className={`${className} flex items-center justify-between gap-2 text-left`}
      >
        <span className={`truncate ${current ? "" : "text-ink-3"}`}>{current?.label ?? placeholder}</span>
        <svg viewBox="0 0 20 20" aria-hidden className={`h-4 w-4 shrink-0 text-ink-3 transition ${open ? "rotate-180" : ""}`}>
          <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {/* 表單送出時一樣檢查必填 */}
      {required && <input tabIndex={-1} aria-hidden required value={value} onChange={() => {}} className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0" />}
      {open && (
        <div className="absolute top-full right-0 z-30 mt-1 w-full min-w-44 rounded-xl border border-line bg-surface p-1 shadow-xl">
          {searchable && (
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKey}
              className="mb-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-ink"
            />
          )}
          <ul ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto">
            {shown.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${i === active ? "bg-surface-2" : ""}`}
              >
                <span className="truncate">{o.label}</span>
                {o.value === value && (
                  <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4 shrink-0 text-accent-ink">
                    <path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
