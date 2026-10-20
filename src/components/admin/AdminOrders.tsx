"use client";

import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/fx";
import type { ShippingAddress } from "@/lib/shipping";
import type { Tracking } from "@/lib/tracking";
import { AddressBlock } from "@/components/shipping/AddressDialog";
import { TrackingBlock } from "@/components/shipping/Tracking";
import { TxLink, type Act, type Call } from "./shared";

export type Order = {
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

// 擔保交易訂單：申訴中的排最前面，可以退款給買家或放款給賣家
export default function AdminOrders({ orders, busy, act, call }: { orders: Order[] | null; busy?: string; act: Act; call: Call }) {
  const t = useTranslations("Admin");
  const tb = useTranslations("Binder");
  return (
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
                    <TxLink label={tb("txPayment")} sig={o.payTx} onArc={o.rail === "arc"} />
                    <TxLink label={tb("txTransfer")} sig={o.transferTx} />
                    <TxLink label={tb("txPayout")} sig={o.payoutTx} />
                    <TxLink label={tb("txRefund")} sig={o.refundTx} onArc={o.rail === "arc"} />
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
  );
}
