"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { PRIVY_CHAIN, RPC_URL, RPC_WS_URL } from "@/lib/solana/config";

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";

const solanaConnectors = toSolanaWalletConnectors();

// 粉絲用郵箱、Google、Apple 登入時自動生成 Solana 內嵌錢包；加密用戶直接連 Phantom、Solflare、Backpack
export default function Web3Providers({ children }: { children: React.ReactNode }) {
  if (!PRIVY_APP_ID) return children;

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#a78bfa",
          walletChainType: "solana-only",
          walletList: ["phantom", "solflare", "backpack", "detected_solana_wallets"],
        },
        loginMethods: ["email", "google", "apple", "wallet"],
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
      {children}
    </PrivyProvider>
  );
}
