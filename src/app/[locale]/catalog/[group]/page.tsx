import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import CatalogGrid from "@/components/binder/CatalogGrid";
import GroupProgress from "@/components/binder/GroupProgress";
import { Link } from "@/i18n/navigation";
import { GROUPS, findGroup, templatesOf } from "@/lib/catalog";

export function generateStaticParams() {
  return GROUPS.map((g) => ({ group: g.id }));
}

export async function generateMetadata(props: PageProps<"/[locale]/catalog/[group]">): Promise<Metadata> {
  const g = findGroup((await props.params).group);
  return g ? { title: g.name } : {};
}

// 外框靜態，讀取網址參數的內容放進 Suspense
export default function GroupCatalogPage(props: PageProps<"/[locale]/catalog/[group]">) {
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-surface-2" />}>
          <GroupContent params={props.params} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

async function GroupContent({ params }: { params: PageProps<"/[locale]/catalog/[group]">["params"] }) {
  const g = findGroup((await params).group);
  if (!g) notFound();
  const t = await getTranslations("Catalog");
  const list = templatesOf(g.id);
  return (
    <>
      <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-xs text-ink-3">
        <Link href="/catalog" className="hover:text-ink">
          {t("title")}
        </Link>
        <span>/</span>
        <span className="text-ink">{g.name}</span>
      </nav>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{g.name}</h1>
          <p className="mt-1 text-sm text-ink-3">
            {t("membersCount", { count: g.members.length })} · {t("cardsCount", { count: list.length })}
          </p>
        </div>
        <div className="w-full max-w-xs">
          <GroupProgress ids={list.map((x) => x.id)} />
        </div>
      </div>
      <p className="mt-4 text-xs text-ink-3">{t("placeholderNote")}</p>
      <div className="mt-6">
        <CatalogGrid members={g.members} templates={list} />
      </div>
    </>
  );
}
