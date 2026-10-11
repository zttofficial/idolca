import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/server/db";
import { loginNonces, users } from "@/lib/server/schema";
import { newUserId, publicUser, startSession } from "@/lib/server/auth";
import { addressBytes, verifySignature } from "@/lib/server/wallet-auth";
import { shortAddress } from "@/lib/solana/config";

// 錢包登入第二步：驗證簽名，地址第一次出現就建立帳號，然後開會話
export async function POST(request: Request) {
  const db = await getDb();
  if (!db) return Response.json({ error: "not_configured" }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { address?: string; nonce?: string; signature?: string };
  const key = addressBytes(body.address);
  if (!key || typeof body.nonce !== "string" || typeof body.signature !== "string") return Response.json({ error: "invalid_request" }, { status: 400 });

  // 挑戰碼只能用一次：先刪再驗
  const [challenge] = await db
    .delete(loginNonces)
    .where(and(eq(loginNonces.nonce, body.nonce), eq(loginNonces.address, body.address!), gt(loginNonces.expiresAt, new Date())))
    .returning();
  if (!challenge) return Response.json({ error: "expired" }, { status: 401 });
  if (!verifySignature(key, challenge.message, Buffer.from(body.signature, "base64"))) return Response.json({ error: "bad_signature" }, { status: 401 });

  let [user] = await db.select().from(users).where(eq(users.walletAddress, body.address!)).limit(1);
  if (!user) {
    [user] = await db.insert(users).values({ id: newUserId(), walletAddress: body.address!, displayName: shortAddress(body.address!) }).returning();
  }
  await startSession(db, user.id);
  return Response.json({ user: publicUser(user) });
}
