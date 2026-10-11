import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import CardArt from "@/components/market/CardArt";
import GroupProgress from "@/components/binder/GroupProgress";
import { Link } from "@/i18n/navigation";
import { GROUPS, isTemplateOf, templateCard, templatesOf } from "@/lib/catalog";
import { getDb } from "@/lib/server/db";
import { listVaultCards } from "@/lib/server/vault-cards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return pageMetadata({ locale: await getLocale(), path: "/catalog", title: t("catalogTitle"), description: t("catalogDescription") });
}

export default async function CatalogPage() {
  const t = await getTranslations("Catalog");
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-2">{t("subtitle")}</p>
        <Suspense fallback={<div className="mt-10 h-96 animate-pulse rounded-2xl bg-surface-2" />}>
          <Groups />
        </Suspense>
        <p className="mt-10 text-xs text-ink-3">{t("sampleNote")}</p>
      </main>
      <Footer />
    </>
  );
}

// 各團體的卡款數和封面；封面要讀金庫，所以每次請求讀資料庫
async function Groups() {
  await connection();
  const t = await getTranslations("Catalog");
  const tRarity = await getTranslations("Rarity");
  const db = await getDb();
  const vault = db ? await listVaultCards(db) : [];
  return (
    <div className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
      {GROUPS.map((g) => {
        const list = templatesOf(g.id);
        // 封面用金庫裡有實拍照的卡款
        const cover = list.find((x) => vault.some((c) => c.image && isTemplateOf(c, x))) ?? list[0];
        return (
          <Link key={g.id} href={`/catalog/${g.id}`} className="group rounded-2xl border border-line bg-surface p-4 transition hover:border-accent">
            <div className="mx-auto aspect-[55/85] w-2/3 overflow-hidden rounded-xl transition group-hover:-rotate-2">
              <CardArt card={templateCard(cover, vault)} rarityLabel={tRarity(cover.rarity)} className="block h-full w-full" />
            </div>
            <h2 className="mt-4 text-lg font-bold">{g.name}</h2>
            <p className="text-xs text-ink-3">
              {g.albums.map((a) => a.title).join(" · ")} · {t("cardsCount", { count: list.length })}
            </p>
            <div className="mt-3">
              <GroupProgress ids={list.map((x) => x.id)} />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
