"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { GetWalletPrompt } from "@/components/auth/WalletSetup";
import { useAuth } from "@/components/auth/AuthContext";
import { payAndConfirm, payOnArc } from "@/lib/chain-client";
import type { EvmWallet } from "@/lib/evm/arc-wallet";
import { setAuction, type ItemAuction } from "@/lib/items";
import AuctionPanel, { type AuctionMe, type BidHistoryEntry } from "./AuctionPanel";

type Detail = ItemAuction & { history: BidHistoryEntry[]; me: AuctionMe | null };

// 自由刊登的拍賣：每幾秒讀一次最新狀態（出價、截止時間、自己的狀態）。出價先付全額進平台託管，Solana 或 Arc 都可以；
// 賣家在沒人出價前可以取消
export default function FreeAuction({ itemId, initial }: { itemId: string; initial: ItemAuction }) {
  const t = useTranslations("Auction");
  const tListing = useTranslations("Listing");
  const { user, login } = useAuth();
  const wallet = user?.walletAddress;
  const [detail, setDetail] = useState<Detail>({ ...initial, history: [], me: null });

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/auctions/${initial.id}`);
    if (res.ok) setDetail(((await res.json()) as { auction: Detail }).auction);
  }, [initial.id]);

  // 進行中每 5 秒讀一次，截止後放慢，結標完就停
  const settled = detail.status === "sold" || detail.status === "unsold" || detail.status === "cancelled";
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 掛載和登入狀態變化時讀一次，帶上自己的出價狀態
    refresh();
    if (settled) return;
    const id = setInterval(refresh, detail.status === "live" ? 5_000 : 15_000);
    return () => clearInterval(id);
  }, [refresh, settled, detail.status, user?.id]);

  const body = (amountUsd: number) => ({ auctionId: initial.id, amountUsd });
  const confirmUrl = (id: string) => `/api/bids/${id}/confirm`;
  const run = (amountUsd: number) => ({
    solana: async () => {
      await payAndConfirm("/api/bids", body(amountUsd), confirmUrl, wallet!);
      await refresh();
    },
    arc: async (evm: EvmWallet) => {
      await payOnArc<{ payTx: string }>("/api/bids", body(amountUsd), confirmUrl, evm);
      await refresh();
    },
  });

  return (
    <AuctionPanel
      view={detail}
      me={detail.me}
      history={detail.history}
      bid={user && wallet ? { run } : null}
      onCancel={
        detail.me?.seller
          ? async () => {
              await setAuction(itemId, null);
              await refresh();
            }
          : undefined
      }
      blocked={
        !user ? (
          <button onClick={login} className="btn-primary w-full rounded-full py-3 text-sm font-semibold">
            {t("loginToBid")}
          </button>
        ) : (
          <GetWalletPrompt text={tListing("linkWalletToBuy")} />
        )
      }
    />
  );
}
