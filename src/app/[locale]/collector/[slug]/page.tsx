import { createHash } from "node:crypto";
import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import PublicBinderView from "@/components/binder/PublicBinder";
import { Link } from "@/i18n/navigation";
import { localePath, pageMetadata } from "@/lib/seo";
import { getDb } from "@/lib/server/db";
import { getPublicBinder } from "@/lib/server/public-binder";

async function findBinder(slug: string) {
  await connection();
  const db = await getDb();
  return db ? getPublicBinder(db, slug) : null;
}

// 分享圖由同目錄的 opengraph-image.tsx 生成。檔案約定的圖蓋不過 pageMetadata 寫明的圖，所以在這裡直接指過去；
// 網址帶按暱稱和卡片清單算的版本號，收藏冊改了社群平台才會重抓
export async function generateMetadata(props: PageProps<"/[locale]/collector/[slug]">): Promise<Metadata> {
  const binder = await findBinder((await props.params).slug);
  if (!binder) return {};
  const locale = await getLocale();
  const t = await getTranslations("Meta");
  const path = `/collector/${binder.slug}`;
  const version = createHash("sha256")
    .update(JSON.stringify([binder.name, binder.have, binder.want]))
    .digest("hex")
    .slice(0, 12);
  return pageMetadata({
    locale,
    path,
    title: t("publicBinderTitle", { name: binder.name }),
    description: t("publicBinderDescription", { name: binder.name, have: binder.have.length, want: binder.want.length }),
    image: `${localePath(locale, path)}/opengraph-image?v=${version}`,
  });
}

// 公開收藏冊：暱稱、有哪些卡、想要哪些卡，給粉絲之間交換和收卡時分享
export default function CollectorPage(props: PageProps<"/[locale]/collector/[slug]">) {
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full page-width flex-1 px-4 py-10 sm:px-6">
        <Suspense fallback={<div className="min-h-svh animate-pulse rounded-2xl bg-surface-2" />}>
          <CollectorContent params={props.params} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

async function CollectorContent({ params }: { params: PageProps<"/[locale]/collector/[slug]">["params"] }) {
  const binder = await findBinder((await params).slug);
  if (!binder) notFound();
  const locale = await getLocale();
  const t = await getTranslations("PublicBinder");
  const since = new Date(binder.joinedAt).toLocaleDateString(locale, { year: "numeric", month: "long" });
  const stats = [
    { label: t("statHave"), value: binder.have.length },
    { label: t("statWant"), value: binder.want.length },
  ];
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-balance [overflow-wrap:anywhere] sm:text-4xl">{t("title", { name: binder.name })}</h1>
          <p className="mt-2 text-sm text-ink-3">{t("since", { date: since })}</p>
        </div>
        <dl className="flex gap-3">
          {stats.map((s) => (
            <div key={s.label} className="min-w-28 rounded-2xl border border-line bg-surface px-4 py-3">
              <dt className="text-xs text-ink-3">{s.label}</dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-2 [overflow-wrap:anywhere]">{t("tradeNote", { name: binder.name })}</p>

      <PublicBinderView have={binder.have} want={binder.want} />

      <section className="mt-16 grid gap-6 rounded-3xl border border-line bg-surface-2 p-6 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t("ctaTitle")}</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-2">{t("ctaBody")}</p>
        </div>
        <Link href="/catalog" className="btn-primary rounded-full px-6 py-3 text-center text-sm font-semibold">
          {t("ctaButton")}
        </Link>
      </section>
    </>
  );
}
