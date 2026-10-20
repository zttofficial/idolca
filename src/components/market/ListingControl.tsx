"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CURRENCY, formatPrice } from "@/lib/fx";
import { AUCTION_DAYS, AUCTION_MIN_START, type AuctionView } from "@/lib/auction";
import { bpsToPct } from "@/lib/fees";
import { useFees, usePromoNote } from "@/lib/use-fees";
import InfoTip from "@/components/ui/InfoTip";
import { TimeLeft } from "@/components/auction/AuctionPanel";
import { track } from "@/lib/analytics";
import VerifyEmailNotice, { useNeedsEmailVerify } from "@/components/auth/VerifyEmailNotice";
import { WalletNotFoundHint } from "@/components/auth/WalletPicker";

export type AuctionInput = { startUsd: number; reserveUsd: number | null; days: number };

// 上架、改價、下架，或改用拍賣出售。收藏冊裡的收藏卡（擔保交易刊登）、收藏冊和卡片頁上的金庫卡（鏈上託管）共用這一個介面，
// 差別只在呼叫方傳進來的動作和說明文字。上架時先選一口價或拍賣；拍賣中顯示目前出價和剩餘時間，沒人出價前可以取消
export default function ListingControl({
  lane,
  price,
  auction,
  viewHref,
  note,
  onList,
  onUnlist,
  onAuction,
  onCancelAuction,
}: {
  // 哪條交易線，只用來記分析事件
  lane: "free" | "vault";
  // 目前的售價；沒上架時為 null
  price: number | null;
  // 拍賣中時的拍賣狀態
  auction?: AuctionView | null;
  // 上架後「看刊登頁」連到哪裡；已經在刊登頁上時不給
  viewHref?: string;
  // 輸入一口價時，價格旁問號裡的說明（後面自動接上現在的抽成）
  note: string;
  onList: (price: number) => Promise<unknown>;
  onUnlist: () => Promise<unknown>;
  // 不給時只能用一口價
  onAuction?: (input: AuctionInput) => Promise<unknown>;
  onCancelAuction?: () => Promise<unknown>;
}) {
  const t = useTranslations("Binder");
  const tAuction = useTranslations("Auction");
  const fees = useFees();
  const promoNote = usePromoNote();
  const withPromo = (text: string, f: (typeof fees)["sale"]) => [text, promoNote(f)].filter(Boolean).join(" ");
  // 收藏卡要先驗證信箱才能上架；金庫卡要錢包，郵箱帳號綁錢包前已經驗證過
  const needsVerify = useNeedsEmailVerify() && lane === "free";
  const listed = price !== null;
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<"fixed" | "auction">("fixed");
  const [input, setInput] = useState(price?.toString() ?? "");
  const [days, setDays] = useState<number>(AUCTION_DAYS[1]);
  const [withReserve, setWithReserve] = useState(false);
  const [reserve, setReserve] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const value = Number(input);
  const reserveValue = Number(reserve);
  // 最低 0.01（伺服器以分為單位存）；拍賣的起標價有下限，保底價不能低於起標價
  const valid =
    mode === "fixed"
      ? input !== "" && value >= 0.01 && value <= 100_000
      : input !== "" && value >= AUCTION_MIN_START && value <= 100_000 && (!withReserve || (reserve !== "" && reserveValue >= value && reserveValue <= 100_000));
  const run = async (go: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await go();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  };
  const errorText =
    error === "email_unverified" ? (
      <VerifyEmailNotice className="mt-2" />
    ) : (
      error && (
        <>
          <p className="mt-2 text-[11px] text-down">{t.has(`error_${error}`) ? t(`error_${error}`) : tAuction.has(`error_${error}`) ? tAuction(`error_${error}`) : t("listingError")}</p>
          <WalletNotFoundHint error={error} />
        </>
      )
    );

  if (auction) {
    return (
      <div className="rounded-xl bg-accent-soft p-3 text-sm">
        <p className="flex items-center justify-between gap-2 font-semibold text-accent-ink">
          <span>{tAuction("inAuction")}</span>
          <TimeLeft endsAt={auction.endsAt} className="text-xs font-normal" />
        </p>
        <p className="mt-1 text-xs text-accent-ink">
          {auction.highUsd === null
            ? tAuction("startingAt", { price: formatPrice(auction.startUsd) })
            : tAuction("currentAt", { price: formatPrice(auction.highUsd), count: auction.bidCount })}
        </p>
        {viewHref && (
          <Link href={viewHref} className="btn-primary mt-2 block rounded-full py-2 text-center text-sm font-semibold">
            {tAuction("viewAuction")} →
          </Link>
        )}
        {onCancelAuction && auction.bidCount === 0 && auction.status === "live" && (
          <button disabled={busy} onClick={() => run(onCancelAuction)} className="btn-secondary mt-2 w-full rounded-full py-1.5 text-xs font-semibold disabled:opacity-50">
            {busy ? "…" : tAuction("cancelAuction")}
          </button>
        )}
        {errorText}
      </div>
    );
  }

  if (listed && !editing) {
    return (
      <div className="rounded-xl bg-accent-soft p-3 text-sm">
        <p className="font-semibold text-accent-ink">{t("listedAt", { price: formatPrice(price) })}</p>
        {viewHref && (
          <Link href={viewHref} className="btn-primary mt-2 block rounded-full py-2 text-center text-sm font-semibold">
            {t("viewListing")} →
          </Link>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button disabled={busy} onClick={() => setEditing(true)} className="btn-secondary rounded-full py-1.5 text-xs font-semibold disabled:opacity-50">
            {t("editPrice")}
          </button>
          <button disabled={busy} onClick={() => run(onUnlist)} className="btn-secondary rounded-full py-1.5 text-xs font-semibold disabled:opacity-50">
            {busy ? "…" : t("unlist")}
          </button>
        </div>
        {errorText}
      </div>
    );
  }
  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="btn-primary rounded-full py-2.5 text-sm font-semibold">
        {t("listForSale")}
      </button>
    );
  }
  if (needsVerify && !listed) {
    return (
      <div className="rounded-xl border border-line p-3">
        <VerifyEmailNotice />
        <button type="button" onClick={() => setEditing(false)} className="btn-secondary mt-2 rounded-full px-4 py-1.5 text-xs font-semibold">
          {t("cancel")}
        </button>
      </div>
    );
  }
  const field = "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-ink";
  const chip = (active: boolean) => `rounded-full px-3 py-1 text-xs font-semibold transition ${active ? "bg-ink text-white" : "bg-surface-2 text-ink-2 hover:text-ink"}`;
  return (
    <form
      className="rounded-xl border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        if (mode === "fixed")
          run(async () => {
            await onList(value);
            if (!listed) track("listed", { lane, mode: "fixed", price_usd: value });
          });
        else
          run(async () => {
            await onAuction!({ startUsd: value, reserveUsd: withReserve ? reserveValue : null, days });
            track("listed", { lane, mode: "auction", start_usd: value, days, reserve: withReserve });
          });
      }}
    >
      {/* 已經一口價上架時只是改價，不切換方式 */}
      {onAuction && !listed && (
        <div role="radiogroup" aria-label={tAuction("saleType")} className="mb-3 flex gap-1.5">
          {(["fixed", "auction"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={chip(mode === m)}>
              {tAuction(m === "fixed" ? "fixedPrice" : "auction")}
            </button>
          ))}
        </div>
      )}
      <label className="flex items-center gap-2 text-xs text-ink-2">
        {mode === "fixed" ? t("price") : tAuction("startPrice")}
        <input autoFocus inputMode="decimal" value={input} onChange={(e) => setInput(e.target.value.replace(/[^\d.]/g, ""))} className={`w-24 ${field}`} />
        {CURRENCY}
        <InfoTip
          text={
            mode === "fixed"
              ? withPromo(`${note} ${t("saleFeeNote", { fee: bpsToPct(fees.sale.value) })}`, fees.sale)
              : withPromo(tAuction("startNote", { min: formatPrice(AUCTION_MIN_START), fee: bpsToPct(fees.auction.value) }), fees.auction)
          }
          label={mode === "fixed" ? t("price") : tAuction("startPrice")}
          align="end"
        />
      </label>
      {mode === "auction" && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
            <span className="mr-1">{tAuction("duration")}</span>
            {AUCTION_DAYS.map((d) => (
              <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={chip(days === d)}>
                {tAuction("days", { count: d })}
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={withReserve} onChange={(e) => setWithReserve(e.target.checked)} className="accent-ink" />
            {tAuction("reservePrice")}
            <InfoTip text={tAuction("reserveNote")} label={tAuction("reservePrice")} />
          </label>
          {withReserve && (
            <label className="mt-2 flex items-center gap-2 pl-5 text-xs text-ink-2">
              <input inputMode="decimal" value={reserve} onChange={(e) => setReserve(e.target.value.replace(/[^\d.]/g, ""))} className={`w-24 ${field}`} />
              {CURRENCY}
            </label>
          )}
        </>
      )}
      <div className="mt-3 flex gap-2">
        <button disabled={!valid || busy} className="btn-primary rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-40">
          {busy ? "…" : mode === "auction" ? tAuction("startAuction") : t(listed ? "savePrice" : "confirmList")}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="btn-secondary rounded-full px-4 py-1.5 text-xs font-semibold">
          {t("cancel")}
        </button>
      </div>
      {errorText}
    </form>
  );
}
