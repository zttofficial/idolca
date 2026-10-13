"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// 窄螢幕的導航：漢堡按鈕展開導航列下方的面板，放搜尋框和各頁入口。
// 導航列有 backdrop-blur，裡面的 fixed 會以導航列為準，所以面板和遮罩用 absolute 掛在導航列底邊
export default function MobileNav({ links, searchAction }: { links: { href: string; label: string }[]; searchAction: string }) {
  const t = useTranslations("Nav");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // 視窗拉寬到桌面版時收起，避免面板留在那裡、頁面也鎖著
    const wide = window.matchMedia("(min-width: 768px)");
    const onWide = () => wide.matches && setOpen(false);
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
      document.body.style.overflow = "";
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={t("menu")}
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen((v) => !v)}
        className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink transition hover:bg-surface-3"
      >
        <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
          {open ? (
            <path d="m5 5 10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          ) : (
            <path d="M3.5 6h13M3.5 10h13M3.5 14h13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          )}
        </svg>
      </button>
      {open && (
        <>
          <div aria-hidden onClick={close} className="absolute inset-x-0 top-full h-[100dvh] bg-black/30" />
          <div id="mobile-nav" className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-line bg-bg px-4 pt-3 pb-5 shadow-xl">
            {/* 搜尋送到市場頁，帶上關鍵字 */}
            <form action={searchAction} method="get" onSubmit={close} className="flex items-center rounded-full border border-line bg-surface px-4 py-2.5 text-sm">
              <input type="search" name="q" placeholder={t("search")} aria-label={t("search")} className="w-full bg-transparent text-ink placeholder:text-ink-3 focus:outline-none" />
            </form>
            <ul className="mt-2">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} onClick={close} className="flex items-center justify-between rounded-xl px-3 py-3 text-base font-medium text-ink hover:bg-surface-2">
                    {l.label}
                    <svg viewBox="0 0 12 12" className="h-3 w-3 text-ink-3" aria-hidden>
                      <path d="m4.5 2.5 3.5 3.5-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
