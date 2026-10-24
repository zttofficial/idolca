import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Hero from "@/components/hero/Hero";
import MarketGrid from "@/components/market/MarketGrid";
import HowItWorks from "@/components/landing/HowItWorks";
import GroupPickerDialog from "@/components/landing/GroupPickerDialog";
import Footer from "@/components/layout/Footer";
import PackPromo from "@/components/packs/PackPromo";
import BinderPromo from "@/components/binder/BinderPromo";
import { SITE_URL, jsonLd, localePath, pageMetadata } from "@/lib/seo";
import { SOCIAL } from "@/lib/social";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return pageMetadata({ locale: await getLocale(), path: "/", title: t("homeTitle"), description: t("description"), absoluteTitle: true });
}

// 首頁順序：主視覺 → 最新入庫 → trading card 卡包 → 收藏冊 → Idolca 有什麼不一樣（四個支柱）
export default async function Home() {
  const locale = await getLocale();
  const t = await getTranslations("Meta");
  // 網站名稱、站內搜尋框（搜尋送到市場頁）和組織資訊
  const structured = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: "Idolca",
        url: `${SITE_URL}${localePath(locale, "/")}`,
        inLanguage: locale,
        description: t("description"),
        potentialAction: { "@type": "SearchAction", target: `${SITE_URL}${localePath(locale, "/market")}?q={search_term_string}`, "query-input": "required name=search_term_string" },
      },
      { "@type": "Organization", name: "Idolca", url: SITE_URL, logo: `${SITE_URL}/icon.svg`, sameAs: SOCIAL.map((s) => s.url) },
    ],
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structured)} />
      <Navbar />
      <main className="flex-1">
        <Hero />
        <MarketGrid />
        <Suspense fallback={null}>
          <PackPromo />
        </Suspense>
        <BinderPromo />
        <HowItWorks />
      </main>
      <GroupPickerDialog />
      <Footer />
    </>
  );
}
