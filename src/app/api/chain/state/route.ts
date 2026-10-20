import { after, connection } from "next/server";
import { CHAIN } from "@/lib/chain";
import { marketReady, settleEndedVaultAuctions, syncChainFees, syncVaultIndex, vaultAuctionsReady, vaultState } from "@/lib/server/vault-chain";

// 金庫卡的鏈上狀態：持有人、掛單價格、拍賣、是否在提貨中，以及金庫卡拍賣開通了沒有；公開。狀態從資料庫的鏈上狀態索引讀，請求本身不讀鏈。
// 回應後做幾件事：有已截止的拍賣時由平台送出結標交易（排程一天只跑一次，靠這裡及時結標）；讓索引跟上不是我們送的交易（有節流，大多數請求什麼都不讀）；
// 把鏈上的手續費同步成現在的費率（促銷開始或結束後沒人交易時靠這裡跟上；鏈上的值有快取，大多數請求不多讀鏈）
export async function GET() {
  await connection();
  if (!marketReady()) return Response.json({ ready: false, cards: {} });
  const [cards, auctions] = await Promise.all([vaultState(), vaultAuctionsReady()]);
  if (Object.values(cards).some((s) => s.auction && new Date(s.auction.endsAt).getTime() <= Date.now())) after(() => settleEndedVaultAuctions());
  after(() => syncVaultIndex().catch((err) => console.error("sync vault index failed", err)));
  after(() => syncChainFees().catch((err) => console.error("sync chain fees failed", err)));
  return Response.json({ ready: true, auctions, usdtMint: CHAIN.market!.usdtMint, cards });
}
