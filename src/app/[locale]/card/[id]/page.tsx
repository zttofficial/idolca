import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import CardGallery from "@/components/card/CardGallery";
import BuyPanel from "@/components/card/BuyPanel";
import ChainActivity from "@/components/card/ChainActivity";
import OnSolanaBadge from "@/components/web3/OnSolanaBadge";
import { Link } from "@/i18n/navigation";
import { CHAIN } from "@/lib/chain";
import { getDb } from "@/lib/server/db";
import { getVaultRow, toCard } from "@/lib/server/vault-cards";
import { shortAddress, solscanUrl } from "@/lib/solana/config";

async function findCard(id: string) {
  await connection();
  const db = await getDb();
  const row = db ? await getVaultRow(db, id) : null;
  return row ? toCard(row) : null;
}

export async function generateMetadata(props: PageProps<"/[locale]/card/[id]">): Promise<Metadata> {
  const card = await findCard((await props.params).id);
  return card ? { title: `${card.group} ${card.member} ${card.version}` } : {};
}

const SECTION = "rounded-2xl border border-line bg-surface p-5";

// 學 Courtyard：左邊看卡，右邊是名稱、購買、卡片資訊；下面是鏈上紀錄。價格、持有人、紀錄都是即時鏈上數據
export default function CardPage(props: PageProps<"/[locale]/card/[id]">) {
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Suspense fallback={<div className="mt-10 h-[520px] animate-pulse rounded-2xl bg-surface-2" />}>
          <CardContent params={props.params} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

async function CardContent({ params }: { params: PageProps<"/[locale]/card/[id]">["params"] }) {
  const card = await findCard((await params).id);
  if (!card) notFound();
  const t = await getTranslations("Detail");
  const tCard = await getTranslations("Card");
  const tRarity = await getTranslations("Rarity");

  // 這些都是鑄造時寫進 NFT Attributes 的資料
  const attributes = [
    [tCard("serial"), card.serial],
    [tCard("group"), card.group],
    [tCard("member"), card.member],
    [tCard("album"), card.album],
    [tCard("version"), card.version],
    [tCard("type"), tRarity(card.rarity)],
    ...(card.grade ? [[tCard("grade"), String(card.grade)]] : []),
    ...(card.condition ? [[tCard("condition"), card.condition]] : []),
    [tCard("intakeDate"), card.intakeDate],
    [t("custodyLocation"), card.location],
  ];

  return (
    <>
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
        <Link href="/market" className="hover:text-ink">
          {t("breadcrumbMarket")}
        </Link>
        <span>/</span>
        <span>{card.group}</span>
        <span>/</span>
        <span className="text-ink">{card.member}</span>
      </nav>

      <div className="mt-6 grid gap-10 md:grid-cols-[minmax(0,400px)_1fr]">
        <div className="md:sticky md:top-24 md:self-start">
          <CardGallery card={card} />
        </div>

        <div className="space-y-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <OnSolanaBadge />
              <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-ink">{tRarity(card.rarity)}</span>
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">
              {card.group} <span className="text-accent-ink">{card.member}</span>
            </h1>
            <p className="mt-1 text-ink-2">
              {card.album} · {card.version}
            </p>
          </div>

          <BuyPanel card={card} />

          <section className={SECTION}>
            <h2 className="text-base font-semibold">{t("detailsTitle")}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {attributes.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] text-ink-3">{k}</dt>
                  <dd className="mt-0.5 break-words">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-xs text-ink-3">
              <a href={solscanUrl("account", card.asset)} target="_blank" rel="noreferrer" className="hover:text-ink">
                NFT <span className="font-mono">{shortAddress(card.asset, 6, 6)}</span> ↗
              </a>
              {CHAIN.vaultCollection && (
                <a href={solscanUrl("account", CHAIN.vaultCollection)} target="_blank" rel="noreferrer" className="hover:text-ink">
                  {t("collection")} ↗
                </a>
              )}
            </div>
          </section>

          <section className={SECTION}>
            <h2 className="text-base font-semibold">{t("activityTitle")}</h2>
            <ChainActivity cardId={card.id} />
          </section>
        </div>
      </div>
    </>
  );
}
