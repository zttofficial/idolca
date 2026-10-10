"use client";

// 收藏冊資料：目前存在瀏覽器 localStorage（帳號體系接上後改存伺服器，結構不變）。
// 所有頁面透過 useBinder 共用同一份快照，任何一處改動都會即時同步到其他元件和分頁。

import { useSyncExternalStore } from "react";
import { fakeBase58, seeded } from "./seeded";
import { TEMPLATES } from "./catalog";

export type BinderEntry = {
  count: number;
  // 用戶自己拍的正面照（已裁成 55:85 的 JPEG data URL）
  photo?: string;
  // 自述收藏 NFT 的地址（演示模式下是假地址）
  mint?: string;
};

export type Binder = { have: Record<string, BinderEntry>; want: Record<string, true> };

const KEY = "idolca:binder:v1";
const EMPTY: Binder = { have: {}, want: {} };
const listeners = new Set<() => void>();
let cache: Binder | null = null;

function read(): Binder {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as Binder) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(next: Binder) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 配額滿或隱私模式：本次瀏覽仍保留在記憶體裡
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useBinder() {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

const update = (fn: (b: Binder) => Binder) => write(fn(read()));

export const binderActions = {
  toggleHave(id: string) {
    update((b) => {
      const have = { ...b.have };
      if (have[id]) delete have[id];
      else have[id] = { count: 1 };
      const want = { ...b.want };
      delete want[id];
      return { have, want };
    });
  },
  setCount(id: string, count: number) {
    update((b) => {
      const have = { ...b.have };
      if (count <= 0) delete have[id];
      else have[id] = { ...(have[id] ?? {}), count };
      return { ...b, have };
    });
  },
  toggleWant(id: string) {
    update((b) => {
      const want = { ...b.want };
      if (want[id]) delete want[id];
      else want[id] = true;
      return { ...b, want };
    });
  },
  // 演示鑄造：記下照片和一個假的 NFT 地址
  mint(id: string, photo: string) {
    update((b) => ({
      ...b,
      have: { ...b.have, [id]: { ...(b.have[id] ?? { count: 1 }), photo, mint: fakeBase58(Math.random, 44) } },
    }));
  },
  clear() {
    write(EMPTY);
  },
  // 示範收藏冊：讓第一次來的用戶看到收藏冊填滿的樣子
  loadSample() {
    const rand = seeded("sample-binder");
    const have: Record<string, BinderEntry> = {};
    const want: Record<string, true> = {};
    for (const t of TEMPLATES) {
      const r = rand();
      if (t.listingId) have[t.id] = { count: 1 };
      else if (t.member === "Wonyoung" && t.rarity !== "fansign" && r < 0.8) have[t.id] = { count: 1 + Math.floor(rand() * 2) };
      else if (t.rarity === "album" && r < 0.12) have[t.id] = { count: 1 };
      else if ((t.rarity === "pob" || t.rarity === "luckydraw") && r < 0.04) want[t.id] = true;
    }
    write({ have, want });
  },
};
