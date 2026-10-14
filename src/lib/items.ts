"use client";

// 我自由上鏈的卡（收藏 NFT），跟著帳號存在伺服器；登入後載入，登出時清空
import { useSyncExternalStore } from "react";

import type { CardSource } from "./sources";
import type { AuctionView } from "./auction";
import { signAndSend } from "./solana/wallets";
import { track } from "./analytics";

// 自由上鏈的卡平台不查驗：一律待驗證，只有查出假卡時才會變成 fake
export type Verification = "unverified" | "fake";

export type CollectorItem = {
  id: string;
  photo: string;
  photoBack: string | null;
  photos: string[];
  title: string | null;
  // 持有人寫的描述，選填
  description: string | null;
  quantity: number;
  source: CardSource;
  group: string;
  member: string;
  album: string | null;
  version: string | null;
  templateId: string | null;
  // 收藏 NFT 的地址；還沒上架出售過（沒鑄造）時為 null
  asset: string | null;
  // 鏈上鑄造的交易
  mintTx: string | null;
  // NFT 持有地址：自己的錢包，或平台代管錢包
  ownerAddress: string | null;
  // 標成假卡時改寫鏈上元數據並凍結的交易
  fakeTx: string | null;
  verification: Verification;
  verificationNote: string | null;
  verifiedAt: string | null;
  priceUsdt: number | null;
  listedAt: string | null;
  // 已申請寄進金庫、等實物寄到
  vaultRequestedAt: string | null;
  createdAt: string;
  // 拍賣中時的拍賣狀態（收藏冊只帶進行中的；刊登頁也帶剛結束的）
  auction?: ItemAuction | null;
  // 收藏冊：已賣出、訂單還沒結束時的訂單狀態
  openOrder?: "paid" | "shipped" | "disputed" | "refunding" | "releasing" | null;
};

export type ItemAuction = AuctionView & { id: string };

// 不在售的卡最近一筆成交：trading 買家已付款、還沒放款，sold 已放款；at 是付款或放款的時間
export type ListingDeal = { status: "trading" | "sold"; priceUsdt: number; at: string };

// 自由刊登：收藏品加上賣家暱稱。不在售的卡帶最近一筆成交；寄進金庫鑑定過的帶金庫卡 id
export type Listing = CollectorItem & { seller: string; auction: ItemAuction | null; deal: ListingDeal | null; vaultCardId: string | null };

// 刊登頁的交易紀錄。成交連到 NFT 轉給買家的交易，沒上鏈的卡連到買家的付款交易（可能在 Arc 上）
export type ListingEvent = { type: "list" | "auction" | "unsold" | "cancelAuction" | "sale"; date: string; priceUsdt?: number; tx?: { chain: "solana" | "arc"; signature: string } };


const EMPTY: CollectorItem[] = [];
let items: CollectorItem[] = EMPTY;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useMyItems = () =>
  useSyncExternalStore(
    subscribe,
    () => items,
    () => EMPTY,
  );

export async function refreshItems() {
  const res = await fetch("/api/items");
  if (!res.ok) return;
  items = ((await res.json()) as { items: CollectorItem[] }).items;
  emit();
}

export function clearItems() {
  items = EMPTY;
  emit();
}

// photos 第一張正面、第二張背面，之後是補充照片
export type MintInput = {
  photos: string[];
  title?: string;
  description?: string;
  quantity: number;
  source: CardSource;
  group: string;
  member: string;
  album?: string;
  version?: string;
  priceUsdt?: number;
};

// 加卡進收藏冊（只存資料庫，不上鏈）
export async function addItem(input: MintInput): Promise<CollectorItem> {
  const res = await fetch("/api/items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  const data = (await res.json()) as { item?: CollectorItem; error?: string };
  if (!data.item) throw new Error(data.error ?? "mint_failed");
  items = [data.item, ...items];
  emit();
  track("card_added", { listed: input.priceUsdt !== undefined, photos: input.photos.length });
  return data.item;
}

// 自己付費把卡上鏈：伺服器組交易 → 錢包簽名送出（手續費和押金由這個錢包付）→ 回報確認
export async function putOnChain(id: string, wallet: string) {
  const post = async (url: string, body?: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;
    if (!res.ok) throw new Error(data.error ?? "mint_failed");
    return data;
  };
  const { tx, asset } = (await post(`/api/items/${id}/mint`)) as unknown as { tx: string; asset: string };
  const signature = await signAndSend(tx, wallet);
  const { item } = (await post(`/api/items/${id}/mint/confirm`, { signature, asset })) as unknown as { item: CollectorItem };
  track("collectible_minted");
  items = items.map((i) => (i.id === id ? item : i));
  emit();
  return item;
}

// 刊登（priceUsdt 為數字）或下架（null）
export async function setListing(id: string, priceUsdt: number | null) {
  const res = await fetch(`/api/items/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ priceUsdt }) });
  const data = (await res.json()) as { item?: CollectorItem; error?: string };
  if (!data.item) throw new Error(data.error ?? "listing_failed");
  items = items.map((i) => (i.id === id ? data.item! : i));
  emit();
  return data.item;
}

// 開拍（起標價、可選的保底價、天數；一口價刊登會同時下架），或在沒人出價前取消拍賣
export async function setAuction(id: string, input: { startUsd: number; reserveUsd: number | null; days: number } | null) {
  const res = await fetch(`/api/items/${id}/auction`, {
    method: input ? "POST" : "DELETE",
    headers: { "content-type": "application/json" },
    body: input ? JSON.stringify(input) : undefined,
  });
  const data = (await res.json()) as { item?: CollectorItem; error?: string };
  if (!data.item) throw new Error(data.error ?? "auction_failed");
  items = items.map((i) => (i.id === id ? data.item! : i));
  emit();
  return data.item;
}

// 申請寄進金庫（下架、等實物寄到），或取消申請
export async function requestVault(id: string, cancel = false) {
  const res = await fetch(`/api/items/${id}/vault`, { method: cancel ? "DELETE" : "POST" });
  const data = (await res.json()) as { item?: CollectorItem; error?: string };
  if (!data.item) throw new Error(data.error ?? "vault_failed");
  items = items.map((i) => (i.id === id ? data.item! : i));
  emit();
  return data.item;
}

// 改描述（空字串清除）
export async function setDescription(id: string, description: string) {
  const res = await fetch(`/api/items/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ description }) });
  const data = (await res.json()) as { item?: CollectorItem; error?: string };
  if (!data.item) throw new Error(data.error ?? "update_failed");
  items = items.map((i) => (i.id === id ? data.item! : i));
  emit();
  return data.item;
}
