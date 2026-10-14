"use client";

// 收藏錢包（Privy 嵌入式錢包）的入口。Privy 的 SDK 很大，也按月活用戶收費，所以只在用戶要建收藏錢包、
// 用它簽名或加值時才載入並登入 Privy（components/auth/PrivyMount 負責掛上）。這個模組不引入 SDK，其他程式碼只跟它打交道
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
export const privyEnabled = () => Boolean(PRIVY_APP_ID);

export type PrivyBridge = {
  // 登入 Privy（還沒登入時寄驗證碼到 email、等用戶輸入），回傳這個人的 Solana 收藏錢包地址；create 為 true 時沒有就建一個。
  // 錢包會註冊進 Wallet Standard，之後綁定、簽名照常找得到
  wallet: (opts: { email: string; create: boolean }) => Promise<string>;
  // 刷卡等方式買 USDC 進收藏錢包
  deposit: (address: string) => Promise<void>;
};

let bridge: Promise<PrivyBridge> | null = null;
let resolveBridge: ((b: PrivyBridge) => void) | null = null;
const listeners = new Set<() => void>();

export const privyRequested = () => bridge !== null;
export function subscribePrivy(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// 要用 Privy 時呼叫：第一次呼叫才掛上 SDK，等它準備好
export function requestPrivy(): Promise<PrivyBridge> {
  if (!privyEnabled()) return Promise.reject(new Error("privy_not_configured"));
  if (!bridge) {
    bridge = new Promise((resolve) => (resolveBridge = resolve));
    listeners.forEach((l) => l());
  }
  return bridge;
}

// PrivyHost 準備好時交出操作介面
export function provideBridge(b: PrivyBridge) {
  resolveBridge?.(b);
}

// 目前登入的帳號：簽名時找不到錢包、而帳號的錢包是收藏錢包，就先登入 Privy 再找
let account: { email: string | null; walletAddress: string | null; walletKind: string | null } = { email: null, walletAddress: null, walletKind: null };
export function setPrivyAccount(a: typeof account) {
  account = a;
}
export const privyAccount = () => account;
