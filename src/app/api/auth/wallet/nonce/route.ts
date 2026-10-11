import { lt } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { loginNonces } from "@/lib/server/schema";
import { NONCE_TTL_MS, addressBytes, loginMessage, newNonce } from "@/lib/server/wallet-auth";
import { allow, clientIp, tooMany } from "@/lib/server/rate-limit";

// 錢包登入第一步：為這個地址發一段要簽名的訊息
export async function POST(request: Request) {
  const db = await getDb();
  if (!db) return Response.json({ error: "not_configured" }, { status: 503 });
  if (!(await allow(db, `nonce:${clientIp(request)}`, 60, 600))) return tooMany();
  const body = (await request.json().catch(() => ({}))) as { address?: string };
  if (!addressBytes(body.address)) return Response.json({ error: "invalid_address" }, { status: 400 });

  const now = new Date();
  const nonce = newNonce();
  const message = loginMessage(new URL(request.url).host, body.address!, nonce, now);
  await db.delete(loginNonces).where(lt(loginNonces.expiresAt, now));
  await db.insert(loginNonces).values({ nonce, address: body.address!, message, expiresAt: new Date(now.getTime() + NONCE_TTL_MS) });
  return Response.json({ nonce, message });
}
