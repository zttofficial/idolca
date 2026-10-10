import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import ChartBoard from "@/components/charts/ChartBoard";
import { CHART_WEEK, WEEKLY_CHART } from "@/lib/charts";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: t("chartsTitle"), description: t("chartsDescription") };
}

export default async function ChartsPage() {
  const t = await getTranslations("Charts");
  const top = WEEKLY_CHART[0];
  const climbers = WEEKLY_CHART.filter((e) => e.prevRank !== null);
  const climber = climbers.reduce((a, b) => (b.prevRank! - b.rank > a.prevRank! - a.rank ? b : a));
  const total = WEEKLY_CHART.reduce((n, e) => n + e.weeklySales, 0);
  const debut = WEEKLY_CHART.find((e) => e.prevRank === null);
  const tiles = [
    { label: t("tileTop"), value: top.album, sub: top.artist },
    { label: t("tileTotal"), value: total.toLocaleString("en-US"), sub: t("tileTotalSub") },
    { label: t("tileClimber"), value: climber.album, sub: `${climber.artist} · ▲ ${climber.prevRank! - climber.rank}` },
    { label: t("tileDebut"), value: debut?.album ?? "–", sub: debut ? `${debut.artist} · #${debut.rank}` : "" },
  ];

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-14 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("title")}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-2">{t("subtitle")}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-ink-2 tabular-nums">
              {CHART_WEEK.start} – {CHART_WEEK.end}
            </p>
            <p className="mt-1 inline-block rounded-full bg-notice-bg px-2 py-0.5 text-[11px] font-semibold text-notice-ink">{t("sample")}</p>
          </div>
        </div>

        <dl className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((x) => (
            <div key={x.label} className="rounded-2xl border border-line bg-surface p-4">
              <dt className="text-xs text-ink-3">{x.label}</dt>
              <dd className="mt-1 truncate text-xl font-bold">{x.value}</dd>
              <dd className="mt-0.5 truncate text-xs text-ink-3">{x.sub}</dd>
            </div>
          ))}
        </dl>

        <section className="mt-10">
          <ChartBoard />
        </section>

        <section className="mt-12 grid gap-4 md:grid-cols-3">
          {(["hanteo", "circle", "idolca"] as const).map((k) => (
            <div key={k} className="rounded-2xl border border-line bg-surface p-5">
              <h2 className="text-sm font-semibold">{t(`method_${k}_title`)}</h2>
              <p className="mt-2 text-xs leading-relaxed text-ink-2">{t(`method_${k}_body`)}</p>
            </div>
          ))}
        </section>
      </main>
      <Footer />
    </>
  );
}
