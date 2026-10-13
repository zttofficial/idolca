import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Breadcrumb from "@/components/layout/Breadcrumb";
import CatalogGrid from "@/components/binder/CatalogGrid";
import GroupProgress from "@/components/binder/GroupProgress";
import { GROUPS, findGroup, templatesOf } from "@/lib/catalog";

export function generateStaticParams() {
  return GROUPS.map((g) => ({ group: g.id }));
}

export async function generateMetadata(props: PageProps<"/[locale]/catalog/[group]">): Promise<Metadata> {
  const g = findGroup((await props.params).group);
  if (!g) return {};
  const t = await getTranslations("Meta");
  return pageMetadata({ locale: await getLocale(), path: `/catalog/${g.id}`, title: t("groupTitle", { group: g.name }), description: t("groupDescription", { group: g.name }) });
}

// 外框靜態，讀取網址參數的內容放進 Suspense
export default function GroupCatalogPage(props: PageProps<"/[locale]/catalog/[group]">) {
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6">
        <Suspense fallback={<div className="min-h-svh animate-pulse rounded-2xl bg-surface-2" />}>
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
      <Breadcrumb
        items={[
          { label: t("title"), href: "/catalog" },
          { label: g.name, href: `/catalog/${g.id}` },
        ]}
      />
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
