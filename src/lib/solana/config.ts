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
export const RPC_WS_URL = RPC_URL.replace(/^http/, "ws");

// Privy 的 Solana 鏈標識（CAIP-2 風格）
export const PRIVY_CHAIN = CLUSTER === "mainnet-beta" ? "solana:mainnet" : "solana:devnet";

// 結算代幣。主網用 Tether 和 Circle 的官方 mint；devnet 沒有官方 USDT，
// 預設用 Circle 的 devnet USDC 當測試幣，也可以用 NEXT_PUBLIC_USDT_MINT 指定自己鑄的測試幣
const STABLES: Record<Cluster, { usdt: string; usdc: string }> = {
  "mainnet-beta": {
    usdt: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    usdc: "EPjFWJd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  devnet: {
    usdt: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    usdc: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  },
};

export const USDT_MINT = process.env.NEXT_PUBLIC_USDT_MINT || STABLES[CLUSTER].usdt;
export const USDC_MINT = STABLES[CLUSTER].usdc;
export const STABLE_DECIMALS = 6;

// 卡片 NFT 所屬的 Metaplex Core 集合，由 scripts/create-collection.ts 建立
export const CARD_COLLECTION = process.env.NEXT_PUBLIC_CARD_COLLECTION || "";

// 掛單託管程序（onchain/programs/idolca-market）
export const MARKET_PROGRAM_ID = process.env.NEXT_PUBLIC_MARKET_PROGRAM_ID || "";

export function solscanUrl(kind: "account" | "tx" | "token", id: string) {
  const suffix = CLUSTER === "devnet" ? "?cluster=devnet" : "";
  return `https://solscan.io/${kind}/${id}${suffix}`;
}

export function shortAddress(address: string, head = 4, tail = 4) {
  return address.length <= head + tail + 1 ? address : `${address.slice(0, head)}…${address.slice(-tail)}`;
}
