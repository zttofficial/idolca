import { and, eq, gt } from "drizzle-orm";
import { loginNonces, users } from "@/lib/server/schema";
import { fail, requireUser } from "@/lib/server/require-user";
import { addressBytes, verifySignature } from "@/lib/server/wallet-auth";
import { releaseHeldPayouts } from "@/lib/server/orders";

// 郵箱帳號綁定錢包：和錢包登入一樣先取挑戰訊息、簽名，驗證後把地址記到目前帳號上。
// 綁定後才能用錢包買賣；之前因為沒錢包而暫存在平台的貨款會補發
export async function POST(request: Request) {
  const a = await requireUser();
  if ("error" in a) return a.error;
  const body = (await request.json().catch(() => ({}))) as { address?: string; nonce?: string; signature?: string };
  const key = addressBytes(body.address);
  if (!key || typeof body.nonce !== "string" || typeof body.signature !== "string") return fail("invalid_request");
  if (a.user.walletAddress) return fail("already_linked", 409);

  const [challenge] = await a.db
    .delete(loginNonces)
    .where(and(eq(loginNonces.nonce, body.nonce), eq(loginNonces.address, body.address!), gt(loginNonces.expiresAt, new Date())))
    .returning();
  if (!challenge) return fail("expired", 401);
  if (!verifySignature(key, challenge.message, Buffer.from(body.signature, "base64"))) return fail("bad_signature", 401);

  const [taken] = await a.db.select({ id: users.id }).from(users).where(eq(users.walletAddress, body.address!)).limit(1);
  if (taken) return fail("wallet_taken", 409);
  await a.db.update(users).set({ walletAddress: body.address! }).where(eq(users.id, a.user.id));
  await releaseHeldPayouts(a.db, a.user.id, body.address!).catch((err) => console.error("release payouts failed", err));
  return Response.json({ user: { ...a.user, walletAddress: body.address! } });
}
