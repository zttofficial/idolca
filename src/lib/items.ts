"use client";

// 我自由上鏈的卡（自述收藏 NFT），跟著帳號存在伺服器；登入後載入，登出時清空
import { useSyncExternalStore } from "react";

import type { CardSource } from "./sources";

export type Verification = "self_reported" | "authentic" | "fake";

export type CollectorItem = {
  id: string;
  photo: string;
  photoBack: string | null;
  source: CardSource;
  group: string;
  member: string;
  album: string | null;
  version: string | null;
  templateId: string | null;
  asset: string;
  verification: Verification;
  verificationNote: string | null;
  verifiedAt: string | null;
  createdAt: string;
};

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

export type MintInput = { photo: string; photoBack: string; source: CardSource; group: string; member: string; album?: string; version?: string };

export async function mintItem(input: MintInput): Promise<CollectorItem> {
  const res = await fetch("/api/items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  const data = (await res.json()) as { item?: CollectorItem; error?: string };
  if (!data.item) throw new Error(data.error ?? "mint_failed");
  items = [data.item, ...items];
  emit();
  return data.item;
}
