"use client";

// 瀏覽器端的鏈上狀態：金庫卡的即時持有人和掛單、錢包餘額，以及「伺服器組交易 → 錢包簽名 → 回報確認」的共用流程
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Card } from "./cards";
import { isTemplateOf, type Template } from "./catalog";
import { signAndSend } from "./solana/wallets";
import { signArcPayment, type EvmWallet } from "./evm/arc-wallet";
import type { ArcPaymentRequest } from "./arc";

export type VaultCardState = {
  owner: string;
  listing: { seller: string; priceUsdt: number } | null;
  redeeming: boolean;
  burned: boolean;
};
type ChainState = { ready: boolean; cards: Record<string, VaultCardState> };

let state: ChainState | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function refreshChainState() {
  loading ??= fetch("/api/chain/state")
    .then((r) => r.json() as Promise<ChainState>)
    .then((s) => {
      state = s;
      emit();
    })
    .catch(() => {})
    .finally(() => {
      loading = null;
    });
  return loading;
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!state) refreshChainState();
  return () => listeners.delete(l);
}

// 還沒讀到時是 null；鏈上未配置時 ready 為 false
export const useChainState = () =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => null,
  );

// 金庫裡的卡（資料庫的實物資料），整站共用一份；入庫或提貨後呼叫 refreshVaultCards 重讀
let vaultCards: Card[] | null = null;
let vaultLoading: Promise<void> | null = null;
const vaultListeners = new Set<() => void>();
export function refreshVaultCards() {
  vaultLoading ??= fetch("/api/vault/cards")
    .then((r) => (r.ok ? r.json() : { cards: [] }))
    .then((d: { cards: Card[] }) => {
      vaultCards = d.cards;
      vaultListeners.forEach((l) => l());
    })
    .catch(() => {})
    .finally(() => {
      vaultLoading = null;
    });
  return vaultLoading;
}
function subscribeVault(l: () => void) {
  vaultListeners.add(l);
  if (!vaultCards) refreshVaultCards();
  return () => vaultListeners.delete(l);
}

// 金庫卡加上鏈上即時狀態（持有人、掛單價、提貨中）。預設只有還在金庫裡的；includeRedeemed 連已提貨銷毀的也給。
// 還沒讀到時是 null
export function useVaultCards(includeRedeemed = false): Card[] | null {
  const cards = useSyncExternalStore(
    subscribeVault,
    () => vaultCards,
    () => null,
  );
  const chain = useChainState();
  return useMemo(() => (cards ? withLive(cards, chain).filter((c) => includeRedeemed || c.status !== "redeemed") : null), [cards, chain, includeRedeemed]);
}

export class ChainError extends Error {}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ChainError(data.error ?? "network");
  return data;
}

export type VaultAction = "buy" | "list" | "cancel" | "redeem";

// 金庫卡的動作：伺服器組交易 → 錢包簽名送出 → 伺服器等確認、刷新狀態。回傳交易簽名
// 提貨（redeem）要帶收件地址
export async function vaultAction(action: VaultAction, cardId: string, wallet: string, priceUsdt?: number, address?: unknown) {
  const { tx } = await postJson<{ tx: string }>("/api/chain/vault/tx", { action, cardId, priceUsdt, address });
  const signature = await signAndSend(tx, wallet);
  await postJson("/api/chain/vault/confirm", { action, cardId, signature, address });
  await refreshChainState();
  return signature;
}

// 金庫卡上架或改價。託管程序沒有改價：改價是先取消掛單，再用新價格掛單，錢包簽兩次
export async function listVaultCard(cardId: string, wallet: string, priceUsdt: number, relist: boolean) {
  if (relist) await vaultAction("cancel", cardId, wallet);
  return vaultAction("list", cardId, wallet, priceUsdt);
}

// 付款類動作（擔保交易、開卡包）：先建訂單拿到付款交易，簽名送出後回報確認
export async function payAndConfirm<T>(createUrl: string, createBody: unknown, confirmUrl: (id: string) => string, wallet: string) {
  const order = await postJson<{ id: string; tx: string }>(createUrl, createBody);
  const signature = await signAndSend(order.tx, wallet);
  const result = await postJson<T>(confirmUrl(order.id), { signature });
  return { signature, result };
}

// 在 Arc 上付款：建單（rail: "arc"）拿到授權內容 → 買家在 EVM 錢包簽名 → 回報給伺服器，伺服器代送上鏈並對帳。
// 回傳 Arc 上的付款交易哈希和確認結果
export async function payOnArc<T extends { payTx: string }>(createUrl: string, createBody: object, confirmUrl: (id: string) => string, wallet: EvmWallet) {
  const order = await postJson<{ id: string; arc: ArcPaymentRequest }>(createUrl, { ...createBody, rail: "arc" });
  const signed = await signArcPayment(wallet, order.arc);
  const result = await postJson<T>(confirmUrl(order.id), signed);
  return { payTx: result.payTx, result };
}

export const postAction = postJson;

export function useBalance(wallet: string | null | undefined) {
  const [balance, setBalance] = useState<{ sol: number; usdt: number } | null>(null);
  const refresh = useCallback(async () => {
    if (!wallet) return;
    const res = await fetch("/api/chain/balance");
    if (res.ok) setBalance((await res.json()) as { sol: number; usdt: number });
  }, [wallet]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 錢包變化時重新讀餘額
    refresh();
  }, [refresh]);
  return { balance: wallet ? balance : null, refresh };
}

type CardLike = { id: string; priceUsdt: number; owner: string; status: "vaulted" | "listed" | "redeeming" | "redeemed" };

// 把鏈上即時狀態疊到卡片資料上：持有人、掛單價、狀態；鏈上已銷毀的標成已提貨
export function withLive<T extends CardLike>(cards: T[], chain: ChainState | null): T[] {
  if (!chain?.ready) return cards;
  return cards.map((c) => {
    const s = chain.cards[c.id];
    if (!s || c.status === "redeemed") return c;
    if (s.burned) return { ...c, owner: "", status: "redeemed" };
    const status = s.listing ? "listed" : s.redeeming ? "redeeming" : "vaulted";
    return { ...c, owner: s.listing?.seller ?? s.owner, status, priceUsdt: s.listing?.priceUsdt ?? c.priceUsdt };
  });
}

// 自由刊登清單（整站共用一份），給圖鑑算在售數量
type ListingLite = { id: string; templateId: string | null; priceUsdt: number | null };
let listings: ListingLite[] | null = null;
let listingsLoading: Promise<void> | null = null;
const listingListeners = new Set<() => void>();
function subscribeListings(l: () => void) {
  listingListeners.add(l);
  listingsLoading ??= fetch("/api/listings")
    .then((r) => (r.ok ? r.json() : { listings: [] }))
    .then((d: { listings: ListingLite[] }) => {
      listings = d.listings;
      listingListeners.forEach((x) => x());
    })
    .catch(() => {});
  return () => listingListeners.delete(l);
}
const useListings = () =>
  useSyncExternalStore(
    subscribeListings,
    () => listings,
    () => null,
  );

// vaultCardId：最便宜的那張在售金庫卡，沒有金庫卡在售時為空
export type TemplateMarket = { forSale: number; fromUsdt: number | null; vaultCardId: string | null };

// 一個卡款的真實在售情況：這個卡款的金庫卡（鏈上掛單）加上對得上的自由刊登
export function useTemplateMarket() {
  const vault = useVaultCards();
  const free = useListings();
  return (template: Template): TemplateMarket | null => {
    if (!vault || !free) return null;
    const listed = vault.filter((c) => c.status === "listed" && isTemplateOf(c, template)).sort((a, b) => a.priceUsdt - b.priceUsdt);
    const prices = listed.map((c) => c.priceUsdt);
    for (const l of free) if (l.templateId === template.id && l.priceUsdt !== null) prices.push(l.priceUsdt);
    return { forSale: prices.length, fromUsdt: prices.length ? Math.min(...prices) : null, vaultCardId: listed[0]?.id ?? null };
  };
}
