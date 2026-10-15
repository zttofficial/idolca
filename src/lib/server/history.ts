import "server-only";
import * as anchor from "@anchor-lang/core";
import { PublicKey } from "@solana/web3.js";
import idl from "@/lib/chain/idl/idolca_market.json";
import type { IdolcaMarket } from "@/lib/chain/idl/idolca_market";
import { CHAIN } from "@/lib/chain";
import { USDT_DECIMALS, auctionPda, connection } from "./vault-chain";

// 一張金庫卡在鏈上的完整紀錄，直接讀交易日誌分類：
// Core 的 CreateV2 = 鑄造；託管程序的 List / Buy / Cancel（附事件資料：價格、賣家、買家）；
// CreateAuction = 開拍（起標價）、SettleAuction = 結標（有得標者是成交，否則流拍）、CancelAuction = 取消拍賣；
// AddPlugin = 持有人申請提貨（委託銷毀權並凍結）；Burn = 平台寄出實物時銷毀；其餘 Core Transfer = 轉手（例如賣回平台）

export type ChainEvent = {
  type: "mint" | "list" | "sale" | "cancel" | "auction" | "unsold" | "cancelAuction" | "redeem" | "burn" | "transfer";
  date: string;
  signature: string;
  priceUsdt?: number;
  from?: string;
  to?: string;
};

const coder = new anchor.BorshCoder(idl as IdolcaMarket);
const has = (logs: string[], name: string) => logs.some((l) => l === `Program log: Instruction: ${name}`);

// 程序升級前的 Listed 事件多一個 payment_mint 欄位（長 112 位元組），價格在它後面；按新格式解析會讀錯，照舊格式讀
const LEGACY_LISTED_LEN = 112;
type MarketEvent = { name: string; data: Record<string, unknown> };
function marketEvents(logs: string[]) {
  const out: MarketEvent[] = [];
  for (const l of logs) {
    if (!l.startsWith("Program data: ")) continue;
    const raw = l.slice("Program data: ".length);
    try {
      const e = coder.events.decode(raw) as MarketEvent | null;
      if (!e) continue;
      const bytes = Buffer.from(raw, "base64");
      if (e.name === "Listed" && bytes.length === LEGACY_LISTED_LEN) e.data.price = new anchor.BN(bytes.subarray(104, 112), "le");
      out.push(e);
    } catch {}
  }
  return out;
}
const marketEvent = (logs: string[]) => marketEvents(logs)[0] ?? null;

const price = (v: unknown) => Number(v as anchor.BN) / 10 ** USDT_DECIMALS;
const addr = (v: unknown) => (v as PublicKey).toBase58();

function classify(logs: string[], signature: string, date: string, signer: string): ChainEvent | null {
  const ev = marketEvent(logs);
  // 開拍和結標的交易裡也有 Core 的 Transfer，要先判斷
  if (has(logs, "CreateAuction") && ev?.name === "AuctionCreated") return { type: "auction", date, signature, priceUsdt: price(ev.data.start_price), from: addr(ev.data.seller) };
  if (has(logs, "SettleAuction") && ev?.name === "AuctionSettled") {
    return ev.data.winner
      ? { type: "sale", date, signature, priceUsdt: price(ev.data.price), from: addr(ev.data.seller), to: addr(ev.data.winner) }
      : { type: "unsold", date, signature, from: addr(ev.data.seller) };
  }
  if (has(logs, "CancelAuction")) return { type: "cancelAuction", date, signature, from: signer };
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

// 一批簽名對應的交易。批次請求的回應順序不保證和簽名清單一致，按交易簽名對應
async function transactions(signatures: string[]) {
  const txs = await connection.getTransactions(signatures, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  return new Map(txs.flatMap((tx) => (tx ? [[tx.transaction.signatures[0], tx] as const] : [])));
}

async function readHistory(asset: string) {
  const sigs = (await connection.getSignaturesForAddress(new PublicKey(asset), { limit: 30 })).filter((s) => !s.err);
  const bySig = await transactions(sigs.map((s) => s.signature));
  return sigs.flatMap((s) => {
    const tx = bySig.get(s.signature);
    if (!tx) return [];
    // 動手的人：第一個不是平台的簽名者（手續費由平台付，平台常是第一個簽名者）
    const keys = tx.transaction.message.getAccountKeys();
    const signers = Array.from({ length: tx.transaction.message.header.numRequiredSignatures }, (_, i) => keys.get(i)?.toBase58() ?? "");
    const signer = signers.find((k) => k !== CHAIN.platform) ?? signers[0] ?? "";
    const date = new Date((s.blockTime ?? 0) * 1000).toISOString();
    const e = classify(tx.meta?.logMessages ?? [], s.signature, date, signer);
    return e ? [e] : [];
  });
}

// 金庫卡目前這場拍賣的每一口出價（新的在前）。拍賣帳戶按卡固定，同一張卡的每場拍賣都用它，
// 所以從新往舊讀到這場的開拍交易（AuctionCreated）為止。
// expected 是鏈上拍賣帳戶記的出價數：和快取時的不同就重讀，新出價不會被快取擋住；同一個數快取 10 秒
export type AuctionBid = { bidder: string; amountUsd: number; at: string; signature: string };
const PAGE = 50;
const MAX_PAGES = 6;
const bidCache = new Map<string, { at: number; expected: number; value: Promise<AuctionBid[]> }>();

export function auctionBids(asset: string, expected = 0): Promise<AuctionBid[]> {
  const hit = bidCache.get(asset);
  if (hit && hit.expected === expected && Date.now() - hit.at < 10_000) return hit.value;
  const value = withRetry(() => readAuctionBids(asset)).then(
    (bids) => {
      // 讀到的比出價數少（節點還沒收錄最新的交易）不留快取，下次重讀
      if (bids.length < expected) bidCache.delete(asset);
      return bids;
    },
    (err) => {
      bidCache.delete(asset);
      throw err;
    },
  );
  bidCache.set(asset, { at: Date.now(), expected, value });
  return value;
}

async function readAuctionBids(asset: string) {
  const account = auctionPda(new PublicKey(asset));
  const out: AuctionBid[] = [];
  let before: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const sigs = await connection.getSignaturesForAddress(account, { limit: PAGE, before });
    const ok = sigs.filter((s) => !s.err);
    const bySig = await transactions(ok.map((s) => s.signature));
    for (const s of ok) {
      const events = marketEvents(bySig.get(s.signature)?.meta?.logMessages ?? []);
      for (const e of events) {
        if (e.name === "BidPlaced") out.push({ bidder: addr(e.data.bidder), amountUsd: price(e.data.amount), at: new Date((s.blockTime ?? 0) * 1000).toISOString(), signature: s.signature });
      }
      if (events.some((e) => e.name === "AuctionCreated")) return out;
    }
    if (sigs.length < PAGE) return out;
    before = sigs[sigs.length - 1].signature;
  }
  return out;
}

// 一筆託管程序交易裡的事件，給通知用。出價事件不帶前一位最高出價者，從 bid 指令的 prev_bidder 帳戶讀
export type TxEvent =
  | { name: "BidPlaced"; asset: string; bidder: string; amountUsd: number; prevBidder: string | null }
  | { name: "Sold"; asset: string; seller: string; buyer: string; priceUsdt: number };

// 讀 IDL 原始的 JSON（帳戶名是 snake_case，和型別檔的 camelCase 不同）
const RAW_IDL = idl as unknown as { address: string; instructions: { name: string; discriminator: number[]; accounts: { name: string }[] }[] };
const BID_IX = RAW_IDL.instructions.find((i) => i.name === "bid")!;
const PREV_BIDDER = BID_IX.accounts.findIndex((a) => a.name === "prev_bidder");
const PROGRAM_ID = new PublicKey(RAW_IDL.address);

export async function marketTxEvents(signature: string): Promise<TxEvent[]> {
  const tx = await withRetry(() => connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }));
  if (!tx || tx.meta?.err) return [];
  const message = tx.transaction.message;
  const keys = message.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses });
  const bidIx = message.compiledInstructions.find((ix) => keys.get(ix.programIdIndex)?.equals(PROGRAM_ID) && BID_IX.discriminator.every((b, i) => ix.data[i] === b));
  const prevBidder = bidIx ? (keys.get(bidIx.accountKeyIndexes[PREV_BIDDER])?.toBase58() ?? null) : null;
  return marketEvents(tx.meta?.logMessages ?? []).flatMap((e): TxEvent[] => {
    if (e.name === "BidPlaced") return [{ name: "BidPlaced", asset: addr(e.data.asset), bidder: addr(e.data.bidder), amountUsd: price(e.data.amount), prevBidder }];
    if (e.name === "Sold") return [{ name: "Sold", asset: addr(e.data.asset), seller: addr(e.data.seller), buyer: addr(e.data.buyer), priceUsdt: price(e.data.price) }];
    return [];
  });
}

// 託管程序在 until 之後的每一筆成交（一口價的 Sold、有得標者的 AuctionSettled），舊的在前。
// newest 是處理到的最新簽名，下次從它之後讀；節點還沒收錄的交易停在它前面，下次再讀
export type MarketTrade = { signature: string; asset: string; kind: "buy" | "auction"; seller: string; buyer: string; paymentMint: string; priceUsdt: number; feeUsdt: number; at: Date };
const SIG_PAGE = 1000;

export async function marketTradesSince(until: string | null): Promise<{ trades: MarketTrade[]; newest: string | null }> {
  const sigs = [];
  for (let before: string | undefined; ;) {
    const page = await withRetry(() => connection.getSignaturesForAddress(PROGRAM_ID, { limit: SIG_PAGE, before, until: until ?? undefined }));
    sigs.push(...page);
    if (page.length < SIG_PAGE) break;
    before = page[page.length - 1].signature;
  }
  sigs.reverse();
  const trades: MarketTrade[] = [];
  let newest = until;
  for (let i = 0; i < sigs.length; i += PAGE) {
    const chunk = sigs.slice(i, i + PAGE);
    const ok = chunk.filter((s) => !s.err).map((s) => s.signature);
    const bySig = ok.length ? await withRetry(() => transactions(ok)) : new Map();
    for (const s of chunk) {
      if (s.err) {
        newest = s.signature;
        continue;
      }
      const tx = bySig.get(s.signature);
      if (!tx) return { trades, newest };
      const at = new Date((s.blockTime ?? 0) * 1000);
      for (const e of marketEvents(tx.meta?.logMessages ?? [])) {
        if (e.name !== "Sold" && e.name !== "AuctionSettled") continue;
        const base = { signature: s.signature, asset: addr(e.data.asset), seller: addr(e.data.seller), priceUsdt: price(e.data.price), feeUsdt: price(e.data.fee), at };
        if (e.name === "Sold") trades.push({ ...base, kind: "buy", buyer: addr(e.data.buyer), paymentMint: addr(e.data.payment_mint) });
        if (e.name === "AuctionSettled" && e.data.winner)
          trades.push({ ...base, kind: "auction", buyer: addr(e.data.winner), paymentMint: e.data.payment_mint ? addr(e.data.payment_mint) : "" });
      }
      newest = s.signature;
    }
  }
  return { trades, newest };
}
