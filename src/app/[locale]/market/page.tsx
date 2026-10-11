import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MarketBrowser from "@/components/market/MarketBrowser";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return pageMetadata({ locale: await getLocale(), path: "/market", title: t("marketTitle"), description: t("marketDescription") });
}

// 篩選狀態在網址查詢字串裡，讀取它的元件放進 Suspense
export default async function MarketPage() {
  const t = await getTranslations("Market");
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("pageTitle")}</h1>
        <p className="mt-2 text-sm text-ink-2">{t("pageSubtitle")}</p>
        <div className="mt-8">
          <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-surface-2" />}>
            <MarketBrowser />
          </Suspense>
        </div>
      </main>
      <Footer />
    </>
  );
}
