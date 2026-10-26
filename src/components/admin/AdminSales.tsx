"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatPrice } from "@/lib/fx";
import { SALES_EXPORT_CAP } from "@/lib/admin-list";
import type { Sale } from "@/lib/server/admin-sales";
import AdminList from "./AdminList";
import { TxLink, Wallet, adminHref, when, type Call } from "./shared";

// 後台只用英文，下面是代碼對應的顯示文字
const SALE_STATUS_LABEL: Record<string, string> = { vault_settled: "Settled", pack_drawn: "Drawn", pack_drawing: "Drawing", pack_legacy: "Drawn (legacy)" };
const SALE_TYPE_LABEL: Record<string, string> = { all: "All", vault: "Vault card", escrow: "Escrow", pack: "Pack" };
const SALE_VIEW_LABEL: Record<string, string> = { all: "All", settled: "Settled", open: "In progress", refunded: "Refunded" };
const SALE_KIND_LABEL: Record<string, string> = { buy: "Fixed price", auction: "Auction" };

export const SALE_TYPES = ["all", "vault", "escrow", "pack"] as const;
export const SALE_STATUSES = ["all", "settled", "open", "refunded"] as const;
type Totals = { type: Sale["type"]; count: number; amountUsdt: number; feeUsdt: number }[];

// 每筆成交連回它所在的頁籤：擔保訂單到訂單、金庫卡成交到那張卡、開包到那個卡包
const sourceHref = (s: Sale) =>
  s.type === "escrow"
    ? adminHref("orders", { status: "all", q: s.id, open: s.id })
    : s.type === "vault"
      ? adminHref("cards", { state: "all", open: s.ref })
      : adminHref("packs", { open: s.ref });

// 銷售紀錄：金庫卡在鏈上的成交、擔保訂單、開卡包合在一起按時間倒序，可以按種類、狀態、日期篩，搜編號、錢包、郵箱、卡名。
// 上方是目前篩選下的總計，可以把目前篩選匯出成 CSV
export default function AdminSales({ call }: { call: Call }) {
  const tb = useTranslations("Binder");
  const statusLabel = (s: Sale) => (s.type === "escrow" ? tb(`orderStatus_${s.status}`) : SALE_STATUS_LABEL[`${s.type}_${s.status}`]);
  return (
    <section>
      <h2 className="text-lg font-semibold">Sales</h2>
      <p className="mt-1 mb-4 text-xs text-ink-3">Vault card trades on chain, escrow orders and pack openings in one timeline. Totals and CSV export follow the current filters.</p>
      <AdminList<Sale>
        endpoint="/api/admin/sales"
        call={call}
        rowKey={(s) => `${s.type}:${s.id}`}
        search="Search ID, tx, wallet, email or card"
        dates
        filters={[
          { key: "type", label: "Type", options: SALE_TYPES.map((s) => ({ value: s, label: SALE_TYPE_LABEL[s] })) },
          { key: "status", label: "Status", options: SALE_STATUSES.map((s) => ({ value: s, label: SALE_VIEW_LABEL[s] })) },
        ]}
        summary={(first, query) => {
          const totals = (first.totals ?? []) as Totals;
          const sum = totals.reduce((a, x) => ({ count: a.count + x.count, amountUsdt: a.amountUsdt + x.amountUsdt, feeUsdt: a.feeUsdt + x.feeUsdt }), {
            count: 0,
            amountUsdt: 0,
            feeUsdt: 0,
          });
          return (
            <div className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
                <span>
                  <span className="text-xs text-ink-3">Count</span> <span className="font-semibold tabular-nums">{sum.count}</span>
                </span>
                <span>
                  <span className="text-xs text-ink-3">GMV</span> <span className="font-semibold tabular-nums">{formatPrice(sum.amountUsdt, 2)}</span>
                </span>
                <span>
                  <span className="text-xs text-ink-3">Fees</span> <span className="font-semibold tabular-nums">{formatPrice(sum.feeUsdt, 2)}</span>
                </span>
                <a href={`/api/admin/sales/export${query ? `?${query}` : ""}`} className="btn-secondary ml-auto rounded-full px-4 py-1.5 text-xs font-semibold">
                  Export CSV
                </a>
              </div>
              {totals.length > 1 && (
                <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-ink-3">
                  {totals.map((x) => (
                    <span key={x.type}>
                      {SALE_TYPE_LABEL[x.type]}: {x.count} · {formatPrice(x.amountUsdt, 2)} · {`fee ${formatPrice(x.feeUsdt, 2)}`}
                    </span>
                  ))}
                </p>
              )}
              {sum.count > SALES_EXPORT_CAP && (
                <p className="mt-2 text-xs text-notice-ink">{`More than ${SALES_EXPORT_CAP} rows: the export stops there. Narrow the date range to export the rest.`}</p>
              )}
            </div>
          );
        }}
        renderRow={(s) => (
          <>
            <span className="w-16 shrink-0 text-xs font-semibold text-ink-2">{SALE_TYPE_LABEL[s.type]}</span>
            <span className="min-w-0 flex-1">
              <Link href={sourceHref(s)} className="block truncate font-semibold hover:underline">
                {s.card || s.id}
              </Link>
              <span className="flex flex-wrap gap-x-3 text-xs text-ink-3">
                <span>{when(s.at)}</span>
                <span>{statusLabel(s)}</span>
                {s.type !== "pack" && <span>{SALE_KIND_LABEL[s.sub]}</span>}
                <span className="flex gap-1">
                  {s.buyerEmail ?? <Wallet address={s.buyerWallet} />}
                  {(s.sellerEmail || s.sellerWallet) && (
                    <>
                      <span>←</span>
                      {s.sellerEmail ?? <Wallet address={s.sellerWallet} />}
                    </>
                  )}
                </span>
                <TxLink label="Tx" sig={s.tx} onArc={s.rail === "arc"} />
              </span>
            </span>
            <span className="text-right text-sm tabular-nums">
              {formatPrice(s.amountUsdt, 2)}
              {s.feeUsdt > 0 && <span className="block text-xs text-ink-3">{`fee ${formatPrice(s.feeUsdt, 2)}`}</span>}
            </span>
          </>
        )}
      />
    </section>
  );
}
