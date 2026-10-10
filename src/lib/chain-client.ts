"use client";

// 瀏覽器端的鏈上狀態：金庫卡的即時持有人和掛單、錢包餘額，以及「伺服器組交易 → 錢包簽名 → 回報確認」的共用流程
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { signAndSend } from "./solana/wallets";

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

export class ChainError extends Error {}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ChainError(data.error ?? "network");
  return data;
}

export type VaultAction = "buy" | "list" | "cancel" | "redeem";

// 金庫卡的動作：伺服器組交易 → 錢包簽名送出 → 伺服器等確認、刷新狀態。回傳交易簽名
export async function vaultAction(action: VaultAction, cardId: string, wallet: string, priceUsdt?: number) {
  const { tx } = await postJson<{ tx: string }>("/api/chain/vault/tx", { action, cardId, priceUsdt });
  const signature = await signAndSend(tx, wallet);
  await postJson("/api/chain/vault/confirm", { action, cardId, signature });
  await refreshChainState();
  return signature;
}

// 付款類動作（擔保交易、開卡包）：先建訂單拿到付款交易，簽名送出後回報確認
export async function payAndConfirm<T>(createUrl: string, createBody: unknown, confirmUrl: (id: string) => string, wallet: string) {
  const order = await postJson<{ id: string; tx: string }>(createUrl, createBody);
  const signature = await signAndSend(order.tx, wallet);
  const result = await postJson<T>(confirmUrl(order.id), { signature });
  return { signature, result };
}

export const claimFaucet = () => postJson<{ tx: string; sol: number; usdt: number }>("/api/chain/faucet");
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

type CardLike = { id: string; priceUsdt: number; owner: string; status: "vaulted" | "listed" | "redeeming" };

// 把鏈上即時狀態疊到卡片資料上：持有人、掛單價、狀態；已提貨銷毀的卡不再出現在金庫和市場
export function withLive<T extends CardLike>(cards: T[], chain: ChainState | null): T[] {
  if (!chain?.ready) return cards;
  return cards.flatMap((c) => {
    const s = chain.cards[c.id];
    if (!s) return [c];
    if (s.burned) return [];
    const status = s.listing ? "listed" : s.redeeming ? "redeeming" : "vaulted";
    return [{ ...c, owner: s.listing?.seller ?? s.owner, status, priceUsdt: s.listing?.priceUsdt ?? c.priceUsdt }];
  });
}
