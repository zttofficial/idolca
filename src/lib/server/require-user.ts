import "server-only";
import { getDb, type Db } from "./db";
import { currentUser, type PublicUser } from "./auth";

// 需要登入的接口共用：資料庫未配置回 503，未登入回 401
export async function requireUser() {
  const db = await getDb();
  if (!db) return { error: Response.json({ error: "not_configured" }, { status: 503 }) };
  const user = await currentUser(db);
  if (!user) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
  return { db, user };
}

// 需要錢包的接口（簽交易、收付款）：郵箱帳號要先綁定錢包
export async function requireWalletUser(): Promise<{ error: Response } | { db: Db; user: PublicUser; wallet: string }> {
  const a = await requireUser();
  if (a.error) return { error: a.error };
  if (!a.user.walletAddress) return { error: Response.json({ error: "no_wallet" }, { status: 409 }) };
  return { db: a.db, user: a.user, wallet: a.user.walletAddress };
}

// 郵箱帳號要先驗證信箱才能賣卡、綁錢包（綁了錢包才能買）；錢包登入的帳號沒有信箱，簽名已經證明了身分
export const unverifiedEmail = (user: PublicUser) => (user.email !== null && !user.emailVerified ? Response.json({ error: "email_unverified" }, { status: 403 }) : null);

// 組鏈上交易時的錯誤：餘額不夠、模擬就會失敗的交易，原樣回給前端顯示；其他當成鏈上服務出錯
export const TX_ERRORS = ["insufficient_funds", "tx_rejected"];
export function chainError(err: unknown) {
  const message = err instanceof Error ? err.message : "";
  if (TX_ERRORS.includes(message)) return Response.json({ error: message }, { status: 409 });
  console.error("build tx failed", err);
  return Response.json({ error: "chain_failed" }, { status: 502 });
}

export const fail = (error: string, status = 400) => Response.json({ error }, { status });
