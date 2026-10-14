// 收藏冊的擺法：像一本實體卡冊，每個卡套放一張卡，可以留空卡套；拿出冊子的卡（隱藏）放在一邊，隨時放回。
// 卡片本身由鏈上持有和手動標記決定，這裡只記擺放位置。卡的鍵是 "vault:<卡 id>"、"item:<收藏品 id>"、"card:<卡款 id>"。
// 暫時不在手上的卡（賣掉、還沒載入）鍵仍留在原卡套，畫成空卡套；之後回來就回到原位，有別的卡放進來時才被覆蓋。

export type BinderLayout = {
  // 每個卡套放哪張卡，"" 是空卡套
  order: string[];
  // 拿出冊子的卡
  hidden: string[];
};

export const EMPTY_LAYOUT: BinderLayout = { order: [], hidden: [] };
// 一本冊子最多記這麼多個卡套和拿出冊子的卡；整本一次上傳，一萬個鍵約 0.5 MB
export const MAX_LAYOUT_KEYS = 10000;
const KEY_PATTERN = /^(vault|item|card):[\w.-]{1,100}$/;
export const isLayoutKey = (k: unknown): k is string => typeof k === "string" && KEY_PATTERN.test(k);

const trimEmpty = (order: string[]) => {
  let end = order.length;
  while (end > 0 && order[end - 1] === "") end--;
  return order.slice(0, end);
};

// 照排法擺出目前的卡。keys 是手上所有的卡（預設順序）。
// 回傳完整的擺法（新來的卡依預設順序接在最後一張看得到的卡後面）和每個卡套要畫的卡（null 是空卡套）
export function arrange(keys: string[], layout: BinderLayout) {
  const present = new Set(keys);
  const hidden = new Set(layout.hidden);
  const seen = new Set<string>();
  const order = layout.order.map((k) => {
    if (!k || seen.has(k) || hidden.has(k)) return "";
    seen.add(k);
    return k;
  });
  const visible = (k: string) => Boolean(k) && present.has(k);
  let next = order.reduce((last, k, i) => (visible(k) ? i + 1 : last), 0);
  for (const k of keys) {
    if (seen.has(k) || hidden.has(k)) continue;
    order[next++] = k;
  }
  const full = trimEmpty(Array.from({ length: order.length }, (_, i) => order[i] ?? ""));
  return {
    layout: { order: full, hidden: layout.hidden } satisfies BinderLayout,
    pockets: trimNull(full.map((k) => (visible(k) ? k : null))),
    hiddenCards: keys.filter((k) => hidden.has(k)),
  };
}

const trimNull = (pockets: (string | null)[]) => {
  let end = pockets.length;
  while (end > 0 && pockets[end - 1] === null) end--;
  return pockets.slice(0, end);
};

const padTo = (order: string[], n: number) => [...order, ...Array<string>(Math.max(0, n - order.length)).fill("")];

// 卡從一個卡套換到另一個卡套：目標有卡就兩張互換，沒卡就直接放進去
export function swapPockets(layout: BinderLayout, from: number, to: number): BinderLayout {
  const order = padTo(layout.order, Math.max(from, to) + 1);
  [order[from], order[to]] = [order[to], order[from]];
  return { ...layout, order: trimEmpty(order) };
}

// 只是記錄的卡（"card:" 鍵，手動標記的卡款）鏈上沒有，不收進卡盒，移除就是刪掉標記
export const isTrackedOnly = (key: string) => key.startsWith("card:");

// 從冊子裡清掉一張卡的位置（原卡套留空），不放進卡盒
export const clearPocket = (layout: BinderLayout, key: string): BinderLayout => ({ ...layout, order: trimEmpty(layout.order.map((k) => (k === key ? "" : k))) });

// 拿出冊子：原卡套留空
export function takeOut(layout: BinderLayout, key: string): BinderLayout {
  return {
    order: trimEmpty(layout.order.map((k) => (k === key ? "" : k))),
    hidden: layout.hidden.includes(key) ? layout.hidden : [...layout.hidden, key],
  };
}

// 放回冊子：放進指定卡套，那裡原本看得到的卡移到最後；沒指定就接在最後一張看得到的卡後面
export function putBack(layout: BinderLayout, key: string, present: Set<string>, at?: number): BinderLayout {
  const hidden = layout.hidden.filter((k) => k !== key);
  const order = layout.order.map((k) => (k === key ? "" : k));
  const lastVisible = order.reduce((last, k, i) => (k && present.has(k) ? i + 1 : last), 0);
  if (at === undefined) {
    const next = padTo(order, lastVisible + 1);
    next[lastVisible] = key;
    return { order: trimEmpty(next), hidden };
  }
  const next = padTo(order, at + 1);
  const displaced = next[at];
  next[at] = key;
  if (displaced && present.has(displaced)) {
    const end = next.reduce((last, k, i) => (k && present.has(k) ? i + 1 : last), 0);
    const tail = padTo(next, end + 1);
    tail[end] = displaced;
    return { order: trimEmpty(tail), hidden };
  }
  return { order: trimEmpty(next), hidden };
}
