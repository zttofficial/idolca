import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import PackArt from "./PackArt";
import { Link } from "@/i18n/navigation";
import { packStats } from "@/lib/packs";
import { getDb } from "@/lib/server/db";
import { featuredPack } from "@/lib/server/pack-pool";

// 首頁的盲盒入口：只推正在售賣、還有卡的第一個卡包；沒有就不顯示
export default async function PackPromo() {
  await connection();
  const t = await getTranslations("Packs");
  const db = await getDb();
  const pack = db ? await featuredPack(db) : null;
  if (!pack) return null;
  const { topValue, remaining } = packStats(pack);
  const soldOut = remaining === 0;
  return (
    <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
      <Link
        href={`/packs/${pack.id}`}
        className="group relative flex items-center gap-6 overflow-hidden rounded-3xl border border-line bg-accent-soft p-6 transition hover:border-accent sm:gap-10 sm:p-8"
      >
        <PackArt pack={pack} className="w-24 shrink-0 rotate-[-6deg] transition group-hover:rotate-0 sm:w-32" />
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-accent-ink">
            {pack.name.toUpperCase()}
            {soldOut && <span className="ml-2 rounded-full bg-surface px-2 py-0.5 tracking-normal text-ink-2">{t("soldOut")}</span>}
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
            {t("promoTitle", { price: pack.priceUsdt, top: topValue.toLocaleString("en-US") })}
          </h2>
          <p className="mt-2 max-w-xl text-sm text-ink-2">{t("promoBody")}</p>
          <span className="btn-primary mt-5 inline-block rounded-full px-5 py-2 text-sm font-semibold">{t(soldOut ? "promoCtaSoldOut" : "promoCta")}</span>
        </div>
      </Link>
    </section>
  );
}
