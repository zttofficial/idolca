import { useTranslations } from "next-intl";
import HoloTile from "./HoloTile";
import { Link } from "@/i18n/navigation";
import { CARDS } from "@/lib/mock-cards";
import { RARITIES } from "@/lib/market";

// 首頁：只放 24h 漲幅前 8 張，完整瀏覽去市場頁
export default function MarketGrid() {
  const t = useTranslations("Market");
  const tRarity = useTranslations("Rarity");
  const trending = [...CARDS].sort((a, b) => b.change24h - a.change24h).slice(0, 8);

  return (
    <section id="market" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
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
      <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
        {trending.map((c) => (
          <HoloTile key={c.id} card={c} />
        ))}
      </div>
      <div className="mt-12 text-center">
        <Link href="/market" className="inline-block rounded-full border border-line px-6 py-2.5 text-sm font-semibold hover:bg-surface-2">
          {t("viewAll", { count: CARDS.length })}
        </Link>
      </div>
    </section>
  );
}
