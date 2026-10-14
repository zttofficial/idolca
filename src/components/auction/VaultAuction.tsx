"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { GetWalletPrompt } from "@/components/auth/WalletSetup";
import { useAuth } from "@/components/auth/AuthContext";
import { refreshChainState, vaultAction, type VaultAuction as VaultAuctionState } from "@/lib/chain-client";
import AuctionPanel, { type BidHistoryEntry } from "./AuctionPanel";

type ChainBid = { bidder: string; amountUsd: number; at: string; signature: string };

// 金庫卡的鏈上拍賣：狀態直接讀鏈（拍賣帳戶），進行中每 10 秒重讀一次。出價是一筆 Solana 交易：
// 款項鎖進拍賣帳戶，前一位的出價在同一筆交易裡退回，所以不能用 Arc 付款。
// 出價紀錄從拍賣帳戶的交易讀出來，出價數變了才重讀
export default function VaultAuction({ cardId, auction }: { cardId: string; auction: VaultAuctionState }) {
  const t = useTranslations("Auction");
  const tDetail = useTranslations("Detail");
  const tPay = useTranslations("Pay");
  const { user, login } = useAuth();
  const me = user?.walletAddress ?? null;

  const [bids, setBids] = useState<ChainBid[]>([]);
  useEffect(() => {
    const count = auction.bidCount;
    if (!count) return;
    let stale = false;
    let timer: ReturnType<typeof setTimeout>;
    // 剛確認的出價，節點的交易列表可能還沒收錄；讀到的比出價數少就隔幾秒再讀，最多三次
    const load = (tries: number) =>
      fetch(`/api/chain/bids/${cardId}?count=${count}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ bids: ChainBid[] }>) : null))
        .then((d) => {
          if (!d || stale) return;
          setBids(d.bids);
          if (d.bids.length < count && tries > 1) timer = setTimeout(() => load(tries - 1), 4000);
        })
        .catch(() => {});
    load(3);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [cardId, auction.bidCount]);
  const history: BidHistoryEntry[] = bids.map((b) => ({ bidder: b.bidder, wallet: b.bidder, amountUsd: b.amountUsd, at: b.at, mine: b.bidder === me, tx: b.signature }));

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
      history={history}
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
