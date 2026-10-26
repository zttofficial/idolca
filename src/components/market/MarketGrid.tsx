"use client";

import { useTranslations } from "next-intl";
import HoloTile from "./HoloTile";
import TileSkeleton from "./TileSkeleton";
import { Link } from "@/i18n/navigation";
import { useVaultCards } from "@/lib/chain-client";
import { RARITIES } from "@/lib/market";

// 首頁：放最新入庫的 8 張（大螢幕一排 5 張，放 10 張湊滿兩排），完整瀏覽去市場頁。不放漲跌、成交跑馬燈這類行情元素，學 Courtyard 讓商品本身當主角
export default function MarketGrid() {
  const t = useTranslations("Market");
  const tRarity = useTranslations("Rarity");
  const vault = useVaultCards();
  // 金庫還沒有卡時整段不顯示
  if (vault && !vault.length) return null;
  const newest = vault?.slice(0, 10);
  // 第 9、10 張只在一排 5 張的大螢幕上顯示
  const wideOnly = (i: number) => (i >= 8 ? "hidden 2xl:block" : undefined);

  return (
    <section id="market" className="mx-auto page-width scroll-mt-20 px-4 py-20 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("title")}</h2>
          <p className="mt-2 text-sm text-ink-2">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {RARITIES.map((r) => (
            <Link key={r} href={`/market?type=${r}`} className="rounded-full border border-line px-3 py-1 text-xs text-ink-2 transition hover:border-line-strong hover:text-ink">
              {tRarity(r)}
            </Link>
          ))}
        </div>
      </div>
      <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
        {newest
          ? newest.map((c, i) => (
              <div key={c.id} className={wideOnly(i)}>
                <HoloTile card={c} />
              </div>
            ))
          : Array.from({ length: 10 }, (_, i) => (
              <div key={i} className={wideOnly(i)}>
                <TileSkeleton />
              </div>
            ))}
      </div>
      <div className="mt-12 text-center">
        <Link href="/market" className="btn-secondary inline-block rounded-full px-6 py-2.5 text-sm font-semibold">
          {t("viewAll", { count: vault?.length ?? 0 })}
        </Link>
      </div>
    </section>
  );
}
