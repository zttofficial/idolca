import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Link } from "@/i18n/navigation";
import credits from "@/lib/sample-credits.json";
import { sampleImage } from "@/lib/sample-image";
import { getDb } from "@/lib/server/db";
import { listVaultCards } from "@/lib/server/vault-cards";

export async function generateMetadata(): Promise<Metadata> {
  const [t, tc] = await Promise.all([getTranslations("Meta"), getTranslations("Credits")]);
  return pageMetadata({ locale: await getLocale(), path: "/credits", title: t("creditsTitle"), description: tc("intro") });
}

// CC BY 要求的署名：作者、授權、原圖連結、是否修改。只列金庫卡實際用到的照片。
// 最後是付款方式標誌的商標聲明（Arc 的品牌規範要求註明商標歸屬）
export default async function CreditsPage() {
  const t = await getTranslations("Credits");
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-2">{t("intro")}</p>
        <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-2xl bg-surface-2" />}>
          <Credits />
        </Suspense>
        <p className="mt-10 max-w-2xl text-xs leading-relaxed text-ink-3">{t("trademarks")}</p>
      </main>
      <Footer />
    </>
  );
}

async function Credits() {
  await connection();
  const t = await getTranslations("Credits");
  const db = await getDb();
  const vault = db ? await listVaultCards(db) : [];
  const used = credits.flatMap((c) => {
    const card = vault.find((v) => v.image?.front === sampleImage(c.card));
    return card ? [{ c, card }] : [];
  });
  if (!used.length) return <p className="mt-8 text-sm text-ink-3">{t("none")}</p>;
  return (
    <div className="mt-8 overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-surface-2 text-xs text-ink-3">
          <tr>
            <th className="px-4 py-3 font-medium">{t("colCard")}</th>
            <th className="px-4 py-3 font-medium">{t("colPhoto")}</th>
            <th className="px-4 py-3 font-medium">{t("colAuthor")}</th>
            <th className="px-4 py-3 font-medium">{t("colLicense")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {used.map(({ c, card }) => {
            return (
              <tr key={c.card}>
                <td className="px-4 py-3">
                  {card && (
                    <Link href={`/card/${card.id}`} className="hover:text-accent-ink">
                      {card.group} {card.member}
                    </Link>
                  )}
                </td>
                <td className="px-4 py-3">
                  <a href={c.page} target="_blank" rel="noreferrer" className="text-accent-ink hover:underline">
                    {c.file.replace(/^File:/, "")}
                  </a>
                </td>
                <td className="px-4 py-3 text-ink-2">{c.author}</td>
                <td className="px-4 py-3">
                  <a href={c.license_url} target="_blank" rel="noreferrer" className="hover:text-accent-ink hover:underline">
                    {c.license}
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
