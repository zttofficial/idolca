import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { findTemplate, TEMPLATES } from "@/lib/catalog";
import type { Db } from "./db";
import { binderEntries, binderWants, users } from "./schema";

// 公開收藏冊：用戶打開分享後，任何人從 /collector/{slug} 看得到暱稱和圖鑑裡標記的「有」和「想要」。
// 只公開圖鑑卡款和張數，不公開自己拍的照片、錢包地址和其他帳號資料

// 去掉容易看錯的 l、o、0、1，口頭轉述也不會抄錯
const SLUG_CHARS = "abcdefghijkmnpqrstuvwxyz23456789";
const SLUG_LEN = 8;
const newSlug = () => Array.from(randomBytes(SLUG_LEN), (b) => SLUG_CHARS[b % SLUG_CHARS.length]).join("");
export const isSlug = (s: string) => s.length === SLUG_LEN && [...s].every((c) => SLUG_CHARS.includes(c));

export type ShareState = { public: boolean; slug: string | null };

export async function shareState(db: Db, userId: string): Promise<ShareState> {
  const [row] = await db.select({ public: users.binderPublic, slug: users.binderSlug }).from(users).where(eq(users.id, userId));
  return row ? { public: row.public, slug: row.slug } : { public: false, slug: null };
}

// 打開或關掉公開。第一次打開時產生 slug，撞號就換一個重試
export async function setBinderPublic(db: Db, userId: string, isPublic: boolean): Promise<ShareState> {
  const current = await shareState(db, userId);
  if (!isPublic || current.slug) {
    await db.update(users).set({ binderPublic: isPublic }).where(eq(users.id, userId));
    return { public: isPublic, slug: current.slug };
  }
  for (let i = 0; ; i++) {
    const slug = newSlug();
    try {
      await db.update(users).set({ binderPublic: true, binderSlug: slug }).where(eq(users.id, userId));
      return { public: true, slug };
    } catch (err) {
      if (i === 4) throw err;
    }
  }
}

export type PublicBinder = {
  slug: string;
  name: string;
  joinedAt: string;
  // 卡款 id 按圖鑑順序排，同一團體、同一成員的卡放在一起
  have: { id: string; count: number }[];
  want: string[];
};

export async function getPublicBinder(db: Db, slug: string): Promise<PublicBinder | null> {
  if (!isSlug(slug)) return null;
  const [user] = await db
    .select({ id: users.id, name: users.displayName, joinedAt: users.createdAt })
    .from(users)
    .where(and(eq(users.binderSlug, slug), eq(users.binderPublic, true)));
  if (!user) return null;
  const [entries, wants] = await Promise.all([
    db.select({ id: binderEntries.templateId, count: binderEntries.count }).from(binderEntries).where(eq(binderEntries.userId, user.id)),
    db.select({ id: binderWants.templateId }).from(binderWants).where(eq(binderWants.userId, user.id)),
  ]);
  const counts = new Map(entries.filter((e) => findTemplate(e.id)).map((e) => [e.id, e.count]));
  const wanted = new Set(wants.map((w) => w.id));
  return {
    slug,
    name: user.name,
    joinedAt: user.joinedAt.toISOString(),
    have: TEMPLATES.filter((t) => counts.has(t.id)).map((t) => ({ id: t.id, count: counts.get(t.id)! })),
    want: TEMPLATES.filter((t) => wanted.has(t.id)).map((t) => t.id),
  };
}
