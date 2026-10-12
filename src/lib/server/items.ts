import "server-only";
import { randomUUID } from "node:crypto";
import { TEMPLATES } from "@/lib/catalog";
import { and, count, desc, eq, isNotNull, ne } from "drizzle-orm";
import type { Db } from "./db";
import { collectorItems, orders, users } from "./schema";

export type ItemRow = typeof collectorItems.$inferSelect;

const photosOf = (r: ItemRow) => [r.photo, ...(r.photoBack ? [r.photoBack] : []), ...(r.extraPhotos ? (JSON.parse(r.extraPhotos) as string[]) : [])];

// 前端看到的收藏品
export function publicItem(r: ItemRow) {
  return {
    id: r.id,
    photo: r.photo,
    photoBack: r.photoBack,
    photos: photosOf(r),
    title: r.title,
    description: r.description,
    quantity: r.quantity,
    source: r.source,
    group: r.groupName,
    member: r.member,
    album: r.album,
    version: r.version,
    templateId: r.templateId,
    asset: r.asset,
    mintTx: r.mintTx,
    ownerAddress: r.ownerAddress,
    fakeTx: r.fakeTx,
    verification: r.verification,
    verificationNote: r.verificationNote,
    verifiedAt: r.verifiedAt?.toISOString() ?? null,
    priceUsdt: r.priceCents === null ? null : r.priceCents / 100,
    listedAt: r.listedAt?.toISOString() ?? null,
    vaultRequestedAt: r.vaultRequestedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

// 自由刊登對外顯示的內容：收藏品加上賣家暱稱，不含賣家帳號資料
export const publicListing = (r: ItemRow, seller: string) => ({ ...publicItem(r), seller });

export const MAX_PHOTOS = 8;
export const MAX_DESCRIPTION = 500;
export const MAX_PRICE = 100_000;
// 價格轉成分；不合法時回傳 undefined，null 表示下架
export function priceToCents(v: unknown): number | null | undefined {
  if (v === null) return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  // 以分為單位存，四捨五入後至少 1 分（0.01）：不到半分的價格會變成 0，等於免費
  const cents = Math.round(n * 100);
  if (!Number.isFinite(n) || cents < 1 || n > MAX_PRICE) return undefined;
  return cents;
}

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

// 用戶填的名稱和圖鑑卡款完全一致（不分大小寫）時自動關聯
export function matchTemplate(group: string, member: string, album?: string | null, version?: string | null) {
  if (!album || !version) return null;
  return (
    TEMPLATES.find(
      (t) => norm(t.group) === norm(group) && norm(t.member) === norm(member) && norm(t.album) === norm(album) && norm(t.version) === norm(version),
    )?.id ?? null
  );
}

export const newItemId = () => randomUUID();

// 刊登中的自由刊登，新的在前；假卡即使有價格也不出現
export async function listListings(db: Db, limit = 200) {
  const rows = await db
    .select({ item: collectorItems, seller: users.displayName })
    .from(collectorItems)
    .innerJoin(users, eq(users.id, collectorItems.userId))
    .where(and(isNotNull(collectorItems.priceCents), eq(collectorItems.verification, "unverified")))
    .orderBy(desc(collectorItems.listedAt))
    .limit(limit);
  return rows.map((r) => publicListing(r.item, r.seller));
}

export async function getListing(db: Db, id: string) {
  const [r] = await db
    .select({ item: collectorItems, seller: users.displayName })
    .from(collectorItems)
    .innerJoin(users, eq(users.id, collectorItems.userId))
    .where(and(eq(collectorItems.id, id), isNotNull(collectorItems.priceCents), eq(collectorItems.verification, "unverified")));
  return r ? publicListing(r.item, r.seller) : null;
}

export type Listing = ReturnType<typeof publicListing>;

// 刊登頁的賣家卡片：暱稱、加入時間、成交筆數、在售件數、有沒有綁錢包，以及這位賣家的其他刊登（最多 4 則）。
// 只給公開資訊，不含郵箱和錢包地址
export async function getSeller(db: Db, itemId: string) {
  const [row] = await db
    .select({ id: users.id, name: users.displayName, joinedAt: users.createdAt, wallet: users.walletAddress })
    .from(collectorItems)
    .innerJoin(users, eq(users.id, collectorItems.userId))
    .where(eq(collectorItems.id, itemId));
  if (!row) return null;
  const onSale = and(eq(collectorItems.userId, row.id), isNotNull(collectorItems.priceCents), eq(collectorItems.verification, "unverified"));
  const [[sales], [active], others] = await Promise.all([
    db.select({ n: count() }).from(orders).where(and(eq(orders.sellerId, row.id), eq(orders.status, "completed"))),
    db.select({ n: count() }).from(collectorItems).where(onSale),
    db.select().from(collectorItems).where(and(onSale, ne(collectorItems.id, itemId))).orderBy(desc(collectorItems.listedAt)).limit(4),
  ]);
  return {
    name: row.name,
    joinedAt: row.joinedAt.toISOString(),
    sales: sales.n,
    active: active.n,
    walletLinked: Boolean(row.wallet),
    others: others.map((r) => publicListing(r, row.name)),
  };
}

// 鏈上屬性用的收藏品資料
export const chainAttributes = (r: ItemRow) => ({
  title: r.title || [r.groupName, r.member, r.version].filter(Boolean).join(" "),
  group: r.groupName,
  member: r.member,
  source: r.source,
  quantity: r.quantity,
  album: r.album,
  version: r.version,
});
