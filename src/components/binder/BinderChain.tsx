"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatPrice } from "@/lib/fx";
import { postAction } from "@/lib/chain-client";
import { solscanUrl } from "@/lib/solana/config";
import { arcExplorerUrl } from "@/lib/arc";
import AddressDialog, { AddressBlock } from "@/components/shipping/AddressDialog";
import type { ShippingAddress } from "@/lib/shipping";

type Order = {
  id: string;
  role: "buyer" | "seller";
  status: "paid" | "shipped" | "disputed" | "refunding" | "releasing" | "completed" | "refunded" | "cancelled";
  itemId: string;
  title: string;
  photo: string | null;
  priceUsdt: number;
  feeUsdt: number;
  rail: "solana" | "arc";
  // 拍賣得標的訂單
  auction: boolean;
  payTx: string | null;
  payoutTx: string | null;
  payoutHeld: boolean;
  transferTx: string | null;
  refundTx: string | null;
  disputeReason: string | null;
  shipBy: string | null;
  autoReleaseAt: string | null;
  // 收件地址：只有這筆訂單的買家和賣家拿得到
  shippingAddress: ShippingAddress | null;
  addressAt: string | null;
};

const dateOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

// 擔保交易訂單：卡名和照片連到刊登頁（成交後網址仍有效）。賣家標記寄出，買家確認收貨（平台隨即放款、轉移 NFT）。
// 賣家過了寄出期限沒寄，買家可以取消退款；買家收到有問題可以申訴，申訴中暫停自動放款。
// 收件地址：已付款的訂單賣家看得到（可複製），買家寄出前可以補填或修改（拍賣得標的訂單在這裡補填）；
// 沒有地址時賣家不能標記寄出，寄出期限也要等買家填好才開始算
export function Orders() {
  const t = useTranslations("Binder");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<{ id: string; code: string }>();
  const [addressing, setAddressing] = useState<Order>();
  const [disputing, setDisputing] = useState<string>();
  const [reason, setReason] = useState("");
  // 期限比較用的現在時間，讀訂單時更新
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch("/api/orders");
    setOrders(res.ok ? ((await res.json()) as { orders: Order[] }).orders : []);
    setNow(Date.now());
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 進入頁籤時讀訂單
    load();
  }, [load]);

  const act = async (id: string, step: "ship" | "receive" | "refund" | "dispute" | "address", body?: unknown) => {
    setBusy(id);
    setError(undefined);
    try {
      await postAction(`/api/orders/${id}/${step}`, body);
      setDisputing(undefined);
      setAddressing(undefined);
      setReason("");
      await load();
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      setError({ id, code });
      // 買家剛改了地址：重新讀訂單，讓賣家看到新地址再寄
      if (code === "address_changed") await load();
    } finally {
      setBusy(undefined);
    }
  };

  if (!orders) return <div className="mt-6 h-32 animate-pulse rounded-2xl bg-surface-2" />;
  if (!orders.length) return <p className="mt-6 text-sm text-ink-3">{t("ordersEmpty")}</p>;
  // 付款和退款走 Arc 的訂單，交易連到 Arc 區塊瀏覽器；其他都在 Solana
  const tx = (label: string, sig: string | null, onArc = false) =>
    sig && (
      <a href={onArc ? arcExplorerUrl("tx", sig) : solscanUrl("tx", sig)} target="_blank" rel="noreferrer" className="hover:text-ink hover:underline">
        {label} ↗
      </a>
    );
  return (
    <>
      <ul className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
        {orders.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
            <Link href={`/listing/${o.itemId}`} className="aspect-[55/85] w-10 shrink-0 overflow-hidden rounded-md bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- 用戶上傳的照片 */}
              {o.photo && <img src={o.photo} alt="" className="h-full w-full object-cover" />}
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/listing/${o.itemId}`} className="block truncate text-sm font-semibold hover:underline">
                {o.title}
              </Link>
              <p className="text-xs text-ink-3">
                {t(`orderRole_${o.role}`)}
                {o.auction && ` · ${t("orderFromAuction")}`} · {formatPrice(o.priceUsdt)} · <span className="font-medium text-ink-2">{t(`orderStatus_${o.status}`)}</span>
                {o.role === "seller" && o.status === "completed" && o.payoutHeld && <span className="text-notice-ink"> · {t("payoutHeld")}</span>}
              </p>
              <p className="mt-0.5 flex flex-wrap gap-3 text-[11px] text-ink-3">
                {tx(t("txPayment"), o.payTx, o.rail === "arc")}
                {tx(t("txTransfer"), o.transferTx)}
                {tx(t("txRefund"), o.refundTx ?? (o.status === "cancelled" ? o.payoutTx : null), o.rail === "arc")}
                {o.status !== "cancelled" && tx(t("txPayout"), o.payoutTx)}
              </p>
              {o.status === "paid" && o.shipBy && <p className="mt-0.5 text-[11px] text-ink-3">{t(o.role === "seller" ? "shipBySeller" : "shipByBuyer", { date: dateOf(o.shipBy) })}</p>}
              {o.status === "paid" && !o.shippingAddress && <p className="mt-0.5 text-[11px] text-notice-ink">{t(o.role === "seller" ? "awaitingAddress" : "addressNeeded")}</p>}
              {o.status === "paid" && o.shippingAddress && <AddressBlock address={o.shippingAddress} className="mt-2 max-w-xs" />}
              {o.status === "shipped" && o.autoReleaseAt && <p className="mt-0.5 text-[11px] text-ink-3">{t("autoRelease", { date: dateOf(o.autoReleaseAt) })}</p>}
              {o.status === "disputed" && (
                <p className="mt-0.5 text-[11px] text-notice-ink">
                  {t("disputedNote")}
                  {o.disputeReason ? ` · ${o.disputeReason}` : ""}
                </p>
              )}
            </div>
            {o.role === "seller" && o.status === "paid" && (
              <button
                disabled={busy === o.id || !o.shippingAddress}
                title={o.shippingAddress ? undefined : t("awaitingAddress")}
                onClick={() => act(o.id, "ship", { addressAt: o.addressAt })}
                className="btn-primary rounded-full px-4 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("markShipped")}
              </button>
            )}
            {o.role === "buyer" && o.status === "paid" && (
              <button
                disabled={busy === o.id}
                onClick={() => setAddressing(o)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50 ${o.shippingAddress ? "border border-line hover:bg-surface-2" : "btn-primary"}`}
              >
                {t(o.shippingAddress ? "editAddress" : "fillAddress")}
              </button>
            )}
            {o.role === "buyer" && o.status === "shipped" && (
              <button disabled={busy === o.id} onClick={() => act(o.id, "receive")} className="btn-primary rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50">
                {busy === o.id ? t("releasing") : t("confirmReceived")}
              </button>
            )}
            {o.role === "buyer" && o.status === "shipped" && disputing !== o.id && (
              <button
                disabled={busy === o.id}
                onClick={() => setDisputing(o.id)}
                className="rounded-full border border-line px-4 py-1.5 text-xs font-semibold hover:bg-surface-2 disabled:opacity-50"
              >
                {t("reportProblem")}
              </button>
            )}
            {o.role === "buyer" && o.status === "paid" && o.shipBy && now >= Date.parse(o.shipBy) && (
              <button disabled={busy === o.id} onClick={() => act(o.id, "refund")} className="btn-primary rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50">
                {busy === o.id ? t("refunding") : t("cancelRefund")}
              </button>
            )}
            {disputing === o.id && (
              <form
                className="flex w-full flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  act(o.id, "dispute", { reason });
                }}
              >
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  placeholder={t("disputePlaceholder")}
                  className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-1.5 text-xs outline-none focus:border-ink-3"
                />
                <button disabled={busy === o.id || !reason.trim()} className="btn-primary rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50">
                  {t("submitDispute")}
                </button>
                <button type="button" onClick={() => setDisputing(undefined)} className="rounded-full border border-line px-4 py-1.5 text-xs hover:bg-surface-2">
                  {t("cancelDispute")}
                </button>
              </form>
            )}
            {error?.id === o.id && <p className="w-full text-xs text-down">{t(error.code === "address_changed" ? "addressChanged" : "orderError")}</p>}
          </li>
        ))}
      </ul>
      {addressing && (
        <AddressDialog
          title={t("addressTitle")}
          body={t("addressBody")}
          submitLabel={t("saveAddress")}
          busy={busy === addressing.id}
          initial={addressing.shippingAddress}
          onSubmit={(address) => act(addressing.id, "address", { address })}
          onClose={() => setAddressing(undefined)}
        />
      )}
    </>
  );
}
