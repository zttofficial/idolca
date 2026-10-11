import { and, isNotNull, lt } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/lib/server/db";
import { sweepOrders } from "@/lib/server/orders";
import { loginNonces, redemptions, sessions } from "@/lib/server/schema";
import { ADDRESS_RETENTION_DAYS } from "@/lib/policy";


// 每天由 Vercel Cron 呼叫（CRON_SECRET 保護）：
// 處理逾時的擔保訂單（未寄退款、未確認放款）、清除寄出超過 90 天的收件地址、刪掉過期的會話和登入挑戰碼
export async function GET(request: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "forbidden" }, { status: 403 });
  const db = await getDb();
  if (!db) return Response.json({ error: "not_configured" }, { status: 503 });
  const orders = await sweepOrders(db);
  const cutoff = new Date(Date.now() - ADDRESS_RETENTION_DAYS * 86_400_000);
  const purged = await db
    .update(redemptions)
    .set({ shippingAddress: null })
    .where(and(isNotNull(redemptions.shippingAddress), lt(redemptions.shippedAt, cutoff)))
    .returning({ cardId: redemptions.cardId });
  const now = new Date();
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db.delete(loginNonces).where(lt(loginNonces.expiresAt, now));
  return Response.json({ ...orders, addressesPurged: purged.length });
}
