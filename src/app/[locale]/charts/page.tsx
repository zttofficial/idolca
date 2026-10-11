import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { getLocale, getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { CIRCLE_CHART_URL, weeklyAlbumTop10 } from "@/lib/server/circle-chart";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return pageMetadata({ locale: await getLocale(), path: "/charts", title: t("chartsTitle"), description: t("chartsDescription") });
}

// Circle Chart 週專輯榜前 10 名，看板展示。數據每幾小時從 Circle Chart 讀一次
export default async function ChartsPage() {
  const t = await getTranslations("Charts");
  const chart = await weeklyAlbumTop10();
  const n = (v: number) => v.toLocaleString("en-US");

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-2">{t("subtitle")}</p>

        {chart ? (
          <>
            <p className="mt-8 text-sm font-semibold">{t("week", { year: chart.year, week: chart.week })}</p>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-line">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-surface-2 text-xs text-ink-3">
                  <tr>
                    <th className="w-16 px-4 py-3 font-medium">{t("rank")}</th>
                    <th className="px-4 py-3 font-medium">{t("album")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("weekly")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("total")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {chart.rows.map((r) => {
                    const move = r.prevRank === null ? null : r.prevRank - r.rank;
                    return (
                      <tr key={r.rank}>
                        <td className="px-4 py-3">
                          <span className="text-lg font-bold tabular-nums">{r.rank}</span>
                          <span className="ml-2 text-[11px] font-semibold">
                            {move === null ? (
                              <span className="text-accent-ink">{t("new")}</span>
                            ) : move > 0 ? (
                              <span className="text-up">▲{move}</span>
                            ) : move < 0 ? (
                              <span className="text-down">▼{-move}</span>
                            ) : (
                              <span className="text-ink-3">–</span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold">{r.album}</p>
                          <p className="text-xs text-ink-3">
                            {r.artist} · {r.distributor}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{n(r.weeklySales)}</td>
                        <td className="px-4 py-3 text-right text-ink-2 tabular-nums">{n(r.totalSales)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="mt-8 rounded-2xl border border-dashed border-line px-6 py-12 text-center text-sm text-ink-2">{t("failed")}</p>
        )}

        <p className="mt-4 text-xs leading-relaxed text-ink-3">
          {t("source")}{" "}
          <a href={CIRCLE_CHART_URL} target="_blank" rel="noreferrer" className="font-semibold text-accent-ink hover:underline">
            Circle Chart ↗
          </a>
        </p>
      </main>
      <Footer />
    </>
  );
}
