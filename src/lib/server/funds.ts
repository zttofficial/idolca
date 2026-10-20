import "server-only";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { generateSigner, publicKey } from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { create, fetchAsset, fetchCollection, transfer } from "@metaplex-foundation/mpl-core";
import { toWeb3JsInstruction } from "@metaplex-foundation/umi-web3js-adapters";
import { CHAIN } from "@/lib/chain";
import { COINS, COIN_DECIMALS, type Coin } from "@/lib/coins";
import { collectorCreateArgs, collectorUri, platformUmi, type CollectorAttributes } from "./chain";
import { connection, forUser, mintOf, pickCoin, platform, tokenBalances } from "./vault-chain";

// 平台的資金動作：發測試幣（只有 devnet）、收款（進平台錢包）並驗證、放款、轉移 NFT。
// 收款時用戶錢包裡哪種幣（USDT、USDC）夠就用哪種，退款和放款用原來付的那種；手續費和帳戶租金都由平台付
const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const units = (usd: number) => BigInt(Math.round(usd * 10 ** COIN_DECIMALS));
const memoIx = (memo: string) => new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(memo, "utf8") });
// 從 from 轉 amount 到 to 的代幣帳戶（to 的帳戶由平台付租金建好）
const transferIxs = (coin: Coin, from: PublicKey, to: PublicKey, amountUsd: number, payer: PublicKey) => {
  const mint = mintOf(coin);
  const toAta = getAssociatedTokenAddressSync(mint, to, true);
  return [
    createAssociatedTokenAccountIdempotentInstruction(payer, toAta, to, mint),
    createTransferCheckedInstruction(getAssociatedTokenAddressSync(mint, from, true), mint, toAta, from, units(amountUsd), COIN_DECIMALS),
  ];
};

// 測試幣：一點 SOL（外部錢包做別的事用），加上兩種測試幣各 FAUCET_USD；平台是測試幣的鑄幣權限持有人
export const FAUCET_SOL = 0.02;
export const FAUCET_USD = 500;
export async function sendTestFunds(to: PublicKey) {
  const me = platform()!;
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: me.publicKey, toPubkey: to, lamports: FAUCET_SOL * LAMPORTS_PER_SOL }));
  for (const coin of COINS()) {
    const mint = mintOf(coin);
    const ata = getAssociatedTokenAddressSync(mint, to);
    tx.add(createAssociatedTokenAccountIdempotentInstruction(me.publicKey, ata, to, mint), createMintToInstruction(mint, ata, me.publicKey, units(FAUCET_USD)));
  }
  return sendAndConfirmTransaction(connection, tx, [me], { commitment: "confirmed" });
}

export async function balances(owner: PublicKey) {
  const [lamports, tokens] = await Promise.all([connection.getBalance(owner), tokenBalances(owner)]);
  return { sol: lamports / LAMPORTS_PER_SOL, ...tokens };
}

// 付款交易：用戶把 USDT 或 USDC 轉進平台錢包，備註寫訂單編號，伺服器據此對帳
export async function buildPayment(from: PublicKey, amountUsd: number, memo: string) {
  const coin = await pickCoin(from, amountUsd);
  return forUser([...transferIxs(coin, from, platform()!.publicKey, amountUsd, platform()!.publicKey), memoIx(memo)]);
}

// 對帳：交易成功、備註相符、from 的某種結算代幣少了 amount、平台的同一種多了 amount。回傳付的是哪種，沒對上回 null。
// 手續費由平台付，所以不看簽名者，看代幣是從誰的帳戶轉出的
export async function verifyPayment(signature: string, from: PublicKey, amountUsd: number, memo: string): Promise<Coin | null> {
  for (let i = 0; i < 20; i++) {
    const tx = await connection.getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (tx) {
      const meta = tx.meta;
      if (!meta || meta.err) return null;
      const memos = tx.transaction.message.instructions.filter((ix) => ix.programId.equals(MEMO_PROGRAM)).map((ix) => ("parsed" in ix ? String(ix.parsed) : ""));
      if (!memos.includes(memo)) return null;
      const me = platform()!.publicKey.toBase58();
      const delta = (mint: string, owner: string) => {
        const amount = (list: typeof meta.postTokenBalances) => BigInt((list ?? []).find((b) => b.mint === mint && b.owner === owner)?.uiTokenAmount.amount ?? "0");
        return amount(meta.postTokenBalances) - amount(meta.preTokenBalances);
      };
      const want = units(amountUsd);
      return COINS().find((c) => delta(mintOf(c).toBase58(), me) === want && delta(mintOf(c).toBase58(), from.toBase58()) === -want) ?? null;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

// 交易裡某個錢包自己的簽名（base58）。手續費由平台付，交易編號是平台的簽名、平台事先算得出來；
// 要一個平台算不出來的值（例如卡包抽卡的隨機數）就用付款人自己的簽名
export async function walletSignature(signature: string, wallet: PublicKey) {
  const tx = await connection.getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  const i = tx?.transaction.message.accountKeys.findIndex((k) => k.signer && k.pubkey.equals(wallet)) ?? -1;
  return i >= 0 ? (tx!.transaction.signatures[i] ?? null) : null;
}

// 放款、退款：平台錢包把指定的那種幣轉給收款人
export async function payout(to: PublicKey, amountUsd: number, coin: Coin) {
  const me = platform()!;
  const tx = new Transaction().add(...transferIxs(coin, me.publicKey, to, amountUsd, me.publicKey));
  return sendAndConfirmTransaction(connection, tx, [me], { commitment: "confirmed" });
}

// 擔保交易成交：平台用收藏集合的 PermanentTransferDelegate 把 NFT 轉給買家（賣家不必在線簽名）
export async function transferCollectorNft(asset: string, to: string) {
  const umi = platformUmi()!;
  const a = await fetchAsset(umi, publicKey(asset));
  const collection = await fetchCollection(umi, publicKey(CHAIN.collectorCollection));
  const { signature } = await transfer(umi, { asset: a, collection, newOwner: publicKey(to), authority: umi.identity }).sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
  return base58.deserialize(signature)[0];
}

// 開卡包抽到的卡：平台錢包把那張金庫卡的 NFT 轉給買家（平台是持有人，直接簽名）
export async function transferVaultNft(asset: string, to: string) {
  const umi = platformUmi()!;
  const a = await fetchAsset(umi, publicKey(asset));
  const collection = await fetchCollection(umi, publicKey(CHAIN.vaultCollection));
  const { signature } = await transfer(umi, { asset: a, collection, newOwner: publicKey(to), authority: umi.identity }).sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
  return base58.deserialize(signature)[0];
}

// 簽名人佔位：交易由伺服器組、錢包簽，組指令時只需要公鑰
const signerOf = (key: PublicKey) => ({ publicKey: publicKey(key.toBase58()), signMessage: async () => new Uint8Array(), signTransaction: async <T,>(t: T) => t, signAllTransactions: async <T,>(t: T[]) => t });

// 回購交易：持有人把金庫 NFT 轉給平台（持有人簽），平台用 coin 把貨款轉給持有人（平台先簽）
export async function buildBuybackTx(owner: PublicKey, asset: string, amountUsd: number, coin: Coin) {
  const umi = platformUmi()!;
  const me = platform()!;
  const a = await fetchAsset(umi, publicKey(asset));
  const collection = await fetchCollection(umi, publicKey(CHAIN.vaultCollection));
  return forUser([
    ...transfer(umi, { asset: a, collection, newOwner: umi.identity.publicKey, authority: signerOf(owner), payer: umi.identity }).getInstructions().map(toWeb3JsInstruction),
    ...transferIxs(coin, me.publicKey, owner, amountUsd, me.publicKey),
  ]);
}

// 用戶把收藏卡做成數位珍藏。伺服器組好鑄造交易：NFT 帳戶的押金和手續費由平台付，同一筆交易裡用戶付鑄造費（feeUsd，組交易當下的費率，USDT 或 USDC）；
// 平台以集合更新權限者的身分、新資產以自己的金鑰先簽，錢包簽名後送出。回傳交易（base64）和新 NFT 的地址
export async function buildUserMint(itemId: string, attrs: CollectorAttributes, owner: PublicKey, feeUsd: number) {
  const umi = platformUmi()!;
  const me = platform()!;
  const collection = await fetchCollection(umi, publicKey(CHAIN.collectorCollection));
  const asset = generateSigner(umi);
  const ixs = create(umi, { asset, collection, owner: publicKey(owner.toBase58()), payer: umi.identity, authority: umi.identity, ...collectorCreateArgs(itemId, attrs) })
    .getInstructions()
    .map(toWeb3JsInstruction);
  if (feeUsd > 0) ixs.push(...transferIxs(await pickCoin(owner, feeUsd), owner, me.publicKey, feeUsd, me.publicKey));
  const tx = await forUser(ixs, [Keypair.fromSecretKey(asset.secretKey)]);
  return { tx, asset: asset.publicKey.toString() };
}

// 確認用戶送出的鑄造：NFT 在平台的收藏集合裡、持有人是這個錢包、元數據指向這張卡（所以不能拿別張卡的 NFT 來充數）。
// 鑄造費和鑄造在同一筆交易裡，交易又是平台簽過名的，NFT 存在就表示鑄造費付了，而且付的是組交易時報的價：
// 金額寫死在平台簽過的交易裡，用戶改不了；組好到送出之間促銷剛好開始或結束也照報價算，不再按現在的費率核對（交易的區塊雜湊一兩分鐘就過期，舊報價用不久）
export async function checkUserMint(itemId: string, assetAddress: string, owner: string) {
  const umi = platformUmi()!;
  for (let i = 0; i < 20; i++) {
    const asset = await fetchAsset(umi, publicKey(assetAddress)).catch(() => null);
    if (asset) {
      const inCollection = asset.updateAuthority.type === "Collection" && asset.updateAuthority.address?.toString() === CHAIN.collectorCollection;
      return inCollection && asset.owner.toString() === owner && asset.uri === collectorUri(itemId);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}
