import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import PackArt from "@/components/packs/PackArt";
import Countdown from "@/components/packs/Countdown";
import { Link } from "@/i18n/navigation";
import { PACKS, packStats } from "@/lib/packs";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: t("packsTitle"), description: t("packsDescription") };
}

const STEPS = ["how1", "how2", "how3"] as const;

export default async function PacksPage() {
  const t = await getTranslations("Packs");
  return (
    <>
      <div className="aurora" />
      <div className="grid-bg" />
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          <span className="text-holo">{t("title")}</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">{t("subtitle")}</p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {PACKS.map((pack) => {
            const s = packStats(pack);
            return (
              <Link
                key={pack.id}
                href={`/packs/${pack.id}`}
                className="group flex gap-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-violet-400/40"
              >
                <PackArt pack={pack} className="w-32 shrink-0 transition group-hover:-rotate-2 sm:w-40" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <h2 className="text-xl font-bold">{pack.name}</h2>
                  <p className="mt-1 text-sm text-white/65">{t("chance", { price: pack.priceUsdt, top: s.topValue.toLocaleString("en-US") })}</p>
                  <div className="mt-4">
                    <div className="h-1.5 overflow-hidden rounded-full bg-violet-400/15">
                      <div className="h-full rounded-full bg-violet-400" style={{ width: `${(s.remaining / s.total) * 100}%` }} />
                    </div>
                    <p className="mt-1.5 text-[11px] text-white/45">
                      {t("left", { remaining: s.remaining.toLocaleString("en-US"), total: s.total.toLocaleString("en-US") })}
                    </p>
                  </div>
                  <Countdown startsAt={pack.startsAt} endsAt={pack.endsAt} className="mt-3 text-xs text-white/70" />
                  <span className="mt-auto pt-4 text-sm font-semibold text-violet-300 group-hover:text-violet-200">{t("viewPack")} →</span>
                </div>
              </Link>
            );
          })}
        </div>

        <section className="mt-16">
          <h2 className="text-xl font-bold tracking-tight">{t("howTitle")}</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <span className="text-holo font-mono text-sm font-bold">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-2 font-semibold">{t(`${s}Title`)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/55">{t(`${s}Body`)}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <Footer />
    </>
  );
}
