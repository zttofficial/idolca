import "server-only";
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, VersionedTransaction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { publicKey } from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { toWeb3JsInstruction } from "@metaplex-foundation/umi-web3js-adapters";
import { addPlugin, approvePluginAuthority, burn, fetchAllAssetV1, fetchAsset, fetchCollection, freezeAsset, revokePluginAuthority, thawAsset } from "@metaplex-foundation/mpl-core";
import { CHAIN } from "@/lib/chain";
import idl from "@/lib/chain/idl/idolca_market.json";
import type { IdolcaMarket } from "@/lib/chain/idl/idolca_market";
import { SERVER_RPC, platformSecret, platformUmi } from "./chain";
import { getDb } from "./db";
import { notify, usersByWallet, vaultCard, type Notice } from "./notifications";
import { getVaultRow, markBurned, vaultRows } from "./vault-cards";
import { minNextBid, type AuctionView } from "@/lib/auction";
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

// 鏈上拍賣的狀態：公開的拍賣資訊，加上賣家、目前最高出價者的錢包和出價幣種、付租金的人（鏈上本來就公開）
export type VaultAuction = AuctionView & { seller: string; highBidder: string | null; highBidMint: string | null; rentPayer: string };

export type VaultCardState = {
  owner: string;
  // 在託管程序裡掛單時：賣家、美元價格（買家用 USDT 或 USDC 付都是這個數）和付租金的人（取消、成交時租金退給它）
  listing: { seller: string; priceUsdt: number; rentPayer: string } | null;
  // 在託管程序裡拍賣時（這時 owner 是拍賣帳戶，卡的主人是 auction.seller）
  auction: VaultAuction | null;
  // 已申請提貨，NFT 凍結中
  redeeming: boolean;
  // 已提貨，NFT 已銷毀
  burned: boolean;
};

// 一次讀回所有金庫卡的資產和掛單帳戶（兩次 getMultipleAccounts），快取 10 秒
let stateCache: { at: number; value: Promise<Record<string, VaultCardState>> } | null = null;
export function vaultState(): Promise<Record<string, VaultCardState>> {
  if (stateCache && Date.now() - stateCache.at < 10_000) return stateCache.value;
  const value = readVaultState().catch((err) => {
    stateCache = null;
    throw err;
  });
  stateCache = { at: Date.now(), value };
  return value;
}
export const invalidateVaultState = () => {
  stateCache = null;
};

// RPC 一次最多讀 100 個帳戶，金庫卡超過 100 張時分批讀，結果按原順序接起來
const RPC_BATCH = 100;
async function inBatches<K, V>(keys: K[], read: (batch: K[]) => Promise<V[]>) {
  const out: V[] = [];
  for (let i = 0; i < keys.length; i += RPC_BATCH) out.push(...(await read(keys.slice(i, i + RPC_BATCH))));
  return out;
}

async function readVaultState() {
  const umi = platformUmi();
  const db = await getDb();
  if (!umi || !db) return {};
  const rows = await vaultRows(db);
  if (!rows.length) return {};
  const ids = rows.map((r) => r.id);
  const assets = rows.map((r) => new PublicKey(r.asset));
  const [existing, listings, auctionAccounts] = await Promise.all([
    inBatches(assets, (k) => connection.getMultipleAccountsInfo(k)),
    inBatches(assets.map(listingPda), (k) => connection.getMultipleAccountsInfo(k)),
    inBatches(assets.map(auctionPda), (k) => connection.getMultipleAccountsInfo(k)),
  ]);
  // Core 銷毀資產後會留一個 1 位元組的墓碑帳戶，第一個位元組不是 AssetV1（1）就當作已銷毀。
  // 帳戶讀不到（剛鑄造、節點還沒同步）不算銷毀
  const alive = existing.map((acc) => Boolean(acc && acc.data.length > 1 && acc.data[0] === 1));
  const tombstone = existing.map((acc, i) => Boolean(acc) && !alive[i]);
  // 鏈上已銷毀但表裡還沒記的（例如用別的工具提貨），按銷毀交易（資產的最後一筆交易）的時間補記，之後不再讀它
  for (const [i, id] of ids.entries()) {
    if (!tombstone[i]) continue;
    connection
      .getSignaturesForAddress(assets[i], { limit: 1 })
      .then((sigs) => markBurned(db, id, sigs[0]?.blockTime ? new Date(sigs[0].blockTime * 1000) : new Date()))
      .catch(() => {});
  }
  const live = assets.filter((_, i) => alive[i]);
  const parsed = await inBatches(live, (k) => fetchAllAssetV1(umi, k.map((a) => publicKey(a.toBase58()))));
  const byAddress = new Map(parsed.map((a) => [a.publicKey.toString(), a]));
  const out: Record<string, VaultCardState> = {};
  ids.forEach((id, i) => {
    const asset = byAddress.get(assets[i].toBase58());
    const raw = listings[i];
    // 讀不了的是舊版帳戶（程序升級前建立、等遷移），當作沒有
    const listing = raw ? decodeOrNull<{ seller: PublicKey; price: anchor.BN; rentPayer: PublicKey }>("listing", raw.data) : null;
    const rawAuction = auctionAccounts[i];
    const auction = rawAuction ? decodeOrNull<AuctionAccount>("auction", rawAuction.data) : null;
    out[id] = {
      owner: asset?.owner.toString() ?? "",
      listing: listing ? { seller: listing.seller.toBase58(), priceUsdt: Number(listing.price) / 10 ** USDT_DECIMALS, rentPayer: listing.rentPayer.toBase58() } : null,
      auction: auction ? decodeAuction(auction) : null,
      redeeming: Boolean(asset?.freezeDelegate?.frozen),
      burned: tombstone[i],
    };
  });
  return out;
}

function decodeOrNull<T>(name: "listing" | "auction", data: Buffer): T | null {
  try {
    return program.coder.accounts.decode(name, data) as T;
  } catch {
    return null;
  }
}

type AuctionAccount = {
  seller: PublicKey;
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

function decodeAuction(a: AuctionAccount): VaultAuction {
  const high = a.bidCount > 0 ? Number(a.highBid) : null;
  const reserve = Number(a.reservePrice);
  const endsAt = Number(a.endTs) * 1000;
  return {
    lane: "vault",
    startUsd: Number(a.startPrice) / UNIT,
    hasReserve: reserve > 0,
    reserveMet: reserve === 0 || (high ?? 0) >= reserve,
    highUsd: high === null ? null : high / UNIT,
    bidCount: a.bidCount,
    // 鏈上以最小單位計算，換成分時無條件進位，顯示的最低出價一定被鏈上接受
    minNextUsd: Math.ceil(minNextBid(high, Number(a.startPrice), UNIT) / (UNIT / 100)) / 100,
    endsAt: new Date(endsAt).toISOString(),
    feeBps: a.feeBps,
    status: endsAt <= Date.now() ? "settling" : "live",
    seller: a.seller.toBase58(),
    highBidder: high === null ? null : a.highBidder.toBase58(),
    highBidMint: high === null ? null : a.highBidMint.toBase58(),
    rentPayer: a.rentPayer.toBase58(),
  };
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

async function cardAsset(cardId: string) {
  const db = await getDb();
  const row = db ? await getVaultRow(db, cardId) : null;
  if (!row) throw new Error("not_on_chain");
  return new PublicKey(row.asset);
}

export async function buildBuy(cardId: string, buyer: PublicKey) {
  const asset = await cardAsset(cardId);
  const listing = (await vaultState())[cardId]?.listing;
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
  return forUser([ix]);
}

// 簽名人佔位：交易由伺服器組、錢包簽，組指令時只需要公鑰
const signerOf = (key: PublicKey) => ({ publicKey: publicKey(key.toBase58()), signMessage: async () => new Uint8Array(), signTransaction: async <T,>(t: T) => t, signAllTransactions: async <T,>(t: T[]) => t });

export async function buildList(cardId: string, seller: PublicKey, priceUsdt: number) {
  const asset = await cardAsset(cardId);
  const ix = await program.methods
    .list(new anchor.BN(Math.round(priceUsdt * 10 ** USDT_DECIMALS)))
    .accountsPartial({ seller, payer: platform()!.publicKey, listing: listingPda(asset), asset, ...coreAccounts() })
    .instruction();
  return forUser([ix]);
}

export async function buildCancel(cardId: string, seller: PublicKey) {
  const asset = await cardAsset(cardId);
  const listing = (await vaultState())[cardId]?.listing;
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
  return forUser([ix]);
}

// 拍賣帳戶存放兩種幣出價的代幣帳戶
const escrowAccounts = (auction: PublicKey) => ({
  usdtMint: mintOf("usdt"),
  usdcMint: mintOf("usdc"),
  usdtEscrow: getAssociatedTokenAddressSync(mintOf("usdt"), auction, true),
  usdcEscrow: getAssociatedTokenAddressSync(mintOf("usdc"), auction, true),
});

// 出價：全額轉進拍賣帳戶（錢包裡哪種幣夠就用哪種），同一個指令用前一口的幣種退回前一位最高出價者
export async function buildBid(cardId: string, bidder: PublicKey, amountUsd: number) {
  const asset = await cardAsset(cardId);
  const state = (await vaultState())[cardId]?.auction;
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

export async function buildCancelAuction(cardId: string, seller: PublicKey) {
  const asset = await cardAsset(cardId);
  const auction = auctionPda(asset);
  const state = (await vaultState())[cardId]?.auction;
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

// 結標所有已截止的金庫卡拍賣。同一個伺服器實例裡同一張卡不會同時送兩次；
// 不同實例重複送出時，第二筆會因為拍賣帳戶已關閉而失敗，不影響結果
const settling = new Set<string>();
export async function settleEndedVaultAuctions() {
  if (!marketReady()) return 0;
  const ended = Object.entries(await vaultState()).filter(([id, s]) => s.auction && new Date(s.auction.endsAt).getTime() <= Date.now() && !settling.has(id));
  let done = 0;
  for (const [id, s] of ended) {
    settling.add(id);
    try {
      await settleVaultAuction(id, s.auction!);
      done++;
      await notifySettled(id, s.auction!).catch((err) => console.error("notify vault auction failed", id, err));
    } catch (err) {
      console.error("settle vault auction failed", id, err);
    } finally {
      settling.delete(id);
    }
  }
  if (done) invalidateVaultState();
  return done;
}

export const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const redeemMemo = (cardId: string) => `idolca:redeem:${cardId}`;

// 申請提貨：持有人簽名，把銷毀權委託給平台，並以平台為凍結代理立即凍結（之後不能轉手或掛單）；
// 同一筆交易把運費轉給平台（錢包裡哪種幣夠就用哪種），備註寫卡片 id，確認時對帳。插件的租金由平台付
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
  invalidateVaultState();
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
  invalidateVaultState();
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
