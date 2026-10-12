import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import PackArt from "@/components/packs/PackArt";
import Countdown from "@/components/packs/Countdown";
import { Link } from "@/i18n/navigation";
import { packStats } from "@/lib/packs";
import { getDb } from "@/lib/server/db";
import { listPacks } from "@/lib/server/pack-pool";
import { withLiveRemaining } from "@/lib/server/pack-live";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return pageMetadata({ locale: await getLocale(), path: "/packs", title: t("packsTitle"), description: t("packsDescription") });
}

const STEPS = ["how1", "how2", "how3"] as const;

export default async function PacksPage() {
  const t = await getTranslations("Packs");
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          <span className="text-accent-ink">{t("title")}</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-2">{t("subtitle")}</p>

        <Suspense fallback={<div className="mt-10 h-64 animate-pulse rounded-2xl bg-surface-2" />}>
          <PackList />
        </Suspense>

        <section className="mt-16">
          <h2 className="text-xl font-bold tracking-tight">{t("howTitle")}</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s} className="rounded-2xl border border-line bg-surface p-5">
                <span className="text-accent-ink text-sm font-bold tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-2 font-semibold">{t(`${s}Title`)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{t(`${s}Body`)}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <Footer />
    </>
  );
}

// 卡包和卡池存在資料庫，剩餘張數是真實庫存（按鏈上狀態核過），每次請求讀
async function PackList() {
  await connection();
  const t = await getTranslations("Packs");
  const db = await getDb();
  const packs = db ? await withLiveRemaining(await listPacks(db)) : [];
  if (!packs.length) return <p className="mt-10 rounded-2xl border border-dashed border-line px-6 py-12 text-center text-sm text-ink-2">{t("noPacks")}</p>;
  return (
    <div className="mt-10 grid gap-6 md:grid-cols-2">
      {packs.map((pack) => {
        const s = packStats(pack);
        return (
          <Link
            key={pack.id}
            href={`/packs/${pack.id}`}
            className="group flex gap-5 rounded-2xl border border-line bg-surface p-5 transition hover:border-accent"
          >
            <PackArt pack={pack} className="w-32 shrink-0 transition group-hover:-rotate-2 sm:w-40" />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">{pack.name}</h2>
                {(s.remaining === 0 || s.paused) && <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-ink-2">{t(s.remaining === 0 ? "soldOut" : "paused")}</span>}
              </div>
              <p className="mt-1 text-sm text-ink-2">{t("chance", { price: pack.priceUsdt, top: s.topValue.toLocaleString("en-US") })}</p>
              <div className="mt-4">
                <div className="h-1.5 overflow-hidden rounded-full bg-accent-soft">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${s.total ? (s.remaining / s.total) * 100 : 0}%` }} />
                </div>
                <p className="mt-1.5 text-[11px] text-ink-3">
                  {t("left", { remaining: s.remaining.toLocaleString("en-US"), total: s.total.toLocaleString("en-US") })}
                </p>
              </div>
              <Countdown startsAt={pack.startsAt} endsAt={pack.endsAt} className="mt-3 text-xs text-ink-2" />
              <span className="mt-auto pt-4 text-sm font-semibold text-accent-ink group-hover:text-accent-ink">{t("viewPack")} →</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
