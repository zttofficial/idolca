"use client";

// 瀏覽器端的手續費：從 /api/fees 讀一次，整站共用；讀到之前（和讀不到時）用預設費率。
// 促銷結束、排定的費率生效時自動重讀，頁面開著也跟得上
import { useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { bpsToPct, defaultFees, type FeeKind, type FeeView, type Fees } from "./fees";
import { formatPrice } from "./fx";

const DEFAULTS = defaultFees();
// 讀到的資料多久算舊：重新訂閱（換頁）時超過這個時間就重讀
const STALE_MS = 5 * 60_000;
// 費率變化的時間點超過這麼久以後的不排重讀（setTimeout 的上限約 24.8 天，也沒必要排那麼遠）
const MAX_WAIT_MS = 24 * 3_600_000;

let fees: Fees | null = null;
let loadedAt = 0;
let loading: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

// 最近一個會讓費率改變的時間點：促銷結束或排定的基本費率生效
export function nextFeeChange(f: Fees): number | null {
  const times = Object.values(f).flatMap((v) => [v.promo?.endsAt, v.next?.startsAt].filter((t): t is string => Boolean(t)).map((t) => new Date(t).getTime()));
  return times.length ? Math.min(...times) : null;
}

function load() {
  loading ??= fetch("/api/fees")
    .then((r) => (r.ok ? (r.json() as Promise<Fees>) : null))
    .catch(() => null)
    .then((d) => {
      loading = null;
      if (!d) return;
      fees = d;
      loadedAt = Date.now();
      listeners.forEach((l) => l());
      if (timer) clearTimeout(timer);
      const at = nextFeeChange(d);
      // 時間到了多等幾秒，避開伺服器和 CDN 的快取
      if (at !== null && at - Date.now() < MAX_WAIT_MS) timer = setTimeout(load, Math.max(at - Date.now(), 0) + 5_000);
    });
  return loading;
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!fees || Date.now() - loadedAt > STALE_MS) load();
  return () => listeners.delete(l);
}

export function useFees(): Fees {
  return useSyncExternalStore(
    subscribe,
    () => fees ?? DEFAULTS,
    () => DEFAULTS,
  );
}

// 顯示用的費率：抽成和拍賣手續費是百分比，鑄造費是金額
export const showFee = (kind: FeeKind, value: number) => (kind === "mint" ? formatPrice(value / 100) : `${bpsToPct(value)}%`);

// 進行中促銷的一句說明（「限時優惠：手續費 0%（原本 2.5%），至 10/31 23:59。」），沒有促銷時是 null
export function usePromoNote() {
  const t = useTranslations("Binder");
  const locale = useLocale();
  return (f: FeeView) =>
    f.promo
      ? t("feePromo", {
          name: f.promo.label ?? t("feePromoName"),
          fee: showFee(f.kind, f.value),
          base: showFee(f.kind, f.base),
          date: new Date(f.promo.endsAt).toLocaleString(locale, { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }),
        })
      : null;
}
