import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import CardArt from "@/components/market/CardArt";
import GroupProgress from "@/components/binder/GroupProgress";
import { Link } from "@/i18n/navigation";
import { GROUPS, templateCard, templatesOf } from "@/lib/catalog";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return { title: t("catalogTitle"), description: t("catalogDescription") };
}

export default async function CatalogPage() {
  const t = await getTranslations("Catalog");
  const tRarity = await getTranslations("Rarity");
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-2">{t("subtitle")}</p>
        <div className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {GROUPS.map((g) => {
            const list = templatesOf(g.id);
            const cover = list.find((x) => x.listingId) ?? list[0];
            return (
              <Link key={g.id} href={`/catalog/${g.id}`} className="group rounded-2xl border border-line bg-surface p-4 transition hover:border-accent">
                <div className="mx-auto aspect-[55/85] w-2/3 overflow-hidden rounded-xl transition group-hover:-rotate-2">
                  <CardArt card={templateCard(cover)} rarityLabel={tRarity(cover.rarity)} className="block h-full w-full" />
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
        <p className="mt-10 text-xs text-ink-3">{t("sampleNote")}</p>
      </main>
      <Footer />
    </>
  );
}
