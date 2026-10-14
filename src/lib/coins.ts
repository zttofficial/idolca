import { CHAIN } from "./chain";

// Solana 上的兩種結算代幣，都是 6 位小數、和美元 1:1。買家用哪種付都行：錢包裡哪種夠就用哪種；
// 退款和放款用原來付的那種。設定檔還沒登記 USDC 時只有 USDT
export type Coin = "usdt" | "usdc";
export const COIN_DECIMALS = 6;
export const COIN_LABEL: Record<Coin, string> = { usdt: "USDT", usdc: "USDC" };

export const coinMints = (): Partial<Record<Coin, string>> => ({ usdt: CHAIN.market?.usdtMint, ...(CHAIN.market?.usdcMint ? { usdc: CHAIN.market.usdcMint } : {}) });
export const COINS = (): Coin[] => (Object.keys(coinMints()) as Coin[]).filter((c) => coinMints()[c]);
export const isCoin = (v: unknown): v is Coin => v === "usdt" || v === "usdc";
