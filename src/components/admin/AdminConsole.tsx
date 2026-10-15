"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/components/auth/AuthContext";
import { formatPrice } from "@/lib/fx";
import type { ShippingAddress } from "@/lib/shipping";
import { AddressBlock } from "@/components/shipping/AddressDialog";
import { TrackingBlock, TrackingDialog } from "@/components/shipping/Tracking";
import { trackingOf, type Tracking } from "@/lib/tracking";
import VaultIntake from "./VaultIntake";
import VaultGrade from "./VaultGrade";
import AdminPacks from "./AdminPacks";
import VaultConvert from "./VaultConvert";
import { itemTitle } from "@/lib/item-title";
import type { CollectorItem } from "@/lib/items";
import { shortAddress, solscanUrl } from "@/lib/solana/config";
import { arcExplorerUrl } from "@/lib/arc";
import { VAULTS, type VaultId } from "@/lib/vaults";

type Redemption = {
  cardId: string;
  card: string;
  // 卡所在的金庫，從那裡寄出
  vault: VaultId;
  wallet: string;
  requestTx: string;
  shipTx: string | null;
  shippingAddress: string | null;
  // 運費（不含稅）和加拿大境內另收的 GST/HST
  feeCents: number;
  taxCents: number;
  feePaid: number;
  cancelTx: string | null;
  refundTx: string | null;
  cancelledAt: string | null;
  trackingCarrier: string | null;
  trackingNumber: string | null;
  createdAt: string;
  onChain: { redeeming: boolean; burned: boolean } | null;
};

type Order = {
  id: string;
  status: string;
  title: string;
  photo: string | null;
  priceUsdt: number;
  rail: "solana" | "arc";
  payTx: string | null;
  payoutTx: string | null;
  transferTx: string | null;
  refundTx: string | null;
  disputeReason: string | null;
  shipBy: string | null;
  autoReleaseAt: string | null;
  // 買家的收件地址和賣家填的物流單號，申訴時核對寄到哪裡、包裹走到哪
  shippingAddress: ShippingAddress | null;
  tracking: Tracking | null;
};

// 後台：管理員帳號登入後使用，權限由伺服器按會話檢查
export default function AdminConsole() {
  const t = useTranslations("Admin");
  const tb = useTranslations("Binder");
  const { ready, user, login } = useAuth();
  const [redemptions, setRedemptions] = useState<Redemption[] | null>(null);
  const [items, setItems] = useState<CollectorItem[] | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  // 正在填單號的提貨：還沒出貨是出貨（同一筆交易解凍並銷毀），已出貨是改單號
  const [shipping, setShipping] = useState<{ cardId: string; vault: VaultId; shipped: boolean; initial: Tracking | null }>();

  const call = useCallback(
    async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
      const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = (await res.json().catch(() => ({}))) as T & { error?: string };
      if (!res.ok) throw new Error(data.error ?? String(res.status));
      return data;
    },
    [],
  );

  const load = useCallback(async () => {
    if (!user?.isAdmin) return;
    try {
      setError(undefined);
      const [r, i, o] = await Promise.all([
        call<{ redemptions: Redemption[] }>("GET", "/api/admin/redemptions"),
        call<{ items: CollectorItem[] }>("GET", "/api/admin/items"),
        call<{ orders: Order[] }>("GET", "/api/admin/orders"),
      ]);
      setRedemptions(r.redemptions);
      setItems(i.items);
      setOrders(o.orders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    }
  }, [call, user?.isAdmin]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 有令牌時讀資料
    load();
  }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(undefined);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(undefined);
    }
  };

  if (!ready) return <div className="mt-8 h-32 animate-pulse rounded-2xl bg-surface-2" />;
  if (!user) {
    return (
      <button onClick={login} className="btn-primary mt-8 rounded-full px-6 py-2.5 text-sm font-semibold">
        {t("login")}
      </button>
    );
  }
  if (!user.isAdmin) return <p className="mt-8 rounded-xl bg-surface-2 px-4 py-3 text-sm text-ink-2">{t("forbidden")}</p>;

  // 付款和退款走 Arc 的訂單，交易連到 Arc 區塊瀏覽器；其他都在 Solana
  const tx = (label: string, sig: string | null, onArc = false) =>
    sig && (
      <a href={onArc ? arcExplorerUrl("tx", sig) : solscanUrl("tx", sig)} target="_blank" rel="noreferrer" className="text-accent-ink hover:underline">
        {label} ↗
      </a>
    );

  return (
    <div className="mt-8 space-y-10">
      {error && <p className="rounded-xl bg-down/10 px-4 py-2 text-sm text-down">{t("error", { error })}</p>}

      <VaultIntake />

      <VaultGrade />

      <AdminPacks call={call} />

      <section>
        <h2 className="text-lg font-semibold">{t("orders")}</h2>
        <p className="mt-1 text-xs text-ink-3">{t("ordersHint")}</p>
        {!orders?.length ? (
          <p className="mt-4 text-sm text-ink-3">{orders ? t("none") : "…"}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
            {orders.map((o) => {
              const open = o.status === "paid" || o.status === "shipped" || o.status === "disputed";
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-4 px-4 py-3 text-sm">
                  <div className="aspect-[55/85] w-10 shrink-0 overflow-hidden rounded-md bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 用戶上傳的照片 */}
                    {o.photo && <img src={o.photo} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{o.title}</p>
                    <p className="text-xs text-ink-3">
                      {formatPrice(o.priceUsdt)} · <span className={`font-medium ${o.status === "disputed" ? "text-notice-ink" : "text-ink-2"}`}>{tb(`orderStatus_${o.status}`)}</span>
                      {o.disputeReason && <span> · {o.disputeReason}</span>}
                    </p>
                    <p className="mt-0.5 flex flex-wrap gap-3 text-xs text-ink-3">
                      {tx(tb("txPayment"), o.payTx, o.rail === "arc")}
                      {tx(tb("txTransfer"), o.transferTx)}
                      {tx(tb("txPayout"), o.payoutTx)}
                      {tx(tb("txRefund"), o.refundTx, o.rail === "arc")}
                    </p>
                    {open &&
                      (o.shippingAddress ? <AddressBlock address={o.shippingAddress} className="mt-2 max-w-xs" /> : <p className="mt-1 text-xs text-notice-ink">{t("orderNoAddress")}</p>)}
                    {o.tracking && <TrackingBlock tracking={o.tracking} className="mt-2 max-w-xs" />}
                  </div>
                  {open && (
                    <div className="flex gap-2">
                      {o.status !== "paid" && (
                        <button
                          disabled={busy !== undefined}
                          onClick={() => window.confirm(t("releaseConfirm")) && act(`${o.id}:release`, () => call("POST", `/api/admin/orders/${o.id}/release`))}
                          className="btn-primary rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                        >
                          {busy === `${o.id}:release` ? "…" : t("release")}
                        </button>
                      )}
                      <button
                        disabled={busy !== undefined}
                        onClick={() => window.confirm(t("refundConfirm")) && act(`${o.id}:refund`, () => call("POST", `/api/admin/orders/${o.id}/refund`))}
                        className="rounded-full border border-down px-4 py-1.5 text-xs font-semibold text-down hover:bg-down/10 disabled:opacity-50"
                      >
                        {busy === `${o.id}:refund` ? "…" : t("refund")}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">{t("redemptions")}</h2>
        <p className="mt-1 text-xs text-ink-3">{t("redemptionsHint")}</p>
        {!redemptions?.length ? (
          <p className="mt-4 text-sm text-ink-3">{redemptions ? t("none") : "…"}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
            {redemptions.map((r) => {
              const shipped = r.shipTx || r.onChain?.burned;
              const address = r.shippingAddress ? (JSON.parse(r.shippingAddress) as ShippingAddress) : null;
              const tracking = trackingOf(r.trackingCarrier, r.trackingNumber);
              return (
                <li key={r.cardId} className="flex flex-wrap items-center gap-4 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={`/card/${r.cardId}`} className="font-semibold hover:underline">
                      {r.card}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap gap-3 text-xs text-ink-3">
                      <span>{t("shipsFrom", { vault: VAULTS[r.vault].code })}</span>
                      <span className="font-mono">{shortAddress(r.wallet)}</span>
                      {tx(t("requestTx"), r.requestTx)}
                      {tx(t("shipTx"), r.shipTx)}
                      {tx(t("cancelTx"), r.cancelTx)}
                      {tx(t("refundTx"), r.refundTx)}
                      {r.feeCents > 0 && <span className={r.feePaid ? "text-up" : "text-down"}>{t(r.feePaid ? "feePaid" : "feeUnpaid", { fee: formatPrice(r.feeCents / 100, 2) })}</span>}
                      {r.taxCents > 0 && <span className={r.feePaid ? "text-up" : "text-down"}>{t("taxAmount", { tax: formatPrice(r.taxCents / 100, 2) })}</span>}
                    </p>
                    {address && !shipped && <AddressBlock address={address} className="mt-2 max-w-xs" />}
                    {tracking && <TrackingBlock tracking={tracking} className="mt-2 max-w-xs" />}
                  </div>
                  {r.cancelledAt ? (
                    <span className="text-xs font-semibold text-ink-3">{t("redeemCancelled")}</span>
                  ) : shipped ? (
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-up">{t("shipped")}</span>
                      {r.shipTx && (
                        <button
                          disabled={busy !== undefined}
                          onClick={() => setShipping({ cardId: r.cardId, vault: r.vault, shipped: true, initial: tracking })}
                          className="rounded-full border border-line px-4 py-1.5 text-xs hover:bg-surface-2 disabled:opacity-50"
                        >
                          {t(tracking ? "editTracking" : "addTracking")}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        disabled={busy !== undefined || !address || !r.feePaid}
                        onClick={() => setShipping({ cardId: r.cardId, vault: r.vault, shipped: false, initial: null })}
                        className="btn-primary rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        {busy === r.cardId ? "…" : t("ship")}
                      </button>
                      <button
                        disabled={busy !== undefined}
                        onClick={() => window.confirm(t("redeemCancelConfirm")) && act(`${r.cardId}:cancel`, () => call("POST", `/api/admin/redemptions/${r.cardId}/cancel`))}
                        className="rounded-full border border-line px-4 py-1.5 text-xs hover:bg-surface-2 disabled:opacity-50"
                      >
                        {busy === `${r.cardId}:cancel` ? "…" : t("redeemCancel")}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold">{t("items")}</h2>
        <p className="mt-1 text-xs text-ink-3">{t("itemsHint")}</p>
        {!items?.length ? (
          <p className="mt-4 text-sm text-ink-3">{items ? t("none") : "…"}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
            {items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-4 px-4 py-3 text-sm">
                <div className="aspect-[55/85] w-10 shrink-0 overflow-hidden rounded-md bg-surface-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- 用戶上傳的照片 */}
                  <img src={i.photo} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{itemTitle(i)}</p>
                  <p className="mt-0.5 flex flex-wrap gap-3 text-xs text-ink-3">
                    {i.mintTx && i.asset ? (
                      <a href={solscanUrl("account", i.asset)} target="_blank" rel="noreferrer" className="font-mono hover:underline">
                        {shortAddress(i.asset)} ↗
                      </a>
                    ) : (
                      <span>{t("notOnChain")}</span>
                    )}
                    {tx(t("fakeTx"), i.fakeTx)}
                  </p>
                </div>
                {i.verification === "fake" ? (
                  <span className="text-xs font-semibold text-down">{t("isFake")}</span>
                ) : (
                  <button
                    disabled={busy !== undefined}
                    onClick={() => window.confirm(t("fakeConfirm")) && act(i.id, () => call("PATCH", `/api/admin/items/${i.id}`, { verification: "fake", note: t("fakeNote") }))}
                    className="rounded-full border border-down px-4 py-1.5 text-xs font-semibold text-down hover:bg-down/10 disabled:opacity-50"
                  >
                    {busy === i.id ? "…" : t("markFake")}
                  </button>
                )}
                {i.vaultRequestedAt && i.verification !== "fake" && (
                  <VaultConvert
                    item={i}
                    busy={busy !== undefined}
                    onConvert={(body) => act(`${i.id}:vault`, () => call("POST", `/api/admin/items/${i.id}/vault`, body))}
                    onReturn={() => act(`${i.id}:vault`, () => call("DELETE", `/api/admin/items/${i.id}/vault`))}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {shipping && (
        <TrackingDialog
          title={t(shipping.shipped ? "editTracking" : "ship")}
          body={t(shipping.shipped ? "editTrackingBody" : "shipBody")}
          submitLabel={t(shipping.shipped ? "saveTracking" : "ship")}
          busy={busy === shipping.cardId}
          error={error ? t("error", { error }) : undefined}
          initial={shipping.initial}
          defaultCarrier={VAULTS[shipping.vault].carrier}
          onSubmit={(tracking) =>
            act(shipping.cardId, async () => {
              await call("POST", `/api/admin/redemptions/${shipping.cardId}/${shipping.shipped ? "tracking" : "ship"}`, { tracking });
              setShipping(undefined);
            })
          }
          onClose={() => setShipping(undefined)}
        />
      )}
    </div>
  );
}
