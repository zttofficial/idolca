import { useTranslations } from "next-intl";
import HoloTile from "./HoloTile";
import { CARDS, type Rarity } from "@/lib/mock-cards";

const RARITY_FILTERS: Rarity[] = ["fansign", "pob", "luckydraw"];

export default function MarketGrid() {
  const t = useTranslations("Market");
  const tRarity = useTranslations("Rarity");
  const filters = [t("all"), ...RARITY_FILTERS.map((r) => tRarity(r)), t("graded")];

  return (
    <section id="market" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("title")}</h2>
          <p className="mt-2 text-sm text-white/50">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {filters.map((f, i) => (
            <button
              key={f}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                i === 0 ? "border-white/40 bg-white/15" : "border-white/10 bg-white/5 text-white/55 hover:text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-10 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
        {CARDS.map((c) => (
          <HoloTile key={c.id} card={c} />
        ))}
      </div>
    </section>
  );
}
