"use client";

// 收藏冊資料：未登入時存在瀏覽器 localStorage；登入後以帳號（/api/binder）為準，換裝置也在。
// 所有頁面透過 useBinder 共用同一份快照，任何一處改動都會即時同步到其他元件和分頁。
//
// 同步規則：
// - 本機副本記著屬於哪個帳號（owner）。未登入時記下的（owner 為 null），登入那一次合併進帳號，之後就屬於這個帳號。
// - 已屬於帳號的副本只是快取：有還沒上傳成功的改動（dirty）就以本機為準補傳，否則一律採用帳號裡的版本，
//   在別的裝置刪掉的卡不會被舊副本合併回來。
// - 上傳一次只送一個請求，送出期間的改動等它回來再送，請求不會亂序覆蓋；關頁時把還沒送的改動用 keepalive 送出。

import { useSyncExternalStore } from "react";
import { EMPTY_LAYOUT, isTrackedOnly, type BinderLayout } from "./binder-layout";

export type BinderEntry = {
  count: number;
  // 用戶自己拍的正面照（已裁成 55:85 的 JPEG data URL）
  photo?: string;
  // 收藏 NFT 的地址
  mint?: string;
};

// layout 是卡在冊子裡的擺法和拿出冊子的卡（見 binder-layout.ts）
export type Binder = { have: Record<string, BinderEntry>; want: Record<string, true>; layout: BinderLayout };
type Stored = { binder: Binder; owner: string | null; dirty: boolean };

// v1 可能留著早期「載入樣本收藏冊」產生的假標記；v2 沒記帳號歸屬。兩者都可能把刪掉的卡合併回帳號，直接丟掉
const KEY = "idolca:binder:v3";
const LEGACY_KEYS = ["idolca:binder:v1", "idolca:binder:v2"];
const EMPTY: Binder = { have: {}, want: {}, layout: EMPTY_LAYOUT };
const listeners = new Set<() => void>();
let stored: Stored | null = null;

// 只是記錄的卡不會放進卡盒：以前被拿出冊子的，當作已移除，連標記一起刪掉
function normalize(b: Binder): Binder {
  const gone = b.layout.hidden.filter(isTrackedOnly);
  if (!gone.length) return b;
  const have = { ...b.have };
  for (const key of gone) delete have[key.slice("card:".length)];
  return { ...b, have, layout: { ...b.layout, hidden: b.layout.hidden.filter((k) => !isTrackedOnly(k)) } };
}

function load(): Stored {
  if (stored) return stored;
  try {
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Stored>) : null;
    stored = { binder: normalize({ ...EMPTY, ...parsed?.binder }), owner: parsed?.owner ?? null, dirty: Boolean(parsed?.dirty) };
  } catch {
    stored = { binder: EMPTY, owner: null, dirty: false };
  }
  return stored;
}
const read = () => load().binder;

function save(next: Stored) {
  stored = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 配額滿或隱私模式：本次瀏覽仍保留在記憶體裡
  }
  listeners.forEach((l) => l());
}

// 目前登入的帳號；null 時不上傳
let account: string | null = null;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;

const putBody = () => JSON.stringify(read());

async function push() {
  clearTimeout(pushTimer);
  if (!account || inFlight || !load().dirty) return;
  inFlight = true;
  const sent = read();
  try {
    const res = await fetch("/api/binder", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(sent) });
    // 送出期間沒有新改動，才算同步完成
    if (res.ok && read() === sent) save({ ...load(), dirty: false });
  } catch {
    // 網路錯誤：保持 dirty，下次改動或下次載入時再送
  } finally {
    inFlight = false;
  }
  if (load().dirty && read() !== sent) pushSoon();
}

// 改動在 0.6 秒內合併成一次整本上傳
function pushSoon() {
  if (!account) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 600);
}

// 關頁或切到背景時，把還沒送出的改動送出去（keepalive 讓請求在頁面關掉後仍能完成）
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (!account || !load().dirty || inFlight) return;
    clearTimeout(pushTimer);
    fetch("/api/binder", { method: "PUT", headers: { "content-type": "application/json" }, body: putBody(), keepalive: true }).catch(() => {});
  });
}

function write(next: Binder) {
  save({ ...load(), binder: next, dirty: true });
  pushSoon();
}

// 兩本收藏冊合併：張數取大，照片和鏈上地址保留有的那份，想要清單取聯集；擺法以帳號裡排過的為準
function merge(a: Binder, b: Binder): Binder {
  const have: Record<string, BinderEntry> = { ...a.have };
  for (const [id, e] of Object.entries(b.have)) {
    const mine = have[id];
    have[id] = mine ? { count: Math.max(mine.count, e.count), photo: mine.photo ?? e.photo, mint: mine.mint ?? e.mint } : e;
  }
  const want: Record<string, true> = { ...a.want, ...b.want };
  for (const id of Object.keys(have)) delete want[id];
  const arranged = (x: Binder) => x.layout.order.length > 0 || x.layout.hidden.length > 0;
  return { have, want, layout: arranged(a) ? a.layout : b.layout };
}

// 登入或載入頁面時呼叫：決定用帳號的版本、本機未送出的改動，還是把未登入時記的合併進帳號
export async function attachAccount(userId: string) {
  const res = await fetch("/api/binder");
  if (!res.ok) return;
  const remote = { ...EMPTY, ...((await res.json()) as Partial<Binder>) };
  const local = load();
  account = userId;
  let next: Binder;
  if (local.owner === userId) next = local.dirty ? local.binder : remote;
  else if (local.owner === null) next = merge(remote, local.binder);
  else next = remote;
  next = normalize(next);
  const changed = JSON.stringify(next) !== JSON.stringify(remote);
  save({ binder: next, owner: userId, dirty: changed });
  if (changed) push();
}

// 登出時呼叫：停止同步並清空本機副本，下一個用這台裝置的人看不到
export function detachAccount() {
  account = null;
  clearTimeout(pushTimer);
  save({ binder: EMPTY, owner: null, dirty: false });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      stored = null;
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
      return { ...b, have, want };
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
  // 清空手動標記的卡和想要清單；擺法留著，鏈上的卡位置不變
  clear() {
    update((b) => ({ ...EMPTY, layout: b.layout }));
  },
  setLayout(layout: BinderLayout) {
    update((b) => ({ ...b, layout }));
  },
};
