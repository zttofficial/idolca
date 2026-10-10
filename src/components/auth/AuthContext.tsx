"use client";

import { createContext, useContext } from "react";

// 登入的統一介面：帳號存在自己的資料庫，用郵箱 + 密碼或錢包簽名登入，頁面只管 useAuth()
export type AuthUser = {
  id: string;
  // 用錢包登入的帳號沒有郵箱
  email: string | null;
  displayName: string;
  // 用錢包登入時是那個錢包的地址；郵箱帳號為 null，上鏈的卡由平台代管
  walletAddress: string | null;
};

export type AuthState = {
  ready: boolean;
  // 部署環境有沒有配置資料庫；沒有時帳號功能顯示「未開通」
  configured: boolean;
  user: AuthUser | null;
  login: () => void;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth 必須在 Web3Providers 裡使用");
  return auth;
}
