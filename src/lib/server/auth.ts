import "server-only";
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import type { Db } from "./db";
import { sessions, users } from "./schema";
import { nextRenameAt } from "./names";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;

// scrypt 參數和鹽一起存，以後調整強度時舊密碼仍能驗證
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, n, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt") return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scryptAsync(password, Buffer.from(salt, "base64"), expected.length, { N: +n, r: +r, p: +p });
  return timingSafeEqual(expected, actual);
}

export const COOKIE = "idolca_session";
const SESSION_DAYS = 30;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function startSession(db: Db, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(db: Db) {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  jar.delete(COOKIE);
}

export type PublicUser = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string;
  // 冷卻中時下次能改暱稱的時間（ISO），可以改時是 null
  renameAt: string | null;
  walletAddress: string | null;
  walletKind: "external" | "privy" | null;
  isAdmin: boolean;
  // 能不能用 Arc 付款：設了 ARC_PAY_ADMIN_ONLY=1 時只有管理員能用（見 arc-gate.ts），前端照它決定顯不顯示 Arc
  arcPay: boolean;
  ageConfirmed: boolean;
};

// 管理員：資料庫裡 role 是 admin 的帳號，或錢包在 ADMIN_WALLETS（逗號分隔）裡的帳號。
// 環境變數只認錢包：錢包登入要簽名證明持有，比郵箱更難冒用
export const adminWallets = () => new Set((process.env.ADMIN_WALLETS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
export const isAdmin = (u: { role: string; walletAddress: string | null }) => u.role === "admin" || (u.walletAddress !== null && adminWallets().has(u.walletAddress));

// 回給前端的帳號資料
export const publicUser = (u: typeof users.$inferSelect): PublicUser => ({
  id: u.id,
  email: u.email,
  emailVerified: u.emailVerifiedAt !== null,
  displayName: u.displayName,
  renameAt: nextRenameAt(u.nameChangedAt)?.toISOString() ?? null,
  walletAddress: u.walletAddress,
  // 錢包登入的帳號沒記種類，一律是自己的錢包
  walletKind: u.walletAddress ? (u.walletKind ?? "external") : null,
  isAdmin: isAdmin(u),
  arcPay: process.env.ARC_PAY_ADMIN_ONLY !== "1" || isAdmin(u),
  ageConfirmed: u.ageConfirmedAt !== null,
});

// 改密碼或重設密碼後讓所有裝置重新登入
export async function endAllSessions(db: Db, userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function currentUser(db: Db): Promise<PublicUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0] ? publicUser(rows[0].user) : null;
}

export const newUserId = () => randomUUID();

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;
