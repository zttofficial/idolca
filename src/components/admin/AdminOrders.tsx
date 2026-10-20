"use client";

import { useTranslations } from "next-intl";
import { formatPrice } from "@/lib/fx";
import type { AdminOrder } from "@/lib/server/orders";
import { AddressBlock } from "@/components/shipping/AddressDialog";
import { TrackingBlock } from "@/components/shipping/Tracking";
import AdminList from "./AdminList";
import { Facts, Party, Thumb, TxLink, when, type Call } from "./shared";

// 後台只用英文，下面是代碼對應的顯示文字
const ORDER_VIEW_LABEL: Record<string, string> = {
  open: "Open",
  disputed: "Disputed",
  late: "Ship-by due",
  paid: "Paid",
  shipped: "Shipped",
  completed: "Completed",
  refunded: "Refunded",
  cancelled: "Cancelled",
  all: "All",
};

export const ORDER_STATUSES = ["open", "disputed", "late", "paid", "shipped", "completed", "refunded", "cancelled", "all"] as const;
const isOpen = (o: AdminOrder) => o.status === "paid" || o.status === "shipped" || o.status === "disputed";

// 擔保交易訂單：預設列還沒結束的（申訴中的排最前面），點一列在右側看買賣雙方、地址、物流和交易，申訴時退款給買家或放款給賣家
export default function AdminOrders({ call, onChanged }: { call: Call; onChanged: () => void }) {
  const tb = useTranslations("Binder");
  const status = (o: AdminOrder) => <span className={`font-medium ${o.status === "disputed" ? "text-notice-ink" : "text-ink-2"}`}>{tb(`orderStatus_${o.status}`)}</span>;
  return (
    <section>
      <h2 className="text-lg font-semibold">Escrow orders</h2>
      <p className="mt-1 mb-4 text-xs text-ink-3">
        Disputed orders first. Refund returns the full price to the buyer and relists the card; release sends the NFT to the buyer and the payment to the seller.
      </p>
      <AdminList<AdminOrder>
        endpoint="/api/admin/orders"
        call={call}
        onChanged={onChanged}
        rowKey={(o) => o.id}
        search="Search order ID, card, buyer or seller email or wallet, payment tx"
        dates
        filters={[{ key: "status", label: "Status", options: ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_VIEW_LABEL[s] })) }]}
        renderRow={(o) => (
          <>
            <Thumb src={o.photo} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{o.title}</span>
              <span className="block text-xs text-ink-3">
                {formatPrice(o.priceUsdt)} · {status(o)}
                {o.disputeReason && <span> · {o.disputeReason}</span>}
              </span>
            </span>
            <span className="w-full text-xs text-ink-3 sm:w-auto sm:text-right">
              {o.status === "paid" && o.shipBy ? `Ship by ${when(o.shipBy)}` : when(o.updatedAt)}
              <span className="block truncate">
                {o.buyer.email ?? o.buyer.name} → {o.seller.email ?? o.seller.name}
              </span>
            </span>
          </>
        )}
        detail={{
          title: (o) => o.title || o.id,
          render: (o, { busy, act, call }) => (
            <div className="space-y-5">
              <div className="flex gap-4">
                <span className="w-20 shrink-0">
                  <Thumb src={o.photo} />
                </span>
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">{o.title}</p>
                  <p className="mt-1 text-xs text-ink-3">
                    {formatPrice(o.priceUsdt)} · {status(o)} · {`fee ${formatPrice(o.feeUsdt, 2)}`}
                  </p>
                  {o.disputeReason && <p className="mt-2 rounded-lg bg-notice-bg px-3 py-2 text-xs text-notice-ink">{o.disputeReason}</p>}
                </div>
              </div>
              <Facts
                rows={[
                  [
                    "Order ID",
                    <span key="id" className="font-mono text-xs break-all">
                      {o.id}
                    </span>,
                  ],
                  ["Buyer", <Party key="b" party={o.buyer} />],
                  ["Seller", <Party key="s" party={o.seller} />],
                  ["Created", when(o.createdAt)],
                  ["Paid", when(o.paidAt)],
                  ["Ship by", when(o.shipBy)],
                  ["Address due", when(o.addressBy)],
                  ["Shipped", when(o.shippedAt)],
                  ["Auto-release", when(o.autoReleaseAt)],
                  ["Payment rail", `${o.rail}${o.auction ? ` · ${"auction win"}` : ""}`],
                ]}
              />
              <p className="flex flex-wrap gap-3 text-xs">
                <TxLink label={tb("txPayment")} sig={o.payTx} onArc={o.rail === "arc"} />
                <TxLink label={tb("txTransfer")} sig={o.transferTx} />
                <TxLink label={tb("txPayout")} sig={o.payoutTx} />
                <TxLink label={tb("txRefund")} sig={o.refundTx} onArc={o.rail === "arc"} />
              </p>
              {isOpen(o) &&
                (o.shippingAddress ? <AddressBlock address={o.shippingAddress} /> : <p className="text-xs text-notice-ink">{"No shipping address yet, so the seller can't ship."}</p>)}
              {o.tracking && <TrackingBlock tracking={o.tracking} />}
              {isOpen(o) && (
                <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                  {o.status !== "paid" && (
                    <button
                      disabled={busy !== undefined}
                      onClick={() =>
                        window.confirm("Send the NFT to the buyer and the payment to the seller? This can't be undone.") &&
                        act(`${o.id}:release`, () => call("POST", `/api/admin/orders/${o.id}/release`))
                      }
                      className="btn-primary rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
                    >
                      {busy === `${o.id}:release` ? "…" : "Release to seller"}
                    </button>
                  )}
                  <button
                    disabled={busy !== undefined}
                    onClick={() =>
                      window.confirm("Refund the full price to the buyer? This sends a transaction and can't be undone.") &&
                      act(`${o.id}:refund`, () => call("POST", `/api/admin/orders/${o.id}/refund`))
                    }
                    className="rounded-full border border-down px-4 py-1.5 text-xs font-semibold text-down hover:bg-down/10 disabled:opacity-50"
                  >
                    {busy === `${o.id}:refund` ? "…" : "Refund buyer"}
                  </button>
                </div>
              )}
            </div>
          ),
        }}
      />
    </section>
  );
}
