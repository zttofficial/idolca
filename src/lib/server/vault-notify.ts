import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "./db";
import { vaultCards } from "./schema";
import { marketTxEvents } from "./history";
import { notify, usersByWallet, vaultCard, type Notice } from "./notifications";
import { vaultState } from "./vault-chain";

// 金庫卡交易回報確認後（/api/chain/vault/confirm）讀那筆交易的事件發通知：出價通知賣家和被超過的前一位，
// 一口價成交通知賣家。卡和錢包都從鏈上事件讀，不信任前端傳的卡片 id；同一筆交易以簽名去重
export async function notifyVaultTx(db: Db, signature: string) {
  for (const e of await marketTxEvents(signature)) {
    const [row] = await db.select({ id: vaultCards.id }).from(vaultCards).where(eq(vaultCards.asset, e.asset));
    if (!row) continue;
    const { card, href } = await vaultCard(db, row.id);
    if (e.name === "BidPlaced") {
      const seller = (await vaultState())[row.id]?.auction?.seller ?? "";
      const prev = e.prevBidder && e.prevBidder !== e.bidder ? e.prevBidder : "";
      const ids = await usersByWallet(db, [seller, prev]);
      const notices: Notice[] = [];
      const price = e.amountUsd;
      if (ids.has(seller)) notices.push({ userId: ids.get(seller)!, kind: "bid_received", params: { card, price }, href, ref: signature });
      if (ids.has(prev)) notices.push({ userId: ids.get(prev)!, kind: "outbid", params: { card, price }, href, ref: signature });
      await notify(db, notices);
    } else {
      const ids = await usersByWallet(db, [e.seller]);
      if (ids.has(e.seller)) await notify(db, [{ userId: ids.get(e.seller)!, kind: "vault_sold", params: { card, price: e.priceUsdt }, href, ref: signature }]);
    }
  }
}
