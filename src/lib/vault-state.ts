import { minNextBid, type AuctionView } from "@/lib/auction";
import { COIN_DECIMALS } from "@/lib/coins";

// 金庫卡鏈上狀態的換算：託管程序帳戶的原始欄位 ↔ vault_chain_state 的一列 ↔ 給前端的 VaultCardState。
// 讀鏈、寫索引在 server/vault-chain.ts；這裡不連資料庫和鏈，方便測試
const UNIT = 10 ** COIN_DECIMALS;

// 鏈上拍賣的狀態：公開的拍賣資訊，加上賣家、目前最高出價者的錢包和出價幣種、付租金的人（鏈上本來就公開）
export type VaultAuction = AuctionView & { seller: string; highBidder: string | null; highBidMint: string | null; rentPayer: string };

export type VaultCardState = {
  owner: string;
  // 在託管程序裡掛單時：賣家、美元價格（買家用 USDT 或 USDC 付都是這個數）和付租金的人（取消、成交時租金退給它）
  listing: { seller: string; priceUsdt: number; rentPayer: string } | null;
  // 在託管程序裡拍賣時（這時 owner 是拍賣帳戶，卡的主人是 auction.seller）
  auction: VaultAuction | null;
  // 已申請提貨，NFT 凍結中
  redeeming: boolean;
  // 已提貨，NFT 已銷毀
  burned: boolean;
};

// 掛單和拍賣帳戶的原始欄位，金額是代幣最小單位、時間是 Unix 秒。拍賣的整份存進索引的 auction 欄（JSON），讀出時再算狀態和最低出價
export type RawListing = { seller: string; price: number; rentPayer: string };
export type RawAuction = {
  seller: string;
  startPrice: number;
  reservePrice: number;
  endTs: number;
  highBidder: string;
  highBid: number;
  highBidMint: string;
  bidCount: number;
  rentPayer: string;
  feeBps: number;
};

export const listingView = (l: RawListing): NonNullable<VaultCardState["listing"]> => ({ seller: l.seller, priceUsdt: l.price / UNIT, rentPayer: l.rentPayer });

// status 按 now 算：截止了就是 settling（等結標）
export function auctionView(a: RawAuction, now = Date.now()): VaultAuction {
  const high = a.bidCount > 0 ? a.highBid : null;
  const endsAt = a.endTs * 1000;
  return {
    lane: "vault",
    startUsd: a.startPrice / UNIT,
    hasReserve: a.reservePrice > 0,
    reserveMet: a.reservePrice === 0 || (high ?? 0) >= a.reservePrice,
    highUsd: high === null ? null : high / UNIT,
    bidCount: a.bidCount,
    // 鏈上以最小單位計算，換成分時無條件進位，顯示的最低出價一定被鏈上接受
    minNextUsd: Math.ceil(minNextBid(high, a.startPrice, UNIT) / (UNIT / 100)) / 100,
    endsAt: new Date(endsAt).toISOString(),
    feeBps: a.feeBps,
    status: endsAt <= now ? "settling" : "live",
    seller: a.seller,
    highBidder: high === null ? null : a.highBidder,
    highBidMint: high === null ? null : a.highBidMint,
    rentPayer: a.rentPayer,
  };
}

// 索引裡掛單和拍賣的欄位（listing_* 和 auction_*）
export type MarketColumns = {
  listingSeller: string | null;
  listingPriceCents: number | null;
  listingRentPayer: string | null;
  auctionSeller: string | null;
  auctionEndsAt: Date | null;
  auction: string | null;
};
// 索引裡持有人、凍結、銷毀的欄位
export type AssetColumns = { owner: string; redeeming: boolean; burned: boolean };
export type IndexColumns = MarketColumns & AssetColumns;

// 掛單價格在索引裡以分計（我們組的掛單都是整分，見 buildList）；組交易時另外即時讀鏈上的原值
export const marketColumns = (listing: RawListing | null, auction: RawAuction | null): MarketColumns => ({
  listingSeller: listing?.seller ?? null,
  listingPriceCents: listing ? Math.round(listing.price / (UNIT / 100)) : null,
  listingRentPayer: listing?.rentPayer ?? null,
  auctionSeller: auction?.seller ?? null,
  auctionEndsAt: auction ? new Date(auction.endTs * 1000) : null,
  auction: auction ? JSON.stringify(auction) : null,
});

// 索引和鏈上讀到的掛單、拍賣是否一致（不一致的卡要重讀）
export const sameMarket = (a: MarketColumns, b: MarketColumns) =>
  a.listingSeller === b.listingSeller &&
  a.listingPriceCents === b.listingPriceCents &&
  a.listingRentPayer === b.listingRentPayer &&
  a.auctionSeller === b.auctionSeller &&
  a.auction === b.auction;

export function stateOfRow(r: IndexColumns, now = Date.now()): VaultCardState {
  return {
    owner: r.owner,
    listing: r.listingSeller ? { seller: r.listingSeller, priceUsdt: (r.listingPriceCents ?? 0) / 100, rentPayer: r.listingRentPayer ?? "" } : null,
    auction: r.auctionSeller && r.auction ? auctionView(JSON.parse(r.auction) as RawAuction, now) : null,
    redeeming: r.redeeming,
    burned: r.burned,
  };
}

export type CardLike = { id: string; priceUsdt: number; owner: string; status: "vaulted" | "listed" | "auction" | "redeeming" | "redeemed" };

// 把鏈上狀態疊到卡片資料上：持有人、價格、狀態；鏈上已銷毀的標成已提貨。
// 掛單和拍賣時 NFT 在託管程序裡，持有人顯示賣家；拍賣的價格是目前最高出價，沒人出價時是起標價
export function applyChainStates<T extends CardLike>(cards: T[], states: Record<string, VaultCardState>): T[] {
  return cards.map((c) => {
    const s = states[c.id];
    if (!s || c.status === "redeemed") return c;
    if (s.burned) return { ...c, owner: "", status: "redeemed" };
    if (s.auction) return { ...c, owner: s.auction.seller, status: "auction", priceUsdt: s.auction.highUsd ?? s.auction.startUsd };
    const status = s.listing ? "listed" : s.redeeming ? "redeeming" : "vaulted";
    return { ...c, owner: s.listing?.seller ?? s.owner, status, priceUsdt: s.listing?.priceUsdt ?? c.priceUsdt };
  });
}
