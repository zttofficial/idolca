"use client";

// 我自由上鏈的卡（收藏 NFT），跟著帳號存在伺服器；登入後載入，登出時清空
import { useSyncExternalStore } from "react";

import type { CardSource } from "./sources";

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
  asset: string;
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
};

// 自由刊登：收藏品加上賣家暱稱
export type Listing = CollectorItem & { seller: string };


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

export async function mintItem(input: MintInput): Promise<CollectorItem> {
  const res = await fetch("/api/items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  const data = (await res.json()) as { item?: CollectorItem; error?: string };
  if (!data.item) throw new Error(data.error ?? "mint_failed");
  items = [data.item, ...items];
  emit();
  return data.item;
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
