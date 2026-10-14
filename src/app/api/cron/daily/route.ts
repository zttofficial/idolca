import { and, isNotNull, lt } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/lib/server/db";
import { purgeOrderAddresses, sweepOrders } from "@/lib/server/orders";
import { sweepAuctions } from "@/lib/server/auctions";
import { settleEndedVaultAuctions } from "@/lib/server/vault-chain";
import { purgeNotifications } from "@/lib/server/notifications";
import { emailTokens, loginNonces, redemptions, sessions } from "@/lib/server/schema";
import { ADDRESS_RETENTION_DAYS } from "@/lib/policy";


// 每天由 Vercel Cron 呼叫（CRON_SECRET 保護）：
// 處理逾時的擔保訂單（未寄退款、未確認放款、提醒還沒填收件地址的買家）、結標到期的拍賣並退回被超過的出價、清除提貨寄出、擔保訂單結束超過 90 天的收件地址、刪掉過期的會話、登入挑戰碼和郵件連結，以及超過 90 天的站內通知。
// 拍賣平時由拍賣頁和市場的請求及時結標，這裡是保底
export async function GET(request: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "forbidden" }, { status: 403 });
  const db = await getDb();
  if (!db) return Response.json({ error: "not_configured" }, { status: 503 });
  const orders = await sweepOrders(db);
  const auctions = await sweepAuctions(db);
  const vaultAuctionsSettled = await settleEndedVaultAuctions().catch((err) => {
    console.error("settle vault auctions failed", err);
    return 0;
  });
  const cutoff = new Date(Date.now() - ADDRESS_RETENTION_DAYS * 86_400_000);
  const purged = await db
    .update(redemptions)
    .set({ shippingAddress: null })
    .where(and(isNotNull(redemptions.shippingAddress), lt(redemptions.shippedAt, cutoff)))
    .returning({ cardId: redemptions.cardId });
  const orderAddressesPurged = await purgeOrderAddresses(db, cutoff);
  const now = new Date();
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db.delete(loginNonces).where(lt(loginNonces.expiresAt, now));
  await db.delete(emailTokens).where(lt(emailTokens.expiresAt, now));
  const notificationsPurged = await purgeNotifications(db);
  return Response.json({ ...orders, ...auctions, vaultAuctionsSettled, addressesPurged: purged.length + orderAddressesPurged, notificationsPurged });
}
