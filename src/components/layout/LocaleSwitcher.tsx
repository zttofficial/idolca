"use client";

import { useLocale, useTranslations } from "next-intl";
import { Suspense, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALE_NAMES, routing, type Locale } from "@/i18n/routing";

// 按鈕只顯示目前語言的短名，寬度跟著內容走；展開的清單列出各語言的全名
const SHORT: Record<Locale, string> = {
  en: "EN",
  "zh-Hant": "繁中",
  "zh-Hans": "简中",
  ja: "日本語",
  ko: "한국어",
  th: "ไทย",
  id: "ID",
  vi: "VI",
};

// usePathname 在動態路由（如 /listing/[id]）上要等請求時才知道，選單放進 Suspense，先顯示同樣的按鈕
export default function LocaleSwitcher() {
  return (
    <Suspense fallback={<Trigger open={false} />}>
      <Menu />
    </Suspense>
  );
}

function Trigger({ open, pending = false, onClick }: { open: boolean; pending?: boolean; onClick?: () => void }) {
  const t = useTranslations("Nav");
  const locale = useLocale() as Locale;
  return (
    <button
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={t("language")}
      disabled={pending || !onClick}
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-3 ${pending ? "opacity-60" : ""}`}
    >
      <span aria-hidden className="text-sm leading-none">
        🌐
      </span>
      {SHORT[locale]}
      <svg viewBox="0 0 12 12" className={`h-2.5 w-2.5 text-ink-3 transition ${open ? "rotate-180" : ""}`} aria-hidden>
        <path d="m2.5 4.5 3.5 3.5 3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function Menu() {
  const t = useTranslations("Nav");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (next: Locale) => {
    setOpen(false);
    if (next === locale) return;
    startTransition(() => {
      // pathname 不帶語言前綴（如 /card/c1），換語言時留在同一頁
      router.replace(pathname, { locale: next });
    });
  };

  return (
    <div ref={root} className="relative">
      <Trigger open={open} pending={pending} onClick={() => setOpen((v) => !v)} />
      {open && (
        <ul role="listbox" aria-label={t("language")} className="absolute right-0 z-50 mt-2 w-44 rounded-xl border border-line bg-surface p-1 shadow-lg">
          {routing.locales.map((l) => (
            <li key={l}>
              <button
                type="button"
                role="option"
                aria-selected={l === locale}
                lang={l}
                onClick={() => choose(l)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${l === locale ? "font-semibold text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"}`}
              >
                {LOCALE_NAMES[l]}
                {l === locale && (
                  <svg viewBox="0 0 12 12" className="h-3 w-3 text-accent" aria-hidden>
                    <path d="m2.5 6.5 2.5 2.5 4.5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
