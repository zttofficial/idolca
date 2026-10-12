import "server-only";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { generateSigner, publicKey } from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { create, fetchAsset, fetchCollection, transfer } from "@metaplex-foundation/mpl-core";
import { toWeb3JsInstruction } from "@metaplex-foundation/umi-web3js-adapters";
import { CHAIN } from "@/lib/chain";
import { collectorCreateArgs, collectorUri, platformUmi, type CollectorAttributes } from "./chain";
import { USDT_DECIMALS, connection, platform, usdtMint } from "./vault-chain";

// 平台的資金動作：發測試幣（只有 devnet）、收款（進平台託管錢包）並驗證、放款、轉移 NFT
const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const units = (usdt: number) => BigInt(Math.round(usdt * 10 ** USDT_DECIMALS));

// 測試幣：一點 SOL 付手續費，加上測試 USDT；平台是測試 USDT 的鑄幣權限持有人
export const FAUCET_SOL = 0.02;
export const FAUCET_USDT = 500;
export async function sendTestFunds(to: PublicKey) {
  const me = platform()!;
  const mint = usdtMint();
  const ata = getAssociatedTokenAddressSync(mint, to);
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: me.publicKey, toPubkey: to, lamports: FAUCET_SOL * LAMPORTS_PER_SOL }),
    createAssociatedTokenAccountIdempotentInstruction(me.publicKey, ata, to, mint),
    createMintToInstruction(mint, ata, me.publicKey, units(FAUCET_USDT)),
  );
  return sendAndConfirmTransaction(connection, tx, [me], { commitment: "confirmed" });
}

export async function balances(owner: PublicKey) {
  const [lamports, token] = await Promise.all([
    connection.getBalance(owner),
    connection.getTokenAccountBalance(getAssociatedTokenAddressSync(usdtMint(), owner)).catch(() => null),
  ]);
  return { sol: lamports / LAMPORTS_PER_SOL, usdt: token ? Number(token.value.uiAmount ?? 0) : 0 };
}

// 付款交易：用戶把 USDT 轉進平台錢包，備註寫訂單編號，伺服器據此對帳。手續費由用戶付
export async function buildPayment(from: PublicKey, amountUsdt: number, memo: string) {
  const me = platform()!;
  const mint = usdtMint();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: from, blockhash, lastValidBlockHeight }).add(
    createTransferCheckedInstruction(getAssociatedTokenAddressSync(mint, from), mint, getAssociatedTokenAddressSync(mint, me.publicKey), from, units(amountUsdt), USDT_DECIMALS),
    new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [], data: Buffer.from(memo, "utf8") }),
  );
  return tx.serialize({ requireAllSignatures: false }).toString("base64");
}

// 對帳：交易成功、付款人是 from、平台的 USDT 帳戶收到 amount、備註相符
export async function verifyPayment(signature: string, from: PublicKey, amountUsdt: number, memo: string) {
  for (let i = 0; i < 20; i++) {
    const tx = await connection.getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (tx) {
      if (tx.meta?.err) return false;
      const mint = usdtMint().toBase58();
      const me = platform()!.publicKey.toBase58();
      const received = (tx.meta?.postTokenBalances ?? []).find((b) => b.mint === mint && b.owner === me);
      const before = (tx.meta?.preTokenBalances ?? []).find((b) => b.mint === mint && b.owner === me);
      const delta = BigInt(received?.uiTokenAmount.amount ?? "0") - BigInt(before?.uiTokenAmount.amount ?? "0");
      const signer = tx.transaction.message.accountKeys.find((k) => k.signer)?.pubkey.toBase58();
      const memos = tx.transaction.message.instructions.filter((ix) => ix.programId.equals(MEMO_PROGRAM)).map((ix) => ("parsed" in ix ? String(ix.parsed) : ""));
      return delta === units(amountUsdt) && signer === from.toBase58() && memos.includes(memo);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

// 放款：平台錢包把 USDT 轉給收款人
export async function payout(to: PublicKey, amountUsdt: number) {
  const me = platform()!;
  const mint = usdtMint();
  const ata = getAssociatedTokenAddressSync(mint, to);
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(me.publicKey, ata, to, mint),
    createTransferCheckedInstruction(getAssociatedTokenAddressSync(mint, me.publicKey), mint, ata, me.publicKey, units(amountUsdt), USDT_DECIMALS),
  );
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

// 回購交易：持有人把金庫 NFT 轉給平台（持有人簽），平台把 USDT 轉給持有人（平台先簽）。手續費由持有人付
export async function buildBuybackTx(owner: PublicKey, asset: string, amountUsdt: number) {
  const umi = platformUmi()!;
  const me = platform()!;
  const mint = usdtMint();
  const a = await fetchAsset(umi, publicKey(asset));
  const collection = await fetchCollection(umi, publicKey(CHAIN.vaultCollection));
  const ownerSigner = { publicKey: publicKey(owner.toBase58()), signMessage: async () => new Uint8Array(), signTransaction: async <T,>(t: T) => t, signAllTransactions: async <T,>(t: T[]) => t };
  const ownerAta = getAssociatedTokenAddressSync(mint, owner);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: owner, blockhash, lastValidBlockHeight }).add(
    ...transfer(umi, { asset: a, collection, newOwner: umi.identity.publicKey, authority: ownerSigner, payer: ownerSigner }).getInstructions().map(toWeb3JsInstruction),
    createAssociatedTokenAccountIdempotentInstruction(owner, ownerAta, owner, mint),
    createTransferCheckedInstruction(getAssociatedTokenAddressSync(mint, me.publicKey), mint, ownerAta, me.publicKey, units(amountUsdt), USDT_DECIMALS),
  );
  tx.partialSign(me);
  return tx.serialize({ requireAllSignatures: false }).toString("base64");
}

// 用戶自己付費把收藏卡上鏈（像 Getgems：鑄造者付費）。伺服器組好鑄造交易：手續費和 NFT 帳戶的押金由用戶錢包付，
// 平台以集合更新權限者的身分、新資產以自己的金鑰先簽，錢包簽名後送出。回傳交易（base64）和新 NFT 的地址
export async function buildUserMint(itemId: string, attrs: CollectorAttributes, owner: PublicKey) {
  const umi = platformUmi()!;
  const me = platform()!;
  const collection = await fetchCollection(umi, publicKey(CHAIN.collectorCollection));
  const asset = generateSigner(umi);
  const ownerSigner = { publicKey: publicKey(owner.toBase58()), signMessage: async () => new Uint8Array(), signTransaction: async <T,>(t: T) => t, signAllTransactions: async <T,>(t: T[]) => t };
  const ixs = create(umi, { asset, collection, owner: ownerSigner.publicKey, payer: ownerSigner, authority: umi.identity, ...collectorCreateArgs(itemId, attrs) })
    .getInstructions()
    .map(toWeb3JsInstruction);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: owner, blockhash, lastValidBlockHeight }).add(...ixs);
  tx.partialSign(me, Keypair.fromSecretKey(asset.secretKey));
  return { tx: tx.serialize({ requireAllSignatures: false }).toString("base64"), asset: asset.publicKey.toString() };
}

// 確認用戶送出的鑄造：NFT 在平台的收藏集合裡、持有人是這個錢包、元數據指向這張卡（所以不能拿別張卡的 NFT 來充數）
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
