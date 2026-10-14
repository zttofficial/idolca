// 啟用掛單託管程序：initialize 寫入抽成、收款錢包、金庫集合和結算代幣，地址寫進 src/lib/chain/<cluster>.json 的 market 欄位；
// 抽成和拍賣設定（AuctionConfig：手續費、起標價下限、時長範圍、延長時間）都按 src/lib/policy.ts 建立或更新，改了規則重跑一次就同步到鏈上。
// 結算代幣有兩種，買家用哪種付都行：主網是 Tether 的 USDT 和 Circle 的 USDC；devnet 沒有官方 USDT，Circle 的 devnet USDC 平台又發不出來，
// 所以第一次執行時由平台各鑄一個測試幣（平台持有鑄幣權，水龍頭和端到端測試靠它發幣），登記不一致就用 setMints 更新。
// 舊版帳戶（程序升級前建立的掛單和拍賣，格式不同）會被找出來遷移：資產退回賣家，有出價的全額退款。
// 收款錢包（抽成進這裡）：主網用 TREASURY_ADDRESS 指定一個冷錢包；devnet 沒指定時生成 .data/treasury-devnet.json。
// 程序要先用 anchor deploy 部署到該網路。可以重複執行，已完成的步驟會跳過。
// 用法（在 onchain/ 下）：NEXT_PUBLIC_SOLANA_CLUSTER=devnet node ../node_modules/tsx/dist/cli.mjs scripts/setup-market.mts
// 預演：SOLANA_RPC_URL 指向本地驗證節點、CHAIN_CONFIG 指向一份設定檔的副本，不動正式的設定
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createMint, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import idl from "../target/idl/idolca_market.json";
import type { IdolcaMarket } from "../target/types/idolca_market";
import { AUCTION_DAYS, AUCTION_EXTEND_MINUTES, AUCTION_FEE_BPS, AUCTION_MIN_START, FEE_BPS } from "../../src/lib/policy";

const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta" ? "mainnet-beta" : "devnet";
const ROOT = "..";
const CONFIG = process.env.CHAIN_CONFIG || `${ROOT}/src/lib/chain/${CLUSTER}.json`;
const RPC = process.env.SOLANA_RPC_URL || (CLUSTER === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com");
const BPF_UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const MAINNET_USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const MAINNET_USDC = "EPjFWJd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MPL_CORE_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
// 舊版帳戶的長度（見程序的 LEGACY_LISTING_LEN、LEGACY_AUCTION_LEN）
const LEGACY_LISTING_LEN = 113;
const LEGACY_AUCTION_LEN = 175;

type Market = { programId: string; config: string; treasury: string; usdtMint: string; usdcMint?: string };
const chain = JSON.parse(readFileSync(CONFIG, "utf8")) as Record<string, unknown> & { vaultCollection: string; market?: Market };
if (!chain.vaultCollection) throw new Error(`先執行 npm run chain:setup 建金庫集合（${CONFIG}）`);
const save = () => writeFileSync(CONFIG, JSON.stringify(chain, null, 2) + "\n");

const loadKeypair = (path: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
const platform = loadKeypair(process.env.PLATFORM_KEYPAIR ? `${ROOT}/${process.env.PLATFORM_KEYPAIR}` : `${ROOT}/.data/platform-${CLUSTER}.json`);
function treasuryAddress() {
  if (process.env.TREASURY_ADDRESS) return new PublicKey(process.env.TREASURY_ADDRESS);
  if (CLUSTER === "mainnet-beta") throw new Error("主網請用 TREASURY_ADDRESS 指定收款錢包");
  const path = `${ROOT}/.data/treasury-devnet.json`;
  if (!existsSync(path)) writeFileSync(path, JSON.stringify(Array.from(Keypair.generate().secretKey)));
  return loadKeypair(path).publicKey;
}

const connection = new Connection(RPC, "confirmed");
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(platform), { commitment: "confirmed" });
const program = new anchor.Program<IdolcaMarket>(idl as IdolcaMarket, provider);
const explorer = (sig: string) => `https://solscan.io/tx/${sig}${CLUSTER === "devnet" ? "?cluster=devnet" : ""}`;
const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

const treasury = treasuryAddress();
chain.market ??= { programId: program.programId.toBase58(), config: configPda.toBase58(), treasury: treasury.toBase58(), usdtMint: CLUSTER === "mainnet-beta" ? MAINNET_USDT : "" };
const market = chain.market;
market.usdcMint ??= CLUSTER === "mainnet-beta" ? MAINNET_USDC : "";
save();

for (const key of ["usdtMint", "usdcMint"] as const) {
  if (market[key]) continue;
  market[key] = (await createMint(connection, platform, platform.publicKey, null, 6)).toBase58();
  save();
  console.log(`測試 ${key === "usdtMint" ? "USDT" : "USDC"} ${market[key]}`);
}
const usdt = new PublicKey(market.usdtMint);
const usdc = new PublicKey(market.usdcMint!);

if (!(await connection.getAccountInfo(configPda))) {
  const [programData] = PublicKey.findProgramAddressSync([program.programId.toBuffer()], BPF_UPGRADEABLE_LOADER);
  const sig = await program.methods
    .initialize(FEE_BPS)
    .accountsPartial({ authority: platform.publicKey, config: configPda, treasury, collection: new PublicKey(chain.vaultCollection), usdtMint: usdt, usdcMint: usdc, program: program.programId, programData, systemProgram: SystemProgram.programId })
    .rpc();
  console.log(`initialize（抽成 ${FEE_BPS / 100}%）${explorer(sig)}`);
}

// 抽成直接打進收款錢包的代幣帳戶，兩種幣都要先開好
for (const mint of [usdt, usdc]) await getOrCreateAssociatedTokenAccount(connection, platform, mint, treasury);

// 遷移舊版帳戶：要在換登記的代幣之前做（舊版拍賣的存款帳戶屬於舊代幣，遷移指令按帳戶裡記的代幣退款）
const vaultCollection = new PublicKey(chain.vaultCollection);
for (const { pubkey, account } of await connection.getProgramAccounts(program.programId)) {
  const d = account.data;
  const key = (at: number) => new PublicKey(d.subarray(at, at + 32));
  if (d.length === LEGACY_LISTING_LEN) {
    const [seller, asset] = [key(8), key(40)];
    const sig = await program.methods
      .migrateListing()
      .accountsPartial({ authority: platform.publicKey, config: configPda, listing: pubkey, seller, asset, collection: vaultCollection, mplCoreProgram: MPL_CORE_ID, systemProgram: SystemProgram.programId })
      .rpc();
    console.log(`migrateListing ${asset.toBase58()} → ${seller.toBase58()} ${explorer(sig)}`);
  } else if (d.length === LEGACY_AUCTION_LEN) {
    const [seller, asset, mint, highBidder] = [key(8), key(40), key(72), key(128)];
    const bidCount = d.readUInt32LE(8 + 160);
    const refundTo = bidCount > 0 ? highBidder : seller;
    const sig = await program.methods
      .migrateAuction()
      .accountsPartial({
        authority: platform.publicKey,
        config: configPda,
        auction: pubkey,
        seller,
        highBidder: refundTo,
        paymentMint: mint,
        escrow: getAssociatedTokenAddressSync(mint, pubkey, true),
        highBidderToken: getAssociatedTokenAddressSync(mint, refundTo, true),
        asset,
        collection: vaultCollection,
        mplCoreProgram: MPL_CORE_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log(`migrateAuction ${asset.toBase58()}（${bidCount} 口出價，退給 ${refundTo.toBase58()}）${explorer(sig)}`);
  }
}

// 登記的結算代幣和設定檔一致
const registered = await program.account.config.fetch(configPda);
if (!registered.usdtMint.equals(usdt) || !registered.usdcMint.equals(usdc)) {
  const sig = await program.methods.setMints().accountsPartial({ authority: platform.publicKey, config: configPda, usdtMint: usdt, usdcMint: usdc }).rpc();
  console.log(`setMints ${explorer(sig)}`);
}

// 成交抽成：和網站的規則同一份，不一致就更新（收款錢包不變）
const config = await program.account.config.fetch(configPda);
if (config.feeBps !== FEE_BPS) {
  const sig = await program.methods.updateConfig(FEE_BPS, config.treasury).accountsPartial({ authority: platform.publicKey, config: configPda }).rpc();
  console.log(`updateConfig（抽成 ${FEE_BPS / 100}%）${explorer(sig)}`);
}

// 拍賣設定：和網站的規則同一份（src/lib/policy.ts），沒有就建立，不一致就更新
const [auctionConfigPda] = PublicKey.findProgramAddressSync([Buffer.from("auction_config")], program.programId);
const rules = {
  feeBps: AUCTION_FEE_BPS,
  minStart: new anchor.BN(AUCTION_MIN_START * 1_000_000),
  minDuration: new anchor.BN(Math.min(...AUCTION_DAYS) * 86_400),
  maxDuration: new anchor.BN(Math.max(...AUCTION_DAYS) * 86_400),
  extendSecs: new anchor.BN(AUCTION_EXTEND_MINUTES * 60),
};
const current = await program.account.auctionConfig.fetchNullable(auctionConfigPda);
if (!current) {
  const sig = await program.methods.initAuctionConfig(rules).accountsPartial({ authority: platform.publicKey, config: configPda, auctionConfig: auctionConfigPda }).rpc();
  console.log(`initAuctionConfig（拍賣抽成 ${AUCTION_FEE_BPS / 100}%）${explorer(sig)}`);
} else if (
  current.feeBps !== rules.feeBps ||
  !current.minStart.eq(rules.minStart) ||
  !current.minDuration.eq(rules.minDuration) ||
  !current.maxDuration.eq(rules.maxDuration) ||
  !current.extendSecs.eq(rules.extendSecs)
) {
  const sig = await program.methods.updateAuctionConfig(rules).accountsPartial({ authority: platform.publicKey, config: configPda, auctionConfig: auctionConfigPda }).rpc();
  console.log(`updateAuctionConfig ${explorer(sig)}`);
}

// 平台錢包收款（擔保交易、卡包、鑄造費）也要有兩種幣的帳戶
for (const mint of [usdt, usdc]) await getOrCreateAssociatedTokenAccount(connection, platform, mint, platform.publicKey);
console.log("完成");
