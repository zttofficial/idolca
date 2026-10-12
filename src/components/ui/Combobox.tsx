"use client";

import { useId, useMemo, useRef, useState } from "react";

export type ComboOption = { value: string; hint?: string; keywords?: string[] };

const MAX_SHOWN = 60;
const norm = (s: string) => s.trim().toLowerCase();

// 可自由輸入、帶建議清單的輸入框（取代瀏覽器預設的 datalist）。
// 輸入時即時篩選，開頭相符的排前面；上下鍵移動、Enter 選取、Esc 關閉
export default function Combobox({
  value,
  onChange,
  options,
  className = "",
  placeholder,
  maxLength,
  required,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: (string | ComboOption)[];
  className?: string;
  placeholder?: string;
  maxLength?: number;
  required?: boolean;
  ariaLabel?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const all = useMemo(() => options.map((o) => (typeof o === "string" ? { value: o } : o)), [options]);
  const shown = useMemo(() => {
    const q = norm(value);
    if (!q) return all.slice(0, MAX_SHOWN);
    // 已經完全等於某個選項時列出全部方便改選，但那個選項排第一個（清單只顯示前 MAX_SHOWN 個，不然可能被擠出去）
    const exact = all.find((o) => norm(o.value) === q);
    if (exact) return [exact, ...all.filter((o) => o !== exact)].slice(0, MAX_SHOWN);
    const score = (o: ComboOption) => {
      const words = [o.value, ...(o.keywords ?? [])].map(norm);
      if (words.some((w) => w.startsWith(q))) return 0;
      if (words.some((w) => w.includes(q))) return 1;
      return -1;
    };
    return all
      .map((o) => ({ o, s: score(o) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => a.s - b.s)
      .slice(0, MAX_SHOWN)
      .map((x) => x.o);
  }, [all, value]);

  const pick = (o: ComboOption) => {
    onChange(o.value);
    setOpen(false);
  };
  const move = (delta: number) => {
    setOpen(true);
    const next = Math.max(0, Math.min(shown.length - 1, active + delta));
    setActive(next);
    listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div className="relative">
      <input
        role="combobox"
        aria-expanded={open && shown.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        value={value}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            move(open ? 1 : 0);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            move(-1);
          } else if (e.key === "Enter" && open && shown[active]) {
            e.preventDefault();
            pick(shown[active]);
          } else if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        className={`${className} pr-8`}
      />
      <svg viewBox="0 0 20 20" aria-hidden className={`pointer-events-none absolute right-3 bottom-3 h-4 w-4 text-ink-3 transition ${open ? "rotate-180" : ""}`}>
        <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {open && shown.length > 0 && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          // 按住選項時不讓輸入框先失焦，點擊才選得到
          onMouseDown={(e) => e.preventDefault()}
          className="absolute top-full left-0 z-20 mt-1 max-h-60 w-max max-w-[min(20rem,90vw)] min-w-full overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-xl"
        >
          {shown.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o)}
              className={`flex cursor-pointer items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-sm ${i === active ? "bg-surface-2" : ""} ${norm(o.value) === norm(value) ? "font-semibold" : ""}`}
            >
              <span className="min-w-0 truncate">{o.value}</span>
              <span className="flex shrink-0 items-center gap-2">
                {o.hint && <span className="truncate text-[11px] text-ink-3">{o.hint}</span>}
                {/* 目前的值，和 Select 一樣打勾 */}
                {norm(o.value) === norm(value) && (
                  <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4 shrink-0 text-accent-ink">
                    <path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
