import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { HoloCardFace } from "@/components/market/HoloTile";
import UsdtPrice from "@/components/web3/UsdtPrice";
import OnSolanaBadge from "@/components/web3/OnSolanaBadge";
import { CARDS, RARITY_LABEL, STATUS_LABEL, findCard } from "@/lib/mock-cards";
import { shortAddress, solscanUrl } from "@/lib/solana/config";

export function generateStaticParams() {
  return CARDS.map((c) => ({ id: c.id }));
}

export async function generateMetadata(props: PageProps<"/card/[id]">): Promise<Metadata> {
  const card = findCard((await props.params).id);
  return card ? { title: `${card.group} ${card.member} ${card.version} · Idolca` } : {};
}

export default async function CardPage(props: PageProps<"/card/[id]">) {
  const card = findCard((await props.params).id);
  if (!card) notFound();

  // 和 scripts/mint-card.ts 寫入 Core Attributes 插件的欄位一致
  const attributes = [
    ["編號", card.serial],
    ["團體", card.group],
    ["成員", card.member],
    ["專輯", card.album],
    ["版本", card.version],
    ["類型", RARITY_LABEL[card.rarity]],
    ["評級", card.grade ? `${card.grade}` : "未評級"],
    ["入庫日期", card.intakeDate],
  ];

  const links = [
    { label: "Solscan", href: solscanUrl("account", card.asset) },
    { label: "Magic Eden", href: `https://magiceden.io/item-details/${card.asset}` },
    { label: "Tensor", href: `https://www.tensor.trade/item/${card.asset}` },
  ];

  return (
    <>
      <div className="aurora" />
      <div className="grid-bg" />
      <Navbar />
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-12 px-4 py-14 sm:px-6 md:grid-cols-[minmax(0,340px)_1fr]">
        <div className="holo-stage mx-auto w-full max-w-[340px]">
          <HoloCardFace card={card} />
        </div>

        <div>
          <OnSolanaBadge />
          <h1 className="mt-4 text-3xl font-bold tracking-tight">
            {card.group} {card.member}
          </h1>
          <p className="mt-1 text-white/55">
            {card.album} · {card.version}
          </p>

          <div className="mt-6 flex items-baseline gap-3">
            <UsdtPrice amount={card.priceUsdt} className="font-mono text-3xl font-semibold" />
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">{STATUS_LABEL[card.status]}</span>
          </div>

          <section className="mt-10">
            <h2 className="text-sm font-semibold text-white/80">鏈上資料</h2>
            <dl className="mt-3 divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.03] text-sm">
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-white/45">NFT 地址</dt>
                <dd className="truncate font-mono text-xs text-white/85" title={card.asset}>
                  {shortAddress(card.asset, 8, 8)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-white/45">持有人</dt>
                <dd className="truncate font-mono text-xs text-white/85" title={card.owner}>
                  {shortAddress(card.owner, 8, 8)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-white/45">標準</dt>
                <dd className="text-white/85">Metaplex Core</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              {links.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/75 hover:bg-white/10"
                >
                  {l.label} ↗
                </a>
              ))}
            </div>
          </section>

          <section className="mt-10">
            <h2 className="text-sm font-semibold text-white/80">屬性</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {attributes.map(([k, v]) => (
                <div key={k} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <dt className="text-[11px] text-white/40">{k}</dt>
                  <dd className="mt-0.5 truncate text-sm">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
