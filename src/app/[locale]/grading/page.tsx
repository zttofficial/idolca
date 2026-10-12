import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { getLocale, getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Link } from "@/i18n/navigation";
import { GRADERS } from "@/lib/grading";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Grading");
  return pageMetadata({ locale: await getLocale(), path: "/grading", title: t("metaTitle"), description: t("metaDescription") });
}

const SECTION = "mt-16";
const STEPS = ["step1", "step2", "step3", "step4"] as const;
const WHY = ["why1", "why2", "why3"] as const;
const SCALE = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const;

// Idolca Grading（IDG）的介紹頁：為什麼小卡要有自己的評級、IDG 怎麼評、分數怎麼讀、第三方評級怎麼處理，
// 以及 IDG 是自家評級這件事怎麼標示。評分規則的代碼在 src/lib/grading.ts
export default async function GradingPage() {
  const t = await getTranslations("Grading");
  const locale = await getLocale();
  const third = new Intl.ListFormat(locale, { type: "conjunction" }).format(GRADERS.filter((g) => !g.inHouse).map((g) => g.name));
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-14 sm:px-6">
        <p className="text-xs font-semibold tracking-[0.2em] text-accent-ink uppercase">{t("eyebrow")}</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">{t("title")}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-2">{t("subtitle")}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/binder" className="btn-primary rounded-full px-5 py-2.5 text-sm font-semibold">
            {t("ctaBinder")}
          </Link>
          <Link href="/vault" className="btn-secondary rounded-full px-5 py-2.5 text-sm font-semibold">
            {t("ctaVault")}
          </Link>
        </div>

        <section className={SECTION}>
          <h2 className="text-2xl font-bold tracking-tight">{t("whyTitle")}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {WHY.map((k) => (
              <div key={k} className="rounded-2xl border border-line bg-surface p-5">
                <h3 className="font-semibold">{t(`${k}Title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{t(`${k}Body`)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={SECTION}>
          <h2 className="text-2xl font-bold tracking-tight">{t("howTitle")}</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-2">
            {STEPS.map((k, i) => (
              <li key={k} className="flex gap-4 rounded-2xl bg-surface-2 p-5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-white">{i + 1}</span>
                <div>
                  <h3 className="font-semibold">{t(`${k}Title`)}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{t(`${k}Body`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={SECTION}>
          <h2 className="text-2xl font-bold tracking-tight">{t("scaleTitle")}</h2>
          <p className="mt-2 text-sm text-ink-2">{t("scaleBody")}</p>
          <dl className="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
            {SCALE.map((n) => (
              <div key={n} className="flex items-baseline gap-4 px-5 py-3">
                <dt className="w-16 shrink-0 text-lg font-black tabular-nums">IDG {n}</dt>
                <dd className="text-sm text-ink-2">{t(`scale${n}`)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={`${SECTION} grid gap-4 md:grid-cols-2`}>
          <div className="rounded-2xl border border-line bg-surface p-6">
            <h2 className="text-lg font-bold">{t("thirdTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{t("thirdBody", { graders: third })}</p>
          </div>
          <div className="rounded-2xl border border-notice-line bg-notice-bg p-6 text-notice-ink">
            <h2 className="text-lg font-bold">{t("honestTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed">{t("honestBody")}</p>
          </div>
        </section>

        <section className={`${SECTION} rounded-3xl bg-accent-soft px-6 py-10 text-center`}>
          <h2 className="text-2xl font-bold tracking-tight">{t("ctaTitle")}</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-ink-2">{t("ctaBody")}</p>
          <Link href="/binder" className="btn-primary mt-5 inline-block rounded-full px-6 py-3 text-sm font-semibold">
            {t("ctaBinder")}
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
