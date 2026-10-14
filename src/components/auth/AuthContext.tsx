"use client";

import { createContext, useContext } from "react";

// 登入的統一介面：帳號存在自己的資料庫，用郵箱 + 密碼或錢包簽名登入，頁面只管 useAuth()
export type AuthUser = {
  id: string;
  // 用錢包登入的帳號沒有郵箱
  email: string | null;
  // 郵箱帳號點過驗證信才是 true；沒驗證不能賣卡和綁錢包
  emailVerified: boolean;
  displayName: string;
  // 用錢包登入時是那個錢包的地址；郵箱帳號綁定錢包前為 null，綁了才能買賣
  walletAddress: string | null;
  // external：用戶自己的錢包；privy：在 Idolca 建的收藏錢包，簽名前要先登入 Privy
  walletKind: "external" | "privy" | null;
  // 管理員才看得到後台入口；後台接口在伺服器端另外檢查
  isAdmin: boolean;
  // 能不能用 Arc 付款（Arc 主網只開給管理員時是 false）
  arcPay: boolean;
  // 已確認滿 18 歲（開卡包要）
  ageConfirmed: boolean;
};

export type AuthState = {
  ready: boolean;
  // 部署環境有沒有配置資料庫；沒有時帳號功能顯示「未開通」
  configured: boolean;
  user: AuthUser | null;
  login: () => void;
  logout: () => Promise<void>;
  // 綁定錢包等改動帳號資料之後更新
  updateUser: (user: AuthUser) => void;
};

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth 必須在 Web3Providers 裡使用");
  return auth;
}
