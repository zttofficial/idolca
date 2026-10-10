import "server-only";
import * as anchor from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import idl from "@/lib/chain/idl/idolca_market.json";
import type { IdolcaMarket } from "@/lib/chain/idl/idolca_market";
import { USDT_DECIMALS, connection } from "./vault-chain";

// 一張金庫卡在鏈上的完整紀錄，直接讀交易日誌分類：
// Core 的 CreateV2 = 鑄造；託管程序的 List / Buy / Cancel（附事件資料：價格、賣家、買家）；
// AddPlugin = 持有人申請提貨（委託銷毀權並凍結）；Burn = 平台寄出實物時銷毀；其餘 Core Transfer = 轉手（例如賣回平台）

export type ChainEvent = {
  type: "mint" | "list" | "sale" | "cancel" | "redeem" | "burn" | "transfer";
  date: string;
  signature: string;
  priceUsdt?: number;
  from?: string;
  to?: string;
};

const coder = new anchor.BorshCoder(idl as IdolcaMarket);
const has = (logs: string[], name: string) => logs.some((l) => l === `Program log: Instruction: ${name}`);

function marketEvent(logs: string[]) {
  for (const l of logs) {
    if (!l.startsWith("Program data: ")) continue;
    try {
      const e = coder.events.decode(l.slice("Program data: ".length));
      if (e) return e as { name: string; data: Record<string, unknown> };
    } catch {}
  }
  return null;
}

const price = (v: unknown) => Number(v as anchor.BN) / 10 ** USDT_DECIMALS;
const addr = (v: unknown) => (v as PublicKey).toBase58();

function classify(logs: string[], signature: string, date: string, signer: string): ChainEvent | null {
  const ev = marketEvent(logs);
  if (has(logs, "List") && ev) return { type: "list", date, signature, priceUsdt: price(ev.data.price), from: addr(ev.data.seller) };
  if (has(logs, "Buy") && ev) return { type: "sale", date, signature, priceUsdt: price(ev.data.price), from: addr(ev.data.seller), to: addr(ev.data.buyer) };
  if (has(logs, "Cancel")) return { type: "cancel", date, signature, from: signer };
  if (has(logs, "CreateV2") || has(logs, "CreateV1")) return { type: "mint", date, signature };
  if (has(logs, "Burn")) return { type: "burn", date, signature };
  if (has(logs, "AddPlugin")) return { type: "redeem", date, signature, from: signer };
  if (has(logs, "Transfer")) return { type: "transfer", date, signature, from: signer };
  return null;
}

const cache = new Map<string, { at: number; value: Promise<ChainEvent[]> }>();

// 新的在前；快取 20 秒，避免公共 RPC 限流
export function assetHistory(asset: string): Promise<ChainEvent[]> {
  const hit = cache.get(asset);
  if (hit && Date.now() - hit.at < 20_000) return hit.value;
  const value = withRetry(() => readHistory(asset)).catch((err) => {
    cache.delete(asset);
    throw err;
  });
  cache.set(asset, { at: Date.now(), value });
  return value;
}

// 公共 devnet 節點偶爾限流，失敗時退避重試
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= tries - 1) throw err;
      await new Promise((r) => setTimeout(r, 800 * 2 ** i));
    }
  }
}

async function readHistory(asset: string) {
  const sigs = (await connection.getSignaturesForAddress(new PublicKey(asset), { limit: 30 })).filter((s) => !s.err);
  const txs = await connection.getTransactions(
    sigs.map((s) => s.signature),
    { maxSupportedTransactionVersion: 0, commitment: "confirmed" },
  );
  // 批次請求的回應順序不保證和簽名清單一致，按交易簽名對應
  const bySig = new Map(txs.flatMap((tx) => (tx ? [[tx.transaction.signatures[0], tx] as const] : [])));
  return sigs.flatMap((s) => {
    const tx = bySig.get(s.signature);
    if (!tx) return [];
    const signer = tx.transaction.message.getAccountKeys().get(0)?.toBase58() ?? "";
    const date = new Date((s.blockTime ?? 0) * 1000).toISOString();
    const e = classify(tx.meta?.logMessages ?? [], s.signature, date, signer);
    return e ? [e] : [];
  });
}
