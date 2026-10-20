"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatPrice } from "@/lib/fx";
import type { ShippingAddress } from "@/lib/shipping";
import type { AdminRedemption } from "@/lib/server/admin-queries";
import { AddressBlock } from "@/components/shipping/AddressDialog";
import { TrackingBlock, TrackingDialog } from "@/components/shipping/Tracking";
import { trackingOf, type Tracking } from "@/lib/tracking";
import { VAULTS, VAULT_LIST, type VaultId } from "@/lib/vaults";
import AdminList, { type ListCtx } from "./AdminList";
import { Facts, TxLink, Wallet, adminHref, when, type Call } from "./shared";

// 後台只用英文，下面是代碼對應的顯示文字
const REDEEM_VIEW_LABEL: Record<string, string> = { pending: "Not shipped", ready: "Ready to ship", shipped: "Shipped", cancelled: "Cancelled", all: "All" };

export const REDEMPTION_STATUSES = ["pending", "ready", "shipped", "cancelled", "all"] as const;
const shippedOf = (r: AdminRedemption) => Boolean(r.shipTx || r.onChain?.burned);

// 提貨申請：預設列還沒寄出的（最早申請的在前）。點一列在右側看地址和運費，填單號出貨（同一筆交易解凍並銷毀）、改單號、取消提貨
export default function AdminRedemptions({ call, onChanged }: { call: Call; onChanged: () => void }) {
  const tVault = useTranslations("Vaults");
  const state = (r: AdminRedemption) =>
    r.cancelledAt ? (
      <span className="text-ink-3">Cancelled</span>
    ) : shippedOf(r) ? (
      <span className="text-up">Shipped</span>
    ) : (
      <span className={r.feePaid ? "text-notice-ink" : "text-down"}>{r.feePaid ? "Waiting to ship" : "Fee not received"}</span>
    );
  return (
    <section>
      <h2 className="text-lg font-semibold">Redemptions</h2>
      <p className="mt-1 mb-4 text-xs text-ink-3">The owner froze the NFT when requesting. Shipping thaws and burns it in one transaction.</p>
      <AdminList<AdminRedemption>
        endpoint="/api/admin/redemptions"
        call={call}
        onChanged={onChanged}
        rowKey={(r) => r.cardId}
        search="Search serial, wallet, tracking number, group or member"
        dates
        filters={[
          { key: "status", label: "Status", options: REDEMPTION_STATUSES.map((s) => ({ value: s, label: REDEEM_VIEW_LABEL[s] })) },
          { key: "vault", label: "Vault", options: [{ value: "", label: "Any" }, ...VAULT_LIST.map((v) => ({ value: v.id, label: v.code }))] },
        ]}
        renderRow={(r) => (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{r.card}</span>
              <span className="flex flex-wrap gap-x-3 text-xs text-ink-3">
                <span>{`Ships from ${VAULTS[r.vault].code}`}</span>
                <span>{when(r.createdAt)}</span>
                {r.trackingNumber && <span className="font-mono">{r.trackingNumber}</span>}
              </span>
            </span>
            <span className="text-xs font-semibold">{state(r)}</span>
          </>
        )}
        detail={{
          title: (r) => r.card,
          render: (r, ctx) => <RedemptionDetail r={r} ctx={ctx} vaultName={tVault(r.vault)} />,
        }}
      />
    </section>
  );
}

function RedemptionDetail({ r, ctx, vaultName }: { r: AdminRedemption; ctx: ListCtx; vaultName: string }) {
  const { busy, act, call } = ctx;
  // 正在填單號：還沒出貨是出貨，已出貨是改單號
  const [shipping, setShipping] = useState<{ shipped: boolean; initial: Tracking | null }>();
  const [error, setError] = useState<string>();
  const shipped = shippedOf(r);
  const address = r.shippingAddress ? (JSON.parse(r.shippingAddress) as ShippingAddress) : null;
  const tracking = trackingOf(r.trackingCarrier, r.trackingNumber);
  const paid = r.feePaid ? "text-up" : "text-down";
  return (
    <div className="space-y-5">
      <Facts
        rows={[
          [
            "Card",
            <Link key="c" href={adminHref("cards", { open: r.cardId })} className="font-semibold hover:underline">
              {r.card}
            </Link>,
          ],
          ["Vault", `${VAULTS[r.vault].code} · ${vaultName}`],
          ["Holder", <Wallet key="w" address={r.wallet} />],
          ["Requested", when(r.createdAt)],
          ["Shipped", when(r.shippedAt)],
          ["Cancelled", when(r.cancelledAt)],
          ["Shipping", r.feeCents > 0 && <span className={paid}>{r.feePaid ? `Fee ${formatPrice(r.feeCents / 100, 2)} paid` : `Fee ${formatPrice(r.feeCents / 100, 2)} not found`}</span>],
          ["Tax", r.taxCents > 0 && <span className={paid}>{`GST/HST ${formatPrice(r.taxCents / 100, 2)}`}</span>],
          ["On-chain state", r.onChain ? (r.onChain.burned ? "Burned" : r.onChain.redeeming ? "Frozen for redemption" : "Held") : "Not synced"],
        ]}
      />
      <p className="flex flex-wrap gap-3 text-xs">
        <TxLink label="Request" sig={r.requestTx} />
        <TxLink label="Burn" sig={r.shipTx} />
        <TxLink label="Cancel tx" sig={r.cancelTx} />
        <TxLink label="Refund tx" sig={r.refundTx} />
      </p>
      {address && !shipped && <AddressBlock address={address} />}
      {tracking && <TrackingBlock tracking={tracking} />}
      {!r.cancelledAt && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {shipped ? (
            r.shipTx && (
              <button
                disabled={busy !== undefined}
                onClick={() => setShipping({ shipped: true, initial: tracking })}
                className="rounded-full border border-line px-4 py-1.5 text-xs hover:bg-surface-2 disabled:opacity-50"
              >
                {tracking ? "Edit tracking" : "Add tracking"}
              </button>
            )
          ) : (
            <>
              <button
                disabled={busy !== undefined || !address || !r.feePaid}
                onClick={() => setShipping({ shipped: false, initial: null })}
                className="btn-primary rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
              >
                {busy === r.cardId ? "…" : "Ship and burn"}
              </button>
              <button
                disabled={busy !== undefined}
                onClick={() =>
                  window.confirm("Cancel this redemption? The NFT is unfrozen and the shipping fee refunded.") &&
                  act(`${r.cardId}:cancel`, () => call("POST", `/api/admin/redemptions/${r.cardId}/cancel`))
                }
                className="rounded-full border border-line px-4 py-1.5 text-xs hover:bg-surface-2 disabled:opacity-50"
              >
                {busy === `${r.cardId}:cancel` ? "…" : "Cancel"}
              </button>
            </>
          )}
        </div>
      )}

      {shipping && (
        <TrackingDialog
          title={shipping.shipped ? "Edit tracking" : "Ship and burn"}
          body={
            shipping.shipped
              ? "Correct the tracking number. The holder is notified again."
              : "Enter the tracking number, then ship: the NFT is thawed and burned in one transaction and the holder is notified with the number."
          }
          submitLabel={shipping.shipped ? "Save" : "Ship and burn"}
          busy={busy === r.cardId}
          error={error ? `Error: ${error}` : undefined}
          initial={shipping.initial}
          defaultCarrier={VAULTS[r.vault as VaultId].carrier}
          onSubmit={(tracking) =>
            act(r.cardId, async () => {
              setError(undefined);
              try {
                await call("POST", `/api/admin/redemptions/${r.cardId}/${shipping.shipped ? "tracking" : "ship"}`, { tracking });
                setShipping(undefined);
              } catch (e) {
                setError(e instanceof Error ? e.message : "error");
                throw e;
              }
            })
          }
          onClose={() => setShipping(undefined)}
        />
      )}
    </div>
  );
}
