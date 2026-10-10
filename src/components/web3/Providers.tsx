"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { PRIVY_CHAIN, RPC_URL, RPC_WS_URL } from "@/lib/solana/config";
import AccountProvider from "@/components/auth/AccountProvider";

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";

const solanaConnectors = toSolanaWalletConnectors();

// 帳號用我們自己的郵箱註冊（AccountProvider）。Privy 只負責之後的收藏錢包：
// 配置了 App ID 才載入，用戶第一次交易或上鏈時再建立內嵌錢包
export default function Web3Providers({ children }: { children: React.ReactNode }) {
  if (!PRIVY_APP_ID) return <AccountProvider>{children}</AccountProvider>;

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: "light",
          accentColor: "#e8285a",
          landingHeader: "Log in or sign up",
          showWalletLoginFirst: false,
          walletChainType: "solana-only",
          walletList: ["phantom", "solflare", "backpack", "detected_solana_wallets"],
        },
        loginMethods: ["google", "apple", "email", "wallet"],
        embeddedWallets: {
          solana: { createOnLogin: "users-without-wallets" },
          ethereum: { createOnLogin: "off" },
        },
        externalWallets: { solana: { connectors: solanaConnectors } },
        solana: {
          rpcs: {
            [PRIVY_CHAIN]: {
              rpc: createSolanaRpc(RPC_URL),
              rpcSubscriptions: createSolanaRpcSubscriptions(RPC_WS_URL),
            },
          },
        },
      }}
    >
      <AccountProvider>{children}</AccountProvider>
    </PrivyProvider>
  );
}
