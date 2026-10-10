// 在 devnet 上啟用掛單託管程序並跑一筆真實交易：
// 1. 建測試 USDT（devnet 沒有官方 USDT）；2. initialize 寫入抽成、收款錢包、金庫集合和結算代幣；
// 3. 把樣本資料裡「掛單中」的金庫卡真的掛進程序；4. 建一個買家錢包，用測試 USDT 買下其中一張。
// 結果寫進 src/lib/chain/devnet.json 的 market 欄位。可以重複執行，已完成的步驟會跳過。
// 用法（在 onchain/ 下）：node ../node_modules/tsx/dist/cli.mjs scripts/devnet-market.mts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, createMint, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import idl from "../target/idl/idolca_market.json";
import type { IdolcaMarket } from "../target/types/idolca_market";
import { CARDS as SAMPLES } from "../../src/lib/mock-cards";

const ROOT = "..";
const CONFIG = `${ROOT}/src/lib/chain/devnet.json`;
const MPL_CORE_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
const BPF_UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
// Circle 的 devnet USDC，作為第二種結算代幣
const DEVNET_USDC = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const FEE_BPS = 250;
const USDT = 1_000_000;

// 樣本資料裡「掛單中」的卡按標價掛進程序；最便宜的那張由測試買家買走，示範一筆真實成交
const LISTED = Object.fromEntries(SAMPLES.filter((c) => c.status === "listed").map((c) => [c.id, c.priceUsdt]));
const DEMO_BUY = Object.entries(LISTED).sort((a, b) => a[1] - b[1])[0][0];

type Market = {
  programId: string;
  config: string;
  treasury: string;
  usdtMint: string;
  listings: Record<string, string>;
  demoTrade?: { card: string; buyer: string; listTx: string; buyTx: string };
};
const chain = JSON.parse(readFileSync(CONFIG, "utf8")) as Record<string, unknown> & { vaultCollection: string; cards: Record<string, string>; market?: Market };
const save = () => writeFileSync(CONFIG, JSON.stringify(chain, null, 2) + "\n");

const loadKeypair = (path: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
function keypairFile(path: string) {
  if (!existsSync(path)) writeFileSync(path, JSON.stringify(Array.from(Keypair.generate().secretKey)));
  return loadKeypair(path);
}

const platform = loadKeypair(`${ROOT}/.data/platform-devnet.json`);
const treasury = keypairFile(`${ROOT}/.data/treasury-devnet.json`);
const buyer = keypairFile(`${ROOT}/.data/demo-buyer-devnet.json`);
const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed");
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(platform), { commitment: "confirmed" });
const program = new anchor.Program<IdolcaMarket>(idl as IdolcaMarket, provider);
const tx = (sig: string) => `https://solscan.io/tx/${sig}?cluster=devnet`;

const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
const listingPda = (asset: PublicKey) => PublicKey.findProgramAddressSync([Buffer.from("listing"), asset.toBuffer()], program.programId)[0];
const collection = new PublicKey(chain.vaultCollection);
const coreAccounts = () => ({ config: configPda, collection, mplCoreProgram: MPL_CORE_ID, systemProgram: SystemProgram.programId });

chain.market ??= { programId: program.programId.toBase58(), config: configPda.toBase58(), treasury: treasury.publicKey.toBase58(), usdtMint: "", listings: {} };
const market = chain.market;

if (!market.usdtMint) {
  market.usdtMint = (await createMint(connection, platform, platform.publicKey, null, 6)).toBase58();
  save();
  console.log(`測試 USDT ${market.usdtMint}`);
}
const usdt = new PublicKey(market.usdtMint);

if (!(await connection.getAccountInfo(configPda))) {
  await getOrCreateAssociatedTokenAccount(connection, platform, usdt, treasury.publicKey);
  const [programData] = PublicKey.findProgramAddressSync([program.programId.toBuffer()], BPF_UPGRADEABLE_LOADER);
  const sig = await program.methods
    .initialize(FEE_BPS)
    .accountsPartial({ authority: platform.publicKey, config: configPda, treasury: treasury.publicKey, collection, usdtMint: usdt, usdcMint: DEVNET_USDC, program: program.programId, programData, systemProgram: SystemProgram.programId })
    .rpc();
  console.log(`initialize（抽成 ${FEE_BPS / 100}%）${tx(sig)}`);
}

for (const [card, price] of Object.entries(LISTED)) {
  if (market.listings[card] || (card === DEMO_BUY && market.demoTrade)) continue;
  const asset = new PublicKey(chain.cards[card]);
  const sig = await program.methods
    .list(new anchor.BN(price * USDT))
    .accountsPartial({ seller: platform.publicKey, listing: listingPda(asset), asset, paymentMint: usdt, ...coreAccounts() })
    .rpc();
  market.listings[card] = sig;
  save();
  console.log(`${card} 掛單 ${price} USDT  ${tx(sig)}`);
}

if (!market.demoTrade) {
  // 買家：轉一點 SOL 付手續費，鑄 2,000 測試 USDT 給它
  await provider.sendAndConfirm(new Transaction().add(SystemProgram.transfer({ fromPubkey: platform.publicKey, toPubkey: buyer.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })));
  const buyerUsdt = await getOrCreateAssociatedTokenAccount(connection, platform, usdt, buyer.publicKey);
  await mintTo(connection, platform, usdt, buyerUsdt.address, platform, 2_000 * USDT);

  const asset = new PublicKey(chain.cards[DEMO_BUY]);
  const price = LISTED[DEMO_BUY] * USDT;
  const buyTx = await program.methods
    .buy(new anchor.BN(price))
    .accountsPartial({
      buyer: buyer.publicKey,
      seller: platform.publicKey,
      listing: listingPda(asset),
      asset,
      paymentMint: usdt,
      buyerToken: buyerUsdt.address,
      sellerToken: getAssociatedTokenAddressSync(usdt, platform.publicKey),
      treasury: treasury.publicKey,
      treasuryToken: getAssociatedTokenAddressSync(usdt, treasury.publicKey),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      ...coreAccounts(),
    })
    .signers([buyer])
    .rpc();
  market.demoTrade = { card: DEMO_BUY, buyer: buyer.publicKey.toBase58(), listTx: market.listings[DEMO_BUY], buyTx };
  delete market.listings[DEMO_BUY];
  save();
  console.log(`${DEMO_BUY} 由 ${buyer.publicKey.toBase58()} 買下  ${tx(buyTx)}`);
}

console.log("完成");
