// 啟用掛單託管程序：initialize 寫入抽成、收款錢包、金庫集合和結算代幣，地址寫進 src/lib/chain/<cluster>.json 的 market 欄位；
// 抽成和拍賣設定（AuctionConfig：手續費、起標價下限、時長範圍、延長時間）都按 src/lib/policy.ts 建立或更新，改了規則重跑一次就同步到鏈上。
// devnet 沒有官方 USDT，第一次執行時由平台鑄一個測試 USDT（平台持有鑄幣權，水龍頭靠它發幣）；主網用 Tether 的官方 USDT。
// 收款錢包（抽成進這裡）：主網用 TREASURY_ADDRESS 指定一個冷錢包；devnet 沒指定時生成 .data/treasury-devnet.json。
// 程序要先用 anchor deploy 部署到該網路。可以重複執行，已完成的步驟會跳過。
// 用法（在 onchain/ 下）：NEXT_PUBLIC_SOLANA_CLUSTER=devnet node ../node_modules/tsx/dist/cli.mjs scripts/setup-market.mts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as anchor from "@anchor-lang/core";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import idl from "../target/idl/idolca_market.json";
import type { IdolcaMarket } from "../target/types/idolca_market";
import { AUCTION_DAYS, AUCTION_EXTEND_MINUTES, AUCTION_FEE_BPS, AUCTION_MIN_START, FEE_BPS } from "../../src/lib/policy";

const CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta" ? "mainnet-beta" : "devnet";
const ROOT = "..";
const CONFIG = `${ROOT}/src/lib/chain/${CLUSTER}.json`;
const RPC = process.env.SOLANA_RPC_URL || (CLUSTER === "devnet" ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com");
const BPF_UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
// 第二種結算代幣：Circle 的 USDC
const USDC = { devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", "mainnet-beta": "EPjFWJd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }[CLUSTER];
const MAINNET_USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

type Market = { programId: string; config: string; treasury: string; usdtMint: string };
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
save();

if (!market.usdtMint) {
  market.usdtMint = (await createMint(connection, platform, platform.publicKey, null, 6)).toBase58();
  save();
  console.log(`測試 USDT ${market.usdtMint}`);
}
const usdt = new PublicKey(market.usdtMint);

if (!(await connection.getAccountInfo(configPda))) {
  await getOrCreateAssociatedTokenAccount(connection, platform, usdt, treasury);
  const [programData] = PublicKey.findProgramAddressSync([program.programId.toBuffer()], BPF_UPGRADEABLE_LOADER);
  const sig = await program.methods
    .initialize(FEE_BPS)
    .accountsPartial({ authority: platform.publicKey, config: configPda, treasury, collection: new PublicKey(chain.vaultCollection), usdtMint: usdt, usdcMint: new PublicKey(USDC), program: program.programId, programData, systemProgram: SystemProgram.programId })
    .rpc();
  console.log(`initialize（抽成 ${FEE_BPS / 100}%）${explorer(sig)}`);
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

// 平台錢包收款（擔保交易、卡包）也要有 USDT 帳戶
await getOrCreateAssociatedTokenAccount(connection, platform, usdt, platform.publicKey);
console.log("完成");
