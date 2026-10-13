import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MarketBrowser from "@/components/market/MarketBrowser";
import { MarketDataProvider } from "@/lib/chain-client";
import { getDb } from "@/lib/server/db";
import { publicListings, publicVaultCards } from "@/lib/server/market-data";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return pageMetadata({ locale: await getLocale(), path: "/market", title: t("marketTitle"), description: t("marketDescription") });
}

// 商品在伺服器上就讀好、直接輸出在 HTML 裡，搜尋引擎和首次打開的人不用等瀏覽器再去抓；
// 金庫卡的即時價格和掛單仍由瀏覽器讀鏈上補上。篩選狀態在網址查詢字串裡，讀取它的元件放進 Suspense
export default async function MarketPage() {
  const t = await getTranslations("Market");
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("pageTitle")}</h1>
        <p className="mt-2 text-sm text-ink-2">{t("pageSubtitle")}</p>
        <div className="mt-8">
          <Suspense fallback={<div className="min-h-svh animate-pulse rounded-2xl bg-surface-2" />}>
            <MarketData />
          </Suspense>
        </div>
      </main>
      <Footer />
    </>
  );
}

async function MarketData() {
  await connection();
  const db = await getDb();
  const [vaultCards, listings] = db ? await Promise.all([publicVaultCards(db), publicListings(db)]) : [[], []];
  return (
    <MarketDataProvider vaultCards={vaultCards} listings={listings}>
      <MarketBrowser />
    </MarketDataProvider>
  );
}
