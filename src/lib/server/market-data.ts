import "server-only";
import { after } from "next/server";
import type { Db } from "./db";
import { auctionsDue, sweepAuctions } from "./auctions";
import { listListings } from "./items";
import { listRedeemedCards, listVaultCards } from "./vault-cards";

// 市場資料：公開接口和伺服器端渲染的頁面共用同一份讀法

// 金庫卡的實物資料和 NFT 地址，包括已提貨銷毀的（status 為 redeemed）；持有人、掛單和提貨狀態另外讀鏈上
export async function publicVaultCards(db: Db) {
  const [vault, redeemed] = await Promise.all([listVaultCards(db), listRedeemedCards(db)]);
  return [...vault, ...redeemed];
}

// 在售的自由刊登（一口價和拍賣中）。有到期的拍賣時回應後順便結標
export async function publicListings(db: Db) {
  if (await auctionsDue(db)) after(() => sweepAuctions(db));
  return listListings(db);
}
