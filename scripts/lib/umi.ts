// 平台端腳本共用的 Umi 實例：連到 SOLANA_CLUSTER 對應的 RPC，用 PLATFORM_KEYPAIR 簽名付費。
// PLATFORM_KEYPAIR 是 Solana CLI 格式的金鑰檔（64 個數字的 JSON 陣列），絕對不要提交進倉庫。
import { readFileSync } from "node:fs";
import { keypairIdentity, type Umi } from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplCore } from "@metaplex-foundation/mpl-core";

const DEFAULT_RPC = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
};

export const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta" ? "mainnet-beta" : "devnet";

export function loadKeypairFile(umi: Umi, path: string) {
  const secret = Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]);
  return umi.eddsa.createKeypairFromSecretKey(secret);
}

export function platformUmi() {
  const keypairPath = process.env.PLATFORM_KEYPAIR;
  if (!keypairPath) throw new Error("請在 .env.local 設定 PLATFORM_KEYPAIR（平台金鑰檔路徑）");
  const umi = createUmi(process.env.SOLANA_RPC_URL || DEFAULT_RPC[cluster]).use(mplCore());
  umi.use(keypairIdentity(loadKeypairFile(umi, keypairPath)));
  return umi;
}

export function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`請在 .env.local 設定 ${name}`);
  return value;
}

export function explorer(kind: "account" | "tx", id: string) {
  return `https://solscan.io/${kind}/${id}${cluster === "devnet" ? "?cluster=devnet" : ""}`;
}
