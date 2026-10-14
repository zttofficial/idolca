import { CHAIN } from "../chain";

// 鏈上配置。只放公開資訊（地址、公開 RPC），瀏覽器和伺服器都能讀；
// API 金鑰類的秘密放在不帶 NEXT_PUBLIC_ 前綴的變數裡，見 src/lib/solana/das.ts。

export type Cluster = "mainnet-beta" | "devnet";

export const CLUSTER: Cluster =
  process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta" ? "mainnet-beta" : "devnet";

const DEFAULT_RPC: Record<Cluster, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
};

// 瀏覽器端用的 RPC。生產環境換成 Helius 等服務商提供的、按網域限制來源的端點
export const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || DEFAULT_RPC[CLUSTER];

// Wallet Standard 的鏈標識，錢包簽名和發送交易時用
export const WALLET_CHAIN = CLUSTER === "mainnet-beta" ? "solana:mainnet" : "solana:devnet";

// 金庫卡 NFT 所屬的 Metaplex Core 集合；預設用 scripts/setup-chain.ts 建好的那個
export const CARD_COLLECTION = process.env.NEXT_PUBLIC_CARD_COLLECTION || CHAIN.vaultCollection;

// 掛單託管程序（onchain/programs/idolca-market）
export const MARKET_PROGRAM_ID = process.env.NEXT_PUBLIC_MARKET_PROGRAM_ID || CHAIN.market?.programId || "";

export function solscanUrl(kind: "account" | "tx" | "token", id: string) {
  const suffix = CLUSTER === "devnet" ? "?cluster=devnet" : "";
  return `https://solscan.io/${kind}/${id}${suffix}`;
}

export function shortAddress(address: string, head = 4, tail = 4) {
  return address.length <= head + tail + 1 ? address : `${address.slice(0, head)}…${address.slice(-tail)}`;
}
