import { and, eq, gt } from "drizzle-orm";
import { loginNonces, users } from "@/lib/server/schema";
import { fail, requireUser, unverifiedEmail } from "@/lib/server/require-user";
import { publicUser } from "@/lib/server/auth";
import { addressBytes, verifySignature } from "@/lib/server/wallet-auth";
import { releaseHeldPayouts } from "@/lib/server/orders";

// 郵箱帳號綁定錢包：和錢包登入一樣先取挑戰訊息、簽名，驗證後把地址記到目前帳號上。
// 錢包可以是用戶自己的（Phantom 等），也可以是剛在 Idolca 建的收藏錢包（kind: "privy"），兩者都要簽名證明持有。
// 要先驗證信箱；綁定後才能用錢包買賣；之前因為沒錢包而暫存在平台的貨款會補發
export async function POST(request: Request) {
  const a = await requireUser();
  if ("error" in a) return a.error;
  const unverified = unverifiedEmail(a.user);
  if (unverified) return unverified;
  const body = (await request.json().catch(() => ({}))) as { address?: string; nonce?: string; signature?: string; kind?: string };
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
  // kind 只影響網站要不要先登入 Privy 才能簽名，不涉及權限，照前端說的記
  const walletKind = body.kind === "privy" ? "privy" : "external";
  const [updated] = await a.db.update(users).set({ walletAddress: body.address!, walletKind }).where(eq(users.id, a.user.id)).returning();
  await releaseHeldPayouts(a.db, a.user.id, body.address!).catch((err) => console.error("release payouts failed", err));
  return Response.json({ user: publicUser(updated) });
}
