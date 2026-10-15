"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatPrice } from "@/lib/fx";
import type { VaultId } from "@/lib/vaults";

// 運費表的一列：一個國家或地區，從各金庫寄過去的運費（USD）；那個金庫不寄是 null
export type RateRow = { country: string; name: string; fees: Record<VaultId, number | null> };

type SortKey = "name" | VaultId;

// 公開的運費表（/shipping）：每列一個國家或地區，每個金庫一欄。可以搜尋，點欄名排序（再點一次反向）；不寄的地方不論升降都排在最後。
// 只有三欄，窄螢幕也不用橫向捲動。資料由頁面從 src/lib/shipping.ts 算好傳進來
export default function RateTable({ rows, vaults, notes }: { rows: RateRow[]; vaults: VaultId[]; notes: Partial<Record<string, string>> }) {
  const t = useTranslations("Shipping");
  const tVault = useTranslations("Vaults");
  const locale = useLocale();
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "name", asc: true });
  const [q, setQ] = useState("");

  const collator = new Intl.Collator(locale);
  const query = q.trim().toLowerCase();
  const shown = rows
    .filter((r) => !query || r.name.toLowerCase().includes(query) || r.country.toLowerCase() === query)
    .sort((a, b) => {
      const dir = sort.asc ? 1 : -1;
      if (sort.key === "name") return dir * collator.compare(a.name, b.name);
      const fa = a.fees[sort.key];
      const fb = b.fees[sort.key];
      if (fa === null || fb === null) return fa === fb ? collator.compare(a.name, b.name) : fa === null ? 1 : -1;
      return dir * (fa - fb) || collator.compare(a.name, b.name);
    });

  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, asc: !s.asc } : { key, asc: true }));
  const header = (key: SortKey, label: string, align: string) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.asc ? "ascending" : "descending") : "none"} className={`px-3 py-3 font-medium sm:px-4 ${align}`}>
      <button type="button" onClick={() => toggle(key)} className={`inline-flex items-center gap-1 hover:text-ink ${sort.key === key ? "text-ink" : ""}`}>
        {label}
        <span aria-hidden className={sort.key === key ? "" : "opacity-30"}>
          {sort.key === key && !sort.asc ? "↓" : "↑"}
        </span>
      </button>
    </th>
  );

  return (
    <div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("search")}
        aria-label={t("search")}
        className="w-full rounded-full border border-line bg-surface px-4 py-2 text-sm outline-none focus:border-ink sm:w-72"
      />
      <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs text-ink-3">
            <tr>
              {header("name", t("colCountry"), "")}
              {vaults.map((v) => header(v, tVault(v), "text-right"))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((r) => (
              <tr key={r.country} className="hover:bg-surface-2">
                <th scope="row" className="px-3 py-3 font-normal text-ink sm:px-4">
                  {r.name}
                  {notes[r.country] && <span className="mt-0.5 block text-xs text-ink-3">{notes[r.country]}</span>}
                </th>
                {vaults.map((v) => (
                  <td key={v} className="px-3 py-3 text-right whitespace-nowrap tabular-nums sm:px-4">
                    {r.fees[v] === null ? <span className="text-xs text-ink-3">{t("notShipped")}</span> : formatPrice(r.fees[v], 2)}
                  </td>
                ))}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={vaults.length + 1} className="px-4 py-10 text-center text-sm text-ink-3">
                  {t("noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
