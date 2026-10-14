import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "./db";
import { redemptions } from "./schema";
import { notify, usersByWallet, vaultCard } from "./notifications";
import { trackingOf, type Tracking } from "@/lib/tracking";

type RedemptionRow = typeof redemptions.$inferSelect;

// 提貨寄出的通知：發給申請人（帳號被刪時按申請錢包找），帶物流單號、連到卡片頁。
// ref 預設是卡片 id；後台更正單號時另外帶上區分的 ref，再通知一次。卡已出貨，通知失敗只記日誌
export async function notifyRedeemShipped(db: Db, r: RedemptionRow, tracking: string, ref = "") {
  try {
    const userId = r.userId ?? (await usersByWallet(db, [r.wallet])).get(r.wallet);
    if (!userId) return;
    const { card, href } = await vaultCard(db, r.cardId);
    await notify(db, [{ userId, kind: "redeem_shipped", params: { card, tracking }, href, ref: ref ? `${r.cardId}:${ref}` : r.cardId }]);
  } catch (err) {
    console.error("redeem notify failed", r.cardId, err);
  }
}

export type MyRedemption = { requestedAt: string; shippedAt: string | null; cancelled: boolean; tracking: Tracking | null };

// 卡片頁給申請人看的提貨進度和物流單號：只回給申請的帳號或申請時用的錢包，別人拿到 null
export async function myRedemption(db: Db, cardId: string, user: { id: string; walletAddress: string | null }): Promise<MyRedemption | null> {
  const [r] = await db.select().from(redemptions).where(eq(redemptions.cardId, cardId));
  if (!r || (r.userId !== user.id && r.wallet !== user.walletAddress)) return null;
  return {
    requestedAt: r.createdAt.toISOString(),
    shippedAt: r.shippedAt?.toISOString() ?? null,
    cancelled: r.cancelledAt !== null,
    tracking: trackingOf(r.trackingCarrier, r.trackingNumber),
  };
}
