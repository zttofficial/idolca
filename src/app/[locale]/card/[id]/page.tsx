import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import HoloTile from "@/components/market/HoloTile";
import CardGallery from "@/components/card/CardGallery";
import BuyPanel from "@/components/card/BuyPanel";
import PriceChart from "@/components/card/PriceChart";
import OnSolanaBadge from "@/components/web3/OnSolanaBadge";
import { Link } from "@/i18n/navigation";
import { FEES, getCardDetail, type ChainEvent } from "@/lib/card-detail";
import { formatUsdt } from "@/lib/fx";
import { CARDS, findCard } from "@/lib/mock-cards";
import { shortAddress, solscanUrl } from "@/lib/solana/config";

export function generateStaticParams() {
  return CARDS.map((c) => ({ id: c.id }));
}

export async function generateMetadata(props: PageProps<"/[locale]/card/[id]">): Promise<Metadata> {
  const card = findCard((await props.params).id);
  return card ? { title: `${card.group} ${card.member} ${card.version}` } : {};
}

const SECTION = "rounded-2xl border border-white/10 bg-white/[0.03] p-5";
const H2 = "text-base font-semibold";
const SUB = "mt-1 text-xs text-white/45";

const EVENT_DOT: Record<ChainEvent["type"], string> = {
  mint: "bg-violet-400",
  list: "bg-sky-400",
  sale: "bg-emerald-400",
  cancel: "bg-white/40",
};

// 外框（導航、頁腳）是靜態的；讀取網址參數的內容放進 Suspense，客戶端導航時先顯示骨架
export default function CardPage(props: PageProps<"/[locale]/card/[id]">) {
  return (
    <>
      <div className="aurora" />
      <div className="grid-bg" />
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Suspense fallback={<CardSkeleton />}>
          <CardContent params={props.params} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

function CardSkeleton() {
  return (
    <div className="mt-10 grid animate-pulse gap-10 md:grid-cols-[minmax(0,380px)_1fr]">
      <div className="mx-auto aspect-[55/85] w-full max-w-[380px] rounded-2xl bg-white/5" />
      <div className="space-y-5">
        <div className="h-24 rounded-2xl bg-white/5" />
        <div className="h-44 rounded-2xl bg-white/5" />
        <div className="h-56 rounded-2xl bg-white/5" />
      </div>
    </div>
  );
}

async function CardContent({ params }: { params: PageProps<"/[locale]/card/[id]">["params"] }) {
  const card = findCard((await params).id);
  if (!card) notFound();
  const t = await getTranslations("Detail");
  const tCard = await getTranslations("Card");
  const tRarity = await getTranslations("Rarity");
  const tStatus = await getTranslations("Status");

  const detail = getCardDetail(card);
  const { condition, sales, events, otherListings, seller } = detail;
  const prices = sales.map((s) => s.priceUsdt);
  const lastSale = prices[prices.length - 1];
  const recent = sales.filter((s) => Date.parse(s.date) >= Date.parse(sales[sales.length - 1].date) - 30 * 86_400_000);
  const avg30 = Math.round(recent.reduce((sum, s) => sum + s.priceUsdt, 0) / recent.length);
  const stats = [
    { label: t("statLast"), value: lastSale },
    { label: t("statAvg"), value: avg30 },
    { label: t("statLow"), value: Math.min(...prices) },
    { label: t("statHigh"), value: Math.max(...prices) },
  ];
  const subgrades = [
    { label: t("centering"), value: condition.subgrades.centering },
    { label: t("corners"), value: condition.subgrades.corners },
    { label: t("edges"), value: condition.subgrades.edges },
    { label: t("surface"), value: condition.subgrades.surface },
  ];
  const attributes = [
    [tCard("serial"), card.serial],
    [tCard("group"), card.group],
    [tCard("member"), card.member],
    [tCard("album"), card.album],
    [tCard("version"), card.version],
    [tCard("type"), tRarity(card.rarity)],
    [tCard("grade"), card.grade ? `${card.grade}` : tCard("ungraded")],
    [tCard("intakeDate"), card.intakeDate],
  ];
  const explorers = [
    { label: "Solscan", href: solscanUrl("account", card.asset) },
    { label: "Magic Eden", href: `https://magiceden.io/item-details/${card.asset}` },
    { label: "Tensor", href: `https://www.tensor.trade/item/${card.asset}` },
  ];

  return (
    <>
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-white/45">
        <Link href="/#market" className="hover:text-white">
          {t("breadcrumbMarket")}
        </Link>
        <span>/</span>
        <span>{card.group}</span>
        <span>/</span>
        <span className="text-white/75">{card.member}</span>
      </nav>

      {/* 首屏：左邊看卡，右邊買卡 */}
      <div className="mt-6 grid gap-10 md:grid-cols-[minmax(0,380px)_1fr]">
        <div className="md:sticky md:top-24 md:self-start">
          <CardGallery card={card} />
        </div>

        <div className="space-y-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <OnSolanaBadge />
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/75">{tRarity(card.rarity)}</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/75">{tStatus(card.status)}</span>
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">
              {card.group} <span className="text-holo">{card.member}</span>
            </h1>
            <p className="mt-1 text-white/60">
              {card.album} · {card.version}
            </p>
            <p className="mt-1 font-mono text-xs text-white/40">{card.serial}</p>
          </div>

          <BuyPanel card={card} lastSale={lastSale} likes={detail.likes} />

          <section className={SECTION}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className={H2}>{t("authTitle")}</h2>
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-emerald-300">
                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
                    <path d="M10 1.5 3 4.5v5c0 4.1 3 7.6 7 9 4-1.4 7-4.9 7-9v-5l-7-3Zm-1 12.1-3.3-3.3 1.4-1.4L9 10.8l3.9-3.9 1.4 1.4L9 13.6Z" />
                  </svg>
                  {t("authBadge")}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-4xl font-bold leading-none">{condition.grade}</p>
                <p className="mt-1 text-xs text-white/60">{t(`condition_${condition.condition}`)}</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-white/50">
              {t("authBody")}
              {!card.grade && ` ${t("ungradedNote")}.`}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              {subgrades.map((s) => (
                <div key={s.label}>
                  <dt className="flex justify-between text-[11px] text-white/45">
                    {s.label}
                    <span className="font-mono text-white/80">{s.value}</span>
                  </dt>
                  <dd className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-violet-400/15" aria-hidden>
                    <div className="h-full rounded-full bg-violet-400" style={{ width: `${(s.value / 10) * 100}%` }} />
                  </dd>
                </div>
              ))}
            </dl>
            <ul className="mt-4 flex flex-wrap gap-2">
              {condition.notes.map((n) => (
                <li key={n} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/65">
                  {t(`note_${n}`)}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-white/35">
              {t("inspectedOn", { date: condition.inspectedOn, inspector: condition.inspector })}
            </p>
          </section>

          <section className={SECTION}>
            <h2 className={H2}>{t("custodyTitle")}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {[
                [t("custodyLocation"), t("custodyLocationValue")],
                [t("custodyIntake"), card.intakeDate],
                [t("custodyStatus"), tStatus(card.status)],
                [t("custodyInsured"), t("custodyInsuredValue")],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] text-white/40">{k}</dt>
                  <dd className="mt-0.5 text-white/85">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>

      {/* 價格走勢 */}
      <section className={`${SECTION} mt-12`}>
        <h2 className={H2}>{t("priceTitle")}</h2>
        <p className={SUB}>{t("priceSubtitle")}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-white/[0.04] px-4 py-3">
              <dt className="text-[11px] text-white/45">{s.label}</dt>
              <dd className="mt-1 text-lg font-semibold">{formatUsdt(s.value)}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5">
          <PriceChart sales={sales} />
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* 同款其他在售 */}
        <section className={SECTION}>
          <h2 className={H2}>{t("othersTitle")}</h2>
          <p className={SUB}>{t("othersSubtitle")}</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-[11px] text-white/45">
                <tr>
                  <th className="pb-2 font-medium">{t("colSerial")}</th>
                  <th className="pb-2 font-medium">{t("colGrade")}</th>
                  <th className="pb-2 font-medium">{t("colSeller")}</th>
                  <th className="pb-2 text-right font-medium">{t("colPrice")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                <tr className="bg-violet-400/[0.06]">
                  <td className="py-2.5 font-mono text-xs text-violet-200">{card.serial}</td>
                  <td className="py-2.5 font-mono text-xs">{condition.grade}</td>
                  <td className="py-2.5 font-mono text-xs text-white/55">{shortAddress(card.owner)}</td>
                  <td className="py-2.5 text-right font-mono text-xs font-semibold tabular-nums">{formatUsdt(card.priceUsdt)}</td>
                </tr>
                {otherListings.map((o) => (
                  <tr key={o.serial}>
                    <td className="py-2.5 font-mono text-xs text-white/75">{o.serial}</td>
                    <td className="py-2.5 font-mono text-xs">{o.grade}</td>
                    <td className="py-2.5 font-mono text-xs text-white/55">{shortAddress(o.seller)}</td>
                    <td className="py-2.5 text-right font-mono text-xs tabular-nums">{formatUsdt(o.priceUsdt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 賣家 */}
        <section className={SECTION}>
          <h2 className={H2}>{t("sellerTitle")}</h2>
          <div className="mt-3 flex items-center gap-3">
            <span
              className="h-10 w-10 shrink-0 rounded-full"
              style={{ background: `linear-gradient(135deg, ${card.palette[0]}, ${card.palette[2]})` }}
              aria-hidden
            />
            <a
              href={solscanUrl("account", seller.address)}
              target="_blank"
              rel="noreferrer"
              className="truncate font-mono text-sm text-white/85 hover:text-white"
            >
              {shortAddress(seller.address, 6, 6)}
            </a>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            {[
              [t("sellerSales"), seller.sales.toLocaleString("en-US")],
              [t("sellerListings"), seller.listings],
              [t("sellerPositive"), `${seller.positivePct}%`],
              [t("sellerJoined"), seller.joined],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-white/[0.04] px-3 py-2">
                <dt className="text-[11px] text-white/45">{k}</dt>
                <dd className="mt-0.5 font-mono text-sm">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* 鏈上紀錄 */}
        <section className={SECTION}>
          <h2 className={H2}>{t("historyTitle")}</h2>
          <p className={SUB}>{t("historySubtitle")}</p>
          <dl className="mt-4 divide-y divide-white/5 rounded-xl bg-white/[0.03] text-xs">
            {[
              [tCard("asset"), card.asset],
              [tCard("owner"), card.owner],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-3 py-2">
                <dt className="text-white/45">{k}</dt>
                <dd className="truncate font-mono text-white/80" title={v}>
                  {shortAddress(v, 8, 8)}
                </dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 px-3 py-2">
              <dt className="text-white/45">{tCard("standard")}</dt>
              <dd className="text-white/80">Metaplex Core</dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            {explorers.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/75 hover:bg-white/10"
              >
                {l.label} ↗
              </a>
            ))}
          </div>
          <ol className="mt-5 space-y-4 border-l border-white/10 pl-5">
            {events.map((e) => (
              <li key={e.signature} className="relative">
                <span className={`absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full ring-2 ring-[#0c0918] ${EVENT_DOT[e.type]}`} />
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-sm font-medium">
                    {t(`event_${e.type}`)}
                    {e.priceUsdt !== undefined && <span className="ml-2 font-mono text-white/70">{formatUsdt(e.priceUsdt)}</span>}
                  </p>
                  <span className="font-mono text-[11px] text-white/40">{e.date}</span>
                </div>
                <p className="mt-0.5 font-mono text-[11px] text-white/45">
                  {e.from && (
                    <>
                      {t("from")} {shortAddress(e.from)}{" "}
                    </>
                  )}
                  {e.to && (
                    <>
                      {t("to")} {shortAddress(e.to)}{" "}
                    </>
                  )}
                  ·{" "}
                  <a href={solscanUrl("tx", e.signature)} target="_blank" rel="noreferrer" className="text-violet-300/80 hover:text-violet-200">
                    tx {shortAddress(e.signature)}
                  </a>
                </p>
              </li>
            ))}
          </ol>
        </section>

        <div className="space-y-6">
          {/* 屬性 */}
          <section className={SECTION}>
            <h2 className={H2}>{tCard("attributes")}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {attributes.map(([k, v]) => (
                <div key={k} className="rounded-xl bg-white/[0.04] px-3 py-2">
                  <dt className="text-[11px] text-white/40">{k}</dt>
                  <dd className="mt-0.5 truncate text-sm">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* 費用與保障 */}
          <section className={SECTION}>
            <h2 className={H2}>{t("feesTitle")}</h2>
            <dl className="mt-3 divide-y divide-white/5 text-sm">
              {[
                [t("feePlatform"), t("feePlatformValue", { pct: FEES.platformBps / 100 })],
                [t("feeNetwork"), t("feeNetworkValue", { usd: FEES.networkUsd })],
                [t("feeShipping"), t("feeShippingValue")],
                [t("feeRedeem"), t("feeRedeemValue", { usdt: FEES.redemptionFromUsdt })],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2">
                  <dt className="shrink-0 text-white/45">{k}</dt>
                  <dd className="text-right text-white/85">{v}</dd>
                </div>
              ))}
            </dl>
            <h3 className="mt-5 text-sm font-semibold">{t("policyTitle")}</h3>
            <ul className="mt-2 space-y-2 text-xs leading-relaxed text-white/55">
              {[t("policyEscrow"), t("policyAuth"), t("policyCountries")].map((p) => (
                <li key={p} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-300" />
                  {p}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {/* 推薦 */}
      <section className="mt-14">
        <h2 className="text-xl font-bold tracking-tight">{t("relatedTitle")}</h2>
        <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-4">
          {detail.related.map((c) => (
            <HoloTile key={c.id} card={c} />
          ))}
        </div>
      </section>
    </>
  );
}
