"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { GetWalletPrompt } from "@/components/auth/WalletSetup";
import { useAuth } from "@/components/auth/AuthContext";
import { refreshChainState, vaultAction, type VaultAuction as VaultAuctionState } from "@/lib/chain-client";
import AuctionPanel from "./AuctionPanel";

// 金庫卡的鏈上拍賣：狀態直接讀鏈（拍賣帳戶），進行中每 10 秒重讀一次。出價是一筆 Solana 交易：
// 款項鎖進拍賣帳戶，前一位的出價在同一筆交易裡退回，所以不能用 Arc 付款
export default function VaultAuction({ cardId, auction }: { cardId: string; auction: VaultAuctionState }) {
  const t = useTranslations("Auction");
  const tDetail = useTranslations("Detail");
  const tPay = useTranslations("Pay");
  const { user, login } = useAuth();
  const me = user?.walletAddress ?? null;

  const live = auction.status === "live";
  useEffect(() => {
    const id = setInterval(refreshChainState, live ? 10_000 : 20_000);
    return () => clearInterval(id);
  }, [live]);

  const run = (amountUsd: number) => ({
    solana: async () => {
      await vaultAction("bid", cardId, me!, { amountUsd });
    },
    arc: null,
  });

  return (
    <AuctionPanel
      view={auction}
      me={me ? { seller: auction.seller === me, leading: auction.highBidder === me, refunding: false } : null}
      bid={me ? { run, arcUnavailableNote: tPay("arcVaultOnly") } : null}
      onCancel={me && auction.seller === me ? () => vaultAction("cancelAuction", cardId, me) : undefined}
      blocked={
        !user ? (
          <button onClick={login} className="btn-primary w-full rounded-full py-3 text-sm font-semibold">
            {t("loginToBid")}
          </button>
        ) : (
          <GetWalletPrompt text={tDetail("linkWalletToBuy")} />
        )
      }
    />
  );
}
