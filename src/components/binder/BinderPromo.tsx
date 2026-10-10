import { useTranslations } from "next-intl";
import CardArt from "@/components/market/CardArt";
import { Link } from "@/i18n/navigation";
import { CARDS } from "@/lib/mock-cards";

// 首頁的收藏冊入口：不交易的粉絲也有理由來
export default function BinderPromo() {
  const t = useTranslations("Binder");
  const tRarity = useTranslations("Rarity");
  const fan = CARDS.slice(0, 9);
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <div className="grid items-center gap-10 rounded-3xl border border-line bg-surface-2 p-6 sm:p-10 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-accent-ink">{t("promoKicker")}</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">{t("promoTitle")}</h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-2">{t("promoBody")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/binder" className="btn-primary rounded-full px-5 py-2.5 text-sm font-semibold">
              {t("promoCta")}
            </Link>
            <Link href="/catalog" className="rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold hover:bg-surface-3">
              {t("browse")}
            </Link>
          </div>
        </div>
        {/* 一頁 3×3 的卡冊 */}
        <div className="mx-auto grid w-full max-w-md grid-cols-3 gap-2 rounded-2xl bg-surface p-3 shadow-sm">
          {fan.map((c) => (
            <div key={c.id} className="relative aspect-[55/85] overflow-hidden rounded-lg">
              <CardArt card={c} rarityLabel={tRarity(c.rarity)} className="block h-full w-full" />
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-transparent" />
            </div>
          ))}
          <div className="aspect-[55/85] rounded-lg border border-dashed border-line bg-surface-2" />
        </div>
      </div>
    </section>
  );
}
