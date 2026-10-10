"use client";

import { createContext, useContext } from "react";

// 登入的統一介面：帳號是我們自己的（郵箱 + 密碼，存在自己的資料庫），頁面只管 useAuth()
export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  // 收藏錢包在第一次交易或上鏈時才建立，帳號本身不需要錢包
  walletAddress?: string;
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
