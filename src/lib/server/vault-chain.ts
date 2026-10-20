import "server-only";
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, VersionedTransaction, type AccountInfo } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { lamports, publicKey } from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { toWeb3JsInstruction } from "@metaplex-foundation/umi-web3js-adapters";
import { addPlugin, approvePluginAuthority, burn, deserializeAssetV1, fetchAsset, fetchCollection, freezeAsset, revokePluginAuthority, thawAsset } from "@metaplex-foundation/mpl-core";
import { CHAIN } from "@/lib/chain";
import idl from "@/lib/chain/idl/idolca_market.json";
import type { IdolcaMarket } from "@/lib/chain/idl/idolca_market";
import { and, eq, inArray, isNotNull, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { SERVER_RPC, platformSecret, platformUmi } from "./chain";
import { getDb, type Db } from "./db";
import { getFees } from "./fees";
import { notify, usersByWallet, vaultCard, type Notice } from "./notifications";
import { allow } from "./rate-limit";
import { vaultCards, vaultChainState } from "./schema";
import { getVaultRow, markBurned } from "./vault-cards";
import { auctionView, listingView, marketColumns, sameMarket, stateOfRow, type AssetColumns, type RawAuction, type RawListing, type VaultAuction, type VaultCardState } from "@/lib/vault-state";
import { COINS, COIN_DECIMALS, coinMints, type Coin } from "@/lib/coins";

// 金庫卡的鏈上交易。伺服器組好交易，錢包只負責簽名發送。手續費、帳戶租金和 Core 轉移的費用一律由平台錢包付，
// 用戶的錢包只要有 USDT 或 USDC 就能交易；需要平台簽名的部分（付手續費、提貨時當凍結代理）由伺服器先簽

export const USDT_DECIMALS = COIN_DECIMALS;
const MPL_CORE_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");

export const connection = new Connection(SERVER_RPC, "confirmed");

let platformKeypair: Keypair | null | undefined;
export function platform() {
  if (platformKeypair !== undefined) return platformKeypair;
  const secret = platformSecret();
  return (platformKeypair = secret ? Keypair.fromSecretKey(secret) : null);
}

// 只用來組指令，不靠它簽名
const program = new anchor.Program<IdolcaMarket>(idl as IdolcaMarket, { connection } as anchor.Provider);

export const marketReady = () => Boolean(CHAIN.market && platform());
const usdtMint = () => new PublicKey(CHAIN.market!.usdtMint);
// 結算代幣：兩種的地址、讀餘額、按餘額挑一種付款
export const mintOf = (coin: Coin) => new PublicKey(coinMints()[coin]!);
export const coinOfMint = (mint: string) => COINS().find((c) => coinMints()[c] === mint) ?? null;
export async function tokenBalances(owner: PublicKey) {
  const out = { usdt: 0, usdc: 0 } as Record<Coin, number>;
  await Promise.all(
    COINS().map(async (c) => {
      const b = await connection.getTokenAccountBalance(getAssociatedTokenAddressSync(mintOf(c), owner, true)).catch(() => null);
      out[c] = Number(b?.value.uiAmount ?? 0);
    }),
  );
  return out;
}
// 錢包裡夠付這筆的那種；兩種都夠時用餘額多的，都不夠時丟 insufficient_funds（不讓錢包簽一筆注定失敗的交易）
export async function pickCoin(owner: PublicKey, amountUsd: number): Promise<Coin> {
  const b = await tokenBalances(owner);
  const enough = COINS().filter((c) => b[c] + 1e-9 >= amountUsd);
  if (!enough.length) throw new Error("insufficient_funds");
  return enough.sort((x, y) => b[y] - b[x])[0];
}
const configPda = () => new PublicKey(CHAIN.market!.config);
const vaultCollection = () => new PublicKey(CHAIN.vaultCollection);
export const listingPda = (asset: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("listing"), asset.toBuffer()], program.programId)[0];
export const auctionPda = (asset: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("auction"), asset.toBuffer()], program.programId)[0];
const auctionConfigPda = () => PublicKey.findProgramAddressSync([Buffer.from("auction_config")], program.programId)[0];
const coreAccounts = () => ({ config: configPda(), collection: vaultCollection(), mplCoreProgram: MPL_CORE_ID, systemProgram: SystemProgram.programId });
const tokenAccounts = () => ({ tokenProgram: TOKEN_PROGRAM_ID, associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID });
const UNIT = 10 ** USDT_DECIMALS;
const toUnits = (usd: number) => new anchor.BN(Math.round(usd * UNIT));

export type { VaultAuction, VaultCardState } from "@/lib/vault-state";

// 鏈上狀態索引：每張金庫卡在 vault_chain_state 有一列（持有人、掛單、拍賣、提貨凍結、已銷毀），列表、/api/chain/state 和後台都讀這張表，不每次掃整條鏈。
// 索引有三個來源：
// 1. 組交易、確認交易，以及平台自己送的交易（鑄造、卡包轉移、出貨、結標）之後，即時讀那幾張卡並寫回（readCardStates）
// 2. 託管程序的掛單和拍賣帳戶整批讀（每種一次 getProgramAccounts，成本跟在架的數量走，和卡的總數無關），和索引不一致的卡即時重讀（syncMarket）
// 3. 持有人、凍結、銷毀在託管程序以外也會變（錢包之間直接轉手、用別的工具提貨），從最久沒核對的卡開始輪流重讀資產（sweep）；
//    每日排程掃一遍全部：RPC 支援 DAS 時用 getAssetsByGroup 找出變了的卡再重讀，不支援就逐批重讀全部
// 寫入都帶條件：資產和掛單拍賣兩組欄位各記核對時間，只蓋掉開始讀鏈之前核對的那組，較晚開始的讀取先寫進去的不會被較舊的結果蓋掉

type CardRef = { id: string; asset: string; burnedAt: Date | null };
// 資產帳戶讀到的狀態；null 是讀不到（剛鑄造、節點還沒同步），不算銷毀，也不寫進索引
type ChainRead = { card: CardRef; asset: AssetColumns | null; listing?: RawListing | null; auction?: RawAuction | null };

// RPC 一次最多讀 100 個帳戶，超過時分批讀，結果按原順序接起來（資料庫的 IN 查詢也用它分批）
const RPC_BATCH = 100;
async function inBatches<K, V>(keys: K[], read: (batch: K[]) => Promise<V[]>, size = RPC_BATCH) {
  const out: V[] = [];
  for (let i = 0; i < keys.length; i += size) out.push(...(await read(keys.slice(i, i + size))));
  return out;
}

function decodeOrNull<T>(name: "listing" | "auction", data: Buffer): T | null {
  try {
    return program.coder.accounts.decode(name, data) as T;
  } catch {
    return null;
  }
}

type ListingAccount = { seller: PublicKey; asset: PublicKey; price: anchor.BN; rentPayer: PublicKey };
type AuctionAccount = {
  seller: PublicKey;
  asset: PublicKey;
  startPrice: anchor.BN;
  reservePrice: anchor.BN;
  endTs: anchor.BN;
  highBidder: PublicKey;
  highBid: anchor.BN;
  highBidMint: PublicKey;
  bidCount: number;
  rentPayer: PublicKey;
  feeBps: number;
};

// 讀不了的是舊版帳戶（程序升級前建立、等遷移），當作沒有
function listingOf(data: Buffer): { asset: string; raw: RawListing } | null {
  const l = decodeOrNull<ListingAccount>("listing", data);
  return l && { asset: l.asset.toBase58(), raw: { seller: l.seller.toBase58(), price: Number(l.price), rentPayer: l.rentPayer.toBase58() } };
}
function auctionOf(data: Buffer): { asset: string; raw: RawAuction } | null {
  const a = decodeOrNull<AuctionAccount>("auction", data);
  if (!a) return null;
  const raw = {
    seller: a.seller.toBase58(),
    startPrice: Number(a.startPrice),
    reservePrice: Number(a.reservePrice),
    endTs: Number(a.endTs),
    highBidder: a.highBidder.toBase58(),
    highBid: Number(a.highBid),
    highBidMint: a.highBidMint.toBase58(),
    bidCount: a.bidCount,
    rentPayer: a.rentPayer.toBase58(),
    feeBps: a.feeBps,
  };
  return { asset: a.asset.toBase58(), raw };
}

// Core 銷毀資產後會留一個 1 位元組的墓碑帳戶，第一個位元組不是 AssetV1（1）就當作已銷毀
function assetOf(address: string, acc: AccountInfo<Buffer> | null): AssetColumns | null {
  if (!acc) return null;
  if (acc.data.length <= 1 || acc.data[0] !== 1) return { owner: "", redeeming: false, burned: true };
  const a = deserializeAssetV1({ publicKey: publicKey(address), owner: publicKey(acc.owner.toBase58()), lamports: lamports(acc.lamports), executable: acc.executable, data: acc.data });
  return { owner: a.owner.toString(), redeeming: Boolean(a.freezeDelegate?.frozen), burned: false };
}

// 讀一批卡的鏈上帳戶：資產；market 時連掛單和拍賣帳戶（每張卡三個帳戶，100 個一批）
async function readChain(cards: CardRef[], market: boolean): Promise<ChainRead[]> {
  const keys = cards.flatMap((c) => {
    const a = new PublicKey(c.asset);
    return market ? [a, listingPda(a), auctionPda(a)] : [a];
  });
  const accounts = await inBatches(keys, (k) => connection.getMultipleAccountsInfo(k));
  const n = market ? 3 : 1;
  return cards.map((card, i) => {
    const [asset, listing, auction] = accounts.slice(i * n, i * n + n);
    const read: ChainRead = { card, asset: assetOf(card.asset, asset) };
    if (market) {
      read.listing = listing ? (listingOf(listing.data)?.raw ?? null) : null;
      read.auction = auction ? (auctionOf(auction.data)?.raw ?? null) : null;
    }
    return read;
  });
}

// 已有的列：那組欄位的核對時間早於 startedAt 才換成這次讀到的值（UPDATE 裡的每個運算式看到的都是舊值，順序無所謂）
const ASSET_COLUMNS = { owner: "owner", redeeming: "redeeming", burned: "burned", syncedAt: "synced_at" };
const MARKET_COLUMNS = {
  listingSeller: "listing_seller",
  listingPriceCents: "listing_price_cents",
  listingRentPayer: "listing_rent_payer",
  auctionSeller: "auction_seller",
  auctionEndsAt: "auction_ends_at",
  auction: "auction",
  marketSyncedAt: "market_synced_at",
};
const guarded = (columns: Record<string, string>, stamp: string, startedAt: Date) => {
  const older = sql`coalesce(${sql.raw(`vault_chain_state.${stamp}`)}, 'epoch') < ${startedAt.toISOString()}::timestamptz`;
  return Object.fromEntries(Object.entries(columns).map(([key, col]) => [key, sql`CASE WHEN ${older} THEN ${sql.raw(`excluded.${col}`)} ELSE ${sql.raw(`vault_chain_state.${col}`)} END`]));
};

// 寫回索引，startedAt 是開始讀鏈的時間。讀不到資產的只寫掛單和拍賣（新列的持有人先空著、核對時間記成最早，輪流核對時最先重讀）。
// 鏈上已銷毀但表裡還沒記的（例如用別的工具提貨），按銷毀交易（資產的最後一筆交易）的時間補記，之後不再讀它
async function writeReads(db: Db, reads: ChainRead[], startedAt: Date) {
  for (const [withAsset, withMarket] of [
    [true, true],
    [true, false],
    [false, true],
  ]) {
    const group = reads.filter((r) => Boolean(r.asset) === withAsset && (r.listing !== undefined) === withMarket);
    const values = group.map((r) => ({
      cardId: r.card.id,
      ...(r.asset ?? { owner: "", redeeming: false, burned: false }),
      syncedAt: r.asset ? startedAt : new Date(0),
      ...(withMarket ? { ...marketColumns(r.listing ?? null, r.auction ?? null), marketSyncedAt: startedAt } : {}),
    }));
    const set = { ...(withAsset ? guarded(ASSET_COLUMNS, "synced_at", startedAt) : {}), ...(withMarket ? guarded(MARKET_COLUMNS, "market_synced_at", startedAt) : {}) };
    await inBatches(values, (v) => db.insert(vaultChainState).values(v).onConflictDoUpdate({ target: vaultChainState.cardId, set }).then(() => []), 500);
  }
  await Promise.all(
    reads
      .filter((r) => r.asset?.burned && !r.card.burnedAt)
      .map((r) =>
        connection
          .getSignaturesForAddress(new PublicKey(r.card.asset), { limit: 1 })
          .then((sigs) => markBurned(db, r.card.id, sigs[0]?.blockTime ? new Date(sigs[0].blockTime * 1000) : new Date()))
          .catch((err) => console.error("mark burned failed", r.card.id, err)),
      ),
  );
  invalidateVaultState();
}

// 即時讀這幾張卡（資產、掛單、拍賣）並寫回索引，回傳鏈上此刻的狀態（掛單價格是鏈上的原值）。寫索引失敗不影響回傳，之後的同步會補上
async function freshStates(db: Db, cards: CardRef[]) {
  const startedAt = new Date();
  const reads = await readChain(cards, true);
  await writeReads(db, reads, startedAt).catch((err) => console.error("write vault state failed", err));
  const out: Record<string, VaultCardState> = {};
  for (const r of reads) {
    const a = r.asset ?? { owner: "", redeeming: false, burned: false };
    out[r.card.id] = { owner: a.owner, listing: r.listing ? listingView(r.listing) : null, auction: r.auction ? auctionView(r.auction) : null, redeeming: a.redeeming, burned: a.burned };
  }
  return out;
}

const cardRef = { id: vaultCards.id, asset: vaultCards.asset, burnedAt: vaultCards.burnedAt };

// 組交易、確認交易，以及平台送出交易之後用：即時讀鏈上的狀態，順便更新索引。不在資料庫裡的卡不在結果裡
export async function readCardStates(cardIds: string[]): Promise<Record<string, VaultCardState>> {
  const db = await getDb();
  if (!db || !cardIds.length) return {};
  return freshStates(db, await db.select(cardRef).from(vaultCards).where(inArray(vaultCards.id, cardIds)));
}
export const readCardState = async (cardId: string): Promise<VaultCardState | null> => (await readCardStates([cardId]))[cardId] ?? null;
// 平台自己的交易確認後刷新那幾張卡；讀不到不影響呼叫端（之後的同步會補上）
export const refreshCardStates = (cardIds: string[]) =>
  readCardStates(cardIds).catch((err) => {
    console.error("refresh vault state failed", cardIds, err);
    return {} as Record<string, VaultCardState>;
  });

// 從索引讀狀態。還沒有索引的卡（新資料庫、剛加上索引）當場即時讀一批補上，其餘的交給 syncVaultIndex
const BOOTSTRAP_INLINE = 100;
async function indexedStates(db: Db, where: SQL | undefined) {
  const rows = await db
    .select({ ...cardRef, s: vaultChainState })
    .from(vaultCards)
    .leftJoin(vaultChainState, eq(vaultChainState.cardId, vaultCards.id))
    .where(where);
  const now = Date.now();
  const out: Record<string, VaultCardState> = {};
  for (const r of rows) if (r.s) out[r.id] = stateOfRow(r.s, now);
  const missing = rows.filter((r) => !r.s).slice(0, BOOTSTRAP_INLINE);
  if (missing.length) Object.assign(out, await freshStates(db, missing));
  return out;
}

// 所有還在金庫裡的卡（已提貨銷毀的不算）的鏈上狀態，從索引讀，每個實例快取 10 秒
let stateCache: { at: number; value: Promise<Record<string, VaultCardState>> } | null = null;
export function vaultState(): Promise<Record<string, VaultCardState>> {
  if (stateCache && Date.now() - stateCache.at < 10_000) return stateCache.value;
  const value = getDb()
    .then((db) => (db ? indexedStates(db, isNull(vaultCards.burnedAt)) : {}))
    .catch((err) => {
      stateCache = null;
      throw err;
    });
  stateCache = { at: Date.now(), value };
  return value;
}
const invalidateVaultState = () => {
  stateCache = null;
};

// 幾張卡的狀態，從索引讀：顯示和篩選用；要求正確的地方（組交易、確認、轉移前檢查）用 readCardStates
export async function cardStates(cardIds: string[]): Promise<Record<string, VaultCardState>> {
  const db = await getDb();
  if (!db || !cardIds.length) return {};
  return Object.assign({}, ...(await inBatches(cardIds, async (ids) => [await indexedStates(db, inArray(vaultCards.id, ids))], 1000)));
}

// 託管程序裡所有的掛單和拍賣（每種一次 getProgramAccounts）對照索引：鏈上在架、或索引記著在架的卡，兩邊不一致就即時重讀。
// 測試環境和線上共用 devnet 的託管程序，不在這個資料庫的卡跳過；一次最多重讀 MARKET_REREAD 張，其餘下次
const MARKET_REREAD = 330;
async function programAccounts<T>(name: "listing" | "auction", decode: (data: Buffer) => { asset: string; raw: T } | null) {
  const accounts = await connection.getProgramAccounts(program.programId, { filters: [{ memcmp: program.coder.accounts.memcmp(name) }] });
  const out = new Map<string, T>();
  for (const { account } of accounts) {
    const v = decode(account.data);
    if (v) out.set(v.asset, v.raw);
  }
  return out;
}
async function syncMarket(db: Db) {
  const [listings, auctions] = await Promise.all([programAccounts("listing", listingOf), programAccounts("auction", auctionOf)]);
  const rows = () => db.select({ ...cardRef, s: vaultChainState }).from(vaultCards).leftJoin(vaultChainState, eq(vaultChainState.cardId, vaultCards.id));
  const assets = [...new Set([...listings.keys(), ...auctions.keys()])];
  const onChain = await inBatches(assets, (batch) => rows().where(and(inArray(vaultCards.asset, batch), isNull(vaultCards.burnedAt))), 1000);
  const indexed = await rows().where(and(isNull(vaultCards.burnedAt), or(isNotNull(vaultChainState.listingSeller), isNotNull(vaultChainState.auctionSeller))));
  const changed = new Map<string, CardRef>();
  for (const c of [...onChain, ...indexed]) if (!c.s || !sameMarket(c.s, marketColumns(listings.get(c.asset) ?? null, auctions.get(c.asset) ?? null))) changed.set(c.id, c);
  if (changed.size) await freshStates(db, [...changed.values()].slice(0, MARKET_REREAD));
}

// 重讀一批卡：還沒有索引的連掛單和拍賣一起讀，其餘只讀資產（掛單和拍賣由 syncMarket 整批核對）
type DueCard = CardRef & { syncedAt: Date | null };
const dueCard = { ...cardRef, syncedAt: vaultChainState.syncedAt };
async function recheck(db: Db, cards: DueCard[]) {
  const startedAt = new Date();
  const missing = cards.filter((c) => !c.syncedAt);
  const known = cards.filter((c) => c.syncedAt);
  if (missing.length) await freshStates(db, missing);
  if (known.length) await writeReads(db, await readChain(known, false), startedAt);
}

// 輪流核對：還沒有索引的卡在前，其次是最久沒核對的，每次 limit 張
async function sweep(db: Db, limit: number) {
  const due = await db
    .select(dueCard)
    .from(vaultCards)
    .leftJoin(vaultChainState, eq(vaultChainState.cardId, vaultCards.id))
    .where(isNull(vaultCards.burnedAt))
    .orderBy(sql`${vaultChainState.syncedAt} asc nulls first`)
    .limit(limit);
  await recheck(db, due);
}

// DAS（Helius 等 RPC 提供的資產索引）；RPC 不支援這個方法時回傳 null
async function das<T>(method: string, params: object): Promise<T | null> {
  const res = await fetch(SERVER_RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }) });
  const body = (await res.json().catch(() => null)) as { result?: T; error?: { code: number; message: string } } | null;
  if (body?.result) return body.result;
  if (body?.error?.code === -32601) return null;
  throw new Error(`das ${method} failed: ${body?.error?.message ?? res.status}`);
}

// 全部核對一遍（每日排程）。DAS 一頁列 1000 張整個集合，和索引不一致的卡（持有人、凍結、銷毀）即時重讀確認（DAS 比鏈上晚幾秒，不直接寫它的值），
// 一致的只更新核對時間（記成 DAS_LAG_MS 之前，DAS 至少反映到那時）；DAS 沒列出的卡（剛鑄造、還沒進它的索引）留給輪流核對。
// RPC 不支援 DAS 時按卡片 id 逐批重讀全部
const DAS_PAGE = 1000;
const DAS_LAG_MS = 120_000;
async function sweepAll(db: Db) {
  const startedAt = new Date();
  const checkedAt = new Date(startedAt.getTime() - DAS_LAG_MS);
  const rows = await db
    .select({ ...dueCard, owner: vaultChainState.owner, redeeming: vaultChainState.redeeming, burned: vaultChainState.burned })
    .from(vaultCards)
    .leftJoin(vaultChainState, eq(vaultChainState.cardId, vaultCards.id))
    .where(isNull(vaultCards.burnedAt));
  const byAsset = new Map(rows.map((r) => [r.asset, r]));
  type DasAsset = { id: string; burnt: boolean; ownership: { owner: string }; plugins?: { freeze_delegate?: { data?: { frozen?: boolean } } } };
  const changed: DueCard[] = [];
  const same: string[] = [];
  for (let page = 1; ; page++) {
    const res = await das<{ items: DasAsset[] }>("getAssetsByGroup", {
      groupKey: "collection",
      groupValue: CHAIN.vaultCollection,
      page,
      limit: DAS_PAGE,
      sortBy: { sortBy: "id", sortDirection: "asc" },
    });
    if (!res) {
      for (let i = 0; i < rows.length; i += 1000) await recheck(db, rows.slice(i, i + 1000));
      return;
    }
    for (const a of res.items) {
      const r = byAsset.get(a.id);
      if (!r) continue;
      const owner = a.burnt ? "" : a.ownership.owner;
      const frozen = !a.burnt && Boolean(a.plugins?.freeze_delegate?.data?.frozen);
      if (r.syncedAt && r.owner === owner && r.redeeming === frozen && r.burned === a.burnt) same.push(r.id);
      else changed.push(r);
    }
    if (res.items.length < DAS_PAGE) break;
  }
  await recheck(db, changed);
  const touch = (ids: string[]) => db.update(vaultChainState).set({ syncedAt: checkedAt }).where(and(inArray(vaultChainState.cardId, ids), lt(vaultChainState.syncedAt, checkedAt)));
  await inBatches(same, (ids) => touch(ids).then(() => []), 1000);
}

// 讓索引跟上不是我們送的交易。/api/chain/state 回應後呼叫，每個實例、也跨實例節流（計數在 rate_limits）：掛單和拍賣最多每 20 秒核對一次，
// 輪流核對最多每分鐘一批 SWEEP_CARDS 張。每日排程以 full 呼叫，不節流，全部核對一遍
const MARKET_SECS = 20;
const SWEEP_SECS = 60;
const SWEEP_CARDS = 300;
let marketAt = 0;
let sweepAt = 0;
let indexing: Promise<void> | null = null;
export async function syncVaultIndex(full = false) {
  const db = await getDb();
  if (!db || !marketReady()) return;
  if (full) {
    await syncMarket(db);
    await sweepAll(db);
    return;
  }
  indexing ??= (async () => {
    const now = Date.now();
    if (now - marketAt >= MARKET_SECS * 1000) {
      marketAt = now;
      if (await allow(db, "vault-index:market", 1, MARKET_SECS)) await syncMarket(db);
    }
    if (now - sweepAt >= SWEEP_SECS * 1000) {
      sweepAt = now;
      if (await allow(db, "vault-index:sweep", 1, SWEEP_SECS)) await sweep(db, SWEEP_CARDS);
    }
  })().finally(() => (indexing = null));
  return indexing;
}

// 組一筆讓用戶簽名的交易，回傳 base64，錢包簽名後送出。手續費由平台付，平台和其他共同簽名者先簽。
// 先模擬一次：失敗的交易照樣要付手續費，所以會失敗的（多半是餘額不夠）不交給錢包
export async function forUser(ixs: TransactionInstruction[], cosign: Keypair[] = []) {
  const me = platform()!;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: me.publicKey, blockhash, lastValidBlockHeight }).add(...ixs);
  const sim = await connection.simulateTransaction(new VersionedTransaction(tx.compileMessage()), { sigVerify: false, commitment: "confirmed" });
  if (sim.value.err) {
    const logs = sim.value.logs ?? [];
    console.error("simulation failed", JSON.stringify(sim.value.err), logs.slice(-6));
    throw new Error(logs.some((l) => /insufficient (funds|lamports)/i.test(l)) ? "insufficient_funds" : "tx_rejected");
  }
  tx.partialSign(me, ...cosign);
  return tx.serialize({ requireAllSignatures: false }).toString("base64");
}

// 手續費同步：一口價抽成（鏈上 Config.fee_bps，成交時讀）和拍賣手續費（AuctionConfig.fee_bps，開拍時記到拍賣上）以後台的費率規則為準（getFees），
// 平台是兩個設定的權限持有人。買金庫卡、開拍的交易開頭帶上更新指令（平台本來就先簽），所以成交和開拍一定照組交易當下的費率，促銷開始、結束都不差；
// 沒人交易時由 syncChainFees 單獨送一筆，讓鏈上顯示的費率也跟上。收款錢包和拍賣的其他設定照鏈上原值寫回
type AuctionRules = { feeBps: number; minStart: anchor.BN; minDuration: anchor.BN; maxDuration: anchor.BN; extendSecs: anchor.BN };
type ChainFees = { authority: PublicKey; treasury: PublicKey; feeBps: number; auction: AuctionRules | null };
const CHAIN_FEES_MS = 15_000;
let chainFeesCache: { at: number; value: ChainFees } | null = null;
async function readChainFees(fresh: boolean): Promise<ChainFees> {
  if (!fresh && chainFeesCache && Date.now() - chainFeesCache.at < CHAIN_FEES_MS) return chainFeesCache.value;
  const [config, auctionConfig] = await connection.getMultipleAccountsInfo([configPda(), auctionConfigPda()]);
  if (!config) throw new Error("not_configured");
  const c = program.coder.accounts.decode("config", config.data) as { authority: PublicKey; treasury: PublicKey; feeBps: number };
  const a = auctionConfig ? (program.coder.accounts.decode("auctionConfig", auctionConfig.data) as AuctionRules) : null;
  const auction = a && { feeBps: a.feeBps, minStart: a.minStart, minDuration: a.minDuration, maxDuration: a.maxDuration, extendSecs: a.extendSecs };
  const value = { authority: c.authority, treasury: c.treasury, feeBps: c.feeBps, auction };
  chainFeesCache = { at: Date.now(), value };
  return value;
}

let authorityWarned = false;
// 鏈上和現在費率不一致的設定的更新指令。fresh 時不用快取（組交易時用，鏈上的值以此刻為準）；組出指令後清掉快取，下次重讀
async function feeSyncIxs(which: readonly ("sale" | "auction")[], fresh: boolean) {
  const me = platform()!;
  const [chain, fees] = await Promise.all([readChainFees(fresh), getFees(await getDb())]);
  if (!chain.authority.equals(me.publicKey)) {
    if (!authorityWarned) console.error("market authority is not the platform wallet; fees not synced");
    authorityWarned = true;
    return [];
  }
  const ixs: TransactionInstruction[] = [];
  if (which.includes("sale") && chain.feeBps !== fees.sale.value)
    ixs.push(await program.methods.updateConfig(fees.sale.value, chain.treasury).accountsPartial({ authority: me.publicKey, config: configPda() }).instruction());
  if (which.includes("auction") && chain.auction && chain.auction.feeBps !== fees.auction.value)
    ixs.push(
      await program.methods
        .updateAuctionConfig({ ...chain.auction, feeBps: fees.auction.value })
        .accountsPartial({ authority: me.publicKey, config: configPda(), auctionConfig: auctionConfigPda() })
        .instruction(),
    );
  if (ixs.length) chainFeesCache = null;
  return ixs;
}

// 把鏈上的手續費設定同步成現在的費率，回傳更新了幾項。每日排程、/api/chain/state 回應後和後台改規則後呼叫；託管程序沒啟用時什麼都不做。
// 同一實例同時只送一筆；不同實例同時送也沒關係，寫的是同一個值
let syncing: Promise<number> | null = null;
export function syncChainFees(fresh = false) {
  if (!marketReady()) return Promise.resolve(0);
  syncing ??= (async () => {
    const ixs = await feeSyncIxs(["sale", "auction"], fresh);
    if (!ixs.length) return 0;
    const me = platform()!;
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: me.publicKey, blockhash, lastValidBlockHeight }).add(...ixs);
    tx.sign(me);
    const signature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    return ixs.length;
  })().finally(() => (syncing = null));
  return syncing;
}

async function cardAsset(cardId: string) {
  const db = await getDb();
  const row = db ? await getVaultRow(db, cardId) : null;
  if (!row) throw new Error("not_on_chain");
  return new PublicKey(row.asset);
}

// 組交易的函式都由呼叫端傳入剛即時讀到的狀態（readCardState），不用索引
export async function buildBuy(cardId: string, buyer: PublicKey, state: VaultCardState) {
  const asset = await cardAsset(cardId);
  const listing = state.listing;
  if (!listing) throw new Error("not_listed");
  if (listing.seller === buyer.toBase58()) throw new Error("own_listing");
  const seller = new PublicKey(listing.seller);
  const treasury = new PublicKey(CHAIN.market!.treasury);
  const mint = mintOf(await pickCoin(buyer, listing.priceUsdt));
  const ix = await program.methods
    .buy(new anchor.BN(Math.round(listing.priceUsdt * 10 ** USDT_DECIMALS)))
    .accountsPartial({
      buyer,
      payer: platform()!.publicKey,
      seller,
      listing: listingPda(asset),
      rentPayer: new PublicKey(listing.rentPayer),
      asset,
      paymentMint: mint,
      buyerToken: getAssociatedTokenAddressSync(mint, buyer),
      sellerToken: getAssociatedTokenAddressSync(mint, seller),
      treasury,
      treasuryToken: getAssociatedTokenAddressSync(mint, treasury),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      ...coreAccounts(),
    })
    .instruction();
  return forUser([...(await feeSyncIxs(["sale"], true)), ix]);
}

// 簽名人佔位：交易由伺服器組、錢包簽，組指令時只需要公鑰
const signerOf = (key: PublicKey) => ({ publicKey: publicKey(key.toBase58()), signMessage: async () => new Uint8Array(), signTransaction: async <T,>(t: T) => t, signAllTransactions: async <T,>(t: T[]) => t });

// 價格取到分（索引和其他價格都以分計）
export async function buildList(cardId: string, seller: PublicKey, priceUsdt: number) {
  const asset = await cardAsset(cardId);
  const ix = await program.methods
    .list(new anchor.BN(Math.round(priceUsdt * 100) * (10 ** USDT_DECIMALS / 100)))
    .accountsPartial({ seller, payer: platform()!.publicKey, listing: listingPda(asset), asset, ...coreAccounts() })
    .instruction();
  return forUser([ix]);
}

export async function buildCancel(cardId: string, seller: PublicKey, state: VaultCardState) {
  const asset = await cardAsset(cardId);
  const listing = state.listing;
  if (!listing) throw new Error("not_listed");
  const ix = await program.methods
    .cancel()
    .accountsPartial({ seller, payer: platform()!.publicKey, listing: listingPda(asset), rentPayer: new PublicKey(listing.rentPayer), asset, ...coreAccounts() })
    .instruction();
  return forUser([ix]);
}

// 金庫卡拍賣開通了沒有：鏈上的 AuctionConfig 建好了才開放（程序升級、執行 npm run chain:setup-market 之後）。結果快取 1 分鐘
let auctionsCache: { at: number; value: boolean } | null = null;
export async function vaultAuctionsReady() {
  if (!marketReady()) return false;
  if (auctionsCache && Date.now() - auctionsCache.at < 60_000) return auctionsCache.value;
  const value = Boolean(await connection.getAccountInfo(auctionConfigPda()).catch(() => null));
  auctionsCache = { at: Date.now(), value };
  return value;
}

// 開拍：資產轉進拍賣帳戶。reserveUsd 為空表示不設保底價；時長、起標價下限由鏈上的 AuctionConfig 再檢查一次
export async function buildCreateAuction(cardId: string, seller: PublicKey, startUsd: number, reserveUsd: number | null, days: number) {
  const asset = await cardAsset(cardId);
  const auction = auctionPda(asset);
  const ix = await program.methods
    .createAuction(toUnits(startUsd), toUnits(reserveUsd ?? 0), new anchor.BN(days * 86_400))
    .accountsPartial({
      seller,
      payer: platform()!.publicKey,
      auctionConfig: auctionConfigPda(),
      auction,
      ...escrowAccounts(auction),
      asset,
      ...tokenAccounts(),
      ...coreAccounts(),
    })
    .instruction();
  return forUser([...(await feeSyncIxs(["auction"], true)), ix]);
}

// 拍賣帳戶存放兩種幣出價的代幣帳戶
const escrowAccounts = (auction: PublicKey) => ({
  usdtMint: mintOf("usdt"),
  usdcMint: mintOf("usdc"),
  usdtEscrow: getAssociatedTokenAddressSync(mintOf("usdt"), auction, true),
  usdcEscrow: getAssociatedTokenAddressSync(mintOf("usdc"), auction, true),
});

// 出價：全額轉進拍賣帳戶（錢包裡哪種幣夠就用哪種），同一個指令用前一口的幣種退回前一位最高出價者
export async function buildBid(cardId: string, bidder: PublicKey, amountUsd: number, card: VaultCardState) {
  const asset = await cardAsset(cardId);
  const state = card.auction;
  if (!state || state.status !== "live") throw new Error("auction_ended");
  if (state.seller === bidder.toBase58()) throw new Error("own_auction");
  if (state.highBidder === bidder.toBase58()) throw new Error("already_leading");
  if (amountUsd < state.minNextUsd) throw new Error("bid_too_low");
  const auction = auctionPda(asset);
  const mint = mintOf(await pickCoin(bidder, amountUsd));
  const prev = state.highBidder ? new PublicKey(state.highBidder) : bidder;
  const prevMint = state.highBidMint ? new PublicKey(state.highBidMint) : mint;
  const ix = await program.methods
    .bid(toUnits(amountUsd))
    .accountsPartial({
      bidder,
      payer: platform()!.publicKey,
      config: configPda(),
      auctionConfig: auctionConfigPda(),
      auction,
      bidMint: mint,
      bidderToken: getAssociatedTokenAddressSync(mint, bidder),
      bidEscrow: getAssociatedTokenAddressSync(mint, auction, true),
      prevMint,
      prevEscrow: getAssociatedTokenAddressSync(prevMint, auction, true),
      prevBidder: prev,
      prevBidderToken: getAssociatedTokenAddressSync(prevMint, prev, true),
      ...tokenAccounts(),
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return forUser([ix]);
}

export async function buildCancelAuction(cardId: string, seller: PublicKey, card: VaultCardState) {
  const asset = await cardAsset(cardId);
  const auction = auctionPda(asset);
  const state = card.auction;
  if (!state) throw new Error("auction_ended");
  const ix = await program.methods
    .cancelAuction()
    .accountsPartial({ seller, payer: platform()!.publicKey, auction, rentPayer: new PublicKey(state.rentPayer), ...escrowAccounts(auction), asset, tokenProgram: TOKEN_PROGRAM_ID, ...coreAccounts() })
    .instruction();
  return forUser([ix]);
}

// 結標：平台錢包呼叫 settle_auction（任何人都能呼叫，平台負責準時），手續費和新建代幣帳戶的租金由平台付
async function settleVaultAuction(cardId: string, a: VaultAuction) {
  const me = platform()!;
  const asset = await cardAsset(cardId);
  const auction = auctionPda(asset);
  const mint = a.highBidMint ? new PublicKey(a.highBidMint) : mintOf("usdt");
  const seller = new PublicKey(a.seller);
  const high = a.highBidder ? new PublicKey(a.highBidder) : seller;
  const treasury = new PublicKey(CHAIN.market!.treasury);
  const ix = await program.methods
    .settleAuction()
    .accountsPartial({
      cranker: me.publicKey,
      seller,
      highBidder: high,
      auction,
      rentPayer: new PublicKey(a.rentPayer),
      ...escrowAccounts(auction),
      winMint: mint,
      asset,
      sellerToken: getAssociatedTokenAddressSync(mint, seller, true),
      highBidderToken: getAssociatedTokenAddressSync(mint, high, true),
      treasury,
      treasuryToken: getAssociatedTokenAddressSync(mint, treasury),
      ...tokenAccounts(),
      ...coreAccounts(),
    })
    .instruction();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: me.publicKey, blockhash, lastValidBlockHeight }).add(ix);
  tx.sign(me);
  const signature = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return signature;
}

// 結標後通知：有人出價且達到保底價是成交（得標者、賣家），否則流拍（賣家；沒達到保底價的最高出價者款項退回）。
// 以卡和截止時間去重，不同實例重複結標也只通知一次
async function notifySettled(cardId: string, a: VaultAuction) {
  const db = await getDb();
  if (!db) return;
  const { card, href } = await vaultCard(db, cardId);
  const ids = await usersByWallet(db, [a.seller, a.highBidder ?? ""]);
  const seller = ids.get(a.seller);
  const high = a.highBidder ? ids.get(a.highBidder) : undefined;
  const ref = `${cardId}:${a.endsAt}`;
  const price = a.highUsd ?? undefined;
  const sold = a.highBidder !== null && a.reserveMet;
  const notices: Notice[] = [];
  if (sold) {
    if (high) notices.push({ userId: high, kind: "auction_won_vault", params: { card, price }, href, ref });
    if (seller) notices.push({ userId: seller, kind: "auction_sold_vault", params: { card, price }, href, ref });
  } else {
    if (seller) notices.push({ userId: seller, kind: "auction_unsold", params: { card }, href, ref });
    if (high) notices.push({ userId: high, kind: "auction_lost", params: { card }, href, ref });
  }
  await notify(db, notices);
}

// 結標所有已截止的金庫卡拍賣（從索引找截止時間已過的）。同一個伺服器實例裡同一張卡不會同時送兩次；
// 不同實例重複送出時，第二筆會因為拍賣帳戶已關閉而失敗，不影響結果
const settling = new Set<string>();
export async function settleEndedVaultAuctions() {
  const db = await getDb();
  if (!marketReady() || !db) return 0;
  const ended = await db
    .select({ id: vaultChainState.cardId })
    .from(vaultChainState)
    .innerJoin(vaultCards, eq(vaultCards.id, vaultChainState.cardId))
    .where(and(isNotNull(vaultChainState.auctionSeller), lte(vaultChainState.auctionEndsAt, new Date()), isNull(vaultCards.burnedAt)));
  let done = 0;
  for (const { id } of ended) {
    if (settling.has(id)) continue;
    settling.add(id);
    try {
      // 最後幾分鐘有人出價會延後截止，最高出價者也可能剛換人：結標前即時讀一次
      const a = (await readCardState(id))?.auction;
      if (!a || new Date(a.endsAt).getTime() > Date.now()) continue;
      await settleVaultAuction(id, a);
      done++;
      await refreshCardStates([id]);
      await notifySettled(id, a).catch((err) => console.error("notify vault auction failed", id, err));
    } catch (err) {
      console.error("settle vault auction failed", id, err);
    } finally {
      settling.delete(id);
    }
  }
  return done;
}

export const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const redeemMemo = (cardId: string) => `idolca:redeem:${cardId}`;

// 申請提貨：持有人簽名，把銷毀權委託給平台，並以平台為凍結代理立即凍結（之後不能轉手或掛單）；
// 同一筆交易把運費（呼叫端按卡所在的金庫和收件國家用 redeemFeeUsd 算）轉給平台（錢包裡哪種幣夠就用哪種），備註寫卡片 id，確認時對帳。插件的租金由平台付
export async function buildRedeemRequest(cardId: string, owner: PublicKey, feeUsdt: number) {
  const umi = platformUmi()!;
  const asset = await fetchAsset(umi, publicKey((await cardAsset(cardId)).toBase58()));
  const collection = await fetchCollection(umi, publicKey(CHAIN.vaultCollection));
  const ownerSigner = signerOf(owner);
  // 銷毀委託：第一次提貨新增插件；插件已經存在（取消過提貨，委託已交還持有人）就重新委託給平台
  const burnIxs = asset.burnDelegate
    ? approvePluginAuthority(umi, {
        asset: asset.publicKey,
        collection: collection.publicKey,
        plugin: { type: "BurnDelegate" },
        newAuthority: { type: "Address", address: umi.identity.publicKey },
        authority: ownerSigner,
        payer: umi.identity,
      }).getInstructions()
    : addPlugin(umi, {
        asset: asset.publicKey,
        collection: collection.publicKey,
        plugin: { type: "BurnDelegate", authority: { type: "Address", address: umi.identity.publicKey } },
        authority: ownerSigner,
        payer: umi.identity,
      }).getInstructions();
  const ixs = [
    ...burnIxs,
    ...freezeAsset(umi, { asset, collection, delegate: umi.identity.publicKey, authority: ownerSigner }).getInstructions(),
  ].map(toWeb3JsInstruction);
  const me = platform()!;
  if (feeUsdt > 0) {
    const mint = mintOf(await pickCoin(owner, feeUsdt));
    ixs.push(
      createTransferCheckedInstruction(getAssociatedTokenAddressSync(mint, owner), mint, getAssociatedTokenAddressSync(mint, me.publicKey), owner, BigInt(Math.round(feeUsdt * 10 ** USDT_DECIMALS)), USDT_DECIMALS),
      new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(redeemMemo(cardId), "utf8") }),
    );
  }
  return forUser(ixs);
}

// 平台寄出實物：解凍並銷毀，兩步在同一筆交易裡
export async function shipRedemption(cardId: string) {
  const umi = platformUmi()!;
  const asset = await fetchAsset(umi, publicKey((await cardAsset(cardId)).toBase58()));
  const collection = await fetchCollection(umi, publicKey(CHAIN.vaultCollection));
  const { signature } = await thawAsset(umi, { asset, collection, delegate: umi.identity })
    .add(burn(umi, { asset, collection, authority: umi.identity }))
    .sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
  await refreshCardStates([cardId]);
  return base58.deserialize(signature)[0];
}

// 取消提貨：平台解凍並交還凍結委託（thawAsset 已包含），再交還銷毀委託
export async function cancelRedemption(cardId: string) {
  const umi = platformUmi()!;
  const asset = await fetchAsset(umi, publicKey((await cardAsset(cardId)).toBase58()));
  const collection = await fetchCollection(umi, publicKey(CHAIN.vaultCollection));
  const { signature } = await thawAsset(umi, { asset, collection, delegate: umi.identity })
    .add(revokePluginAuthority(umi, { asset: asset.publicKey, collection: collection.publicKey, plugin: { type: "BurnDelegate" }, authority: umi.identity }))
    .sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
  await refreshCardStates([cardId]);
  return base58.deserialize(signature)[0];
}

// 等交易確認；失敗或逾時丟錯
export async function confirmSignature(signature: string) {
  for (let i = 0; i < 30; i++) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const s = value[0];
    if (s?.err) throw new Error("tx_failed");
    if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("tx_timeout");
}

export { createAssociatedTokenAccountIdempotentInstruction, getAssociatedTokenAddressSync, usdtMint };
