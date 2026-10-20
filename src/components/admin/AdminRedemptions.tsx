"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatPrice } from "@/lib/fx";
import type { ShippingAddress } from "@/lib/shipping";
import { AddressBlock } from "@/components/shipping/AddressDialog";
import { TrackingBlock, TrackingDialog } from "@/components/shipping/Tracking";
import { trackingOf, type Tracking } from "@/lib/tracking";
import { shortAddress } from "@/lib/solana/config";
import { VAULTS, type VaultId } from "@/lib/vaults";
import { TxLink, type Act, type Call } from "./shared";

export type Redemption = {
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

// 還在等出貨的提貨（頁籤上的數字）
export const pendingRedemption = (r: Redemption) => !r.cancelledAt && !r.shipTx && !r.onChain?.burned;

// 提貨申請：填單號出貨（同一筆交易解凍並銷毀）、改單號、取消提貨
export default function AdminRedemptions({ redemptions, busy, error, act, call }: { redemptions: Redemption[] | null; busy?: string; error?: string; act: Act; call: Call }) {
  const t = useTranslations("Admin");
  // 正在填單號的提貨：還沒出貨是出貨，已出貨是改單號
  const [shipping, setShipping] = useState<{ cardId: string; vault: VaultId; shipped: boolean; initial: Tracking | null }>();
  return (
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
                    <TxLink label={t("requestTx")} sig={r.requestTx} />
                    <TxLink label={t("shipTx")} sig={r.shipTx} />
                    <TxLink label={t("cancelTx")} sig={r.cancelTx} />
                    <TxLink label={t("refundTx")} sig={r.refundTx} />
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
    </section>
  );
}
