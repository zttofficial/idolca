import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import CardArt from "@/components/market/CardArt";
import PackArt from "@/components/packs/PackArt";
import Countdown from "@/components/packs/Countdown";
import PackOpener, { TierPill } from "@/components/packs/PackOpener";
import { Link } from "@/i18n/navigation";
import { formatPrice } from "@/lib/fx";
import { connection } from "next/server";
import { headers } from "next/headers";
import { packsBlockedIn } from "@/lib/server/region";
import { BUYBACK_RATE, TIERS, TIER_COLOR, entryCard, packStats } from "@/lib/packs";
import { getDb } from "@/lib/server/db";
import { getPack, recentPackPulls } from "@/lib/server/pack-pool";
import { withLiveRemaining } from "@/lib/server/packs";
import { shortAddress, solscanUrl } from "@/lib/solana/config";

async function findPack(id: string) {
  await connection();
  const db = await getDb();
  const pack = db ? await getPack(db, id) : null;
  return pack ? (await withLiveRemaining([pack]))[0] : null;
}

export async function generateMetadata(props: PageProps<"/[locale]/packs/[id]">): Promise<Metadata> {
  const pack = await findPack((await props.params).id);
  if (!pack) return {};
  const t = await getTranslations("Meta");
  const { topValue } = packStats(pack);
  return pageMetadata({ locale: await getLocale(), path: `/packs/${pack.id}`, title: t("packTitle", { name: pack.name }), description: t("packDescription", { price: pack.priceUsdt, top: topValue }) });
}

const SECTION = "rounded-2xl border border-line bg-surface p-5";
const SUB = "mt-1 text-xs text-ink-3";

// 外框靜態，讀取網址參數的內容放進 Suspense
export default function PackPage(props: PageProps<"/[locale]/packs/[id]">) {
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Suspense fallback={<div className="mt-10 h-[520px] animate-pulse rounded-2xl bg-surface-2" />}>
          <PackContent params={props.params} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

async function PackContent({ params }: { params: PageProps<"/[locale]/packs/[id]">["params"] }) {
  // 卡池剩餘張數和最近開卡都是真實紀錄，每次請求讀資料庫
  const pack = await findPack((await params).id);
  if (!pack) notFound();
  const db = (await getDb())!;
  const pulls = await recentPackPulls(db, pack);
  const t = await getTranslations("Packs");
  const s = packStats(pack);
  const pct = (n: number) => `${(n * 100).toFixed(n < 0.01 ? 2 : 1)}%`;
  const usdt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

  return (
    <>
      <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-xs text-ink-3">
        <Link href="/packs" className="hover:text-ink">
          {t("title")}
        </Link>
        <span>/</span>
        <span className="text-ink">{pack.name}</span>
      </nav>

      <div className="mt-6 grid items-start gap-10 md:grid-cols-[minmax(0,320px)_1fr]">
        <PackArt pack={pack} className="mx-auto w-full max-w-[320px]" />

        <div>
          <h1 className="text-4xl font-black tracking-tight">{pack.name}</h1>
          <p className="mt-2 text-lg text-ink">{t("chance", { price: pack.priceUsdt, top: usdt(s.topValue) })}</p>
          <p className="mt-1 text-sm text-ink-3">{t("perPack", { price: pack.priceUsdt })}</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-surface-2 px-4 py-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-accent-soft">
                <div className="h-full rounded-full bg-accent" style={{ width: `${s.total ? (s.remaining / s.total) * 100 : 0}%` }} />
              </div>
              <p className="mt-2 text-xs text-ink-2">{t("left", { remaining: usdt(s.remaining), total: usdt(s.total) })}</p>
              <Countdown startsAt={pack.startsAt} endsAt={pack.endsAt} className="mt-1 block text-xs text-ink" />
            </div>
            <div className="rounded-xl bg-surface-2 px-4 py-3">
              <p className="text-[11px] text-ink-3">{t("expectedTitle")}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{formatPrice(s.expected, 2)}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-ink-3">
                {t("expectedBody", { rtp: Math.round((s.expected / pack.priceUsdt) * 100) })}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <PackOpener pack={pack} regionBlocked={packsBlockedIn(await headers())} />
          </div>
        </div>
      </div>

      {/* 即時機率 */}
      <section className={`${SECTION} mt-12`}>
        <h2 className="text-base font-semibold">{t("oddsTitle")}</h2>
        <p className={SUB}>{t("oddsSubtitle")}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-[11px] text-ink-3">
              <tr>
                <th className="pb-2 font-medium">{t("colTier")}</th>
                <th className="pb-2 font-medium">{t("colOdds")}</th>
                <th className="w-2/5 pb-2" />
                <th className="pb-2 text-right font-medium">{t("colLeft")}</th>
                <th className="pb-2 text-right font-medium">{t("colValue")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {s.tiers.map((tier) => (
                <tr key={tier.tier}>
                  <td className="py-2.5">
                    <TierPill tier={tier.tier} />
                  </td>
                  <td className="py-2.5 text-xs tabular-nums">{pct(tier.odds)}</td>
                  <td className="py-2.5 pr-4">
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(tier.odds * 100, tier.remaining ? 0.8 : 0)}%`, background: TIER_COLOR[tier.tier] }}
                      />
                    </div>
                  </td>
                  <td className="py-2.5 text-right text-xs tabular-nums text-ink-2">
                    {usdt(tier.remaining)} / {usdt(tier.total)}
                  </td>
                  <td className="py-2.5 text-right text-xs tabular-nums text-ink-2">
                    {tier.minValue === tier.maxValue ? usdt(tier.minValue) : `${usdt(tier.minValue)}–${usdt(tier.maxValue)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 卡池 */}
      <section className="mt-12">
        <h2 className="text-xl font-bold tracking-tight">{t("poolTitle")}</h2>
        {TIERS.filter((tier) => pack.pool.some((e) => e.tier === tier)).map((tier) => (
          <div key={tier} className="mt-6">
            <TierPill tier={tier} />
            <div className="mt-3 grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              {pack.pool
                .filter((e) => e.tier === tier)
                .map((e) => {
                  const card = entryCard(e);
                  const gone = e.remaining === 0;
                  return (
                    <Link key={e.id} href={`/card/${e.id}`} className={`block ${gone ? "opacity-40 grayscale" : ""}`}>
                      <div
                        className="aspect-[55/85] overflow-hidden rounded-xl"
                        style={tier === "SSR" && !gone ? { boxShadow: `0 0 0 2px ${TIER_COLOR.SSR}, 0 0 24px ${TIER_COLOR.SSR}66` } : undefined}
                      >
                        <CardArt card={card} rarityLabel={tier} className="block h-full w-full" />
                      </div>
                      <p className="mt-2 truncate text-xs font-semibold">
                        {card.group} {card.member}
                      </p>
                      <p className="truncate text-[11px] text-ink-3">{card.version}</p>
                      <p className="mt-0.5 flex justify-between text-[11px]">
                        <span className="text-ink tabular-nums">{formatPrice(e.valueUsdt, e.valueUsdt < 10 ? 1 : 0)}</span>
                        <span className="text-ink-3">{gone ? t("pulled") : card.serial}</span>
                      </p>
                    </Link>
                  );
                })}
            </div>
          </div>
        ))}
      </section>

      <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* 最近抽卡 */}
        <section className={SECTION}>
          <h2 className="text-base font-semibold">{t("pullsTitle")}</h2>
          {pulls.length ? (
            <ul className="mt-3 divide-y divide-line">
              {pulls.map((p, i) => {
                const card = entryCard(p.entry);
                return (
                  <li key={i} className="flex items-center gap-3 py-2 text-xs">
                    <TierPill tier={p.entry.tier} />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-mono text-ink-3">{t("pulledBy", { wallet: shortAddress(p.wallet) })}</span>{" "}
                      <span className="text-ink">
                        {card.group} {card.member} · {card.version}
                      </span>
                    </span>
                    {p.tx ? (
                      <a href={solscanUrl("tx", p.tx)} target="_blank" rel="noreferrer" className="shrink-0 text-ink-3 hover:text-ink">
                        {t("minutesAgo", { minutes: p.minutesAgo })} ↗
                      </a>
                    ) : (
                      <span className="shrink-0 text-ink-3">{t("minutesAgo", { minutes: p.minutesAgo })}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-ink-3">{t("noPulls")}</p>
          )}
        </section>

        <div className="space-y-6">
          {/* 公平性 */}
          <section className={SECTION}>
            <h2 className="text-base font-semibold">{t("fairTitle")}</h2>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-ink-2">
              {[t("fairCommit"), t("fairDraw"), t("fairNft")].map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] text-ink-3">{t("seedHash")}</p>
            <p className="mt-1 font-mono text-[11px] break-all text-ink-2">{pack.seedHash}</p>
            <p className="mt-3 text-[11px] text-ink-3">{t("seed")}</p>
            <p className="mt-1 font-mono text-[11px] break-all text-ink-2">{pack.seed ?? t("seedHidden")}</p>
            <a href={`/api/packs/${pack.id}/draws`} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[11px] font-semibold text-accent-ink hover:underline">
              {t("drawLog")} ↗
            </a>
          </section>

          {/* 規則 */}
          <section className={SECTION}>
            <h2 className="text-base font-semibold">{t("rulesTitle")}</h2>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-ink-2">
              {[t("rule18"), t("ruleRefund"), t("ruleBuyback", { pct: BUYBACK_RATE * 100 }), t("ruleShipping")].map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                  {line}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
