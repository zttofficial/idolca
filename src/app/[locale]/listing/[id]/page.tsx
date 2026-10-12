import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import PhotoGallery from "@/components/market/PhotoGallery";
import EscrowBuy from "@/components/market/EscrowBuy";
import Price from "@/components/web3/Price";
import VerificationBadge from "@/components/binder/VerificationBadge";
import { Link } from "@/i18n/navigation";
import { itemTitle } from "@/lib/item-title";
import { getDb } from "@/lib/server/db";
import { getListing } from "@/lib/server/items";
import { shortAddress, solscanUrl } from "@/lib/solana/config";

export async function generateMetadata(props: PageProps<"/[locale]/listing/[id]">): Promise<Metadata> {
  await connection();
  const db = await getDb();
  const listing = db ? await getListing(db, (await props.params).id) : null;
  if (!listing) return {};
  const t = await getTranslations("Meta");
  return pageMetadata({ locale: await getLocale(), path: `/listing/${listing.id}`, title: itemTitle(listing), description: t("listingDescription", { title: itemTitle(listing) }), image: listing.photo });
}

const SECTION = "rounded-2xl border border-line bg-surface p-5";

// 自由刊登的商品頁：卡在賣家手上、平台未查驗。和金庫卡的卡片頁（/card/[id]）分開，免責聲明放在價格旁邊
export default function ListingPage(props: PageProps<"/[locale]/listing/[id]">) {
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Suspense fallback={<div className="mt-10 h-[480px] animate-pulse rounded-2xl bg-surface-2" />}>
          <ListingContent params={props.params} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

async function ListingContent({ params }: { params: PageProps<"/[locale]/listing/[id]">["params"] }) {
  // 刊登隨時會變（改價、下架、標假卡），每次請求都讀資料庫
  await connection();
  const db = await getDb();
  const listing = db ? await getListing(db, (await params).id) : null;
  if (!listing) notFound();
  const t = await getTranslations("Listing");
  const tSource = await getTranslations("Source");
  const tMint = await getTranslations("Mint");
  const title = itemTitle(listing);
  const attributes = [
    [tMint("group"), listing.group],
    [tMint("member"), listing.member],
    [tMint("source"), tSource(listing.source)],
    [tMint("releaseName"), listing.album],
    [tMint("detail"), listing.version],
    [tMint("quantity"), String(listing.quantity)],
    [t("listedOn"), listing.listedAt?.slice(0, 10)],
  ].filter((x): x is [string, string] => Boolean(x[1]));

  return (
    <>
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
        <Link href="/market?lane=free" className="hover:text-ink">
          {t("breadcrumb")}
        </Link>
        <span>/</span>
        <span>{listing.group}</span>
        <span>/</span>
        <span className="text-ink">{listing.member}</span>
      </nav>

      <div className="mt-6 grid gap-10 md:grid-cols-[minmax(0,380px)_1fr]">
        <div className="md:sticky md:top-24 md:self-start">
          <PhotoGallery photos={listing.photos} alt={title} />
        </div>

        <div className="space-y-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <VerificationBadge status={listing.verification} className="text-[10px]" />
              {listing.quantity > 1 && <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-ink">{t("setOf", { count: listing.quantity })}</span>}
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-ink-2">
              {listing.group} · {listing.member}
            </p>
          </div>

          <div className={SECTION}>
            <p className="text-xs text-ink-3">{t("price")}</p>
            <Price amount={listing.priceUsdt ?? 0} className="mt-1 text-3xl font-bold tabular-nums" />
            <p className="mt-3 text-sm text-ink-2">{t("seller", { name: listing.seller })}</p>
            <EscrowBuy itemId={listing.id} priceUsdt={listing.priceUsdt ?? 0} />
            <ol className="mt-4 space-y-1.5 text-xs leading-relaxed text-ink-2">
              {(["step1", "step2", "step3"] as const).map((k, i) => (
                <li key={k} className="flex gap-2">
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-surface-3 text-[10px] font-bold">{i + 1}</span>
                  {t(k)}
                </li>
              ))}
            </ol>
          </div>

          {listing.description && (
            <div className={SECTION}>
              <h2 className="text-base font-semibold">{t("sellerNotes")}</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-2">{listing.description}</p>
            </div>
          )}

          <div className="rounded-2xl border border-notice-ink/20 bg-notice-bg p-5 text-notice-ink">
            <p className="text-sm font-semibold">{t("disclaimerTitle")}</p>
            <p className="mt-2 text-xs leading-relaxed">{t("disclaimerBody")}</p>
            <Link href="/market" className="mt-3 inline-block text-xs font-semibold underline underline-offset-2">
              {t("vaultCta")}
            </Link>
          </div>

          <div className={SECTION}>
            <h2 className="text-base font-semibold">{t("details")}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {attributes.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-ink-3">{k}</dt>
                  <dd className="mt-0.5 break-words">{v}</dd>
                </div>
              ))}
              <div className="col-span-2">
                <dt className="text-xs text-ink-3">{t("nft")}</dt>
                <dd className="mt-0.5 text-xs">
                  {listing.mintTx ? (
                    <a href={solscanUrl("account", listing.asset)} target="_blank" rel="noreferrer" className="inline-flex gap-1.5 hover:underline">
                      <span className="font-mono text-ink-2">{shortAddress(listing.asset, 8, 8)}</span>
                      <span className="font-semibold text-accent-ink">{tMint("onSolscan")} ↗</span>
                    </a>
                  ) : (
                    <span className="font-mono text-ink-2">{shortAddress(listing.asset, 8, 8)}</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
