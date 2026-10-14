"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/components/auth/AuthContext";
import { formatPrice } from "@/lib/fx";
import { ESCROW_SHIP_DAYS } from "@/lib/policy";
import type { NotificationView } from "@/lib/notifications";

const POLL_MS = 60_000;

// 頁首的通知鈴：登入後每分鐘、切回分頁時讀一次，有未讀就顯示數字。打開列表時全部標成已讀，
// 這次打開時未讀的那幾則仍然標出來，關掉再開才變回一般樣式
export default function NotificationBell() {
  const t = useTranslations("Notifications");
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const [unread, setUnread] = useState(0);
  // 讀到通知的時間，「幾分鐘前」以它為準
  const [now, setNow] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/notifications").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as { items: NotificationView[]; unread: number };
    setItems(data.items);
    setUnread(data.unread);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 登入或換帳號時讀一次
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const toggle = () => {
    if (open) {
      setOpen(false);
      // 關掉時把這次看過的變成已讀樣式
      setItems((list) => list?.map((n) => ({ ...n, read: true })) ?? null);
      return;
    }
    setOpen(true);
    if (unread > 0) {
      setUnread(0);
      fetch("/api/notifications/read", { method: "POST" }).catch(() => {});
    }
  };

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={unread ? t("labelUnread", { count: unread }) : t("label")}
        className="relative grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink transition hover:bg-surface-3"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white tabular-nums">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-x-4 top-16 z-50 max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-2 text-sm shadow-xl sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-96">
          <p className="px-3 pt-2 pb-1 text-xs font-semibold text-ink-3">{t("title")}</p>
          {items === null ? (
            <div className="m-2 h-16 animate-pulse rounded-xl bg-surface-2" />
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-ink-3">{t("empty")}</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id}>
                  <Link href={n.href} onClick={toggle} className={`flex gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-2 ${n.read ? "" : "bg-accent-soft/40"}`}>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-accent"}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block leading-snug text-ink">
                        {t(`kind_${n.kind}`, { card: n.params.card || t("aCard"), price: formatPrice(n.params.price ?? 0), days: ESCROW_SHIP_DAYS })}
                      </span>
                      <TimeAgo at={n.at} now={now} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// 多久以前：一分鐘內、幾分鐘、幾小時、幾天前，再久顯示日期
function TimeAgo({ at, now }: { at: string; now: number }) {
  const locale = useLocale();
  const t = useTranslations("Notifications");
  const s = Math.max(0, (now - new Date(at).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const text =
    s < 60
      ? t("justNow")
      : s < 3600
        ? rtf.format(-Math.floor(s / 60), "minute")
        : s < 86_400
          ? rtf.format(-Math.floor(s / 3600), "hour")
          : s < 7 * 86_400
            ? rtf.format(-Math.floor(s / 86_400), "day")
            : new Date(at).toLocaleDateString(locale, { month: "numeric", day: "numeric" });
  return (
    <time dateTime={at} className="mt-0.5 block text-xs text-ink-3">
      {text}
    </time>
  );
}
