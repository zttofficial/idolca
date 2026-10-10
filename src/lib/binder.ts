"use client";

// 收藏冊資料：未登入時存在瀏覽器 localStorage；登入後同步到帳號（/api/binder），換裝置也在。
// 所有頁面透過 useBinder 共用同一份快照，任何一處改動都會即時同步到其他元件和分頁。

import { useSyncExternalStore } from "react";
import { seeded } from "./seeded";
import { TEMPLATES } from "./catalog";

export type BinderEntry = {
  count: number;
  // 用戶自己拍的正面照（已裁成 55:85 的 JPEG data URL）
  photo?: string;
  // 收藏 NFT 的地址（演示模式下是假地址）
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

// 登入後的同步：本機每次改動在 0.6 秒內合併成一次整本上傳
let syncing = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;

function pushSoon() {
  if (!syncing) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    fetch("/api/binder", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(read()) }).catch(() => {});
  }, 600);
}

function write(next: Binder, push = true) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 配額滿或隱私模式：本次瀏覽仍保留在記憶體裡
  }
  listeners.forEach((l) => l());
  if (push) pushSoon();
}

// 兩本收藏冊合併：張數取大，照片和鏈上地址保留有的那份，想要清單取聯集
function merge(a: Binder, b: Binder): Binder {
  const have: Record<string, BinderEntry> = { ...a.have };
  for (const [id, e] of Object.entries(b.have)) {
    const mine = have[id];
    have[id] = mine ? { count: Math.max(mine.count, e.count), photo: mine.photo ?? e.photo, mint: mine.mint ?? e.mint } : e;
  }
  const want: Record<string, true> = { ...a.want, ...b.want };
  for (const id of Object.keys(have)) delete want[id];
  return { have, want };
}

// 登入時呼叫：把帳號裡的收藏冊和本機的合併，之後的改動自動同步
export async function attachAccount() {
  const res = await fetch("/api/binder");
  if (!res.ok) return;
  const remote = (await res.json()) as Binder;
  const merged = merge(remote, read());
  syncing = true;
  write(merged, false);
  if (JSON.stringify(merged) !== JSON.stringify(remote)) pushSoon();
}

// 登出時呼叫：停止同步並清空本機副本，下一個用這台裝置的人看不到
export function detachAccount() {
  syncing = false;
  clearTimeout(pushTimer);
  write(EMPTY, false);
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
