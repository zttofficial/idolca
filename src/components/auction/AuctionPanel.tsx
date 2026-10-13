"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CURRENCY, formatPrice } from "@/lib/fx";
import { AUCTION_EXTEND_MINUTES, type AuctionView } from "@/lib/auction";
import { ESCROW_SHIP_DAYS } from "@/lib/policy";
import Price from "@/components/web3/Price";
import InfoTip from "@/components/ui/InfoTip";
import PaymentPicker, { type PayRun } from "@/components/pay/PaymentPicker";

// 拍賣面板：自由刊登的刊登頁和金庫卡的卡片頁共用。顯示目前出價、截止倒數、保底價有沒有達到、出價紀錄，
// 出價時打開和購買一樣的付款方式面板。兩條線的差別（怎麼出價、怎麼取消）由呼叫方傳進來

// 現在時間，每秒更新；伺服器渲染和水合前是 null，避免兩邊的倒數對不上
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// 剩餘時間：一天以上顯示天和小時，一小時以上顯示小時和分，最後一小時顯示分和秒
export function TimeLeft({ endsAt, className }: { endsAt: string; className?: string }) {
  const t = useTranslations("Auction");
  const now = useNow();
  if (now === null) return <span className={className}>&nbsp;</span>;
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return <span className={className}>{t("ended")}</span>;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const text = d > 0 ? t("leftDays", { d, h }) : h > 0 ? t("leftHours", { h, m }) : t("leftMinutes", { m, s: s % 60 });
  return <span className={`tabular-nums ${className ?? ""}`}>{text}</span>;
}

export type AuctionMe = { seller: boolean; leading: boolean; refunding: boolean };
export type BidHistoryEntry = { bidder: string; amountUsd: number; at: string; mine: boolean };

export default function AuctionPanel({
  view,
  me,
  history,
  bid,
  blocked,
  onCancel,
}: {
  view: AuctionView;
  // 看的人自己的狀態；未登入時為 null
  me: AuctionMe | null;
  // 出價紀錄（自由刊登有；金庫卡的出價紀錄在鏈上）
  history?: BidHistoryEntry[];
  // 出價：給定金額回傳付款方式面板要用的動作；arcUnavailableNote 是不能用 Arc 時的說明
  bid: { run: (amountUsd: number) => PayRun; arcUnavailableNote?: string } | null;
  // 不能出價時改顯示的內容（登入按鈕、綁錢包提示）
  blocked?: React.ReactNode;
  // 賣家在沒人出價前取消
  onCancel?: () => Promise<unknown>;
}) {
  const t = useTranslations("Auction");
  const locale = useLocale();
  const now = useNow();
  const ended = view.status !== "live" || (now !== null && new Date(view.endsAt).getTime() <= now);
  const [input, setInput] = useState("");
  const [picking, setPicking] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelError, setCancelError] = useState(false);
  const amount = input === "" ? view.minNextUsd : Number(input);
  const valid = Number.isFinite(amount) && amount >= view.minNextUsd && amount <= 100_000;

  // 截止後的結果。結標前（settling）就看得出來：有人出價、達到保底價就是成交
  const outcome = !ended ? null : view.status === "cancelled" ? "cancelled" : view.status === "sold" || (view.status !== "unsold" && view.bidCount > 0 && view.reserveMet) ? "sold" : "unsold";
  const settled = view.status === "sold" || view.status === "unsold" || view.status === "cancelled";
  const chip = !ended ? t("statusLive") : settled ? t(`status_${outcome}`) : t("statusSettling");

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ended ? "bg-surface-3 text-ink-2" : "bg-accent-soft text-accent-ink"}`}>{chip}</span>
        {!ended && (
          <span className="flex items-center gap-1.5 text-sm text-ink-2">
            <TimeLeft endsAt={view.endsAt} className="font-semibold text-ink" />
            <InfoTip text={t("extendNote", { minutes: AUCTION_EXTEND_MINUTES })} label={t("extendLabel")} align="end" />
          </span>
        )}
      </div>

      <p className="mt-4 text-xs text-ink-3">{view.highUsd === null ? t("startingBid") : ended && outcome === "sold" ? t("winningBid") : t("currentBid")}</p>
      <Price amount={view.highUsd ?? view.startUsd} className="mt-1 text-3xl font-bold tabular-nums" />
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
        <span>{view.bidCount === 0 ? t("noBids") : t("bids", { count: view.bidCount })}</span>
        {view.hasReserve && <span className={view.reserveMet ? "text-up" : "text-notice-ink"}>· {t(view.reserveMet ? "reserveMet" : "reserveNotMet")}</span>}
      </p>

      {me?.seller && (
        <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
          {t(!ended ? "sellerLive" : outcome === "sold" ? `sellerSold_${view.lane}` : `sellerEnded_${outcome}`, { days: ESCROW_SHIP_DAYS })}
        </p>
      )}
      {!me?.seller && me?.leading && (
        <p className="mt-4 rounded-xl bg-up/10 px-4 py-3 text-sm font-medium text-up">{t(ended && outcome === "sold" ? `won_${view.lane}` : "leading", { days: ESCROW_SHIP_DAYS })}</p>
      )}
      {!me?.seller && me?.refunding && <p className="mt-4 rounded-xl bg-notice-bg px-4 py-3 text-sm text-notice-ink">{t("refunding")}</p>}

      {!ended && !me?.seller && !me?.leading && (
        <div className="mt-4">
          {bid ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (valid) setPicking(amount);
              }}
            >
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-surface px-4 focus-within:border-ink">
                <span className="sr-only">{t("yourBid")}</span>
                <input
                  inputMode="decimal"
                  value={input}
                  placeholder={String(view.minNextUsd)}
                  onChange={(e) => setInput(e.target.value.replace(/[^\d.]/g, ""))}
                  className="w-full min-w-0 bg-transparent py-3 text-sm tabular-nums outline-none"
                />
                <span className="text-xs text-ink-3">{CURRENCY}</span>
              </label>
              <button disabled={!valid || picking !== null} className="btn-primary shrink-0 rounded-full px-6 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
                {t("placeBid")}
              </button>
            </form>
          ) : (
            blocked
          )}
          {bid && <p className={`mt-2 text-xs ${input !== "" && !valid ? "text-down" : "text-ink-3"}`}>{t("minNext", { price: formatPrice(view.minNextUsd) })}</p>}
        </div>
      )}

      {onCancel && !ended && view.bidCount === 0 && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setCancelError(false);
            try {
              await onCancel();
            } catch {
              setCancelError(true);
            } finally {
              setBusy(false);
            }
          }}
          className="btn-secondary mt-3 w-full rounded-full py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? "…" : t("cancelAuction")}
        </button>
      )}
      {cancelError && <p className="mt-2 text-xs text-down">{t("error_cancel")}</p>}

      <ol className="mt-4 space-y-1.5 text-xs leading-relaxed text-ink-2">
        {[t(`rule1_${view.lane}`), t("rule2"), t(`rule3_${view.lane}`)].map((text, i) => (
          <li key={i} className="flex gap-2">
            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-surface-3 text-[10px] font-bold">{i + 1}</span>
            {text}
          </li>
        ))}
      </ol>

      {history && history.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <h3 className="text-sm font-semibold">{t("history")}</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {history.map((h, i) => (
              <li key={`${h.at}-${i}`} className="flex items-center justify-between gap-3">
                <span className={h.mine ? "font-semibold text-accent-ink" : "text-ink-2"}>{h.mine ? t("bidderYou") : t("bidder", { n: h.bidder })}</span>
                <span className="ml-auto tabular-nums">{formatPrice(h.amountUsd)}</span>
                <time className="w-24 text-right text-xs text-ink-3" dateTime={h.at}>
                  {new Date(h.at).toLocaleString(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </time>
              </li>
            ))}
          </ul>
        </div>
      )}

      {picking !== null && bid && (
        <PaymentPicker
          amountUsd={picking}
          run={bid.run(picking)}
          arcUnavailableNote={bid.arcUnavailableNote}
          describeError={(code) => (t.has(`error_${code}`) ? t(`error_${code}`) : null)}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}
