import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import Breadcrumb from "@/components/layout/Breadcrumb";
import PhotoGallery from "@/components/market/PhotoGallery";
import EscrowBuy from "@/components/market/EscrowBuy";
import FreeAuction from "@/components/auction/FreeAuction";
import Price from "@/components/web3/Price";
import VerificationBadge from "@/components/binder/VerificationBadge";
import { Link } from "@/i18n/navigation";
import { itemTitle } from "@/lib/item-title";
import { getDb } from "@/lib/server/db";
import { getListing, getSeller, listingHistory } from "@/lib/server/items";
import ListingTile from "@/components/market/ListingTile";
import ActivityList from "@/components/card/ActivityList";
import type { Listing, ListingEvent } from "@/lib/items";
import { arcExplorerUrl } from "@/lib/arc";
import { shortAddress, solscanUrl } from "@/lib/solana/config";

export async function generateMetadata(props: PageProps<"/[locale]/listing/[id]">): Promise<Metadata> {
  await connection();
  const db = await getDb();
  const listing = db ? await getListing(db, (await props.params).id) : null;
  if (!listing) return {};
  const t = await getTranslations("Meta");
  // 在售的和成交了的真卡給搜尋引擎收錄，成交頁是成交紀錄。下架了、拍賣流標、交易進行中和假卡的網址一直有效，但不收錄
  const title = itemTitle(listing);
  const indexable = onSale(listing) || (listing.verification === "unverified" && listing.deal?.status === "sold");
  return pageMetadata({ locale: await getLocale(), path: `/listing/${listing.id}`, title, description: t("listingDescription", { title }), image: listing.photo, noindex: !indexable });
}

const SECTION = "rounded-2xl border border-line bg-surface p-5";

// 在售：一口價刊登中或拍賣進行中。拍賣結束 7 天內還顯示拍賣面板，但卡可能已經過戶給得標者，不再當成在售
const onSale = (l: Listing) => l.verification === "unverified" && (l.priceUsdt !== null || l.auction?.status === "live");
const txHref = (tx: NonNullable<ListingEvent["tx"]>) => (tx.chain === "arc" ? arcExplorerUrl("tx", tx.signature) : solscanUrl("tx", tx.signature));

// 自由刊登的商品頁：卡在賣家手上、平台未查驗。和金庫卡的卡片頁（/card/[id]）分開，免責聲明放在價格旁邊。
// 拍賣中的卡在同一頁顯示拍賣面板（目前出價、倒數、出價紀錄）；拍賣結束 7 天內還看得到結果。
// 成交了、下架了的卡網址一直有效（訂單、通知和 NFT 元數據都連到這裡），顯示成交狀態和交易紀錄，不列在市場上
export default function ListingPage(props: PageProps<"/[locale]/listing/[id]">) {
  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Suspense fallback={<div className="mt-10 min-h-svh animate-pulse rounded-2xl bg-surface-2 md:min-h-[480px]" />}>
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
  const selling = onSale(listing);
  // 不在售時刊登者可能已經換成買家，不顯示賣家卡片和「其他刊登」
  const [seller, history] = await Promise.all([selling ? getSeller(db!, listing.id) : null, listingHistory(db!, listing)]);
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
      <Breadcrumb
        items={[
          { label: t("breadcrumb"), href: "/market?lane=free" },
          { label: listing.group, href: `/market?${new URLSearchParams({ lane: "free", group: listing.group })}` },
          { label: listing.member, href: `/listing/${listing.id}` },
        ]}
      />

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
            {listing.auction ? (
              <>
                <FreeAuction itemId={listing.id} initial={listing.auction} />
                {seller && <SellerCard seller={seller} />}
              </>
            ) : !selling ? (
              <DealStatus listing={listing} />
            ) : (
              <>
                <p className="text-xs text-ink-3">{t("price")}</p>
                <Price amount={listing.priceUsdt ?? 0} className="mt-1 text-3xl font-bold tabular-nums" />
                <SellerCard seller={seller!} />
                <EscrowBuy itemId={listing.id} priceUsdt={listing.priceUsdt ?? 0} />
                <ol className="mt-4 space-y-1.5 text-xs leading-relaxed text-ink-2">
                  {(["step1", "step2", "step3"] as const).map((k, i) => (
                    <li key={k} className="flex gap-2">
                      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-surface-3 text-[10px] font-bold">{i + 1}</span>
                      {t(k)}
                    </li>
                  ))}
                </ol>
              </>
            )}
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
                  {listing.mintTx && listing.asset ? (
                    <a href={solscanUrl("account", listing.asset)} target="_blank" rel="noreferrer" className="inline-flex gap-1.5 hover:underline">
                      <span className="font-mono text-ink-2">{shortAddress(listing.asset, 8, 8)}</span>
                      <span className="font-semibold text-accent-ink">{tMint("onSolscan")} ↗</span>
                    </a>
                  ) : (
                    <span className="text-ink-3">{tMint("notMintedYet")}</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <section className={SECTION}>
            <h2 className="text-base font-semibold">{t("historyTitle")}</h2>
            <ActivityList events={history.map(({ tx, ...e }) => ({ ...e, tx: tx && { id: tx.signature, href: txHref(tx) } }))} />
          </section>
        </div>
      </div>

      {seller && seller.others.length > 0 && (
        <section className="mt-14">
          <h2 className="text-lg font-semibold">{t("sellerMore", { name: seller.name })}</h2>
          <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
            {seller.others.map((l) => (
              <ListingTile key={l.id} listing={l as Listing} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// 不在售時的狀態：已轉成金庫卡、已售出（成交價和日期）、交易中（買家已付款、還沒放款），或目前沒有在售
async function DealStatus({ listing }: { listing: Listing }) {
  const t = await getTranslations("Listing");
  if (listing.vaultCardId)
    return (
      <>
        <p className="text-sm font-semibold">{t("statusVaulted")}</p>
        <Link href={`/card/${listing.vaultCardId}`} className="mt-2 inline-block text-sm font-semibold text-accent-ink hover:underline">
          {t("viewVaultCard")}
        </Link>
      </>
    );
  const deal = listing.deal;
  if (!deal) return <p className="text-sm text-ink-2">{t("statusOffMarket")}</p>;
  // 日期和交易紀錄一樣用 UTC 的日期
  const date = deal.at.slice(0, 10);
  return (
    <>
      <p className="text-xs text-ink-3">{t(deal.status === "sold" ? "statusSold" : "statusTrading")}</p>
      <Price amount={deal.priceUsdt} className="mt-1 text-3xl font-bold tabular-nums" />
      <p className="mt-1 text-xs text-ink-3">{t(deal.status === "sold" ? "soldOn" : "paidOn", { date })}</p>
    </>
  );
}

// 賣家卡片：頭像、暱稱，加入時間、成交筆數、在售件數，綁了錢包的標一個記號。只放公開資訊
async function SellerCard({ seller }: { seller: NonNullable<Awaited<ReturnType<typeof getSeller>>> }) {
  const t = await getTranslations("Listing");
  const locale = await getLocale();
  const joined = new Date(seller.joinedAt).toLocaleDateString(locale, { year: "numeric", month: "long" });
  return (
    <div className="mt-4 flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft font-bold text-accent-ink">{seller.name.slice(0, 1).toUpperCase()}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold">{seller.name}</span>
          {seller.walletLinked && <span className="shrink-0 rounded-full bg-up/10 px-1.5 py-0.5 text-[10px] font-semibold text-up">{t("sellerWallet")}</span>}
        </p>
        <p className="mt-0.5 truncate text-xs text-ink-3">
          {[t("sellerJoined", { date: joined }), t("sellerSales", { count: seller.sales }), t("sellerActive", { count: seller.active })].join(" · ")}
        </p>
      </div>
    </div>
  );
}
