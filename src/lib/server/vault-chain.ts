import "server-only";
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
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
import { getVaultRow, markBurned, vaultRows } from "./vault-cards";

// 金庫卡的鏈上交易。伺服器組好交易、設好手續費付款人，錢包只負責簽名發送；
// 需要平台簽名的部分（例如提貨時平台當凍結代理）由伺服器先簽

export const USDT_DECIMALS = 6;
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
const configPda = () => new PublicKey(CHAIN.market!.config);
const vaultCollection = () => new PublicKey(CHAIN.vaultCollection);
export const listingPda = (asset: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("listing"), asset.toBuffer()], program.programId)[0];
const coreAccounts = () => ({ config: configPda(), collection: vaultCollection(), mplCoreProgram: MPL_CORE_ID, systemProgram: SystemProgram.programId });

export type VaultCardState = {
  owner: string;
  // 在託管程序裡掛單時：賣家和價格（USDT）
  listing: { seller: string; priceUsdt: number } | null;
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

async function readVaultState() {
  const umi = platformUmi();
  const db = await getDb();
  if (!umi || !db) return {};
  const rows = await vaultRows(db);
  if (!rows.length) return {};
  const ids = rows.map((r) => r.id);
  const assets = rows.map((r) => new PublicKey(r.asset));
  const [existing, listings] = await Promise.all([
    connection.getMultipleAccountsInfo(assets),
    connection.getMultipleAccountsInfo(assets.map(listingPda)),
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
  const parsed = live.length ? await fetchAllAssetV1(umi, live.map((a) => publicKey(a.toBase58()))) : [];
  const byAddress = new Map(parsed.map((a) => [a.publicKey.toString(), a]));
  const out: Record<string, VaultCardState> = {};
  ids.forEach((id, i) => {
    const asset = byAddress.get(assets[i].toBase58());
    const raw = listings[i];
    const listing = raw ? program.coder.accounts.decode("listing", raw.data) : null;
    out[id] = {
      owner: asset?.owner.toString() ?? "",
      listing: listing ? { seller: listing.seller.toBase58(), priceUsdt: Number(listing.price) / 10 ** USDT_DECIMALS } : null,
      redeeming: Boolean(asset?.freezeDelegate?.frozen),
      burned: tombstone[i],
    };
  });
  return out;
}

// 組一筆由用戶付手續費的交易，回傳 base64，錢包簽名後送出
async function forUser(user: PublicKey, ixs: TransactionInstruction[], cosign: Keypair[] = []) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: user, blockhash, lastValidBlockHeight }).add(...ixs);
  if (cosign.length) tx.partialSign(...cosign);
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
  const mint = usdtMint();
  const ix = await program.methods
    .buy(new anchor.BN(Math.round(listing.priceUsdt * 10 ** USDT_DECIMALS)))
    .accountsPartial({
      buyer,
      seller,
      listing: listingPda(asset),
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
  return forUser(buyer, [ix]);
}

// 簽名人佔位：交易由伺服器組、錢包簽，組指令時只需要公鑰
const signerOf = (key: PublicKey) => ({ publicKey: publicKey(key.toBase58()), signMessage: async () => new Uint8Array(), signTransaction: async <T,>(t: T) => t, signAllTransactions: async <T,>(t: T[]) => t });

export async function buildList(cardId: string, seller: PublicKey, priceUsdt: number) {
  const asset = await cardAsset(cardId);
  const ix = await program.methods
    .list(new anchor.BN(Math.round(priceUsdt * 10 ** USDT_DECIMALS)))
    .accountsPartial({ seller, listing: listingPda(asset), asset, paymentMint: usdtMint(), ...coreAccounts() })
    .instruction();
  return forUser(seller, [ix]);
}

export async function buildCancel(cardId: string, seller: PublicKey) {
  const asset = await cardAsset(cardId);
  const ix = await program.methods.cancel().accountsPartial({ seller, listing: listingPda(asset), asset, ...coreAccounts() }).instruction();
  return forUser(seller, [ix]);
}

export const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const redeemMemo = (cardId: string) => `idolca:redeem:${cardId}`;

// 申請提貨：持有人簽名，把銷毀權委託給平台，並以平台為凍結代理立即凍結（之後不能轉手或掛單）；
// 同一筆交易把運費轉給平台，備註寫卡片 id，確認時對帳
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
        payer: ownerSigner,
      }).getInstructions()
    : addPlugin(umi, {
        asset: asset.publicKey,
        collection: collection.publicKey,
        plugin: { type: "BurnDelegate", authority: { type: "Address", address: umi.identity.publicKey } },
        authority: ownerSigner,
        payer: ownerSigner,
      }).getInstructions();
  const ixs = [
    ...burnIxs,
    ...freezeAsset(umi, { asset, collection, delegate: umi.identity.publicKey, authority: ownerSigner }).getInstructions(),
  ].map(toWeb3JsInstruction);
  // freezeAsset 以平台為付款人（新增插件的租金），所以平台先簽一份
  const me = platform()!;
  if (feeUsdt > 0) {
    const mint = usdtMint();
    ixs.push(
      createTransferCheckedInstruction(getAssociatedTokenAddressSync(mint, owner), mint, getAssociatedTokenAddressSync(mint, me.publicKey), owner, BigInt(Math.round(feeUsdt * 10 ** USDT_DECIMALS)), USDT_DECIMALS),
      new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(redeemMemo(cardId), "utf8") }),
    );
  }
  const needsPlatform = ixs.some((ix) => ix.keys.some((k) => k.isSigner && k.pubkey.equals(me.publicKey)));
  return forUser(owner, ixs, needsPlatform ? [me] : []);
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
