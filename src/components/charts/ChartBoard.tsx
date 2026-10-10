"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import CardArt from "@/components/market/CardArt";
import { Link } from "@/i18n/navigation";
import { FIRST_WEEK_CHART, WEEKLY_CHART, type ChartEntry } from "@/lib/charts";
import { findCard } from "@/lib/mock-cards";

type Tab = "weekly" | "firstWeek";
const fmt = (n: number) => n.toLocaleString("en-US");

// 排名變化：上升綠、下降紅、新進榜用主色，都帶符號和文字，不只靠顏色
function Change({ entry }: { entry: ChartEntry }) {
  const t = useTranslations("Charts");
  if (entry.prevRank === null) return <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent-ink">{t("new")}</span>;
  const diff = entry.prevRank - entry.rank;
  if (diff > 0) return <span className="text-xs font-semibold text-up tabular-nums">▲ {diff}</span>;
  if (diff < 0) return <span className="text-xs font-semibold text-down tabular-nums">▼ {-diff}</span>;
  return <span className="text-xs text-ink-3">–</span>;
}

export default function ChartBoard() {
  const t = useTranslations("Charts");
  const tRarity = useTranslations("Rarity");
  const [tab, setTab] = useState<Tab>("weekly");
  const rows = tab === "weekly" ? WEEKLY_CHART : FIRST_WEEK_CHART;
  const value = (e: ChartEntry) => (tab === "weekly" ? e.weeklySales : e.firstWeekSales);
  const max = Math.max(...rows.map(value));

  return (
    <div>
      <div role="tablist" className="flex gap-6 border-b border-line">
        {(["weekly", "firstWeek"] as Tab[]).map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 pb-3 text-sm font-semibold transition ${tab === id ? "border-ink text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
          >
            {t(`tab_${id}`)}
          </button>
        ))}
      </div>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-[11px] text-ink-3">
            <tr>
              <th className="w-14 py-3 font-medium">{t("colRank")}</th>
              <th className="py-3 font-medium">{t("colAlbum")}</th>
              <th className="w-[38%] py-3 font-medium">{t(tab === "weekly" ? "colWeekly" : "colFirstWeek")}</th>
              <th className="py-3 text-right font-medium">{t(tab === "weekly" ? "colTotal" : "colRelease")}</th>
              {tab === "weekly" && <th className="py-3 text-right font-medium">{t("colWeeks")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((e, i) => {
              const card = findCard(e.coverCardId);
              return (
                <tr key={e.album} className="hover:bg-surface-2">
                  <td className="py-3 align-middle">
                    <p className="text-lg font-bold tabular-nums">{tab === "weekly" ? e.rank : i + 1}</p>
                    {tab === "weekly" && <Change entry={e} />}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <span className="aspect-[55/85] w-9 shrink-0 overflow-hidden rounded-md">
                        {card && <CardArt card={card} rarityLabel={tRarity(card.rarity)} className="block h-full w-full" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{e.album}</span>
                        <Link href={`/catalog/${e.groupId}`} className="block truncate text-xs text-ink-3 hover:text-accent-ink">
                          {e.artist}
                        </Link>
                      </span>
                    </div>
                  </td>
                  <td className="py-3 pr-6">
                    {/* 單一系列的橫條：主色、圓頭、從零起算；數值直接寫在條旁 */}
                    <div className="flex items-center gap-3">
                      <div className="h-2.5 flex-1 rounded-r-full bg-surface-2">
                        <div className="h-full rounded-r-full bg-accent" style={{ width: `${(value(e) / max) * 100}%` }} />
                      </div>
                      <span className="w-20 shrink-0 text-right text-xs font-semibold tabular-nums">{fmt(value(e))}</span>
                    </div>
                  </td>
                  <td className="py-3 text-right text-xs text-ink-2 tabular-nums">{tab === "weekly" ? fmt(e.totalSales) : e.released}</td>
                  {tab === "weekly" && <td className="py-3 text-right text-xs text-ink-2 tabular-nums">{e.weeksOnChart}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
