"use client";

import { useTranslations } from "next-intl";
import CardArt from "@/components/market/CardArt";
import { Link } from "@/i18n/navigation";
import { AddCardButton } from "./AddCard";
import { useVaultCards } from "@/lib/chain-client";

// 首頁的收藏冊入口：不交易的粉絲也有理由來
export default function BinderPromo() {
  const t = useTranslations("Binder");
  const tRarity = useTranslations("Rarity");
  // 卡冊的一頁：九個卡套放金庫裡有實拍照的卡，不足的留空卡套
  const photos = (useVaultCards() ?? []).filter((c) => c.image).slice(0, 9);
  const pockets = Array.from({ length: 9 }, (_, i) => photos[i] ?? null);
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
      <div className="grid items-center gap-10 rounded-3xl border border-line bg-surface-2 p-6 sm:p-10 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="text-xs font-semibold tracking-[0.2em] text-accent-ink">{t("promoKicker")}</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">{t("promoTitle")}</h2>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-2">{t("promoBody")}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <AddCardButton className="btn-primary rounded-full px-5 py-2.5 text-sm font-semibold" />
            <Link href="/binder" className="rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold hover:bg-surface-3">
              {t("promoCta")}
            </Link>
          </div>
        </div>
        <BinderPage>
          {pockets.map((c, i) => (
            <div key={c?.id ?? i} className="relative aspect-[55/85] rounded-[5px] bg-[#e9e5dc] shadow-[inset_0_1px_3px_rgba(0,0,0,0.14)]">
              {c && (
                <Link href={`/card/${c.id}`} className="absolute inset-[6%] overflow-hidden rounded-[4px] shadow-[0_1px_3px_rgba(0,0,0,0.28)]">
                  <CardArt card={c} rarityLabel={tRarity(c.rarity)} className="block h-full w-full" />
                </Link>
              )}
              {/* 透明卡套：上緣開口和一道斜向反光 */}
              <span className="pointer-events-none absolute inset-0 rounded-[5px] bg-gradient-to-br from-white/50 via-white/0 to-white/25 ring-1 ring-white/70 ring-inset" />
              <span className="pointer-events-none absolute inset-x-[10%] top-[4%] h-px bg-white/90" />
            </div>
          ))}
        </BinderPage>
      </div>
    </section>
  );
}

// 攤開的一頁活頁卡冊：左邊硬殼書脊和三個活頁環，米白內頁，下面疊著兩頁紙，右下角頁角微捲。整本斜放，滑過時擺正
function BinderPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="group relative mx-auto w-full max-w-[400px] -rotate-2 transition duration-500 hover:rotate-0">
      {/* 底下的兩頁紙 */}
      <div className="absolute inset-0 translate-x-3 translate-y-2 rotate-[2deg] rounded-r-2xl rounded-l-md bg-[#e6e2d8] shadow-md" />
      <div className="absolute inset-0 translate-x-1.5 translate-y-1 rotate-[1deg] rounded-r-2xl rounded-l-md bg-[#efebe3]" />
      <div className="relative flex rounded-r-2xl rounded-l-md bg-[#f7f5f0] shadow-[0_28px_50px_-22px_rgba(20,10,30,0.45)]">
        {/* 書脊 */}
        <div className="relative w-8 shrink-0 rounded-l-md bg-gradient-to-r from-[#1c1a20] via-[#2c2833] to-[#3a3542] sm:w-10">
          <div className="absolute inset-y-[14%] right-0 flex flex-col justify-between">
            {[0, 1, 2].map((i) => (
              <span key={i} className="block h-4 w-8 translate-x-1/2 rounded-full border-[3px] border-[#cfccd4] shadow-[inset_0_1px_2px_rgba(0,0,0,0.35),0_1px_0_rgba(255,255,255,0.6)] sm:w-9" />
            ))}
          </div>
        </div>
        {/* 內頁 */}
        <div className="relative flex-1 py-4 pr-4 pl-6 sm:py-5 sm:pr-5 sm:pl-7">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-black/12 to-transparent" />
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5">{children}</div>
          <div className="mt-3 flex items-center justify-between text-[9px] font-semibold tracking-[0.2em] text-ink-3">
            <span>IDOLCA BINDER</span>
            <span className="tabular-nums">01</span>
          </div>
          {/* 右下角微捲的頁角 */}
          <span className="pointer-events-none absolute right-0 bottom-0 h-8 w-8 rounded-tl-lg bg-gradient-to-tl from-[#d9d4c8] via-[#ebe7de] to-[#f7f5f0] shadow-[-2px_-2px_4px_rgba(0,0,0,0.06)] [clip-path:polygon(100%_0,0_100%,100%_100%)]" />
        </div>
      </div>
    </div>
  );
}
