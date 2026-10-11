"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { VaultStatus } from "@/lib/cards";
import { useVaultCards } from "@/lib/chain-client";
import { shortAddress, solscanUrl } from "@/lib/solana/config";

export type VaultRow = { serial: string; title: string; asset: string; owner: string; status: VaultStatus; intakeDate: string; cardId: string };

const STATUS_STYLE: Record<VaultStatus, string> = {
  vaulted: "bg-up/10 text-up",
  listed: "bg-accent-soft text-accent-ink",
  redeeming: "bg-notice-bg text-notice-ink",
  redeemed: "bg-surface-3 text-ink-3",
};
const STATUSES: VaultStatus[] = ["vaulted", "listed", "redeeming", "redeemed"];

// 金庫清單：資料庫裡的卡加上鏈上即時的持有人和狀態，包括已提貨銷毀的。還沒讀到時是 null
function useRows(): VaultRow[] | null {
  const cards = useVaultCards(true);
  return cards?.map((c) => ({ serial: c.serial, title: `${c.group} ${c.member} · ${c.version}`, asset: c.asset, owner: c.owner, status: c.status, intakeDate: c.intakeDate, cardId: c.id })) ?? null;
}

export function VaultSummary() {
  const t = useTranslations("Vault");
  // 金庫裡現有的 NFT 和實物不算已提貨的
  const live = (useRows() ?? []).filter((r) => r.status !== "redeemed");
  const summary = [
    { label: t("nftCount"), value: live.length },
    { label: t("redeeming"), value: live.filter((e) => e.status === "redeeming").length },
    { label: t("physical"), value: live.length },
  ];
  return (
    <dl className="mt-10 grid grid-cols-3 gap-4">
      {summary.map((s) => (
        <div key={s.label} className="rounded-2xl border border-line bg-surface p-5">
          <dt className="text-xs text-ink-3">{s.label}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function VaultTable() {
  const t = useTranslations("Vault");
  const loaded = useRows();
  const rows = loaded ?? [];
  const tStatus = useTranslations("Status");
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter(
    (r) => (!status || r.status === status) && words.every((w) => `${r.serial} ${r.title} ${r.asset} ${r.owner}`.toLowerCase().includes(w)),
  );
  const count = (s: VaultStatus | null) => rows.filter((r) => !s || r.status === s).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="flex flex-wrap gap-1.5">
          {[null, ...STATUSES].map((s) => (
            <button
              key={s ?? "all"}
              role="tab"
              aria-selected={status === s}
              onClick={() => setStatus(s)}
              className={`rounded-full border px-3 py-1.5 text-xs ${status === s ? "border-line-strong bg-ink text-bg" : "border-line text-ink-2 hover:text-ink"}`}
            >
              {s ? tStatus(s) : t("all")} <span className="opacity-60 tabular-nums">{count(s)}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          className="w-full rounded-full border border-line bg-surface px-4 py-2 text-sm outline-none focus:border-ink sm:w-72"
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-surface-2 text-xs text-ink-3">
            <tr>
              <th className="px-4 py-3 font-medium">{t("colSerial")}</th>
              <th className="px-4 py-3 font-medium">{t("colCard")}</th>
              <th className="px-4 py-3 font-medium">{t("colAsset")}</th>
              <th className="px-4 py-3 font-medium">{t("colOwner")}</th>
              <th className="px-4 py-3 font-medium">{t("colStatus")}</th>
              <th className="px-4 py-3 font-medium">{t("colIntake")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((r) => (
              <tr key={r.asset} className="hover:bg-surface-2">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link href={`/card/${r.cardId}`} className="text-accent-ink hover:underline">
                    {r.serial}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink">{r.title}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  <a href={solscanUrl("account", r.asset)} target="_blank" rel="noreferrer" className="text-ink-2 hover:text-ink">
                    {shortAddress(r.asset, 6, 6)}
                  </a>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink-2">{shortAddress(r.owner)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[r.status]}`}>{tStatus(r.status)}</span>
                </td>
                <td className="px-4 py-3 text-xs text-ink-2 tabular-nums">{r.intakeDate}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-ink-3">
                  {loaded ? t(rows.length ? "noResults" : "empty") : "…"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
