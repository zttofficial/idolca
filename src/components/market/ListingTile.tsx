"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Price from "@/components/web3/Price";
import { TimeLeft } from "@/components/auction/AuctionPanel";
import VerificationBadge from "@/components/binder/VerificationBadge";
import { itemTitle } from "@/lib/item-title";
import type { Listing } from "@/lib/items";

// 自由刊登的列表卡：賣家照片，不加全息效果，和金庫卡一眼分得出來。
// 拍賣中的卡標「拍賣」和剩餘時間，價格是目前出價（沒人出價時是起標價）
export default function ListingTile({ listing }: { listing: Listing }) {
  const t = useTranslations("Listing");
  const tAuction = useTranslations("Auction");
  const auction = listing.auction?.status === "live" ? listing.auction : null;
  return (
    <article>
      <Link href={`/listing/${listing.id}`} className="relative block aspect-[55/85] overflow-hidden rounded-xl bg-surface-2 ring-1 ring-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- 賣家上傳的照片，已裁成 55:85 */}
        <img src={listing.photo} alt={itemTitle(listing)} className="h-full w-full object-cover transition duration-300 hover:scale-[1.03]" />
        <VerificationBadge status={listing.verification} className="absolute top-2 left-2" />
        {listing.quantity > 1 && (
          <span className="absolute top-2 right-2 rounded-full bg-ink/80 px-2 py-0.5 text-[10px] font-bold text-white">{t("setOf", { count: listing.quantity })}</span>
        )}
        {auction && <AuctionBadge endsAt={auction.endsAt} label={tAuction("auction")} />}
        {listing.photos.length > 2 && (
          <span className="absolute right-2 bottom-2 rounded-full bg-ink/60 px-1.5 py-0.5 text-[10px] text-white tabular-nums">{t("photoCount", { count: listing.photos.length })}</span>
        )}
      </Link>
      <div className="mt-3 space-y-1 px-1">
        <p className="truncate text-xs text-ink-3">
          {listing.group} · {listing.member}
        </p>
        <p className="line-clamp-2 font-semibold text-ink">{itemTitle(listing)}</p>
        <div className="flex items-baseline justify-between gap-2">
          <Price amount={auction ? (auction.highUsd ?? auction.startUsd) : (listing.priceUsdt ?? 0)} className="text-base font-bold tabular-nums" />
          <span className="truncate text-xs text-ink-3">{listing.seller}</span>
        </div>
      </div>
    </article>
  );
}

// 列表卡左下角的拍賣標記：「拍賣 · 剩餘時間」，金庫卡和自由刊登共用
export function AuctionBadge({ endsAt, label }: { endsAt: string; label: string }) {
  return (
    <span className="absolute bottom-2 left-2 z-10 flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-white">
      {label} · <TimeLeft endsAt={endsAt} />
    </span>
  );
}
