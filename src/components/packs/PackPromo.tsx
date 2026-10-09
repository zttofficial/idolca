import { useTranslations } from "next-intl";
import PackArt from "./PackArt";
import { Link } from "@/i18n/navigation";
import { PACKS, packStats } from "@/lib/packs";

// 首頁的盲盒入口：只推正在售賣的第一個卡包
export default function PackPromo() {
  const t = useTranslations("Packs");
  const pack = PACKS[0];
  const { topValue } = packStats(pack);
  return (
    <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
      <Link
        href={`/packs/${pack.id}`}
        className="group relative flex items-center gap-6 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-r from-fuchsia-500/15 via-violet-500/10 to-transparent p-6 transition hover:border-violet-400/40 sm:gap-10 sm:p-8"
      >
        <PackArt pack={pack} className="w-24 shrink-0 rotate-[-6deg] transition group-hover:rotate-0 sm:w-32" />
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-violet-200">{t("title").toUpperCase()}</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            {t("promoTitle", { price: pack.priceUsdt, top: topValue.toLocaleString("en-US") })}
          </h2>
          <p className="mt-2 max-w-xl text-sm text-white/60">{t("promoBody")}</p>
          <span className="btn-holo mt-5 inline-block rounded-full px-5 py-2 text-sm font-semibold text-white">{t("promoCta")}</span>
        </div>
      </Link>
    </section>
  );
}
